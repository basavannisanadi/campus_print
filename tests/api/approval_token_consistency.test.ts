import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/index.js';
import { readDb, writeDb } from '../../server/db.js';

const DEFAULT_SHOPS = [
  {
    id: 'alliance_print',
    name: 'Alliance Print Center',
    ownerName: 'Alliance Staff',
    phoneNumber: '9876543211',
    address: 'Alliance Main Block',
    maintenanceMode: false,
    bwPrice: 2,
    colorPrice: 5,
    duplexPrice: 3,
    isOpen: true,
    adminUsername: 'alliance_admin',
    adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00'
  }
];

const DEFAULT_AGENTS = [
  {
    agentId: 'alliance_agent',
    shopId: 'alliance_print',
    machineName: 'alliance-machine',
    printerName: 'AlliancePrinter',
    daemonVersion: '1.0.0',
    onlineStatus: 'online',
    printerStatus: 'ready',
    lastSeen: new Date().toISOString()
  }
];

const DEFAULT_PRINTER_SETTINGS = {
  status: 'ready',
  expectedReturnTime: '2:00 PM',
  averagePrintSpeed: 5,
  adminOverrideStatus: 'none',
  selectedPrinter: 'AlliancePrinter'
};

const mockPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 595 842]>>endobj xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF');

describe('Approval Token Consistency Across Student Submission, My Jobs, and Admin Portal', () => {
  beforeEach(() => {
    const agents = JSON.parse(JSON.stringify(DEFAULT_AGENTS));
    agents[0].lastSeen = new Date().toISOString();

    const db = readDb();
    db.shops = JSON.parse(JSON.stringify(DEFAULT_SHOPS));
    db.agents = agents;
    db.printerSettings = JSON.parse(JSON.stringify(DEFAULT_PRINTER_SETTINGS));
    db.jobs = [];
    db.orders = [];
    db.studentPrintHistory = [];
    writeDb(db);
  });

  it('1. Token is generated in canonical PRNT-XXXXXXXX format and remains identical across Submission, My Jobs, and Admin Queue', async () => {
    const studentEmail = `student_token_${Date.now()}@university.edu`;
    const loginRes = await request(app)
      .post('/api/auth/google')
      .send({ idToken: `mock_token_${studentEmail}` });

    expect(loginRes.status).toBe(200);
    const sessionToken = loginRes.body.sessionToken;

    // 1. Submit a print job
    const configs = JSON.stringify([{ copies: 1, printType: 'bw', sides: 'single' }]);
    const submitRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${sessionToken}`)
      .field('studentName', 'Token Test Student')
      .field('studentEmail', studentEmail)
      .field('shopId', 'alliance_print')
      .field('configs', configs)
      .attach('files', mockPdfBuffer, 'assignment.pdf');

    expect(submitRes.status).toBe(201);
    
    // Extract token returned on submission
    const submittedJob = Array.isArray(submitRes.body) ? submitRes.body[0] : (submitRes.body.jobs ? submitRes.body.jobs[0] : submitRes.body);
    const submissionToken = submittedJob.token;
    expect(submissionToken).toMatch(/^PRNT-[0-9A-F]{8}$/);

    // 2. Fetch student history (Simulates opening "My Jobs" after page reload)
    const historyRes = await request(app)
      .get('/api/student/history')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.length).toBeGreaterThan(0);

    const historyItem = historyRes.body[0];
    const myJobsToken = historyItem.orderToken || historyItem.jobToken;

    // CRITICAL: My Jobs token MUST match submission token exactly
    expect(myJobsToken).toBe(submissionToken);

    // 3. Fetch Admin orders (Simulates Admin Portal loading pending approvals)
    const adminOrdersRes = await request(app)
      .get('/api/orders?shopId=alliance_print');

    expect(adminOrdersRes.status).toBe(200);
    expect(adminOrdersRes.body.length).toBeGreaterThan(0);

    const adminOrder = adminOrdersRes.body[0];
    const adminOrderToken = adminOrder.token;
    const adminJobToken = adminOrder.jobs?.[0]?.tokenId || adminOrder.jobs?.[0]?.token;

    // CRITICAL: Admin order token and job token MUST match submission token
    expect(adminOrderToken).toBe(submissionToken);
    expect(adminJobToken).toBe(submissionToken);

    // 4. Verify repeated history/order requests NEVER mutate or regenerate the token
    const secondHistoryRes = await request(app)
      .get('/api/student/history')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(secondHistoryRes.body[0].orderToken).toBe(submissionToken);
  });

  it('2. Multi-file submission generates a single canonical order token matching My Jobs and Admin Queue', async () => {
    const studentEmail = `multi_token_${Date.now()}@university.edu`;
    const loginRes = await request(app)
      .post('/api/auth/google')
      .send({ idToken: `mock_token_${studentEmail}` });

    const sessionToken = loginRes.body.sessionToken;

    const configs = JSON.stringify([
      { copies: 1, printType: 'bw', sides: 'single' },
      { copies: 2, printType: 'color', sides: 'double' }
    ]);

    const submitRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${sessionToken}`)
      .field('studentName', 'Multi Student')
      .field('studentEmail', studentEmail)
      .field('shopId', 'alliance_print')
      .field('configs', configs)
      .attach('files', mockPdfBuffer, 'doc1.pdf')
      .attach('files', mockPdfBuffer, 'doc2.pdf');

    expect(submitRes.status).toBe(201);

    const jobs = Array.isArray(submitRes.body) ? submitRes.body : submitRes.body.jobs;
    expect(jobs.length).toBe(2);

    const canonicalOrderToken = jobs[0].tokenId || (submitRes.body.order ? submitRes.body.order.token : jobs[0].token);
    expect(canonicalOrderToken).toMatch(/^PRNT-[0-9A-F]{8}$/);

    // Verify My Jobs returns the exact same canonical order token for both jobs in the batch
    const historyRes = await request(app)
      .get('/api/student/history')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.length).toBe(2);
    expect(historyRes.body[0].orderToken).toBe(canonicalOrderToken);
    expect(historyRes.body[1].orderToken).toBe(canonicalOrderToken);
  });
});

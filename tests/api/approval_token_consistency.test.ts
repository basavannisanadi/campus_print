import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
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

describe('Canonical 6-Digit Approval Token Consistency & Lifecycle', () => {
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

  it('1. Token is generated in canonical 6-digit numeric format (100000-999999) and remains identical everywhere', async () => {
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
    expect(submissionToken).toMatch(/^[1-9][0-9]{5}$/);

    // 2. Fetch student history (Simulates opening "My Jobs" / "History" after page reload)
    const historyRes = await request(app)
      .get('/api/student/history')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.length).toBeGreaterThan(0);

    const historyItem = historyRes.body[0];
    const myJobsToken = historyItem.orderToken;

    // CRITICAL: My Jobs token MUST match submission token exactly
    expect(myJobsToken).toBe(submissionToken);
    expect(historyItem.jobToken).toBe(submissionToken);

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

  it('2. Multi-file submission generates a single canonical 6-digit token for all jobs, order, and history', async () => {
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

    const canonicalToken = jobs[0].token;
    expect(canonicalToken).toMatch(/^[1-9][0-9]{5}$/);
    expect(jobs[0].tokenId).toBe(canonicalToken);
    expect(jobs[1].token).toBe(canonicalToken);
    expect(jobs[1].tokenId).toBe(canonicalToken);

    // Verify My Jobs returns the exact same canonical order token for both jobs in the batch
    const historyRes = await request(app)
      .get('/api/student/history')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.length).toBe(2);
    expect(historyRes.body[0].orderToken).toBe(canonicalToken);
    expect(historyRes.body[0].jobToken).toBe(canonicalToken);
    expect(historyRes.body[1].orderToken).toBe(canonicalToken);
    expect(historyRes.body[1].jobToken).toBe(canonicalToken);
  });

  it('3. Admin Token Search resolves order by 6-digit numeric token', async () => {
    const studentEmail = `search_token_${Date.now()}@university.edu`;
    const loginRes = await request(app)
      .post('/api/auth/google')
      .send({ idToken: `mock_token_${studentEmail}` });

    const sessionToken = loginRes.body.sessionToken;

    const configs = JSON.stringify([
      { copies: 1, printType: 'bw', sides: 'single' }
    ]);

    const submitRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${sessionToken}`)
      .field('studentName', 'Search Student')
      .field('studentEmail', studentEmail)
      .field('shopId', 'alliance_print')
      .field('configs', configs)
      .attach('files', mockPdfBuffer, 'search_doc.pdf');

    expect(submitRes.status).toBe(201);
    const token = submitRes.body[0].token;
    expect(token).toMatch(/^[1-9][0-9]{5}$/);

    // Search by token via admin endpoint
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({
        shopId: 'alliance_print',
        username: 'alliance_admin',
        password: 'tjohn_password123'
      });
    const adminToken = adminLogin.body.token;

    const searchRes = await request(app)
      .get(`/api/orders/token/${token}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.token).toBe(token);
    expect(searchRes.body.jobs[0].token).toBe(token);
  });

  it('4. Legacy historical tokens (CP-XXXX and PRNT-XXXXXXXX) remain searchable without corruption', async () => {
    const db = readDb();
    db.orders.push({
      id: 'order-legacy-1',
      token: 'CP-4819',
      studentId: 'student-legacy',
      shopId: 'alliance_print',
      status: 'pending_approval',
      totalChargedAmount: 10,
      jobIds: ['job-legacy-1'],
      createdAt: new Date().toISOString()
    });
    db.jobs.push({
      id: 'job-legacy-1',
      token: 'PRNT-ABCD1234',
      tokenId: 'CP-4819',
      orderId: 'order-legacy-1',
      fileName: 'legacy_doc.pdf',
      fileSize: 1024,
      pageCount: 2,
      copies: 1,
      printMode: 'mono',
      sides: 'single',
      status: 'pending_approval',
      shopId: 'alliance_print',
      createdAt: new Date().toISOString()
    });
    writeDb(db);

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({
        shopId: 'alliance_print',
        username: 'alliance_admin',
        password: 'tjohn_password123'
      });
    const adminToken = adminLogin.body.token;

    // Search by legacy order token CP-4819
    const orderSearchRes = await request(app)
      .get('/api/orders/token/CP-4819')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(orderSearchRes.status).toBe(200);
    expect(orderSearchRes.body.token).toBe('CP-4819');

    // Search by legacy job token PRNT-ABCD1234
    const jobSearchRes = await request(app)
      .get('/api/jobs/token/PRNT-ABCD1234')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(jobSearchRes.status).toBe(200);
    expect(jobSearchRes.body[0].token).toBe('PRNT-ABCD1234');
  });

  it('5. Deterministic collision retry: candidate collision retries and persists a fresh unique 6-digit token', async () => {
    const studentEmail = `collision_student_${Date.now()}@university.edu`;
    const loginRes = await request(app)
      .post('/api/auth/google')
      .send({ idToken: `mock_token_${studentEmail}` });
    const sessionToken = loginRes.body.sessionToken;

    // Pre-populate an order with token 482731
    const db = readDb();
    db.orders.push({
      id: 'order-existing-collision',
      token: '482731',
      studentId: 'student-existing',
      shopId: 'alliance_print',
      status: 'pending_approval',
      totalChargedAmount: 5,
      jobIds: [],
      createdAt: new Date().toISOString()
    });
    writeDb(db);

    // Spy on crypto.randomInt to return 482731 first, then 763914
    let calls = 0;
    const randomIntSpy = vi.spyOn(crypto, 'randomInt').mockImplementation((min: any, max?: any) => {
      calls++;
      if (calls === 1) return 482731;
      return 763914;
    });

    const configs = JSON.stringify([{ copies: 1, printType: 'bw', sides: 'single' }]);
    const submitRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${sessionToken}`)
      .field('studentName', 'Collision Student')
      .field('studentEmail', studentEmail)
      .field('shopId', 'alliance_print')
      .field('configs', configs)
      .attach('files', mockPdfBuffer, 'collision_test.pdf');

    expect(submitRes.status).toBe(201);
    const assignedToken = submitRes.body[0].token;
    expect(assignedToken).toBe('763914');
    expect(calls).toBeGreaterThanOrEqual(2);

    randomIntSpy.mockRestore();
  });

  it('6. Repeated collision beyond 5 attempts fails safely with HTTP 503 and informative message', async () => {
    const studentEmail = `exhaust_student_${Date.now()}@university.edu`;
    const loginRes = await request(app)
      .post('/api/auth/google')
      .send({ idToken: `mock_token_${studentEmail}` });
    const sessionToken = loginRes.body.sessionToken;

    // Pre-populate collision token 555555
    const db = readDb();
    db.orders.push({
      id: 'order-constant-collision',
      token: '555555',
      studentId: 'student-existing',
      shopId: 'alliance_print',
      status: 'pending_approval',
      totalChargedAmount: 5,
      jobIds: [],
      createdAt: new Date().toISOString()
    });
    writeDb(db);

    // Force randomInt to always return 555555
    const randomIntSpy = vi.spyOn(crypto, 'randomInt').mockImplementation(() => 555555);

    const configs = JSON.stringify([{ copies: 1, printType: 'bw', sides: 'single' }]);
    const submitRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${sessionToken}`)
      .field('studentName', 'Exhaust Student')
      .field('studentEmail', studentEmail)
      .field('shopId', 'alliance_print')
      .field('configs', configs)
      .attach('files', mockPdfBuffer, 'exhaust_test.pdf');

    expect(submitRes.status).toBe(503);
    expect(submitRes.body.error).toContain('Unable to allocate a unique order token');

    randomIntSpy.mockRestore();
  });

  it('7. Concurrent submissions receive distinct unique 6-digit tokens', async () => {
    const numSubmissions = 5;
    const tokens: string[] = [];

    const submissions = Array.from({ length: numSubmissions }).map(async (_, idx) => {
      const email = `concurrent_${idx}_${Date.now()}@university.edu`;
      const loginRes = await request(app)
        .post('/api/auth/google')
        .send({ idToken: `mock_token_${email}` });

      const sessionToken = loginRes.body.sessionToken;
      const configs = JSON.stringify([{ copies: 1, printType: 'bw', sides: 'single' }]);

      const submitRes = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${sessionToken}`)
        .field('studentName', `Concurrent Student ${idx}`)
        .field('studentEmail', email)
        .field('shopId', 'alliance_print')
        .field('configs', configs)
        .attach('files', mockPdfBuffer, `concurrent_${idx}.pdf`);

      expect(submitRes.status).toBe(201);
      return submitRes.body[0].token;
    });

    const results = await Promise.all(submissions);
    expect(results.length).toBe(numSubmissions);

    results.forEach(tok => {
      expect(tok).toMatch(/^[1-9][0-9]{5}$/);
      expect(tokens.includes(tok)).toBe(false);
      tokens.push(tok);
    });

    // All tokens must be unique
    const uniqueTokens = new Set(results);
    expect(uniqueTokens.size).toBe(numSubmissions);
  });
});

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
  },
  {
    id: 'tjohn_print',
    name: 'TJohn Print Center',
    ownerName: 'TJohn Staff',
    phoneNumber: '9876543210',
    address: 'TJohn Block',
    maintenanceMode: false,
    bwPrice: 2,
    colorPrice: 5,
    duplexPrice: 3,
    isOpen: true,
    adminUsername: 'tjohn_admin',
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

describe('Clear All Pending Approval Jobs Feature (API & Persistence)', () => {
  let adminToken: string;

  beforeEach(async () => {
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

    // Login as shop admin for alliance_print
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        shopId: 'alliance_print',
        username: 'alliance_admin',
        password: 'tjohn_password123'
      });
    expect(loginRes.status).toBe(200);
    adminToken = loginRes.body.token;
  });

  it('1. Admin can successfully clear all pending approval jobs for their shop', async () => {
    // 1. Submit 2 pending jobs under 1 order
    const studentEmail = `student_${Date.now()}@university.edu`;
    const sLogin = await request(app)
      .post('/api/auth/google')
      .send({ idToken: `mock_token_${studentEmail}` });
    const sessionToken = sLogin.body.sessionToken;

    const configs = JSON.stringify([
      { copies: 1, printType: 'bw', sides: 'single' },
      { copies: 2, printType: 'bw', sides: 'single' }
    ]);
    const submitRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${sessionToken}`)
      .field('studentName', 'Pending Student')
      .field('studentEmail', studentEmail)
      .field('shopId', 'alliance_print')
      .field('configs', configs)
      .attach('files', mockPdfBuffer, 'doc1.pdf')
      .attach('files', mockPdfBuffer, 'doc2.pdf');

    expect(submitRes.status).toBe(201);

    // Verify jobs and orders are present before deletion
    const dbBefore = readDb();
    expect(dbBefore.jobs.filter(j => j.status === 'pending_approval' && j.shopId === 'alliance_print').length).toBe(2);
    expect(dbBefore.orders?.length).toBe(1);

    // 2. Clear all pending jobs as Admin
    const clearRes = await request(app)
      .delete('/api/admin/jobs/pending?shopId=alliance_print')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(clearRes.status).toBe(200);
    expect(clearRes.body.success).toBe(true);
    expect(clearRes.body.deletedJobsCount).toBe(2);
    expect(clearRes.body.deletedOrdersCount).toBe(1);

    // 3. Verify authoritative database removal
    const dbAfter = readDb();
    expect(dbAfter.jobs.filter(j => j.status === 'pending_approval' && j.shopId === 'alliance_print').length).toBe(0);
    expect(dbAfter.orders?.length).toBe(0);
  });

  it('2. Student cannot clear pending jobs (401/403 forbidden)', async () => {
    const studentEmail = `student_attacker_${Date.now()}@university.edu`;
    const sLogin = await request(app)
      .post('/api/auth/google')
      .send({ idToken: `mock_token_${studentEmail}` });
    const studentSessionToken = sLogin.body.sessionToken;

    const clearRes = await request(app)
      .delete('/api/admin/jobs/pending?shopId=alliance_print')
      .set('Authorization', `Bearer ${studentSessionToken}`);

    expect([401, 403]).toContain(clearRes.status);
  });

  it('3. Unauthenticated requests are rejected (401)', async () => {
    const clearRes = await request(app)
      .delete('/api/admin/jobs/pending?shopId=alliance_print');

    expect([401, 403]).toContain(clearRes.status);
  });

  it('4. Only pending approval jobs are deleted — queued, printing, completed, and failed jobs remain', async () => {
    const db = readDb();
    db.jobs = [
      {
        id: 'job-pending-1',
        token: '111111',
        orderId: 'order-pending-1',
        fileName: 'pending.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'pending_approval',
        shopId: 'alliance_print',
        createdAt: new Date().toISOString()
      },
      {
        id: 'job-queued-1',
        token: '222222',
        orderId: 'order-queued-1',
        fileName: 'queued.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'queued',
        shopId: 'alliance_print',
        createdAt: new Date().toISOString()
      },
      {
        id: 'job-printing-1',
        token: '333333',
        orderId: 'order-printing-1',
        fileName: 'printing.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'printing',
        shopId: 'alliance_print',
        createdAt: new Date().toISOString()
      },
      {
        id: 'job-completed-1',
        token: '444444',
        orderId: 'order-completed-1',
        fileName: 'completed.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'completed',
        shopId: 'alliance_print',
        createdAt: new Date().toISOString()
      },
      {
        id: 'job-failed-1',
        token: '555555',
        orderId: 'order-failed-1',
        fileName: 'failed.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'failed',
        shopId: 'alliance_print',
        createdAt: new Date().toISOString()
      }
    ];
    db.orders = [
      { id: 'order-pending-1', token: '111111', studentId: 's1', shopId: 'alliance_print', status: 'pending_approval', totalChargedAmount: 2, jobIds: ['job-pending-1'], createdAt: new Date().toISOString() },
      { id: 'order-queued-1', token: '222222', studentId: 's1', shopId: 'alliance_print', status: 'printing', totalChargedAmount: 2, jobIds: ['job-queued-1'], createdAt: new Date().toISOString() },
      { id: 'order-printing-1', token: '333333', studentId: 's1', shopId: 'alliance_print', status: 'printing', totalChargedAmount: 2, jobIds: ['job-printing-1'], createdAt: new Date().toISOString() },
      { id: 'order-completed-1', token: '444444', studentId: 's1', shopId: 'alliance_print', status: 'completed', totalChargedAmount: 2, jobIds: ['job-completed-1'], createdAt: new Date().toISOString() },
      { id: 'order-failed-1', token: '555555', studentId: 's1', shopId: 'alliance_print', status: 'failed', totalChargedAmount: 2, jobIds: ['job-failed-1'], createdAt: new Date().toISOString() }
    ];
    writeDb(db);

    const clearRes = await request(app)
      .delete('/api/admin/jobs/pending?shopId=alliance_print')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(clearRes.status).toBe(200);
    expect(clearRes.body.deletedJobsCount).toBe(1);
    expect(clearRes.body.deletedOrdersCount).toBe(1);

    const dbAfter = readDb();
    expect(dbAfter.jobs.map(j => j.id)).toEqual(['job-queued-1', 'job-printing-1', 'job-completed-1', 'job-failed-1']);
    expect(dbAfter.orders?.map(o => o.id)).toEqual(['order-queued-1', 'order-printing-1', 'order-completed-1', 'order-failed-1']);
  });

  it('5. Lifetime student print history ledger remains intact after clearing pending approval queue', async () => {
    // 1. Submit a job so student history is populated
    const studentEmail = `history_student_${Date.now()}@university.edu`;
    const sLogin = await request(app)
      .post('/api/auth/google')
      .send({ idToken: `mock_token_${studentEmail}` });
    const sessionToken = sLogin.body.sessionToken;

    const configs = JSON.stringify([{ copies: 1, printType: 'bw', sides: 'single' }]);
    const submitRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${sessionToken}`)
      .field('studentName', 'History Student')
      .field('studentEmail', studentEmail)
      .field('shopId', 'alliance_print')
      .field('configs', configs)
      .attach('files', mockPdfBuffer, 'history_doc.pdf');

    expect(submitRes.status).toBe(201);

    // Verify history exists
    const histBefore = await request(app)
      .get('/api/student/history')
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(histBefore.body.length).toBe(1);

    // 2. Clear pending approval queue
    const clearRes = await request(app)
      .delete('/api/admin/jobs/pending?shopId=alliance_print')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(clearRes.status).toBe(200);

    // 3. Verify student history still contains the record
    const histAfter = await request(app)
      .get('/api/student/history')
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(histAfter.body.length).toBe(1);
    expect(histAfter.body[0].fileName).toBe('history_doc.pdf');
  });

  it('6. Empty pending queue returns success without error (idempotent)', async () => {
    const clearRes = await request(app)
      .delete('/api/admin/jobs/pending?shopId=alliance_print')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(clearRes.status).toBe(200);
    expect(clearRes.body.success).toBe(true);
    expect(clearRes.body.deletedJobsCount).toBe(0);
    expect(clearRes.body.deletedOrdersCount).toBe(0);
  });

  it('7. Shop scoping isolation: clearing pending jobs for one shop does NOT delete pending jobs of another shop', async () => {
    const db = readDb();
    db.jobs = [
      {
        id: 'job-alliance-pending',
        token: '111111',
        orderId: 'order-alliance-1',
        fileName: 'alliance.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'pending_approval',
        shopId: 'alliance_print',
        createdAt: new Date().toISOString()
      },
      {
        id: 'job-tjohn-pending',
        token: '222222',
        orderId: 'order-tjohn-1',
        fileName: 'tjohn.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'pending_approval',
        shopId: 'tjohn_print',
        createdAt: new Date().toISOString()
      }
    ];
    db.orders = [
      { id: 'order-alliance-1', token: '111111', studentId: 's1', shopId: 'alliance_print', status: 'pending_approval', totalChargedAmount: 2, jobIds: ['job-alliance-pending'], createdAt: new Date().toISOString() },
      { id: 'order-tjohn-1', token: '222222', studentId: 's2', shopId: 'tjohn_print', status: 'pending_approval', totalChargedAmount: 2, jobIds: ['job-tjohn-pending'], createdAt: new Date().toISOString() }
    ];
    writeDb(db);

    // Alliance admin clears pending jobs
    const clearRes = await request(app)
      .delete('/api/admin/jobs/pending?shopId=alliance_print')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(clearRes.status).toBe(200);
    expect(clearRes.body.deletedJobsCount).toBe(1);

    const dbAfter = readDb();
    expect(dbAfter.jobs.length).toBe(1);
    expect(dbAfter.jobs[0].id).toBe('job-tjohn-pending');
    expect(dbAfter.orders?.length).toBe(1);
    expect(dbAfter.orders?.[0].id).toBe('order-tjohn-1');
  });
});

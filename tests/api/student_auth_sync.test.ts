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

describe('Student Authentication & Supabase Synchronization API', () => {
  beforeEach(() => {
    const agents = JSON.parse(JSON.stringify(DEFAULT_AGENTS));
    agents[0].lastSeen = new Date().toISOString();

    const db = readDb();
    db.shops = JSON.parse(JSON.stringify(DEFAULT_SHOPS));
    db.agents = agents;
    db.printerSettings = JSON.parse(JSON.stringify(DEFAULT_PRINTER_SETTINGS));
    writeDb(db);
  });

  it('1. New authenticated Google student is created with active=true and can submit jobs', async () => {
    const uniqueEmail = `student_${Date.now()}@university.edu`;
    const loginRes = await request(app)
      .post('/api/auth/google')
      .send({ idToken: `mock_token_${uniqueEmail}` });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.sessionToken).toBeDefined();

    const sessionToken = loginRes.body.sessionToken;

    // Verify GET /api/me works
    const meRes = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe(uniqueEmail);

    // Verify POST /api/jobs succeeds (201)
    const configs = JSON.stringify([{ copies: 1, printType: 'bw', sides: 'single' }]);
    const jobRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${sessionToken}`)
      .field('studentName', 'Test Student')
      .field('studentEmail', uniqueEmail)
      .field('shopId', 'alliance_print')
      .field('configs', configs)
      .attach('files', mockPdfBuffer, 'sample_doc.pdf');

    expect(jobRes.status).toBe(201);
    expect(jobRes.body).toBeInstanceOf(Array);
    expect(jobRes.body.length).toBe(1);
    expect(jobRes.body[0].token).toMatch(/^[1-9][0-9]{5}$/);
  });

  it('2. Repeated Google login for the same email/googleId preserves original student ID without duplicates', async () => {
    const fixedEmail = `repeat_${Date.now()}@university.edu`;

    const firstLogin = await request(app)
      .post('/api/auth/google')
      .send({ idToken: `mock_token_${fixedEmail}` });

    expect(firstLogin.status).toBe(200);

    const firstMe = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${firstLogin.body.sessionToken}`);

    const originalStudentId = firstMe.body.id;

    // Second login
    const secondLogin = await request(app)
      .post('/api/auth/google')
      .send({ idToken: `mock_token_${fixedEmail}` });

    expect(secondLogin.status).toBe(200);

    const secondMe = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${secondLogin.body.sessionToken}`);

    expect(secondMe.body.id).toBe(originalStudentId);
  });

  it('3. Inactive student is rejected with 401', async () => {
    const inactiveEmail = `inactive_${Date.now()}@university.edu`;
    const loginRes = await request(app)
      .post('/api/auth/google')
      .send({ idToken: `mock_token_${inactiveEmail}` });

    const token = loginRes.body.sessionToken;

    const meRes = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    const studentId = meRes.body.id;

    // Manually deactivate student in local DB
    const db = readDb();
    const studentIdx = (db.students || []).findIndex(s => s.id === studentId);
    if (studentIdx >= 0) {
      db.students![studentIdx].isActive = false;
      writeDb(db);
    }

    const testRes = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(testRes.status).toBe(401);
    expect(testRes.body.error).toContain('Student record not found or inactive');
  });

  it('4. Invalid or expired token is rejected with 401', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer invalid_token_xyz');

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid or expired session');
  });
});

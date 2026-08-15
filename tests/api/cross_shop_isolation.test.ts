import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { app } from '../../server/index.js';
import { writeDb } from '../../server/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_TEST_PATH = path.resolve(__dirname, '../../server/data/db.test.json');
const UPLOADS_TEST_DIR = path.resolve(__dirname, '../../server/uploads-test');

describe('Multi-Tenant Cross-Shop Isolation Security Suite', () => {
  let tjohnAdminToken: string;
  let allianceAdminToken: string;
  let ownerToken: string;
  let studentToken: string;

  const TJONH_ORDER_ID = 'order-tjohn-test-123';
  const ALLIANCE_ORDER_ID = 'order-alliance-test-456';
  const TJONH_JOB_ID = 'job-tjohn-test-123';
  const ALLIANCE_JOB_ID = 'job-alliance-test-456';
  const TJONH_FILE_NAME = 'tjohn_secret_exam.pdf';
  const ALLIANCE_FILE_NAME = 'alliance_confidential.pdf';

  beforeAll(async () => {
    if (!fs.existsSync(UPLOADS_TEST_DIR)) {
      fs.mkdirSync(UPLOADS_TEST_DIR, { recursive: true });
    }

    // Create dummy PDF files in uploads-test
    fs.writeFileSync(path.join(UPLOADS_TEST_DIR, TJONH_FILE_NAME), '%PDF-1.4 TJONH DOC');
    fs.writeFileSync(path.join(UPLOADS_TEST_DIR, ALLIANCE_FILE_NAME), '%PDF-1.4 ALLIANCE DOC');

    // Seed test DB
    writeDb({
      printerSettings: {
        selectedPrinter: 'Canon_LBP2900',
        status: 'online',
        expectedReturnTime: '02:00 PM',
        averagePrintSpeed: 5,
        adminOverrideStatus: 'none'
      },
      shops: [
        {
          id: 'tjohn_print',
          name: 'TJohn Print Center',
          ownerName: 'TJohn Staff',
          phoneNumber: '9876543210',
          phone: '9876543210',
          address: 'TJohn Block',
          maintenanceMode: false,
          bwPrice: 2,
          colorPrice: 5,
          duplexPrice: 3,
          isOpen: true,
          openingTime: '08:00 AM',
          closingTime: '08:00 PM',
          printerStatus: 'online',
          lastHeartbeat: new Date().toISOString(),
          adminUsername: 'tjohn_admin',
          adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00' // 'tjohn_password123'
        },
        {
          id: 'alliance_print',
          name: 'Alliance Print Center',
          ownerName: 'Alliance Staff',
          phoneNumber: '9876543211',
          phone: '9876543211',
          address: 'Alliance Block',
          maintenanceMode: false,
          bwPrice: 2,
          colorPrice: 5,
          duplexPrice: 3,
          isOpen: true,
          openingTime: '08:00 AM',
          closingTime: '08:00 PM',
          printerStatus: 'online',
          lastHeartbeat: new Date().toISOString(),
          adminUsername: 'alliance_admin',
          adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00' // 'tjohn_password123'
        }
      ],
      orders: [
        {
          id: TJONH_ORDER_ID,
          token: 'TK-TJ-100',
          studentId: 'student_123',
          studentName: 'Alice Student',
          studentEmail: 'alice@campus.edu',
          shopId: 'tjohn_print',
          status: 'pending_approval',
          totalChargedAmount: 10,
          jobIds: [TJONH_JOB_ID],
          createdAt: new Date().toISOString()
        },
        {
          id: ALLIANCE_ORDER_ID,
          token: 'TK-AL-200',
          studentId: 'student_456',
          studentName: 'Bob Student',
          studentEmail: 'bob@campus.edu',
          shopId: 'alliance_print',
          status: 'pending_approval',
          totalChargedAmount: 15,
          jobIds: [ALLIANCE_JOB_ID],
          createdAt: new Date().toISOString()
        }
      ],
      jobs: [
        {
          id: TJONH_JOB_ID,
          token: 'TK-TJ-100',
          orderId: TJONH_ORDER_ID,
          fileName: 'tjohn_exam.pdf',
          fileSize: 1024,
          pageCount: 5,
          copies: 1,
          printMode: 'mono',
          printType: 'bw',
          sides: 'single',
          status: 'pending_approval',
          chargedAmount: 10,
          studentName: 'Alice Student',
          studentEmail: 'alice@campus.edu',
          studentId: 'student_123',
          createdAt: new Date().toISOString(),
          serverFilePath: `/uploads/${TJONH_FILE_NAME}`,
          shopId: 'tjohn_print',
          timeline: []
        },
        {
          id: ALLIANCE_JOB_ID,
          token: 'TK-AL-200',
          orderId: ALLIANCE_ORDER_ID,
          fileName: 'alliance_assignment.pdf',
          fileSize: 2048,
          pageCount: 3,
          copies: 1,
          printMode: 'color',
          printType: 'color',
          sides: 'single',
          status: 'pending_approval',
          chargedAmount: 15,
          studentName: 'Bob Student',
          studentEmail: 'bob@campus.edu',
          studentId: 'student_456',
          createdAt: new Date().toISOString(),
          serverFilePath: `/uploads/${ALLIANCE_FILE_NAME}`,
          shopId: 'alliance_print',
          timeline: []
        }
      ],
      students: [
        {
          id: 'student_123',
          googleId: 'gid_123',
          name: 'Alice Student',
          email: 'alice@campus.edu',
          picture: '',
          role: 'student',
          isActive: true,
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
          lastSeen: new Date().toISOString()
        }
      ],
      agents: [
        {
          agentId: 'agent-alliance-test',
          shopId: 'alliance_print',
          machineName: 'ALLIANCE-DESKTOP',
          printerName: 'Canon_LBP2900',
          daemonVersion: '2.0.0',
          onlineStatus: 'online',
          printerStatus: 'online',
          lastSeen: new Date().toISOString()
        },
        {
          agentId: 'agent-tjohn-test',
          shopId: 'tjohn_print',
          machineName: 'TJOHN-DESKTOP',
          printerName: 'Canon_LBP2900',
          daemonVersion: '2.0.0',
          onlineStatus: 'online',
          printerStatus: 'online',
          lastSeen: new Date().toISOString()
        }
      ],
      printers: []
    });

    // Obtain tokens
    const tjRes = await request(app).post('/api/auth/login').send({
      shopId: 'tjohn_print',
      username: 'tjohn_admin',
      password: 'tjohn_password123'
    });
    tjohnAdminToken = tjRes.body.token;

    const alRes = await request(app).post('/api/auth/login').send({
      shopId: 'alliance_print',
      username: 'alliance_admin',
      password: 'tjohn_password123'
    });
    allianceAdminToken = alRes.body.token;

    const owRes = await request(app).post('/api/auth/login').send({
      username: 'owner',
      password: 'campusprint_admin_123'
    });
    ownerToken = owRes.body.token;

    const stRes = await request(app).post('/api/auth/google').send({
      idToken: 'mock_token_student'
    });
    studentToken = stRes.body.sessionToken;
  });

  afterAll(() => {
    if (fs.existsSync(DB_TEST_PATH)) {
      try { fs.unlinkSync(DB_TEST_PATH); } catch {}
    }
    if (fs.existsSync(UPLOADS_TEST_DIR)) {
      try { fs.rmSync(UPLOADS_TEST_DIR, { recursive: true, force: true }); } catch {}
    }
  });

  // TEST 1: TJONH admin can approve TJONH order
  test('TEST 1: TJONH admin can approve TJONH order', async () => {
    const res = await request(app)
      .post(`/api/orders/${TJONH_ORDER_ID}/approve`)
      .set('Authorization', `Bearer ${tjohnAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TJONH_ORDER_ID);
    expect(res.body.status).toBe('printing');
  });

  // TEST 2: Alliance admin cannot approve TJONH order (Cross-Shop Write Block)
  test('TEST 2: Alliance admin cannot approve TJONH order', async () => {
    const res = await request(app)
      .post(`/api/orders/${TJONH_ORDER_ID}/approve`)
      .set('Authorization', `Bearer ${allianceAdminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden|access/i);
  });

  // TEST 3: TJONH admin cannot approve Alliance order
  test('TEST 3: TJONH admin cannot approve Alliance order', async () => {
    const res = await request(app)
      .post(`/api/orders/${ALLIANCE_ORDER_ID}/approve`)
      .set('Authorization', `Bearer ${tjohnAdminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden|access/i);
  });

  // TEST 4: Alliance admin cannot reject TJONH order
  test('TEST 4: Alliance admin cannot reject TJONH order', async () => {
    const res = await request(app)
      .post(`/api/orders/${TJONH_ORDER_ID}/reject`)
      .set('Authorization', `Bearer ${allianceAdminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden|access/i);
  });

  // TEST 5: Admin GET /api/orders cannot override its shop scope using ?shopId=another_shop
  test('TEST 5: Admin GET /api/orders cannot override shop scope via query parameter', async () => {
    // Alliance admin tries to request TJONH orders via ?shopId=tjohn_print
    const res = await request(app)
      .get('/api/orders?shopId=tjohn_print')
      .set('Authorization', `Bearer ${allianceAdminToken}`);

    expect(res.status).toBe(200);
    // Server must strictly enforce alliance_print scope
    const returnedOrders = res.body;
    expect(returnedOrders.every((o: any) => o.shopId === 'alliance_print')).toBe(true);
    expect(returnedOrders.some((o: any) => o.id === TJONH_ORDER_ID)).toBe(false);
  });

  // TEST 6: Admin GET /api/jobs cannot override its shop scope
  test('TEST 6: Admin GET /api/jobs cannot override shop scope via query parameter', async () => {
    // Alliance admin tries to request TJONH jobs via ?shopId=tjohn_print
    const res = await request(app)
      .get('/api/jobs?shopId=tjohn_print')
      .set('Authorization', `Bearer ${allianceAdminToken}`);

    expect(res.status).toBe(200);
    const returnedJobs = res.body;
    expect(returnedJobs.every((j: any) => j.shopId === 'alliance_print')).toBe(true);
    expect(returnedJobs.some((j: any) => j.id === TJONH_JOB_ID)).toBe(false);
  });

  // TEST 7: Alliance admin cannot retrieve TJONH PDF
  test('TEST 7: Alliance admin cannot retrieve TJONH PDF', async () => {
    const res = await request(app)
      .get(`/uploads/${TJONH_FILE_NAME}`)
      .set('Authorization', `Bearer ${allianceAdminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden|access/i);
  });

  // TEST 8: TJONH admin cannot retrieve Alliance PDF
  test('TEST 8: TJONH admin cannot retrieve Alliance PDF', async () => {
    const res = await request(app)
      .get(`/uploads/${ALLIANCE_FILE_NAME}`)
      .set('Authorization', `Bearer ${tjohnAdminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden|access/i);
  });

  // TEST 9: Cross-shop preview access fails if unauthenticated
  test('TEST 9: Preview access requires authentication', async () => {
    const res = await request(app)
      .get(`/api/jobs/pre-convert/preview/${TJONH_FILE_NAME}`);

    expect(res.status).toBe(401);
  });

  // TEST 10: Authenticated student can view preview
  test('TEST 10: Authenticated student can view preview', async () => {
    const res = await request(app)
      .get(`/api/jobs/pre-convert/preview/${TJONH_FILE_NAME}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  });

  // TEST 11: After Shop A -> Shop B switch, uploaded order contains Shop B ID
  test('TEST 11: Uploading order with shopId=alliance_print correctly associates with Alliance', async () => {
    const testPdfPath = path.join(UPLOADS_TEST_DIR, 'sample_upload.pdf');
    fs.writeFileSync(testPdfPath, '%PDF-1.4 Sample PDF content');

    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('studentName', 'Alice Student')
      .field('studentEmail', 'alice@campus.edu')
      .field('shopId', 'alliance_print')
      .field('configs', JSON.stringify([{
        name: 'sample_upload.pdf',
        copies: 1,
        printType: 'bw',
        sides: 'single'
      }]))
      .attach('files', testPdfPath);

    expect(res.status).toBe(201);
    const created = Array.isArray(res.body) ? res.body : res.body.jobs;
    expect(created[0].shopId).toBe('alliance_print');
  });

  // TEST 12: Owner/global access still works across all shops
  test('TEST 12: Owner/global access still functions across all shops', async () => {
    const res = await request(app)
      .get('/api/owner/dashboard')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.shopsStatus).toBeDefined();
    expect(Array.isArray(res.body.shopsStatus)).toBe(true);
    expect(res.body.shopsStatus.length).toBeGreaterThanOrEqual(2);
  });
});

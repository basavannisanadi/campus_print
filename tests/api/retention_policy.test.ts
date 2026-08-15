import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { app } from '../../server/index.js';
import { writeDb, readDb } from '../../server/db.js';
import { 
  uploadDocument, 
  deleteDocument, 
  getDocumentStream, 
  executeRetentionPurge, 
  isRemoteStorageActive,
  UPLOADS_DIR 
} from '../../server/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_TEST_PATH = path.resolve(__dirname, '../../server/data/db.test.json');

describe('7-Day Data Retention & Private Storage Security Suite', () => {
  let adminToken: string;
  let studentToken: string;

  const ACTIVE_JOB_ID = 'job-retention-active-001';
  const COMPLETED_JOB_OLD_ID = 'job-retention-completed-old';
  const FAILED_JOB_OLD_ID = 'job-retention-failed-old';
  const COMPLETED_JOB_FRESH_ID = 'job-retention-completed-fresh';

  const OLD_ORDER_ID = 'order-retention-old-001';
  const FRESH_ORDER_ID = 'order-retention-fresh-002';
  const ACTIVE_ORDER_ID = 'order-retention-active-003';

  const FILE_ACTIVE = 'active_doc.pdf';
  const FILE_OLD_COMPLETED = 'old_completed.pdf';
  const FILE_OLD_FAILED = 'old_failed.pdf';
  const FILE_FRESH_COMPLETED = 'fresh_completed.pdf';

  // 8 days ago
  const EIGHT_DAYS_AGO = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  // 2 days ago
  const TWO_DAYS_AGO = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  beforeAll(async () => {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    // Write dummy physical test files
    fs.writeFileSync(path.join(UPLOADS_DIR, FILE_ACTIVE), '%PDF-1.4 ACTIVE DOCUMENT');
    fs.writeFileSync(path.join(UPLOADS_DIR, FILE_OLD_COMPLETED), '%PDF-1.4 OLD COMPLETED');
    fs.writeFileSync(path.join(UPLOADS_DIR, FILE_OLD_FAILED), '%PDF-1.4 OLD FAILED');
    fs.writeFileSync(path.join(UPLOADS_DIR, FILE_FRESH_COMPLETED), '%PDF-1.4 FRESH COMPLETED');

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
          adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00'
        }
      ],
      orders: [
        {
          id: ACTIVE_ORDER_ID,
          token: 'TK-ACT-001',
          studentId: 'student_123',
          studentName: 'Alice Student',
          studentEmail: 'alice@campus.edu',
          shopId: 'tjohn_print',
          status: 'pending_approval',
          totalChargedAmount: 10,
          jobIds: [ACTIVE_JOB_ID],
          createdAt: EIGHT_DAYS_AGO // Created 8 days ago, but ACTIVE!
        },
        {
          id: OLD_ORDER_ID,
          token: 'TK-OLD-002',
          studentId: 'student_123',
          studentName: 'Alice Student',
          studentEmail: 'alice@campus.edu',
          shopId: 'tjohn_print',
          status: 'completed',
          totalChargedAmount: 10,
          jobIds: [COMPLETED_JOB_OLD_ID, FAILED_JOB_OLD_ID],
          createdAt: EIGHT_DAYS_AGO // 8 days ago, terminal!
        },
        {
          id: FRESH_ORDER_ID,
          token: 'TK-FRESH-003',
          studentId: 'student_123',
          studentName: 'Alice Student',
          studentEmail: 'alice@campus.edu',
          shopId: 'tjohn_print',
          status: 'completed',
          totalChargedAmount: 5,
          jobIds: [COMPLETED_JOB_FRESH_ID],
          createdAt: TWO_DAYS_AGO // 2 days ago, terminal but within 7 days!
        }
      ],
      jobs: [
        {
          id: ACTIVE_JOB_ID,
          token: 'TK-ACT-001',
          orderId: ACTIVE_ORDER_ID,
          fileName: 'active_exam.pdf',
          fileSize: 1024,
          pageCount: 5,
          copies: 1,
          printMode: 'mono',
          printType: 'bw',
          sides: 'single',
          status: 'queued', // IN-FLIGHT / ACTIVE
          chargedAmount: 10,
          studentName: 'Alice Student',
          studentEmail: 'alice@campus.edu',
          studentId: 'student_123',
          createdAt: EIGHT_DAYS_AGO,
          serverFilePath: `/uploads/${FILE_ACTIVE}`,
          shopId: 'tjohn_print',
          timeline: []
        },
        {
          id: COMPLETED_JOB_OLD_ID,
          token: 'TK-OLD-002',
          orderId: OLD_ORDER_ID,
          fileName: 'old_completed.pdf',
          fileSize: 1024,
          pageCount: 5,
          copies: 1,
          printMode: 'mono',
          printType: 'bw',
          sides: 'single',
          status: 'completed', // TERMINAL + >7 DAYS
          chargedAmount: 10,
          studentName: 'Alice Student',
          studentEmail: 'alice@campus.edu',
          studentId: 'student_123',
          createdAt: EIGHT_DAYS_AGO,
          serverFilePath: `/uploads/${FILE_OLD_COMPLETED}`,
          shopId: 'tjohn_print',
          timeline: []
        },
        {
          id: FAILED_JOB_OLD_ID,
          token: 'TK-OLD-003',
          orderId: OLD_ORDER_ID,
          fileName: 'old_failed.pdf',
          fileSize: 1024,
          pageCount: 5,
          copies: 1,
          printMode: 'mono',
          printType: 'bw',
          sides: 'single',
          status: 'failed', // TERMINAL + >7 DAYS
          chargedAmount: 10,
          studentName: 'Alice Student',
          studentEmail: 'alice@campus.edu',
          studentId: 'student_123',
          createdAt: EIGHT_DAYS_AGO,
          serverFilePath: `/uploads/${FILE_OLD_FAILED}`,
          shopId: 'tjohn_print',
          timeline: []
        },
        {
          id: COMPLETED_JOB_FRESH_ID,
          token: 'TK-FRESH-003',
          orderId: FRESH_ORDER_ID,
          fileName: 'fresh_completed.pdf',
          fileSize: 512,
          pageCount: 2,
          copies: 1,
          printMode: 'mono',
          printType: 'bw',
          sides: 'single',
          status: 'completed', // TERMINAL + 2 DAYS (UNDER 7 DAYS)
          chargedAmount: 5,
          studentName: 'Alice Student',
          studentEmail: 'alice@campus.edu',
          studentId: 'student_123',
          createdAt: TWO_DAYS_AGO,
          serverFilePath: `/uploads/${FILE_FRESH_COMPLETED}`,
          shopId: 'tjohn_print',
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
          createdAt: EIGHT_DAYS_AGO,
          lastLogin: new Date().toISOString(),
          lastSeen: new Date().toISOString()
        }
      ],
      agents: [
        {
          agentId: 'agent-tjohn-retention',
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

    const authRes = await request(app).post('/api/auth/login').send({
      shopId: 'tjohn_print',
      username: 'tjohn_admin',
      password: 'tjohn_password123'
    });
    adminToken = authRes.body.token;

    const stRes = await request(app).post('/api/auth/google').send({
      idToken: 'mock_token_student'
    });
    studentToken = stRes.body.sessionToken;
  });

  afterAll(() => {
    if (fs.existsSync(DB_TEST_PATH)) {
      try { fs.unlinkSync(DB_TEST_PATH); } catch {}
    }
    if (fs.existsSync(UPLOADS_DIR)) {
      try { fs.rmSync(UPLOADS_DIR, { recursive: true, force: true }); } catch {}
    }
  });

  // TEST 1: Immediate binary deletion on successful print completion (T+0)
  test('TEST 1: Successful print immediately deletes binary file from storage', async () => {
    const freshJobFilePath = path.join(UPLOADS_DIR, FILE_FRESH_COMPLETED);
    expect(fs.existsSync(freshJobFilePath)).toBe(true);

    const res = await request(app)
      .post(`/api/jobs/${COMPLETED_JOB_FRESH_ID}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    // Physical file must be deleted immediately on terminal completion
    expect(fs.existsSync(freshJobFilePath)).toBe(false);
  });

  // TEST 2: Active jobs are NEVER deleted by retention purge regardless of age
  test('TEST 2: Active in-flight jobs are IMMUNE from retention purge', async () => {
    // Run 7-day retention purge
    const purgeResult = await executeRetentionPurge(7);

    const db = readDb();
    const activeJob = db.jobs.find(j => j.id === ACTIVE_JOB_ID);
    const activeOrder = db.orders.find(o => o.id === ACTIVE_ORDER_ID);

    expect(activeJob).toBeDefined();
    expect(activeJob?.status).toBe('queued');
    expect(activeOrder).toBeDefined();
    // Active document binary must still exist
    expect(fs.existsSync(path.join(UPLOADS_DIR, FILE_ACTIVE))).toBe(true);
  });

  // TEST 3: Terminal records older than 7 days are purged
  test('TEST 3: Terminal jobs and orders older than 7 days are purged', async () => {
    const db = readDb();
    const oldCompletedJob = db.jobs.find(j => j.id === COMPLETED_JOB_OLD_ID);
    const oldFailedJob = db.jobs.find(j => j.id === FAILED_JOB_OLD_ID);
    const oldOrder = db.orders.find(o => o.id === OLD_ORDER_ID);

    expect(oldCompletedJob).toBeUndefined();
    expect(oldFailedJob).toBeUndefined();
    expect(oldOrder).toBeUndefined();

    // Expired files purged
    expect(fs.existsSync(path.join(UPLOADS_DIR, FILE_OLD_COMPLETED))).toBe(false);
    expect(fs.existsSync(path.join(UPLOADS_DIR, FILE_OLD_FAILED))).toBe(false);
  });

  // TEST 4: Student accounts are NEVER deleted by retention purge
  test('TEST 4: Student accounts remain completely intact after purge', async () => {
    const db = readDb();
    const student = db.students.find(s => s.id === 'student_123');
    expect(student).toBeDefined();
    expect(student?.email).toBe('alice@campus.edu');
  });

  // TEST 5: Storage deletion is idempotent and treats missing files safely
  test('TEST 5: deleteDocument on already-missing file succeeds idempotently', async () => {
    const nonExistentFile = 'already_deleted_non_existent.pdf';
    const result = await deleteDocument(nonExistentFile);

    expect(result.success).toBe(true);
  });

  // TEST 6: Desktop Agent /uploads/:filename contract is preserved and streams correctly
  test('TEST 6: Desktop Agent /uploads/:filename streams document successfully', async () => {
    const res = await request(app)
      .get(`/uploads/${FILE_ACTIVE}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.toString('utf-8')).toContain('%PDF-1.4 ACTIVE DOCUMENT');
  });
});

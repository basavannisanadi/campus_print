import { describe, test, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from '../../server/index.js';
import { readDb, writeDb } from '../../server/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_TEST_DIR = path.resolve(__dirname, '../../server/uploads-test');

const DEFAULT_SHOPS = [
  {
    id: 'alliance_print',
    name: 'Alliance Print Center',
    ownerName: 'Alliance Staff',
    phoneNumber: '9876543211',
    phone: '9876543211',
    address: 'Alliance Main Block',
    maintenanceMode: false,
    bwPrice: 2,
    colorPrice: 5,
    duplexPrice: 3,
    isOpen: true,
    openingTime: '08:00 AM',
    closingTime: '08:00 PM',
    printerStatus: 'offline',
    lastHeartbeat: '',
    adminUsername: 'alliance_admin',
    adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00', // 'tjohn_password123'
    bwStatusMode: 'auto',
    colorStatusMode: 'auto',
    bwMaintenanceMode: false,
    colorMaintenanceMode: false
  },
  {
    id: 'tjohn_print',
    name: 'TJohn Print Center',
    ownerName: 'TJohn Staff',
    phoneNumber: '9876543210',
    phone: '9876543210',
    address: 'TJohn Block, Ground Floor',
    maintenanceMode: false,
    bwPrice: 2,
    colorPrice: 5,
    duplexPrice: 3,
    isOpen: true,
    openingTime: '08:00 AM',
    closingTime: '08:00 PM',
    printerStatus: 'offline',
    lastHeartbeat: '',
    adminUsername: 'tjohn_admin',
    adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00',
    bwStatusMode: 'auto',
    colorStatusMode: 'auto',
    bwMaintenanceMode: false,
    colorMaintenanceMode: false
  }
];

const DEFAULT_PRINTER_SETTINGS = {
  status: 'offline',
  expectedReturnTime: '2:00 PM',
  averagePrintSpeed: 5,
  adminOverrideStatus: 'none',
  selectedPrinter: 'AlliancePrinter'
};

const DEFAULT_AGENTS = [
  {
    agentId: 'alliance_agent',
    shopId: 'alliance_print',
    machineName: 'alliance-machine',
    printerName: 'AlliancePrinter',
    daemonVersion: '1.0.0',
    onlineStatus: 'online',
    lastSeen: new Date().toISOString()
  }
];

let adminToken = '';
let otherShopToken = '';

beforeAll(async () => {
  // Clear any existing db state and login to retrieve test auth tokens
  writeDb({
    jobs: [],
    shops: JSON.parse(JSON.stringify(DEFAULT_SHOPS)),
    printerSettings: JSON.parse(JSON.stringify(DEFAULT_PRINTER_SETTINGS)),
    agents: JSON.parse(JSON.stringify(DEFAULT_AGENTS)),
    printers: []
  });

  const res1 = await request(app)
    .post('/api/auth/login')
    .send({
      shopId: 'alliance_print',
      username: 'alliance_admin',
      password: 'tjohn_password123'
    });
  adminToken = res1.body.token;

  const res2 = await request(app)
    .post('/api/auth/login')
    .send({
      shopId: 'tjohn_print',
      username: 'tjohn_admin',
      password: 'tjohn_password123'
    });
  otherShopToken = res2.body.token;
});

beforeEach(() => {
  // Ensure the uploads directory exists
  if (!fs.existsSync(UPLOADS_TEST_DIR)) {
    fs.mkdirSync(UPLOADS_TEST_DIR, { recursive: true });
  }

  // Clear uploads directory to isolate test filesystem
  const files = fs.readdirSync(UPLOADS_TEST_DIR);
  for (const file of files) {
    fs.unlinkSync(path.join(UPLOADS_TEST_DIR, file));
  }

  // Reset database state to a clean template before each test run
  // Always update agent lastSeen to current time so it resolves to online
  const agents = JSON.parse(JSON.stringify(DEFAULT_AGENTS));
  agents[0].lastSeen = new Date().toISOString();

  writeDb({
    jobs: [],
    shops: JSON.parse(JSON.stringify(DEFAULT_SHOPS)),
    printerSettings: JSON.parse(JSON.stringify(DEFAULT_PRINTER_SETTINGS)),
    agents,
    printers: []
  });
});

const mockPdfBuffer = Buffer.from('%PDF-1.4\n%mock pdf content\n%%EOF');

describe('Jobs API Supertest Coverage', () => {

  // ==========================================
  // 1. JOB CREATION (POST /api/jobs)
  // ==========================================
  describe('POST /api/jobs', () => {
    test('should successfully create a print job with valid PDF file and configs', async () => {
      const configs = JSON.stringify([{ copies: 2, printType: 'bw', sides: 'single' }]);
      const res = await request(app)
        .post('/api/jobs')
        .field('studentName', 'Basav')
        .field('studentEmail', 'basav@gmail.com')
        .field('shopId', 'alliance_print')
        .field('configs', configs)
        .attach('files', mockPdfBuffer, 'homework.pdf');

      expect(res.status).toBe(201);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBe(1);

      const job = res.body[0];
      expect(job.studentName).toBe('Basav');
      expect(job.studentEmail).toBe('basav@gmail.com');
      expect(job.copies).toBe(2);
      expect(job.printType).toBe('bw');
      expect(job.status).toBe('pending_approval');
      expect(job.fileName).toBe('homework.pdf');

      // Verify the uploaded file actually exists on the filesystem
      const localFilePath = path.join(UPLOADS_TEST_DIR, path.basename(job.serverFilePath));
      expect(fs.existsSync(localFilePath)).toBe(true);
    });

    test('should reject request when no files are uploaded', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .field('studentName', 'Basav')
        .field('shopId', 'alliance_print');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No files uploaded');
    });

    test('should reject request when page range format is invalid', async () => {
      const configs = JSON.stringify([{ copies: 1, printType: 'bw', sides: 'single', pageRange: '1-3,foo' }]);
      const res = await request(app)
        .post('/api/jobs')
        .field('studentName', 'Basav')
        .field('studentEmail', 'basav@gmail.com')
        .field('shopId', 'alliance_print')
        .field('configs', configs)
        .attach('files', mockPdfBuffer, 'homework.pdf');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid page range format');

      // Assert partial upload was cleaned up from disk
      const uploadedFiles = fs.readdirSync(UPLOADS_TEST_DIR);
      expect(uploadedFiles.length).toBe(0);
    });

    test('should reject request when file type or magic bytes are invalid', async () => {
      const badBuffer = Buffer.from('hello world not a pdf');
      const res = await request(app)
        .post('/api/jobs')
        .field('studentName', 'Basav')
        .field('shopId', 'alliance_print')
        .attach('files', badBuffer, 'homework.pdf');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Security verification failed');

      // Assert upload cleanup
      const uploadedFiles = fs.readdirSync(UPLOADS_TEST_DIR);
      expect(uploadedFiles.length).toBe(0);
    });
  });

  // ==========================================
  // 2. JOB LISTING (GET /api/jobs)
  // ==========================================
  describe('GET /api/jobs', () => {
    test('should return empty list when no jobs are present', async () => {
      const res = await request(app).get('/api/jobs?shopId=alliance_print');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('should return jobs sorted newest first and strip student PII data', async () => {
      const db = readDb();
      db.jobs = [
        {
          id: 'job-1',
          token: 'A123',
          fileName: 'doc1.pdf',
          fileSize: 100,
          pageCount: 1,
          copies: 1,
          printMode: 'mono',
          sides: 'single',
          status: 'pending_approval',
          createdAt: '2026-07-15T12:00:00.000Z',
          shopId: 'alliance_print',
          studentName: 'Basav',
          studentEmail: 'basav@gmail.com',
          serverFilePath: '/uploads/doc1.pdf',
          timeline: []
        },
        {
          id: 'job-2',
          token: 'B123',
          fileName: 'doc2.pdf',
          fileSize: 200,
          pageCount: 2,
          copies: 2,
          printMode: 'color',
          sides: 'double',
          status: 'pending_approval',
          createdAt: '2026-07-15T12:05:00.000Z',
          shopId: 'alliance_print',
          studentName: 'John',
          studentEmail: 'john@gmail.com',
          serverFilePath: '/uploads/doc2.pdf',
          timeline: []
        }
      ];
      writeDb(db);

      const res = await request(app).get('/api/jobs?shopId=alliance_print');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);

      // Verify ordering: doc2 (Job 2) is newest and must be first
      expect(res.body[0].id).toBe('job-2');
      expect(res.body[1].id).toBe('job-1');

      // Verify PII is fully stripped
      for (const job of res.body) {
        expect(job.studentName).toBeUndefined();
        expect(job.studentEmail).toBeUndefined();
        expect(job.serverFilePath).toBeUndefined();
        expect(job.timeline).toBeUndefined();
        // Safe fields should exist
        expect(job.id).toBeDefined();
        expect(job.token).toBeDefined();
        expect(job.fileName).toBeDefined();
      }
    });
  });

  // ==========================================
  // 3. JOB DETAILS (GET /api/jobs/:id & GET /api/admin/jobs/:id)
  // ==========================================
  describe('Job Details', () => {
    test('public GET /api/jobs/:id should return 404', async () => {
      const res = await request(app).get('/api/jobs/job-1');
      expect(res.status).toBe(404);
    });

    test('admin GET /api/admin/jobs/:id should successfully return full job details', async () => {
      const db = readDb();
      const mockJob = {
        id: 'job-details-1',
        token: 'A123',
        fileName: 'doc.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'pending_approval',
        createdAt: '2026-07-15T12:00:00.000Z',
        shopId: 'alliance_print',
        studentName: 'Basav',
        studentEmail: 'basav@gmail.com',
        serverFilePath: '/uploads/doc.pdf',
        timeline: []
      };
      db.jobs = [mockJob];
      writeDb(db);

      const res = await request(app)
        .get('/api/admin/jobs/job-details-1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('job-details-1');
      expect(res.body.studentName).toBe('Basav'); // Full telemetry returned to admin
      expect(res.body.studentEmail).toBe('basav@gmail.com');
    });

    test('admin GET /api/admin/jobs/:id should return 404 if job does not exist', async () => {
      const res = await request(app)
        .get('/api/admin/jobs/missing-job')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Job not found');
    });
  });

  // ==========================================
  // 4. APPROVAL TOKEN (GET /api/jobs/token/:tokenId)
  // ==========================================
  describe('GET /api/jobs/token/:tokenId', () => {
    test('should return print job details for valid tokenId (case-insensitive)', async () => {
      const db = readDb();
      const mockJob = {
        id: 'job-token-1',
        token: 'A123',
        fileName: 'doc.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'pending_approval',
        createdAt: '2026-07-15T12:00:00.000Z',
        shopId: 'alliance_print',
        studentName: 'Basav',
        tokenId: 'APPR123',
        timeline: []
      };
      db.jobs = [mockJob];
      writeDb(db);

      // Verify lookup with lowercase
      const res = await request(app)
        .get('/api/jobs/token/appr123')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('job-token-1');
      expect(res.body.tokenId).toBe('APPR123');
    });

    test('should return 404 if tokenId does not exist', async () => {
      const res = await request(app)
        .get('/api/jobs/token/NOEXIST')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Job not found with this token');
    });
  });

  // ==========================================
  // 5. NEXT JOB (GET /api/jobs/next)
  // ==========================================
  describe('GET /api/jobs/next', () => {
    test('should return 404 when queue is empty', async () => {
      const db = readDb();
      // Set bwStatusMode to online so queue is active
      db.shops[0].bwStatusMode = 'online';
      writeDb(db);

      const res = await request(app)
        .get('/api/jobs/next?shopId=alliance_print')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('No queued jobs');
    });

    test('should return 404 when printer overall status resolves to offline', async () => {
      const db = readDb();
      // Ensure shops and settings render status offline
      db.shops[0].bwStatusMode = 'offline';
      db.shops[0].colorStatusMode = 'offline';
      db.printerSettings.status = 'offline';
      writeDb(db);

      const res = await request(app)
        .get('/api/jobs/next?shopId=alliance_print')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Printer is offline');
    });

    test('should successfully claim the next queued job and update its status to printing', async () => {
      const db = readDb();
      db.shops[0].bwStatusMode = 'online';
      db.jobs = [
        {
          id: 'job-next-1',
          token: 'NEXT1',
          fileName: 'doc1.pdf',
          fileSize: 100,
          pageCount: 1,
          copies: 1,
          printMode: 'mono',
          sides: 'single',
          status: 'queued',
          createdAt: '2026-07-15T12:00:00.000Z',
          shopId: 'alliance_print',
          timeline: []
        }
      ];
      writeDb(db);

      const res = await request(app)
        .get('/api/jobs/next?shopId=alliance_print')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('job-next-1');
      expect(res.body.status).toBe('printing');

      // Verify the claim operation is saved to the database with a timeline stage
      const updatedDb = readDb();
      const job = updatedDb.jobs[0];
      expect(job.status).toBe('printing');
      expect(job.timeline.some(t => t.stage === 'claimed')).toBe(true);
    });

    test('should return queued jobs in chronological (FIFO) priority order', async () => {
      const db = readDb();
      db.shops[0].bwStatusMode = 'online';
      db.jobs = [
        {
          id: 'job-fifo-A',
          token: 'FIFOA',
          fileName: 'first.pdf',
          fileSize: 100,
          pageCount: 1,
          copies: 1,
          printMode: 'mono',
          sides: 'single',
          status: 'queued',
          createdAt: '2026-07-15T12:00:00.000Z',
          shopId: 'alliance_print',
          timeline: []
        },
        {
          id: 'job-fifo-B',
          token: 'FIFOB',
          fileName: 'second.pdf',
          fileSize: 100,
          pageCount: 1,
          copies: 1,
          printMode: 'mono',
          sides: 'single',
          status: 'queued',
          createdAt: '2026-07-15T12:05:00.000Z',
          shopId: 'alliance_print',
          timeline: []
        }
      ];
      writeDb(db);

      const res = await request(app)
        .get('/api/jobs/next?shopId=alliance_print')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('job-fifo-A'); // Oldest queued job matches first
    });
  });

  // ==========================================
  // 6. JOB APPROVAL (POST /api/jobs/:id/approve)
  // ==========================================
  describe('POST /api/jobs/:id/approve', () => {
    test('should approve job and transition status from pending_approval to queued', async () => {
      const db = readDb();
      const mockJob = {
        id: 'job-app-1',
        token: 'APP1',
        fileName: 'doc.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'pending_approval',
        createdAt: '2026-07-15T12:00:00.000Z',
        shopId: 'alliance_print',
        timeline: []
      };
      db.jobs = [mockJob];
      writeDb(db);

      const res = await request(app)
        .post('/api/jobs/job-app-1/approve')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.job.status).toBe('queued');

      // Verify db changes
      const updatedJob = readDb().jobs[0];
      expect(updatedJob.status).toBe('queued');
      expect(updatedJob.timeline.some(t => t.stage === 'approved')).toBe(true);
    });

    test('should return 404 for approval request on missing job id', async () => {
      const res = await request(app)
        .post('/api/jobs/missing-job/approve')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Print job not found');
    });

    test('should restrict shop admin from approving print jobs of another shop', async () => {
      const db = readDb();
      const mockJob = {
        id: 'job-app-2',
        token: 'APP2',
        fileName: 'doc.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'pending_approval',
        createdAt: '2026-07-15T12:00:00.000Z',
        shopId: 'alliance_print',
        timeline: []
      };
      db.jobs = [mockJob];
      writeDb(db);

      // Attempt approval using otherShopToken (tjohn_print administrator)
      const res = await request(app)
        .post('/api/jobs/job-app-2/approve')
        .set('Authorization', `Bearer ${otherShopToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('You do not have access');
    });
  });

  // ==========================================
  // 7. JOB STATUS (POST /api/jobs/:id/status)
  // ==========================================
  describe('POST /api/jobs/:id/status', () => {
    test('should update status and progress properties', async () => {
      const db = readDb();
      const mockJob = {
        id: 'job-stat-1',
        token: 'STAT1',
        fileName: 'doc.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'queued',
        createdAt: '2026-07-15T12:00:00.000Z',
        shopId: 'alliance_print',
        timeline: []
      };
      db.jobs = [mockJob];
      writeDb(db);

      const res = await request(app)
        .post('/api/jobs/job-stat-1/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'printing', progressPercent: 45, reason: 'In-progress' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('printing');
      expect(res.body.progressPercent).toBe(45);
      expect(res.body.reason).toBe('In-progress');

      // Verify db
      const updatedJob = readDb().jobs[0];
      expect(updatedJob.status).toBe('printing');
      expect(updatedJob.progressPercent).toBe(45);
    });

    test('should delete serverFilePath upload from server disk when status becomes completed', async () => {
      // 1. Create a dummy file in uploads-test directory
      const dummyFileName = 'completed-job-temp.pdf';
      const dummyFilePath = path.join(UPLOADS_TEST_DIR, dummyFileName);
      fs.writeFileSync(dummyFilePath, 'dummy file data');
      expect(fs.existsSync(dummyFilePath)).toBe(true);

      // 2. Seed a mock printing job pointing to the dummy file path
      const db = readDb();
      const mockJob = {
        id: 'job-stat-completed',
        token: 'COMP1',
        fileName: 'completed.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'printing',
        createdAt: '2026-07-15T12:00:00.000Z',
        shopId: 'alliance_print',
        serverFilePath: '/uploads/' + dummyFileName,
        timeline: []
      };
      db.jobs = [mockJob];
      writeDb(db);

      // 3. Fire completed status trigger
      const res = await request(app)
        .post('/api/jobs/job-stat-completed/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');

      // 4. Assert disk file is successfully deleted
      expect(fs.existsSync(dummyFilePath)).toBe(false);
    });
  });

  // ==========================================
  // 8. TIMELINE (POST /api/jobs/:id/timeline)
  // ==========================================
  describe('POST /api/jobs/:id/timeline', () => {
    test('should append new timeline stage and record timestamps', async () => {
      const db = readDb();
      const mockJob = {
        id: 'job-time-1',
        token: 'TIME1',
        fileName: 'doc.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'printing',
        createdAt: '2026-07-15T12:00:00.000Z',
        shopId: 'alliance_print',
        timeline: []
      };
      db.jobs = [mockJob];
      writeDb(db);

      const res = await request(app)
        .post('/api/jobs/job-time-1/timeline')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stage: 'downloaded',
          printerId: 'alliance_prn',
          printerName: 'HP LaserJet 400',
          daemonInstance: 'inst-1',
          printType: 'bw',
          selectedPrinter: 'HP LaserJet 400'
        });

      expect(res.status).toBe(200);
      expect(res.body.timeline).toBeInstanceOf(Array);
      expect(res.body.timeline.length).toBe(1);

      const entry = res.body.timeline[0];
      expect(entry.stage).toBe('downloaded');
      expect(entry.printerName).toBe('HP LaserJet 400');
      expect(entry.at).toBeDefined(); // Timestamp generated
    });

    test('should reject invalid timeline stages with 400 error', async () => {
      const db = readDb();
      const mockJob = {
        id: 'job-time-2',
        token: 'TIME2',
        fileName: 'doc.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'printing',
        createdAt: '2026-07-15T12:00:00.000Z',
        shopId: 'alliance_print',
        timeline: []
      };
      db.jobs = [mockJob];
      writeDb(db);

      const res = await request(app)
        .post('/api/jobs/job-time-2/timeline')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stage: 'not_allowed_stage' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid stage');
    });
  });

  // ==========================================
  // 9. FAILURE SNAPSHOT (POST /api/jobs/:id/failure-snapshot)
  // ==========================================
  describe('POST /api/jobs/:id/failure-snapshot', () => {
    test('should successfully record physical failure snapshot and notes', async () => {
      const db = readDb();
      const mockJob = {
        id: 'job-fail-1',
        token: 'FAIL1',
        fileName: 'doc.pdf',
        fileSize: 100,
        pageCount: 1,
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        status: 'failed',
        createdAt: '2026-07-15T12:00:00.000Z',
        shopId: 'alliance_print',
        timeline: []
      };
      db.jobs = [mockJob];
      writeDb(db);

      const res = await request(app)
        .post('/api/jobs/job-fail-1/failure-snapshot')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          printerReported: ' Jam in Tray 2',
          physicalObservation: 'Wrinkled paper stuck in roller',
          paperOutput: false,
          operatorNotes: 'Pulled out sheet, checked rollers'
        });

      expect(res.status).toBe(200);
      expect(res.body.failureSnapshot).toBeDefined();

      const snapshot = res.body.failureSnapshot;
      expect(snapshot.printerReported).toBe(' Jam in Tray 2');
      expect(snapshot.physicalObservation).toBe('Wrinkled paper stuck in roller');
      expect(snapshot.paperOutput).toBe(false);
      expect(snapshot.operatorNotes).toBe('Pulled out sheet, checked rollers');
      expect(snapshot.recordedAt).toBeDefined(); // Timestamp check
    });
  });

});

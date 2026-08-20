import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { app } from '../../server/index.js';
import { readDb, writeDb } from '../../server/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_TEST_DIR = path.resolve(__dirname, '../../server/uploads-test');
const FIXTURES_DIR = path.resolve(__dirname, '../../server/uploads');

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
    printerStatus: 'online',
    lastHeartbeat: new Date().toISOString(),
    adminUsername: 'alliance_admin',
    adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00',
    bwStatusMode: 'auto',
    colorStatusMode: 'auto',
    bwMaintenanceMode: false,
    colorMaintenanceMode: false
  }
];

const DEFAULT_PRINTER_SETTINGS = {
  status: 'online',
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
    printerStatus: 'online',
    lastSeen: new Date().toISOString()
  }
];

function getTestAuthToken(studentId: string): string {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const payload = JSON.stringify({ studentId, expiresAt });
  const base64Payload = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', 'campusprint_admin_123').update(base64Payload).digest('base64url');
  return `${base64Payload}.${signature}`;
}

const testStudent = {
  id: 'student_basav_123',
  googleId: 'google_id_basav_123',
  name: 'Basav',
  email: 'basav@gmail.com',
  picture: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
  role: 'student' as const,
  createdAt: new Date().toISOString(),
  lastLogin: new Date().toISOString(),
  isActive: true,
  lastSeen: new Date().toISOString()
};

const testStudentToken = getTestAuthToken('student_basav_123');

// File paths of existing files in the repo
const samplePdfPath = path.join(FIXTURES_DIR, '1785257751871-c2f4ec2847a294a4.pdf');
const sampleDocxPath = path.join(FIXTURES_DIR, '1785257716958-c7c3f1e4df04f423.docx');
const samplePngPath = path.join(FIXTURES_DIR, '1785257902353-b7628f5215432545.png');

beforeAll(() => {
  // Ensure the uploads-test directory exists
  if (!fs.existsSync(UPLOADS_TEST_DIR)) {
    fs.mkdirSync(UPLOADS_TEST_DIR, { recursive: true });
  }
});

beforeEach(() => {
  // Clear uploads-test directory
  const files = fs.readdirSync(UPLOADS_TEST_DIR);
  for (const file of files) {
    fs.rmSync(path.join(UPLOADS_TEST_DIR, file), { recursive: true, force: true });
  }

  // Setup DB
  const agents = JSON.parse(JSON.stringify(DEFAULT_AGENTS));
  agents[0].lastSeen = new Date().toISOString();
  writeDb({
    jobs: [],
    shops: JSON.parse(JSON.stringify(DEFAULT_SHOPS)),
    printerSettings: JSON.parse(JSON.stringify(DEFAULT_PRINTER_SETTINGS)),
    agents,
    printers: [],
    students: [testStudent]
  });
});

describe('Document Conversion API Integration Tests', () => {
  test('should successfully accept and parse page count of a standard PDF', async () => {
    if (!fs.existsSync(samplePdfPath)) {
      console.warn('Sample PDF not found, skipping PDF test');
      return;
    }

    const configs = JSON.stringify([{ copies: 1, printType: 'bw', sides: 'single' }]);
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${testStudentToken}`)
      .field('studentName', 'Basav')
      .field('studentEmail', 'basav@gmail.com')
      .field('shopId', 'alliance_print')
      .field('configs', configs)
      .attach('files', samplePdfPath, 'homework.pdf');

    expect(res.status).toBe(201);
    const job = res.body.jobs ? res.body.jobs[0] : res.body[0];
    expect(job.pageCount).toBeGreaterThan(0);
    expect(job.serverFilePath).toContain('.pdf');
    expect(job.originalFilePath).toBeUndefined(); // PDF has no originalFilePath separation
    expect(job.chargedAmount).toBe(job.pageCount * 2); // 2rs per page for BW simplex
  });

  test('should successfully convert an image (PNG) to PDF and set page count as 1', async () => {
    if (!fs.existsSync(samplePngPath)) {
      console.warn('Sample PNG not found, skipping PNG test');
      return;
    }

    const configs = JSON.stringify([{ copies: 2, printType: 'color', sides: 'single' }]);
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${testStudentToken}`)
      .field('studentName', 'Basav')
      .field('studentEmail', 'basav@gmail.com')
      .field('shopId', 'alliance_print')
      .field('configs', configs)
      .attach('files', samplePngPath, 'image.png');

    expect(res.status).toBe(201);
    const job = res.body.jobs ? res.body.jobs[0] : res.body[0];
    expect(job.pageCount).toBe(1);
    expect(job.serverFilePath).toContain('.pdf');
    expect(job.originalFilePath).toContain('.png');

    // Verify converted PDF actually exists in UPLOADS_TEST_DIR
    const localPdfPath = path.join(UPLOADS_TEST_DIR, path.basename(job.serverFilePath));
    expect(fs.existsSync(localPdfPath)).toBe(true);

    // Verify original file exists in UPLOADS_TEST_DIR
    const localOrigPath = path.join(UPLOADS_TEST_DIR, path.basename(job.originalFilePath));
    expect(fs.existsSync(localOrigPath)).toBe(true);

    // Color pricing: 5rs * 1 page * 2 copies = 10rs
    expect(job.chargedAmount).toBe(10);
  });

  test('should explicitly reject all Office document formats (.doc, .docx, .ppt, .pptx) with HTTP 400', async () => {
    const formats = [
      { name: 'document.doc', content: Buffer.from('mock doc content') },
      { name: 'document.docx', content: Buffer.from('mock docx content') },
      { name: 'presentation.ppt', content: Buffer.from('mock ppt content') },
      { name: 'presentation.pptx', content: Buffer.from('mock pptx content') }
    ];

    const configs = JSON.stringify([{ copies: 1, printType: 'bw', sides: 'single' }]);

    for (const file of formats) {
      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${testStudentToken}`)
        .field('studentName', 'Basav')
        .field('studentEmail', 'basav@gmail.com')
        .field('shopId', 'alliance_print')
        .field('configs', configs)
        .attach('files', file.content, file.name);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Only PDF (.pdf) and images (.png, .jpg, .jpeg) are supported.');
    }
  });

  test('should reject request when magic bytes do not match extension', async () => {
    const badBuffer = Buffer.from('NOT_A_PNG_FILE_CONTENT');
    const configs = JSON.stringify([{ copies: 1, printType: 'bw', sides: 'single' }]);
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${testStudentToken}`)
      .field('studentName', 'Basav')
      .field('shopId', 'alliance_print')
      .field('configs', configs)
      .attach('files', badBuffer, 'hacked.png');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Security verification failed');

    // Verify no files are left behind
    const files = fs.readdirSync(UPLOADS_TEST_DIR);
    expect(files.length).toBe(0);
  });

  test('should successfully pre-convert and preview a file, then submit print job using it', async () => {
    if (!fs.existsSync(samplePngPath)) {
      console.warn('Sample PNG not found, skipping pre-conversion test');
      return;
    }

    // 1. Trigger pre-convert
    const preConvRes = await request(app)
      .post('/api/jobs/pre-convert')
      .set('Authorization', `Bearer ${testStudentToken}`)
      .attach('file', samplePngPath, 'image.png');

    expect(preConvRes.status).toBe(200);
    expect(preConvRes.body.success).toBe(true);
    expect(preConvRes.body.pageCount).toBe(1);
    expect(preConvRes.body.pdfFilename).toContain('.pdf');
    expect(preConvRes.body.originalFilename).toContain('.png');

    const { pdfFilename, originalFilename, originalSize } = preConvRes.body;

    // 2. Test pre-convert preview endpoint
    const previewRes = await request(app)
      .get(`/api/jobs/pre-convert/preview/${pdfFilename}`)
      .set('Authorization', `Bearer ${testStudentToken}`);

    expect(previewRes.status).toBe(200);
    expect(previewRes.header['content-type']).toContain('application/pdf');

    // 3. Test submitting job using pre-converted references
    const configs = JSON.stringify([{
      copies: 2,
      printType: 'color',
      sides: 'single',
      preConvertedPdfFilename: pdfFilename,
      preConvertedOriginalFilename: originalFilename,
      name: 'image.png',
      size: originalSize
    }]);

    const submitRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${testStudentToken}`)
      .field('studentName', 'Basav')
      .field('studentEmail', 'basav@gmail.com')
      .field('shopId', 'alliance_print')
      .field('configs', configs);

    expect(submitRes.status).toBe(201);
    const job = submitRes.body.jobs ? submitRes.body.jobs[0] : submitRes.body[0];
    expect(job.pageCount).toBe(1);
    expect(job.serverFilePath).toContain(pdfFilename);
    expect(job.originalFilePath).toContain(originalFilename);
    expect(job.chargedAmount).toBe(10); // Color pricing: 5rs * 1 page * 2 copies = 10rs
  }, 30000);
});

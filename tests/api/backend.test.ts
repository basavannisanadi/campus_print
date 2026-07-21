import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from '../../server/index.js';
import { readDb, writeDb } from '../../server/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_TEST_PATH = path.resolve(__dirname, '../../server/data/db.test.json');
const UPLOADS_TEST_DIR = path.resolve(__dirname, '../../server/uploads-test');

const DEFAULT_SHOPS = [
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
    adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00' // SHA-256 hash of 'tjohn_password123'
  }
];

const DEFAULT_PRINTER_SETTINGS = {
  status: 'offline',
  expectedReturnTime: '2:00 PM',
  averagePrintSpeed: 5,
  adminOverrideStatus: 'none'
};

beforeEach(() => {
  // Reset database state to a clean template before each test run
  writeDb({
    jobs: [],
    shops: JSON.parse(JSON.stringify(DEFAULT_SHOPS)),
    printerSettings: JSON.parse(JSON.stringify(DEFAULT_PRINTER_SETTINGS)),
    agents: [],
    printers: []
  });
});

afterAll(() => {
  // Cleanup test artifacts from disk
  if (fs.existsSync(DB_TEST_PATH)) {
    try { fs.unlinkSync(DB_TEST_PATH); } catch {}
  }
  if (fs.existsSync(UPLOADS_TEST_DIR)) {
    try { fs.rmSync(UPLOADS_TEST_DIR, { recursive: true, force: true }); } catch {}
  }
});

describe('Express Backend API Integration Tests', () => {
  // --- AUTHENTICATION ---
  describe('Authentication Endpoints', () => {
    test('POST /api/auth/login - Success (Shop Admin)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          shopId: 'tjohn_print',
          username: 'tjohn_admin',
          password: 'tjohn_password123'
        });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.role).toBe('shop_admin');
      expect(res.body.shopId).toBe('tjohn_print');
      expect(res.body.token).toBeDefined();
      expect(res.body.token.startsWith('token_tjohn_print_')).toBe(true);
    });

    test('POST /api/auth/login - Success (Owner)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'owner',
          password: 'campusprint_admin_123'
        });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.role).toBe('owner');
      expect(res.body.token).toBe('campusprint_admin_123');
    });

    test('POST /api/auth/login - Fail (Invalid password)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          shopId: 'tjohn_print',
          username: 'tjohn_admin',
          password: 'wrong_password'
        });
      
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toContain('Invalid');
    });

    test('POST /api/auth/login - Fail (Missing fields)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'tjohn_admin'
        });
      
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('required');
    });

    test('POST /api/admin/verify - Success', async () => {
      // 1. Get signed token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          shopId: 'tjohn_print',
          username: 'tjohn_admin',
          password: 'tjohn_password123'
        });
      const token = loginRes.body.token;

      // 2. Verify
      const res = await request(app)
        .post('/api/admin/verify')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('POST /api/admin/verify - Fail (Unauthorized)', async () => {
      const res = await request(app)
        .post('/api/admin/verify')
        .set('Authorization', 'Bearer invalid_token');
      
      expect(res.statusCode).toBe(401);
    });
  });

  // --- SHOPS ---
  describe('Shop Endpoints', () => {
    test('GET /api/shops - Success', async () => {
      const res = await request(app).get('/api/shops');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].id).toBe('tjohn_print');
      
      // Security check: passwords and hashes must be sanitized
      expect(res.body[0].adminUsername).toBeUndefined();
      expect(res.body[0].adminPasswordHash).toBeUndefined();
    });

    test('GET /api/shops/:id - Success', async () => {
      const res = await request(app).get('/api/shops/tjohn_print');
      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe('tjohn_print');
      expect(res.body.name).toBe('TJohn Print Center');
      expect(res.body.adminUsername).toBeUndefined();
      expect(res.body.adminPasswordHash).toBeUndefined();
    });

    test('GET /api/shops/:id - Fail (Not found)', async () => {
      const res = await request(app).get('/api/shops/nonexistent_shop');
      expect(res.statusCode).toBe(404);
    });

    test('PUT /api/shops/:id/settings - Success with valid token', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          shopId: 'tjohn_print',
          username: 'tjohn_admin',
          password: 'tjohn_password123'
        });
      const token = loginRes.body.token;

      const res = await request(app)
        .put('/api/shops/tjohn_print/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated TJohn Center',
          address: 'New Location'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated TJohn Center');
      expect(res.body.address).toBe('New Location');
    });

    test('PUT /api/shops/:id/settings - Fail (Unauthorized)', async () => {
      const res = await request(app)
        .put('/api/shops/tjohn_print/settings')
        .send({
          name: 'Updated Name'
        });
      expect(res.statusCode).toBe(401);
    });
  });

  // --- ONLINE / OFFLINE Lifecycle ---
  describe('Go Online / Go Offline Controls', () => {
    test('POST /api/shop/go-online & go-offline - Success lifecycle', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          shopId: 'tjohn_print',
          username: 'tjohn_admin',
          password: 'tjohn_password123'
        });
      const token = loginRes.body.token;

      // 1. Go Online
      const onlineRes = await request(app)
        .post('/api/shop/go-online')
        .set('Authorization', `Bearer ${token}`)
        .send({ shopId: 'tjohn_print' });

      expect(onlineRes.statusCode).toBe(200);
      expect(onlineRes.body.success).toBe(true);

      const dbAfterOnline = readDb();
      const shopAfterOnline = dbAfterOnline.shops.find(s => s.id === 'tjohn_print');
      expect(shopAfterOnline?.operationalState).toBe('connecting');

      // 2. Go Offline
      const offlineRes = await request(app)
        .post('/api/shop/go-offline')
        .set('Authorization', `Bearer ${token}`)
        .send({ shopId: 'tjohn_print' });

      expect(offlineRes.statusCode).toBe(200);
      expect(offlineRes.body.success).toBe(true);

      const dbAfterOffline = readDb();
      const shopAfterOffline = dbAfterOffline.shops.find(s => s.id === 'tjohn_print');
      expect(shopAfterOffline?.operationalState).toBe('offline');
    });
  });

  // --- AGENT INTERACTION ---
  describe('Agent Register and Heartbeat', () => {
    test('POST /api/agent/register - Success', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          shopId: 'tjohn_print',
          username: 'tjohn_admin',
          password: 'tjohn_password123'
        });
      const token = loginRes.body.token;

      const res = await request(app)
        .post('/api/agent/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          agentId: 'CP-AGENT-TEST',
          shopId: 'tjohn_print',
          machineName: 'TEST-MACHINE',
          printerName: 'TestPrinter',
          daemonVersion: '1.0.0',
          printers: ['TestPrinter', 'ColorPrinter']
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      const db = readDb();
      const shop = db.shops.find(s => s.id === 'tjohn_print');
      expect(shop?.operationalState).toBe('online');

      const agent = db.agents?.find(a => a.agentId === 'CP-AGENT-TEST');
      expect(agent).toBeDefined();
      expect(agent?.onlineStatus).toBe('online');
    });

    test('POST /api/agent/heartbeat - Success', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          shopId: 'tjohn_print',
          username: 'tjohn_admin',
          password: 'tjohn_password123'
        });
      const token = loginRes.body.token;

      // Register first
      await request(app)
        .post('/api/agent/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          agentId: 'CP-AGENT-TEST',
          shopId: 'tjohn_print',
          machineName: 'TEST-MACHINE',
          printerName: 'TestPrinter',
          daemonVersion: '1.0.0',
          printers: []
        });

      const res = await request(app)
        .post('/api/agent/heartbeat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          agentId: 'CP-AGENT-TEST',
          shopId: 'tjohn_print',
          installedVersion: '1.0.0',
          selectedPrinter: 'TestPrinter',
          printerCount: 0,
          printerStatus: 'idle',
          queueLength: 0,
          currentJob: null,
          lastPrintTime: '',
          agentUptime: 100,
          windowsVersion: 'Windows 10',
          lastCommunication: new Date().toISOString()
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // --- DATABASE RESET ---
  describe('System Reset Control', () => {
    test('POST /api/reset - Fail as Shop Admin', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          shopId: 'tjohn_print',
          username: 'tjohn_admin',
          password: 'tjohn_password123'
        });
      const token = loginRes.body.token;

      const res = await request(app)
        .post('/api/reset')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(403);
    });

    test('POST /api/reset - Success as Owner', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'owner',
          password: 'campusprint_admin_123'
        });
      const token = loginRes.body.token;

      const res = await request(app)
        .post('/api/reset')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Reset complete');
    });
  });
});

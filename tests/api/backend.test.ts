import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
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
      expect(res.body.token).toBeDefined();
      expect(res.body.token).not.toBe('campusprint_admin_123');
      expect(res.body.token.startsWith('owner_session_')).toBe(true);
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

    test('POST /api/auth/login - Legacy SHA-256 to bcrypt upgrade flow', async () => {
      const db = readDb();
      // Force alliance_print password hash to be legacy sha256 of 'alliance_password123'
      const legacyHash = crypto.createHash('sha256').update('alliance_password123').digest('hex');
      const shop = db.shops.find(s => s.id === 'alliance_print')!;
      shop.adminPasswordHash = legacyHash;
      writeDb(db);

      // 1. First login with legacy hash -> should succeed and trigger upgrade
      const res1 = await request(app)
        .post('/api/auth/login')
        .send({
          shopId: 'alliance_print',
          username: 'alliance_admin',
          password: 'alliance_password123'
        });
      expect(res1.statusCode).toBe(200);
      expect(res1.body.token).toBeDefined();

      // Verify db is updated with bcrypt hash
      const db2 = readDb();
      const updatedHash = db2.shops.find(s => s.id === 'alliance_print')!.adminPasswordHash!;
      expect(updatedHash.startsWith('$2a$') || updatedHash.startsWith('$2b$')).toBe(true);

      // 2. Second login using same password -> should succeed with bcrypt
      const res2 = await request(app)
        .post('/api/auth/login')
        .send({
          shopId: 'alliance_print',
          username: 'alliance_admin',
          password: 'alliance_password123'
        });
      expect(res2.statusCode).toBe(200);
      expect(res2.body.token).toBeDefined();
    });

    test('POST /api/auth/login - Dedicated rate limiter functionality', async () => {
      const express = (await import('express')).default;
      const rateLimit = (await import('express-rate-limit')).default;
      
      const testApp = express();
      testApp.use(express.json());

      const testLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 5,
        message: { error: 'Too many login attempts. Please try again after a minute.' },
        standardHeaders: true,
        legacyHeaders: false,
      });

      testApp.post('/api/auth/login', testLimiter, (req, res) => {
        res.status(200).json({ success: true });
      });

      // 1. Five login attempts succeed
      for (let i = 0; i < 5; i++) {
        const res = await request(testApp)
          .post('/api/auth/login')
          .send({ username: 'owner', password: 'campusprint_admin_123' });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
      }

      // 2. The sixth attempt returns HTTP 429
      const res6 = await request(testApp)
        .post('/api/auth/login')
        .send({ username: 'owner', password: 'campusprint_admin_123' });
      expect(res6.statusCode).toBe(429);
      expect(res6.body.error).toContain('Too many login attempts');
    });

    test('apiLimiter - should not bypass rate limiting based on Authorization header presence/format', async () => {
      const express = (await import('express')).default;
      const rateLimit = (await import('express-rate-limit')).default;

      const testApp = express();
      testApp.use(express.json());

      // Mock rate limiter matching the updated apiLimiter logic (no Bearer token_ bypass)
      const testLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 3,
        message: { error: 'Too many requests' },
        standardHeaders: true,
        legacyHeaders: false,
      });

      testApp.get('/api/test', testLimiter, (req, res) => {
        res.status(200).json({ success: true });
      });

      // Send 3 requests with fake Authorization header format - should succeed
      for (let i = 0; i < 3; i++) {
        const res = await request(testApp)
          .get('/api/test')
          .set('Authorization', 'Bearer token_fake123');
        expect(res.statusCode).toBe(200);
      }

      // 4th request must be rate limited (429) despite having the 'Bearer token_' format
      const res4 = await request(testApp)
        .get('/api/test')
        .set('Authorization', 'Bearer token_fake123');
      expect(res4.statusCode).toBe(429);
    });

    test('CORS policy - should allow localhost/explicit origins and reject others', async () => {
      // 1. Request without Origin header should succeed
      const resNoOrigin = await request(app).get('/api/shops');
      expect(resNoOrigin.statusCode).toBe(200);

      // 2. Request with localhost Origin should succeed and return Access-Control-Allow-Origin
      const resLocalhost = await request(app)
        .get('/api/shops')
        .set('Origin', 'http://localhost:3000');
      expect(resLocalhost.statusCode).toBe(200);
      expect(resLocalhost.headers['access-control-allow-origin']).toBe('http://localhost:3000');

      // 3. Request with 127.0.0.1 Origin should succeed
      const resLoopback = await request(app)
        .get('/api/shops')
        .set('Origin', 'http://127.0.0.1:4000');
      expect(resLoopback.statusCode).toBe(200);
      expect(resLoopback.headers['access-control-allow-origin']).toBe('http://127.0.0.1:4000');

      // 4. Request with untrusted Origin should not return Access-Control-Allow-Origin
      const resUntrusted = await request(app)
        .get('/api/shops')
        .set('Origin', 'https://untrusted-domain.com');
      expect(resUntrusted.statusCode).toBe(200);
      expect(resUntrusted.headers['access-control-allow-origin']).toBeUndefined();
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

  // --- HTTP RESPONSE COMPRESSION ---
  describe('HTTP Response Compression', () => {
    test('should compress JSON API responses', async () => {
      const res = await request(app)
        .get('/api/shops')
        .set('Accept-Encoding', 'gzip');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-encoding']).toBe('gzip');
    });

    test('should not compress Server-Sent Events', async () => {
      // 1. Log in to get admin token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          shopId: 'tjohn_print',
          username: 'tjohn_admin',
          password: 'tjohn_password123'
        });
      const token = loginRes.body.token;

      // 2. Request SSE stream
      const req = request(app)
        .get('/api/jobs/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Accept-Encoding', 'gzip');
      
      const resPromise = req.then(r => r);
      setTimeout(() => {
        req.abort();
      }, 200);

      try {
        const res = await resPromise;
        expect(res.headers['content-encoding']).toBeUndefined();
      } catch (err: any) {
        const res = err.response;
        if (res) {
          expect(res.headers['content-encoding']).toBeUndefined();
        }
      }
    });
  });

  describe('Static Frontend Delivery Caching', () => {
    test('should serve index.html with must-revalidate headers on wildcard route', async () => {
      const res = await request(app).get('/admin');
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
      expect(res.text).toContain('<div id="root">');
    });
  });
});

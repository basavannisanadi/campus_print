import { describe, test, expect, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../server/index.js';
import { readDb, writeDb } from '../../server/db.js';

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
  selectedPrinter: 'HP LaserJet 400',
  availablePrinters: [],
  scanRequested: false
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
let ownerToken = '';

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

  // Retrieve Owner token
  const res3 = await request(app)
    .post('/api/auth/login')
    .send({
      username: 'owner',
      password: process.env.ADMIN_API_KEY || 'campusprint_admin_123'
    });
  ownerToken = res3.body.token;
});

beforeEach(() => {
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

describe('Printer API Supertest Coverage', () => {

  // ==========================================
  // 1. GET /api/printer/settings
  // ==========================================
  describe('GET /api/printer/settings', () => {
    test('should fetch resolved settings successfully', async () => {
      const res = await request(app)
        .get('/api/printer/settings?shopId=alliance_print')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBeDefined();
      expect(res.body.averagePrintSpeed).toBe(5);
      expect(res.body.adminOverrideStatus).toBe('none');
    });

    test('should restrict unauthorized requests with 401', async () => {
      const res = await request(app).get('/api/printer/settings');
      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // 2. POST /api/printer/status
  // ==========================================
  describe('POST /api/printer/status', () => {
    test('should update available printers and status successfully', async () => {
      const res = await request(app)
        .post('/api/printer/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'online',
          printers: ['HP LaserJet', 'Brother Color']
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const db = readDb();
      expect(db.printerSettings?.status).toBe('online');
      expect(db.printerSettings?.availablePrinters).toEqual(['HP LaserJet', 'Brother Color']);
    });

    test('should ignore status heartbeat if adminOverrideStatus is active', async () => {
      const db = readDb();
      if (db.printerSettings) {
        db.printerSettings.adminOverrideStatus = 'offline';
        db.printerSettings.status = 'offline';
      }
      writeDb(db);

      const res = await request(app)
        .post('/api/printer/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'online' });

      expect(res.status).toBe(200);

      const updatedDb = readDb();
      expect(updatedDb.printerSettings?.status).toBe('offline'); // override respected
    });
  });

  // ==========================================
  // 3. POST /api/printer/settings
  // ==========================================
  describe('POST /api/printer/settings', () => {
    test('should configure B&W printer settings independently', async () => {
      const res = await request(app)
        .post('/api/printer/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shopId: 'alliance_print',
          printerType: 'bw',
          adminOverrideStatus: 'online',
          underMaintenance: true,
          selectedPrinterId: 'bw-1',
          selectedPrinterName: 'HP LaserJet'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const db = readDb();
      const shop = db.shops.find(s => s.id === 'alliance_print');
      expect(shop?.bwStatusMode).toBe('online');
      expect(shop?.bwMaintenanceMode).toBe(true);
      expect(shop?.bwPrinterId).toBe('bw-1');
      expect(shop?.bwPrinterName).toBe('HP LaserJet');
    });

    test('should configure Color printer settings independently', async () => {
      const res = await request(app)
        .post('/api/printer/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shopId: 'alliance_print',
          printerType: 'color',
          adminOverrideStatus: 'offline',
          underMaintenance: false,
          selectedPrinterId: 'color-1',
          selectedPrinterName: 'HP Color'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const db = readDb();
      const shop = db.shops.find(s => s.id === 'alliance_print');
      expect(shop?.colorStatusMode).toBe('offline');
      expect(shop?.colorMaintenanceMode).toBe(false);
      expect(shop?.colorPrinterId).toBe('color-1');
      expect(shop?.colorPrinterName).toBe('HP Color');
    });

    test('should configure legacy global/default settings if printerType is omitted', async () => {
      const res = await request(app)
        .post('/api/printer/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          adminOverrideStatus: 'online',
          expectedReturnTime: '5:00 PM',
          averagePrintSpeed: 10,
          underMaintenance: true,
          selectedPrinter: 'HP LaserJet'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const db = readDb();
      expect(db.printerSettings?.adminOverrideStatus).toBe('online');
      expect(db.printerSettings?.expectedReturnTime).toBe('5:00 PM');
      expect(db.printerSettings?.averagePrintSpeed).toBe(10);
      expect(db.printerSettings?.underMaintenance).toBe(true);
      expect(db.printerSettings?.selectedPrinter).toBe('HP LaserJet');
    });

    test('should return 404 if targeted shop does not exist', async () => {
      // Must use ownerToken to bypass shop admin middleware access validation
      const res = await request(app)
        .post('/api/printer/settings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ shopId: 'missing_shop' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Shop not found');
    });
  });

  // ==========================================
  // 4. POST /api/printer/scan
  // ==========================================
  describe('POST /api/printer/scan', () => {
    test('should trigger legacy scanRequest successfully', async () => {
      const res = await request(app)
        .post('/api/printer/scan')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const db = readDb();
      expect(db.printerSettings?.scanRequested).toBe(true);
    });
  });

  // ==========================================
  // 5. GET /api/printers/mapping
  // ==========================================
  describe('GET /api/printers/mapping', () => {
    test('should retrieve shop mapping configurations successfully', async () => {
      const db = readDb();
      const shop = db.shops.find(s => s.id === 'alliance_print');
      if (shop) {
        shop.bwPrinterId = 'bw-id';
        shop.bwPrinterName = 'BW Printer';
        shop.colorPrinterId = 'color-id';
        shop.colorPrinterName = 'Color Printer';
      }
      writeDb(db);

      const res = await request(app)
        .get('/api/printers/mapping?shopId=alliance_print')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.bwPrinterId).toBe('bw-id');
      expect(res.body.bwPrinterName).toBe('BW Printer');
      expect(res.body.colorPrinterId).toBe('color-id');
      expect(res.body.colorPrinterName).toBe('Color Printer');
    });

    test('should restrict cross-shop mapping retrieval', async () => {
      // Attempting to read mapping config of tjohn_print using alliance_print token
      const res = await request(app)
        .get('/api/printers/mapping?shopId=tjohn_print')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('You do not have access');
    });
  });

  // ==========================================
  // 6. PUT /api/printers/mapping
  // ==========================================
  describe('PUT /api/printers/mapping', () => {
    test('should configure mapping details successfully', async () => {
      const res = await request(app)
        .put('/api/printers/mapping')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shopId: 'alliance_print',
          bwPrinterId: 'bw-new',
          bwPrinterName: 'BW New',
          colorPrinterId: 'color-new',
          colorPrinterName: 'Color New'
        });

      expect(res.status).toBe(200);
      expect(res.body.bwPrinterId).toBe('bw-new');
      expect(res.body.colorPrinterId).toBe('color-new');

      const db = readDb();
      const shop = db.shops.find(s => s.id === 'alliance_print');
      expect(shop?.bwPrinterId).toBe('bw-new');
      expect(shop?.colorPrinterId).toBe('color-new');
    });

    test('should restrict cross-shop mapping updates', async () => {
      const res = await request(app)
        .put('/api/printers/mapping')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ shopId: 'tjohn_print', bwPrinterId: 'hacker-id' });

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // 7. PUT /api/printers/bw
  // ==========================================
  describe('PUT /api/printers/bw', () => {
    test('should update B&W configuration and maintenance mode', async () => {
      const res = await request(app)
        .put('/api/printers/bw')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shopId: 'alliance_print',
          bwPrinterId: 'bw-single',
          bwPrinterName: 'BW Single',
          bwMaintenanceMode: true
        });

      expect(res.status).toBe(200);
      expect(res.body.bwPrinterId).toBe('bw-single');
      expect(res.body.bwMaintenanceMode).toBe(true);

      const db = readDb();
      const shop = db.shops.find(s => s.id === 'alliance_print');
      expect(shop?.bwPrinterId).toBe('bw-single');
      expect(shop?.bwMaintenanceMode).toBe(true);
    });
  });

  // ==========================================
  // 8. PUT /api/printers/color
  // ==========================================
  describe('PUT /api/printers/color', () => {
    test('should update Color configuration and maintenance mode', async () => {
      const res = await request(app)
        .put('/api/printers/color')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shopId: 'alliance_print',
          colorPrinterId: 'color-single',
          colorPrinterName: 'Color Single',
          colorMaintenanceMode: true
        });

      expect(res.status).toBe(200);
      expect(res.body.colorPrinterId).toBe('color-single');
      expect(res.body.colorMaintenanceMode).toBe(true);

      const db = readDb();
      const shop = db.shops.find(s => s.id === 'alliance_print');
      expect(shop?.colorPrinterId).toBe('color-single');
      expect(shop?.colorMaintenanceMode).toBe(true);
    });
  });

  // ==========================================
  // 9. POST /api/agent/scan-printers
  // ==========================================
  describe('POST /api/agent/scan-printers', () => {
    test('should successfully trigger print agent scan', async () => {
      const res = await request(app)
        .post('/api/agent/scan-printers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ shopId: 'alliance_print' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Scan initiated');

      const db = readDb();
      const agent = db.agents?.find(a => a.shopId === 'alliance_print');
      expect(agent?.scanRequested).toBe(true);
      expect(agent?.scanStatus).toBe('scanning');
    });

    test('should reject request when scan is already in progress', async () => {
      const db = readDb();
      const agent = db.agents?.find(a => a.shopId === 'alliance_print');
      if (agent) {
        agent.scanStatus = 'scanning';
        agent.scanStartedAt = new Date().toISOString();
      }
      writeDb(db);

      const res = await request(app)
        .post('/api/agent/scan-printers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ shopId: 'alliance_print' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('discovery already in progress');
    });

    test('should return 404 when active agent is missing', async () => {
      // Must use ownerToken to bypass shop admin middleware access validation
      const res = await request(app)
        .post('/api/agent/scan-printers')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ shopId: 'tjohn_print' }); // tjohn has no agent registered

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No active agent registered');
    });
  });

});

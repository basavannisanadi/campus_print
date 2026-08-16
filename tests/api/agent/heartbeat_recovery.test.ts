import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from '../../../server/index.js';
import { readDb, writeDb } from '../../../server/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_TEST_PATH = path.resolve(__dirname, '../../../server/data/db.test.json');

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
    operationalState: 'offline',
    lastHeartbeat: ''
  }
];

beforeEach(() => {
  writeDb({
    jobs: [],
    shops: JSON.parse(JSON.stringify(DEFAULT_SHOPS)),
    printerSettings: {
      status: 'offline',
      expectedReturnTime: '2:00 PM',
      averagePrintSpeed: 5,
      adminOverrideStatus: 'none',
      selectedPrinter: ''
    },
    agents: [],
    printers: []
  });
});

afterAll(() => {
  if (fs.existsSync(DB_TEST_PATH)) {
    try { fs.unlinkSync(DB_TEST_PATH); } catch {}
  }
});

describe('Desktop Agent Heartbeat Auto-Recovery Tests', () => {
  test('A. Existing registered agent heartbeat succeeds', async () => {
    // 1. Register agent first
    const regRes = await request(app)
      .post('/api/agent/register')
      .set('Authorization', 'Bearer campusprint_agent_token_123')
      .send({
        agentId: 'CP-AGENT-TEST-001',
        shopId: 'tjohn_print',
        machineName: 'SHOP-PC-01',
        printerName: 'Canon LBP2900',
        daemonVersion: '1.0.0',
        printers: ['Canon LBP2900']
      });
    expect(regRes.status).toBe(200);

    // 2. Send heartbeat
    const hbRes = await request(app)
      .post('/api/agent/heartbeat')
      .set('Authorization', 'Bearer campusprint_agent_token_123')
      .send({
        agentId: 'CP-AGENT-TEST-001',
        shopId: 'tjohn_print',
        printerName: 'Canon LBP2900',
        daemonVersion: '1.0.0',
        printers: ['Canon LBP2900'],
        printerStatus: 'online'
      });
    expect(hbRes.status).toBe(200);
    expect(hbRes.body.success).toBe(true);

    const db = readDb();
    expect(db.agents.length).toBe(1);
    expect(db.agents[0].onlineStatus).toBe('online');
  });

  test('B. Missing agent record + valid authenticated heartbeat automatically recovers', async () => {
    // DB has no agents registered (e.g. after server restart)
    const dbBefore = readDb();
    expect(dbBefore.agents.length).toBe(0);

    // Send valid authenticated heartbeat
    const hbRes = await request(app)
      .post('/api/agent/heartbeat')
      .set('Authorization', 'Bearer campusprint_agent_token_123')
      .send({
        agentId: 'CP-AGENT-RECOVER-002',
        shopId: 'tjohn_print',
        machineName: 'SHOP-PC-02',
        printerName: 'HP LaserJet Pro',
        daemonVersion: '1.0.0',
        printers: ['HP LaserJet Pro'],
        printerStatus: 'online'
      });

    expect(hbRes.status).toBe(200);
    expect(hbRes.body.success).toBe(true);

    // Verify agent was automatically recreated and marked online
    const dbAfter = readDb();
    expect(dbAfter.agents.length).toBe(1);
    const agent = dbAfter.agents.find((a: any) => a.agentId === 'CP-AGENT-RECOVER-002');
    expect(agent).toBeDefined();
    expect(agent?.shopId).toBe('tjohn_print');
    expect(agent?.onlineStatus).toBe('online');
    expect(agent?.machineName).toBe('SHOP-PC-02');
  });

  test('C. Invalid agent token cannot auto-register or send heartbeat', async () => {
    const hbRes = await request(app)
      .post('/api/agent/heartbeat')
      .set('Authorization', 'Bearer INVALID_EXPIRED_TOKEN')
      .send({
        agentId: 'CP-AGENT-ATTACK-003',
        shopId: 'tjohn_print',
        machineName: 'ATTACKER-PC',
        printerName: 'Fake Printer',
        daemonVersion: '1.0.0'
      });

    expect(hbRes.status).toBe(401);

    const db = readDb();
    expect(db.agents.length).toBe(0);
  });

  test('D. Duplicate agent records are not created on repeated heartbeats', async () => {
    // Send 3 heartbeats for the same agent
    for (let i = 0; i < 3; i++) {
      const hbRes = await request(app)
        .post('/api/agent/heartbeat')
        .set('Authorization', 'Bearer campusprint_agent_token_123')
        .send({
          agentId: 'CP-AGENT-IDEMPOTENT-004',
          shopId: 'tjohn_print',
          machineName: 'SHOP-PC-04',
          printerName: 'Epson L3150',
          daemonVersion: '1.0.0',
          printers: ['Epson L3150'],
          printerStatus: 'online'
        });
      expect(hbRes.status).toBe(200);
    }

    const db = readDb();
    const matchingAgents = db.agents.filter((a: any) => a.agentId === 'CP-AGENT-IDEMPOTENT-004');
    expect(matchingAgents.length).toBe(1);
  });
});

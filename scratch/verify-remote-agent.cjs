const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
const AGENT_TOKEN = 'campusprint_agent_token_123';
const DB_PATH = 'd:/WEBSITES/campus-printing-queue-and-management-system/server/data/db.json';

async function test() {
  console.log('Starting Remote Agent API Verification Tests...');

  try {
    // 1. Test Registration Authentication
    console.log('\n--- 1. Testing Registration Security (agentToken) ---');
    try {
      await apiPost('/api/agent/register', {
        agentId: 'TEST-AGENT-001',
        shopId: 'tjohn_print',
        agentToken: 'wrong_token'
      });
      throw new Error('FAIL: Registration allowed with invalid agentToken!');
    } catch (err) {
      if (err.message.includes('401')) {
        console.log('✓ PASS: Registration rejected with invalid token.');
      } else {
        throw err;
      }
    }

    // 2. Register Agent Successfully
    console.log('\n--- 2. Registering Agent with Valid Details ---');
    const regRes = await apiPost('/api/agent/register', {
      agentId: 'TEST-AGENT-001',
      shopId: 'tjohn_print',
      machineName: 'TEST-MACHINE',
      printerName: 'Canon iR3225 Test',
      daemonVersion: '1.0.0-test',
      agentToken: AGENT_TOKEN
    });
    console.log('✓ PASS: Agent registered successfully:', regRes);

    // Verify DB persistence (Requirement: Store in database. DO NOT use in-memory-only storage.)
    const dbAfterReg = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const storedAgent = dbAfterReg.agents?.find(a => a.agentId === 'TEST-AGENT-001');
    if (!storedAgent || storedAgent.onlineStatus !== 'online') {
      throw new Error('FAIL: Agent was not saved correctly to db.json!');
    }
    console.log('✓ PASS: Agent details successfully persisted to database.');
    console.log('Stored Agent details:', storedAgent);

    // 3. Test Heartbeat Updating
    console.log('\n--- 3. Testing Heartbeat Update ---');
    const hbRes = await apiPost('/api/agent/heartbeat', {
      agentId: 'TEST-AGENT-001',
      shopId: 'tjohn_print',
      printerName: 'Canon iR3225 Test (Updated)',
      daemonVersion: '1.0.0-test'
    }, { 'Authorization': `Bearer ${AGENT_TOKEN}` });
    console.log('✓ PASS: Heartbeat update successful:', hbRes);

    const dbAfterHb = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const updatedAgent = dbAfterHb.agents?.find(a => a.agentId === 'TEST-AGENT-001');
    console.log('Updated Agent printerName:', updatedAgent.printerName);
    if (updatedAgent.printerName !== 'Canon iR3225 Test (Updated)') {
      throw new Error('FAIL: Heartbeat payload did not update printerName in DB!');
    }
    console.log('✓ PASS: Heartbeat payload successfully updated printer details.');

    // 4. Test GET /api/shops exposure
    console.log('\n--- 4. Testing GET /api/shops Telemetry Exposure ---');
    const shops = await apiGet('/api/shops');
    const allianceShop = shops.find(s => s.id === 'tjohn_print');
    console.log('Alliance Shop telemetry keys:', {
      printerStatus: allianceShop.printerStatus,
      printerName: allianceShop.printerName,
      daemonVersion: allianceShop.daemonVersion,
      lastHeartbeat: allianceShop.lastHeartbeat
    });
    if (allianceShop.printerStatus !== 'online' || allianceShop.printerName !== 'Canon iR3225 Test (Updated)') {
      throw new Error('FAIL: GET /api/shops did not dynamically expose remote agent telemetry!');
    }
    console.log('✓ PASS: Shop status, printer name, and heartbeat correctly exposed in shop profile.');

    // 5. Test Offline Timeout transition (Manually setting lastSeen backward in database to simulate timeout)
    console.log('\n--- 5. Simulating Offline Timeout (lastSeen > 60s ago) ---');
    const dbToUpdate = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const agentToTimeout = dbToUpdate.agents?.find(a => a.agentId === 'TEST-AGENT-001');
    if (agentToTimeout) {
      // Set lastSeen to 75 seconds ago
      agentToTimeout.lastSeen = new Date(Date.now() - 75000).toISOString();
      fs.writeFileSync(DB_PATH, JSON.stringify(dbToUpdate, null, 2));
      console.log('Injected simulated expired heartbeat in DB.');
    }

    console.log('Waiting 11 seconds for background offline check loop...');
    await new Promise(r => setTimeout(r, 11000));

    const dbAfterTimeout = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const timedOutAgent = dbAfterTimeout.agents?.find(a => a.agentId === 'TEST-AGENT-001');
    console.log('Agent status after check loop:', timedOutAgent.onlineStatus);
    if (timedOutAgent.onlineStatus !== 'offline') {
      throw new Error('FAIL: Background task failed to transition expired agent to offline!');
    }
    console.log('✓ PASS: Background offline detector successfully set agent status to offline.');

    // 6. Verify Shop Availability lockout when offline
    console.log('\n--- 6. Verifying Shop Availability (Upload Block) ---');
    const shopsAfterTimeout = await apiGet('/api/shops');
    const timedOutShop = shopsAfterTimeout.find(s => s.id === 'tjohn_print');
    console.log('Shop printerStatus after agent timeout:', timedOutShop.printerStatus);
    if (timedOutShop.printerStatus !== 'offline') {
      throw new Error('FAIL: Shop status did not sync to offline when agent timed out!');
    }
    console.log('✓ PASS: Shop status correctly synced to offline.');

    console.log('\n==========================================');
    console.log('ALL REMOTE AGENT TESTS PASSED SUCCESSFULLY! ✓');
    console.log('==========================================');

    // Clean up test agent
    const cleanDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    cleanDb.agents = cleanDb.agents.filter(a => a.agentId !== 'TEST-AGENT-001');
    fs.writeFileSync(DB_PATH, JSON.stringify(cleanDb, null, 2));
    console.log('Cleaned up test agents from database.');

  } catch (err) {
    console.error('Verification failed: ✗', err.message);
    
    // Clean up test agent on failure
    try {
      const cleanDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      cleanDb.agents = cleanDb.agents.filter(a => a.agentId !== 'TEST-AGENT-001');
      fs.writeFileSync(DB_PATH, JSON.stringify(cleanDb, null, 2));
    } catch {}
    
    process.exit(1);
  }
}

function apiGet(endpoint) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${endpoint}`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    }).on('error', reject);
  });
}

function apiPost(endpoint, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

test();

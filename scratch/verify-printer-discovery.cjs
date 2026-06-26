const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
const AGENT_TOKEN = 'campusprint_agent_token_123';
const ADMIN_API_KEY = 'campusprint_admin_123';
const DB_PATH = 'd:/WEBSITES/campus-printing-queue-and-management-system/server/data/db.json';

function signShopId(shopId) {
  const hmac = crypto.createHmac('sha256', ADMIN_API_KEY);
  hmac.update(shopId);
  return `token_${shopId}_${hmac.digest('hex')}`;
}

const VALID_TOKEN = signShopId('tjohn_print');

function apiGet(endpoint, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: headers
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.end();
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

function apiPut(endpoint, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(`${BASE_URL}${endpoint}`, {
      method: 'PUT',
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

async function runTests() {
  console.log('=== Starting Printer Discovery Forensic Verification ===\n');
  
  // Clean up any stale agents/printers from database first
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  db.agents = (db.agents || []).filter(a => a.shopId !== 'tjohn_print');
  db.printers = (db.printers || []).filter(p => p.shopId !== 'tjohn_print');
  const shop = db.shops.find(s => s.id === 'tjohn_print');
  if (shop) {
    delete shop.bwPrinterId;
    delete shop.bwPrinterName;
    delete shop.colorPrinterId;
    delete shop.colorPrinterName;
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

  try {
    // 1. Verify clean state: No printers should appear initially
    console.log('Step 1: Verifying clean state...');
    const shopDetailsInit = await apiGet('/api/shops/tjohn_print');
    if (shopDetailsInit.printers.length !== 0) {
      throw new Error(`Expected initial printers list to be empty, got ${shopDetailsInit.printers.length} printers`);
    }
    console.log('✓ PASS: No printers initially present for tjohn_print.\n');

    // 2. Register Agent
    console.log('Step 2: Registering Agent...');
    await apiPost('/api/agent/register', {
      agentId: 'AGENT-TJOHN-01',
      shopId: 'tjohn_print',
      machineName: 'TJOHN-DESKTOP-1',
      printerName: 'System Default',
      daemonVersion: '3.0.0',
      agentToken: AGENT_TOKEN
    });
    console.log('✓ PASS: Agent registered successfully.\n');

    // 3. Simulating Agent startup heartbeat performing automatic discovery
    console.log('Step 3: Simulating Agent startup heartbeat with discovered printers...');
    const startupDiscovered = ['HP LaserJet Pro M102w', 'Brother DCP-L2540DW'];
    const hbRes = await apiPost('/api/agent/heartbeat', {
      agentId: 'AGENT-TJOHN-01',
      shopId: 'tjohn_print',
      printerName: 'HP LaserJet Pro M102w',
      daemonVersion: '3.0.0',
      printers: startupDiscovered
    }, { 'Authorization': `Bearer ${AGENT_TOKEN}` });
    
    // Verify backend updated discovery
    const shopDetailsStartup = await apiGet('/api/shops/tjohn_print');
    const discoveredNames = shopDetailsStartup.printers.map(p => p.printerName);
    console.log('Discovered printers after startup:', discoveredNames);
    if (discoveredNames.length !== 2 || !discoveredNames.includes('HP LaserJet Pro M102w') || !discoveredNames.includes('Brother DCP-L2540DW')) {
      throw new Error('Discovered printers on startup do not match reported agent list');
    }
    
    // Verify configuration is untouched
    if (shopDetailsStartup.bwPrinterId || shopDetailsStartup.bwPrinterName) {
      throw new Error('Runtime discovery automatically updated configured B&W printer settings');
    }
    console.log('✓ PASS: Startup discovery successfully ran once and populated available list without altering configuration.\n');

    // 4. Trigger manual scan request from Admin
    console.log('Step 4: Triggering manual refresh from Admin Portal...');
    // We simulate using a mock admin token or bypass auth since /api/agent/scan-printers doesn't reject if token matches or for simplicity
    const scanInitRes = await apiPost('/api/agent/scan-printers', { shopId: 'tjohn_print' }, { 'Authorization': `Bearer ${VALID_TOKEN}` });
    if (!scanInitRes.success || scanInitRes.message !== 'Scan initiated') {
      throw new Error(`Unexpected scan trigger response: ${JSON.stringify(scanInitRes)}`);
    }

    // Verify scan status is now 'scanning'
    const settingsMid = await apiGet('/api/printer/settings?shopId=tjohn_print', { 'Authorization': `Bearer ${VALID_TOKEN}` });
    console.log('Agent status after manual trigger:', {
      scanRequested: settingsMid.scanRequested,
      scanStatus: settingsMid.scanStatus
    });
    if (settingsMid.scanStatus !== 'scanning' || settingsMid.scanRequested !== true) {
      throw new Error('Agent scan status was not updated to scanning');
    }
    console.log('✓ PASS: Scan initiated successfully, backend state set to "scanning".\n');

    // 5. Test Scan Protection (only one scan at a time)
    console.log('Step 5: Testing scan protection/concurrency lock...');
    try {
      await apiPost('/api/agent/scan-printers', { shopId: 'tjohn_print' }, { 'Authorization': `Bearer ${VALID_TOKEN}` });
      throw new Error('FAIL: Initiated a scan when another scan was already running!');
    } catch (err) {
      if (err.message.includes('already in progress') || err.message.includes('400')) {
        console.log('✓ PASS: Successfully blocked concurrent scan request.');
      } else {
        throw err;
      }
    }
    console.log('');

    // 6. Simulate agent completing manual scan
    console.log('Step 6: Simulating Agent completing manual scan...');
    const manualDiscovered = ['HP LaserJet Pro M102w', 'Brother DCP-L2540DW', 'Epson L3250 Color'];
    await apiPost('/api/agent/heartbeat', {
      agentId: 'AGENT-TJOHN-01',
      shopId: 'tjohn_print',
      printerName: 'HP LaserJet Pro M102w',
      daemonVersion: '3.0.0',
      printers: manualDiscovered
    }, { 'Authorization': `Bearer ${AGENT_TOKEN}` });

    // Verify backend status cleared scanRequested and transitioned scanStatus to completed
    const settingsFinal = await apiGet('/api/printer/settings?shopId=tjohn_print', { 'Authorization': `Bearer ${VALID_TOKEN}` });
    console.log('Agent status after heartbeat receipt:', {
      scanRequested: settingsFinal.scanRequested,
      scanStatus: settingsFinal.scanStatus
    });
    if (settingsFinal.scanStatus !== 'completed' || settingsFinal.scanRequested !== false) {
      throw new Error('Agent scan status did not transition to completed after reporting printers');
    }

    const shopDetailsFinal = await apiGet('/api/shops/tjohn_print');
    const finalDiscovered = shopDetailsFinal.printers.map(p => p.printerName);
    console.log('Discovered printers list updated:', finalDiscovered);
    if (!finalDiscovered.includes('Epson L3250 Color')) {
      throw new Error('Updated printers list was not saved to database');
    }
    console.log('✓ PASS: Manual scan completed. Dropdown values refreshed automatically.\n');

    // 7. Configure B&W and Color printers
    console.log('Step 7: Admin configures default B&W and Color printers...');
    const bwPrinterObj = shopDetailsFinal.printers.find(p => p.printerName === 'HP LaserJet Pro M102w');
    const colorPrinterObj = shopDetailsFinal.printers.find(p => p.printerName === 'Epson L3250 Color');

    if (!bwPrinterObj || !colorPrinterObj) {
      throw new Error('Could not find mapped printer details to configure');
    }

    await apiPut('/api/printers/bw', {
      shopId: 'tjohn_print',
      bwPrinterId: bwPrinterObj.printerId,
      bwPrinterName: bwPrinterObj.printerName,
      bwMaintenanceMode: false
    }, {
      'Authorization': `Bearer ${VALID_TOKEN}`
    });

    await apiPut('/api/printers/color', {
      shopId: 'tjohn_print',
      colorPrinterId: colorPrinterObj.printerId,
      colorPrinterName: colorPrinterObj.printerName,
      colorMaintenanceMode: false
    }, {
      'Authorization': `Bearer ${VALID_TOKEN}`
    });

    // Verify configured mapping persists
    const mappingRes = await apiGet('/api/printers/mapping?shopId=tjohn_print', {
      'Authorization': `Bearer ${VALID_TOKEN}`
    });
    console.log('Persisted printer mapping:', mappingRes);
    if (mappingRes.bwPrinterName !== 'HP LaserJet Pro M102w' || mappingRes.colorPrinterName !== 'Epson L3250 Color') {
      throw new Error('Configured printer names did not persist correctly');
    }
    console.log('✓ PASS: Printer configuration saved and verified successfully.\n');

    console.log('==========================================');
    console.log('ALL PRINTER DISCOVERY TESTS PASSED SUCCESSFULLY! ✓');
    console.log('==========================================');

  } catch (err) {
    console.error('\nVerification failed: ✗', err.message);
    process.exit(1);
  } finally {
    // Cleanup test agent and printers
    try {
      const cleanDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      cleanDb.agents = (cleanDb.agents || []).filter(a => a.shopId !== 'tjohn_print');
      cleanDb.printers = (cleanDb.printers || []).filter(p => p.shopId !== 'tjohn_print');
      const tjohnShop = cleanDb.shops.find(s => s.id === 'tjohn_print');
      if (tjohnShop) {
        delete tjohnShop.bwPrinterId;
        delete tjohnShop.bwPrinterName;
        delete tjohnShop.colorPrinterId;
        delete tjohnShop.colorPrinterName;
      }
      fs.writeFileSync(DB_PATH, JSON.stringify(cleanDb, null, 2));
      console.log('Cleaned up tjohn_print test registration from database.');
    } catch {}
  }
}

runTests();

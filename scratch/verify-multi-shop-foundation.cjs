const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
const ADMIN_API_KEY = 'campusprint_admin_123';
const AGENT_TOKEN = 'campusprint_agent_token_123';
const DB_PATH = 'd:/WEBSITES/campus-printing-queue-and-management-system/server/data/db.json';

// Create a dummy PDF file for testing uploads
const testPdfPath = path.join(__dirname, 'test-doc.pdf');
fs.writeFileSync(testPdfPath, '%PDF-1.4\n1 0 obj\n<<\n/Type /Page\n>>\nendobj\n/Count 2\n%%EOF');

async function runTests() {
  console.log('=== CAMPUS PRINT V2 MULTI-SHOP FOUNDATION INTEGRATION TESTS ===\n');

  try {
    // 1. Verify GET /api/shops returns the two default shops
    console.log('--- Step 1: Fetching default shops ---');
    const shops = await apiGet('/api/shops');
    console.log(`Successfully fetched ${shops.length} shops.`);
    
    const alliance = shops.find(s => s.id === 'alliance_print');
    const science = shops.find(s => s.id === 'science_print');

    if (!alliance || !science) {
      throw new Error('FAIL: alliance_print or science_print default shops are missing!');
    }
    console.log('✓ PASS: Default shops found in database.');
    console.log(`Alliance Shop: ${alliance.name}, BW Price: ₹${alliance.bwPrice}`);
    console.log(`Science Shop: ${science.name}, BW Price: ₹${science.bwPrice}`);

    if (alliance.bwPrice !== 2 || science.bwPrice !== 3) {
      throw new Error(`FAIL: Shop default pricing incorrect (Alliance: ${alliance.bwPrice}, Science: ${science.bwPrice})`);
    }
    console.log('✓ PASS: Default prices are correct.');

    // 2. Register Agent A for alliance_print and Agent B for science_print
    console.log('\n--- Step 2: Registering two independent agents ---');
    const regResA = await apiPost('/api/agent/register', {
      agentId: 'ALLIANCE-AGENT',
      shopId: 'alliance_print',
      machineName: 'Canon-Machine',
      printerName: 'Canon-Printer-Device',
      daemonVersion: '1.0.0-test',
      agentToken: AGENT_TOKEN
    });
    console.log('Agent A Registered:', regResA.agentId);

    const regResB = await apiPost('/api/agent/register', {
      agentId: 'SCIENCE-AGENT',
      shopId: 'science_print',
      machineName: 'Epson-Machine',
      printerName: 'Epson-Printer-Device',
      daemonVersion: '1.0.0-test',
      agentToken: AGENT_TOKEN
    });
    console.log('Agent B Registered:', regResB.agentId);

    // Verify DB contains both agents
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const agentA = db.agents.find(a => a.agentId === 'ALLIANCE-AGENT');
    const agentB = db.agents.find(a => a.agentId === 'SCIENCE-AGENT');
    if (!agentA || !agentB) {
      throw new Error('FAIL: Agents were not persisted to database.');
    }
    console.log('✓ PASS: Both independent agents persisted to database.');

    // 3. Heartbeat & Printer Discovery verification
    console.log('\n--- Step 3: Reporting heartbeats with discovered printers ---');
    const hbA = await apiPost('/api/agent/heartbeat', {
      agentId: 'ALLIANCE-AGENT',
      shopId: 'alliance_print',
      printerName: 'Canon-Printer-Device',
      daemonVersion: '1.0.0-test',
      printers: ['Canon iR3225', 'HP LaserJet 400']
    });
    console.log('Agent A heartbeat acknowledged. Scan requested:', hbA.settings?.scanRequested);

    const hbB = await apiPost('/api/agent/heartbeat', {
      agentId: 'SCIENCE-AGENT',
      shopId: 'science_print',
      printerName: 'Epson-Printer-Device',
      daemonVersion: '1.0.0-test',
      printers: ['Epson L3150', 'Canon G3010']
    });
    console.log('Agent B heartbeat acknowledged. Scan requested:', hbB.settings?.scanRequested);

    // Verify discovered printers table in DB
    const dbPrinters = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')).printers || [];
    const alliancePrinters = dbPrinters.filter(p => p.shopId === 'alliance_print');
    const sciencePrinters = dbPrinters.filter(p => p.shopId === 'science_print');

    console.log(`Discovered Printers for Alliance (${alliancePrinters.length}):`, alliancePrinters.map(p => p.printerName));
    console.log(`Discovered Printers for Science (${sciencePrinters.length}):`, sciencePrinters.map(p => p.printerName));

    if (alliancePrinters.length === 0 || sciencePrinters.length === 0) {
      throw new Error('FAIL: Discovered printers table is empty or not scoped by shopId!');
    }
    console.log('✓ PASS: Discovered printers are successfully associated with their respective shopIds.');

    // 4. Shop-Specific Settings Changes (Select Printer & Maintenance Mode)
    console.log('\n--- Step 4: Testing independent shop operations (Maintenance & Printer selection) ---');
    // Select printer for alliance_print
    const targetPrinterA = alliancePrinters[0].printerId;
    await apiPut(`/api/shops/alliance_print/select-printer`, { printerId: targetPrinterA }, ADMIN_API_KEY);
    console.log(`Selected printer ID ${targetPrinterA} for Alliance Print.`);

    // Toggle maintenance mode for science_print
    await apiPut(`/api/shops/science_print/maintenance`, { maintenanceMode: true }, ADMIN_API_KEY);
    console.log('Toggled maintenanceMode = true for Science Print.');

    // Verify independence
    const freshShops = await apiGet('/api/shops');
    const shopA = freshShops.find(s => s.id === 'alliance_print');
    const shopB = freshShops.find(s => s.id === 'science_print');

    console.log('Alliance Shop Maintenance:', shopA.maintenanceMode, 'Active Printer:', shopA.activePrinterId);
    console.log('Science Shop Maintenance:', shopB.maintenanceMode, 'Active Printer:', shopB.activePrinterId);

    if (shopA.maintenanceMode !== false || shopB.maintenanceMode !== true) {
      throw new Error('FAIL: Toggle maintenance mode affected the wrong shop!');
    }
    if (shopA.activePrinterId !== targetPrinterA || shopB.activePrinterId === targetPrinterA) {
      throw new Error('FAIL: Printer selection affected the wrong shop!');
    }
    console.log('✓ PASS: Operations (maintenance mode, printer selection) affect ONLY the targeted shop.');

    // Reset maintenance mode for uploads test
    await apiPut(`/api/shops/science_print/maintenance`, { maintenanceMode: false }, ADMIN_API_KEY);

    // 5. Shop-Specific Pricing changes
    console.log('\n--- Step 5: Testing independent pricing configurations ---');
    await apiPut(`/api/shops/alliance_print/pricing`, { bwPrice: 4, duplexPrice: 5 }, ADMIN_API_KEY);
    console.log('Updated Alliance pricing to: BW ₹4, Duplex ₹5');

    const pricingShops = await apiGet('/api/shops');
    const pA = pricingShops.find(s => s.id === 'alliance_print');
    const pB = pricingShops.find(s => s.id === 'science_print');

    console.log(`Alliance BW: ₹${pA.bwPrice}, Duplex: ₹${pA.duplexPrice}`);
    console.log(`Science BW: ₹${pB.bwPrice}, Duplex: ₹${pB.duplexPrice}`);

    if (pA.bwPrice !== 4 || pB.bwPrice !== 3) {
      throw new Error('FAIL: Pricing updates were not scoped/persisted independently!');
    }
    console.log('✓ PASS: Pricing configurations operate independently.');

    // Reset Alliance pricing back to ₹2/₹3
    await apiPut(`/api/shops/alliance_print/pricing`, { bwPrice: 2, duplexPrice: 3 }, ADMIN_API_KEY);

    // 6. Student Upload & Queue Routing verification
    console.log('\n--- Step 6: Testing student uploads and queue routing ---');
    console.log('Uploading print job for Student A -> Alliance Print Center...');
    const uploadResA = await uploadJob('alliance_print', 'Student A', 'studenta@alliance.edu', [
      { copies: 1, printMode: 'mono', sides: 'single' }
    ]);
    console.log('Upload A Response:', uploadResA);

    console.log('Uploading print job for Student B -> Science Block Printing...');
    const uploadResB = await uploadJob('science_print', 'Student B', 'studentb@science.edu', [
      { copies: 2, printMode: 'mono', sides: 'double' }
    ]);
    console.log('Upload B Response:', uploadResB);

    if (uploadResA[0].shopId !== 'alliance_print' || uploadResB[0].shopId !== 'science_print') {
      throw new Error('FAIL: Jobs were not associated with the correct shopId!');
    }
    console.log('✓ PASS: Uploaded jobs correctly mapped and persisted with mandatory shopId field.');

    // Approve jobs first so they are in the queue for the agent
    console.log('Approving Alliance job...');
    await apiPost(`/api/jobs/${uploadResA[0].id}/approve`, {}, ADMIN_API_KEY);
    console.log('Approving Science job...');
    await apiPost(`/api/jobs/${uploadResB[0].id}/approve`, {}, ADMIN_API_KEY);

    // 7. Verify Spooler isolation (Canon receives only Alliance, Epson only Science)
    console.log('\n--- Step 7: Verifying print client job isolation ---');
    const nextJobA = await apiGet('/api/jobs/next?shopId=alliance_print', ADMIN_API_KEY);
    console.log('Alliance Agent Next Job Token:', nextJobA.token, 'ShopId:', nextJobA.shopId);

    const nextJobB = await apiGet('/api/jobs/next?shopId=science_print', ADMIN_API_KEY);
    console.log('Science Agent Next Job Token:', nextJobB.token, 'ShopId:', nextJobB.shopId);

    if (nextJobA.shopId !== 'alliance_print' || nextJobB.shopId !== 'science_print') {
      throw new Error('FAIL: Print queue next jobs are not correctly isolated by shopId!');
    }
    console.log('✓ PASS: Canon receives only Alliance jobs. Epson receives only Science jobs. Queue isolation verified.');

    console.log('\n======================================================');
    console.log('ALL MULTI-SHOP FOUNDATION TESTS PASSED SUCCESSFULLY! ✓');
    console.log('======================================================');

    cleanup();
    process.exit(0);

  } catch (err) {
    console.error('\nVerification failed: ✗', err.message);
    cleanup();
    process.exit(1);
  }
}

function cleanup() {
  try { fs.unlinkSync(testPdfPath); } catch {}
  
  // Clean up registered agents and created test jobs from DB
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    db.agents = db.agents.filter(a => a.agentId !== 'ALLIANCE-AGENT' && a.agentId !== 'SCIENCE-AGENT');
    db.printers = db.printers.filter(p => p.shopId !== 'alliance_print' && p.shopId !== 'science_print');
    db.jobs = db.jobs.filter(j => j.studentEmail !== 'studenta@alliance.edu' && j.studentEmail !== 'studentb@science.edu');
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    console.log('Cleaned up integration test data from DB.');
  } catch (e) {
    console.error('Failed to cleanup DB test data:', e.message);
  }
}

function apiGet(endpoint, authKey) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (authKey) headers['Authorization'] = `Bearer ${authKey}`;
    
    http.get(`${BASE_URL}${endpoint}`, { headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    }).on('error', reject);
  });
}

function apiPost(endpoint, body, authKey) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    };
    if (authKey) headers['Authorization'] = `Bearer ${authKey}`;

    const req = http.request(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers
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

function apiPut(endpoint, body, authKey) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    };
    if (authKey) headers['Authorization'] = `Bearer ${authKey}`;

    const req = http.request(`${BASE_URL}${endpoint}`, {
      method: 'PUT',
      headers
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

function uploadJob(shopId, name, email, configs) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const fileContent = fs.readFileSync(testPdfPath);
    
    let header = '';
    header += `--${boundary}\r\n`;
    header += `Content-Disposition: form-data; name="studentName"\r\n\r\n`;
    header += `${name}\r\n`;
    
    header += `--${boundary}\r\n`;
    header += `Content-Disposition: form-data; name="studentEmail"\r\n\r\n`;
    header += `${email}\r\n`;
    
    header += `--${boundary}\r\n`;
    header += `Content-Disposition: form-data; name="shopId"\r\n\r\n`;
    header += `${shopId}\r\n`;

    header += `--${boundary}\r\n`;
    header += `Content-Disposition: form-data; name="configs"\r\n\r\n`;
    header += `${JSON.stringify(configs)}\r\n`;
    
    header += `--${boundary}\r\n`;
    header += `Content-Disposition: form-data; name="files"; filename="test-doc.pdf"\r\n`;
    header += `Content-Type: application/pdf\r\n\r\n`;
    
    const footer = `\r\n--${boundary}--\r\n`;
    
    const payload = Buffer.concat([
      Buffer.from(header, 'utf-8'),
      fileContent,
      Buffer.from(footer, 'utf-8')
    ]);
    
    const req = http.request({
      host: 'localhost',
      port: PORT,
      path: '/api/jobs',
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': payload.length
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

runTests();

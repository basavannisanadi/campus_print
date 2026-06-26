const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
const ADMIN_API_KEY = 'campusprint_admin_123';
const AGENT_TOKEN = 'campusprint_agent_token_123';
const SHOP_ID = 'tjohn_print';
let ADMIN_TOKEN = '';

const DB_PATH = path.resolve(__dirname, '../server/data/db.json');
const CONFIG_PATH = path.resolve(__dirname, '../print-client/config.json');
const BACKUP_CONFIG_PATH = path.resolve(__dirname, '../print-client/config.json.bak');

async function test() {
  console.log('=== STARTING DUAL PRINTER ROUTING INTEGRATION VERIFICATION ===\n');

  let configBackup = null;
  let clientProcess = null;

  try {
    const loginRes = await apiPost('/api/auth/login', {
      shopId: SHOP_ID,
      username: 'tjohn_admin',
      password: 'tjohn_password123'
    });
    ADMIN_TOKEN = loginRes.token;
    console.log('✓ Logged in and retrieved valid HMAC Admin Token.');
    // 0. Backup print agent config.json
    if (fs.existsSync(CONFIG_PATH)) {
      configBackup = fs.readFileSync(CONFIG_PATH, 'utf-8');
      fs.writeFileSync(BACKUP_CONFIG_PATH, configBackup);
      console.log('✓ Backed up print agent config.json.');
    }

    // Clear leftover daemon lockfile if any
    const lockFilePath = path.resolve(__dirname, '../print-client/daemon.lock');
    if (fs.existsSync(lockFilePath)) {
      try {
        fs.unlinkSync(lockFilePath);
        console.log('✓ Cleared leftover daemon.lock file.');
      } catch (e) {
        console.log('⚠ Could not delete daemon.lock:', e.message);
      }
    }

    // 1. Pre-test cleanup: remove any leftover test jobs
    if (fs.existsSync(DB_PATH)) {
      const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      db.jobs = db.jobs.filter(j => j.studentName !== 'RoutingTester');
      db.agents = db.agents.filter(a => a.agentId !== 'TEST-AGENT-ROUTING');
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
      console.log('✓ Cleaned up database test jobs.');
    }

    // 2. Write temporary mock config.json for the agent
    const testConfig = {
      serverUrl: `http://localhost:${PORT}`,
      pollIntervalMs: 1000,
      mockPrinter: true,
      printerName: '',
      shopId: SHOP_ID,
      agentId: 'TEST-AGENT-ROUTING',
      machineName: 'TEST-ROUTING-PC',
      daemonVersion: '1.0.0-test',
      agentToken: AGENT_TOKEN,
      apiKey: ADMIN_TOKEN
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(testConfig, null, 2));
    console.log('✓ Created temporary config.json with mockPrinter: true.');

    // 3. Register agent and send heartbeat reporting printers list
    console.log('\n--- 1. Testing Discovered Printers Reporting via Heartbeat ---');
    await apiPost('/api/agent/register', {
      agentId: 'TEST-AGENT-ROUTING',
      shopId: SHOP_ID,
      machineName: 'TEST-ROUTING-PC',
      printerName: 'System Default',
      daemonVersion: '1.0.0-test',
      agentToken: AGENT_TOKEN
    });

    const printersList = ['Canon IR3225', 'Epson L3250'];
    await apiPost('/api/agent/heartbeat', {
      agentId: 'TEST-AGENT-ROUTING',
      shopId: SHOP_ID,
      printerName: 'System Default',
      daemonVersion: '1.0.0-test',
      printers: printersList
    }, AGENT_TOKEN);
    console.log('✓ Registered agent and reported discovered printers:', printersList);

    // Verify they are saved in db
    const dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const savedPrinters = dbData.printers.filter(p => p.shopId === SHOP_ID);
    if (savedPrinters.length !== 2) {
      throw new Error(`FAIL: Expected 2 saved printers, found ${savedPrinters.length}`);
    }
    console.log('✓ Discovered printers persisted correctly in database.');

    // 4. Save printer routing mapping
    console.log('\n--- 2. Testing Saving/Updating Printer Mapping ---');
    const bwPrinter = savedPrinters.find(p => p.printerName === 'Canon IR3225');
    const colorPrinter = savedPrinters.find(p => p.printerName === 'Epson L3250');
    if (!bwPrinter || !colorPrinter) {
      throw new Error('FAIL: Discovered printers not found in database');
    }

    const mappingRes = await apiPut('/api/printers/mapping', {
      shopId: SHOP_ID,
      bwPrinterId: bwPrinter.printerId,
      bwPrinterName: bwPrinter.printerName,
      colorPrinterId: colorPrinter.printerId,
      colorPrinterName: colorPrinter.printerName
    }, ADMIN_TOKEN);

    console.log('✓ Saved mappings successfully:', mappingRes);
    if (mappingRes.bwPrinterName !== 'Canon IR3225' || mappingRes.colorPrinterName !== 'Epson L3250') {
      throw new Error('FAIL: Returned mappings do not match submitted values!');
    }

    // 5. Verify Mapping persistence after reading/fetching again
    console.log('\n--- 3. Testing Mapping Persistence and Retrieval ---');
    const fetchedMapping = await apiGet(`/api/printers/mapping?shopId=${SHOP_ID}`, ADMIN_TOKEN);
    console.log('✓ Fetched mapping:', fetchedMapping);
    if (fetchedMapping.bwPrinterId !== bwPrinter.printerId || fetchedMapping.colorPrinterId !== colorPrinter.printerId) {
      throw new Error('FAIL: Persisted mapping details do not match!');
    }

    // 6. Upload B&W job and verify it is pending approval
    console.log('\n--- 4. Testing B&W Upload & Print Type Payload Persistence ---');
    const bwJobToken = await uploadTestJob('bw-doc.pdf', 'bw');
    console.log(`✓ Uploaded B&W job successfully. Token: ${bwJobToken}`);

    // 7. Upload Color job and verify it is pending approval
    console.log('\n--- 5. Testing Color Upload & Print Type Payload Persistence ---');
    const colorJobToken = await uploadTestJob('color-doc.pdf', 'color');
    console.log(`✓ Uploaded Color job successfully. Token: ${colorJobToken}`);

    // Check DB for printType persistence
    let dbAfterUpload = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const dbBwJob = dbAfterUpload.jobs.find(j => j.token === bwJobToken);
    const dbColorJob = dbAfterUpload.jobs.find(j => j.token === colorJobToken);
    if (!dbBwJob || dbBwJob.printType !== 'bw' || dbBwJob.printMode !== 'mono') {
      throw new Error('FAIL: B&W job printType/printMode not saved correctly!');
    }
    if (!dbColorJob || dbColorJob.printType !== 'color' || dbColorJob.printMode !== 'color') {
      throw new Error('FAIL: Color job printType/printMode not saved correctly!');
    }
    console.log('✓ Print job printType and printMode saved correctly.');

    // 8. Approve both jobs to put them in the queue
    console.log('\n--- 6. Testing Approval Workflow ---');
    await apiPost(`/api/jobs/${dbBwJob.id}/approve`, {}, ADMIN_TOKEN);
    await apiPost(`/api/jobs/${dbColorJob.id}/approve`, {}, ADMIN_TOKEN);
    console.log('✓ Approved both B&W and Color jobs.');

    // 9. Start the print agent client to process these jobs
    console.log('\n--- 7. Running Print Agent Client to route jobs ---');
    const clientScriptPath = path.resolve(__dirname, '../print-client/client.cjs');
    
    // Spawn the client daemon
    clientProcess = spawn('node', [clientScriptPath], {
      cwd: path.dirname(clientScriptPath)
    });

    clientProcess.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        console.log(`[CLIENT] ${line}`);
      }
    });

    clientProcess.stderr.on('data', (data) => {
      console.error(`[CLIENT-ERR] ${data.toString()}`);
    });

    // Let the client run for 25 seconds to fetch and print both jobs (giving time for COM/spooler startup checks)
    await new Promise(r => setTimeout(r, 25000));
    console.log('✓ Stopping print agent client.');
    clientProcess.kill();
    clientProcess = null;

    // 10. Verify routing and telemetry inside the DB jobs timelines
    console.log('\n--- 8. Verifying Routing Telemetry and Diagnostics ---');
    const finalDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const bwJobFinal = finalDb.jobs.find(j => j.token === bwJobToken);
    const colorJobFinal = finalDb.jobs.find(j => j.token === colorJobToken);

    if (!bwJobFinal || bwJobFinal.status !== 'completed') {
      throw new Error(`FAIL: B&W job was not completed by the agent. Status: ${bwJobFinal?.status}`);
    }
    if (!colorJobFinal || colorJobFinal.status !== 'completed') {
      throw new Error(`FAIL: Color job was not completed by the agent. Status: ${colorJobFinal?.status}`);
    }

    // Verify B&W job timeline entries contains Canon IR3225 and routing metadata
    console.log('DEBUG bwJobFinal:', JSON.stringify(bwJobFinal, null, 2));
    const bwClaimed = bwJobFinal.timeline.find(t => t.stage === 'claimed');
    if (!bwClaimed || bwClaimed.printerName !== 'Canon IR3225') {
      throw new Error(`FAIL: B&W job was routed to wrong printer: ${bwClaimed?.printerName}`);
    }
    if (bwClaimed.printType !== 'bw' || bwClaimed.selectedPrinter !== 'Canon IR3225') {
      throw new Error(`FAIL: B&W job lacks correct telemetry metadata! ${JSON.stringify(bwClaimed)}`);
    }
    console.log('✓ B&W Job successfully routed to "Canon IR3225" (B&W printer) with correct timeline telemetry.');

    // Verify Color job timeline entries contains Epson L3250 and routing metadata
    const colorClaimed = colorJobFinal.timeline.find(t => t.stage === 'claimed');
    if (!colorClaimed || colorClaimed.printerName !== 'Epson L3250') {
      throw new Error(`FAIL: Color job was routed to wrong printer: ${colorClaimed?.printerName}`);
    }
    if (colorClaimed.printType !== 'color' || colorClaimed.selectedPrinter !== 'Epson L3250') {
      throw new Error(`FAIL: Color job lacks correct telemetry metadata! ${JSON.stringify(colorClaimed)}`);
    }
    console.log('✓ Color Job successfully routed to "Epson L3250" (Color printer) with correct timeline telemetry.');

    console.log('\n======================================================');
    console.log('✓ ALL DUAL PRINTER ROUTING TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('======================================================');

  } catch (err) {
    console.error('\nVerification failed: ✗', err);
    process.exitCode = 1;
  } finally {
    // Stop agent if running
    if (clientProcess) {
      try { clientProcess.kill(); } catch (e) {}
    }

    // Restore config.json
    if (configBackup) {
      fs.writeFileSync(CONFIG_PATH, configBackup);
      try { fs.unlinkSync(BACKUP_CONFIG_PATH); } catch (e) {}
      console.log('✓ Restored original print agent config.json.');
    }

    // Clean up test jobs
    try {
      if (fs.existsSync(DB_PATH)) {
        const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        db.jobs = db.jobs.filter(j => j.studentName !== 'RoutingTester');
        db.agents = db.agents.filter(a => a.agentId !== 'TEST-AGENT-ROUTING');
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
        console.log('✓ Cleaned up verification print jobs and agents from DB.');
      }
    } catch (e) {}
  }
}

async function uploadTestJob(filename, printType) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const fileContent = '%PDF-1.4\n1 0 obj\n<<\n/Type /Page\n>>\nendobj\n/Count 1\n%%EOF';
  
  let header = '';
  header += `--${boundary}\r\n`;
  header += `Content-Disposition: form-data; name="studentName"\r\n\r\n`;
  header += `RoutingTester\r\n`;
  
  header += `--${boundary}\r\n`;
  header += `Content-Disposition: form-data; name="studentEmail"\r\n\r\n`;
  header += `routing@tester.com\r\n`;
  
  header += `--${boundary}\r\n`;
  header += `Content-Disposition: form-data; name="shopId"\r\n\r\n`;
  header += `${SHOP_ID}\r\n`;

  const configs = [
    {
      copies: 1,
      printType,
      printMode: printType === 'color' ? 'color' : 'mono',
      sides: 'single',
      pageRange: ''
    }
  ];
  header += `--${boundary}\r\n`;
  header += `Content-Disposition: form-data; name="configs"\r\n\r\n`;
  header += `${JSON.stringify(configs)}\r\n`;
  
  header += `--${boundary}\r\n`;
  header += `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n`;
  header += `Content-Type: application/pdf\r\n\r\n`;
  
  const footer = `\r\n--${boundary}--\r\n`;
  
  const payload = Buffer.concat([
    Buffer.from(header, 'utf-8'),
    Buffer.from(fileContent, 'utf-8'),
    Buffer.from(footer, 'utf-8')
  ]);

  const uploadRes = await new Promise((resolve, reject) => {
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
        if (res.statusCode >= 400) return reject(new Error(`Upload failed: ${res.statusCode} ${body}`));
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  return uploadRes[0].token;
}

function apiGet(endpoint, token) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
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

function apiPost(endpoint, body, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
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

function apiPut(endpoint, body, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
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

test();

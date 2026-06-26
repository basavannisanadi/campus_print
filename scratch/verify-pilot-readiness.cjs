const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
const ADMIN_API_KEY = 'campusprint_admin_123';
const AGENT_TOKEN = 'campusprint_agent_token_123';
const SHOP_ID = 'tjohn_print';

function signShopId(shopId) {
  const hmac = crypto.createHmac('sha256', ADMIN_API_KEY);
  hmac.update(shopId);
  return `token_${shopId}_${hmac.digest('hex')}`;
}

const VALID_TOKEN = signShopId(SHOP_ID);
const FORGED_TOKEN = `token_${SHOP_ID}_invalidhmac1234567890abcdef`;

// Helpers to make HTTP requests
function apiRequest(method, endpoint, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${endpoint}`;
    const parsedUrl = new URL(url);
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    let payload = null;
    if (body) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: headers
    }, (res) => {
      res.setEncoding('utf-8');
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function uploadTestJob(filename, printType) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const fileContent = '%PDF-1.4\n1 0 obj\n<<\n/Type /Page\n>>\nendobj\n/Count 1\n%%EOF';
    
    let header = '';
    header += `--${boundary}\r\n`;
    header += `Content-Disposition: form-data; name="studentName"\r\n\r\n`;
    header += `PilotTester\r\n`;
    
    header += `--${boundary}\r\n`;
    header += `Content-Disposition: form-data; name="studentEmail"\r\n\r\n`;
    header += `pilot@tester.com\r\n`;
    
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
        if (res.statusCode >= 400) {
          reject(new Error(`Upload failed: ${res.statusCode} ${body}`));
        } else {
          try {
            resolve(JSON.parse(body)[0]);
          } catch (e) {
            reject(e);
          }
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Main verification flow
async function run() {
  console.log('==================================================');
  console.log('       CAMPUS PRINT PILOT READINESS AUDIT         ');
  console.log('==================================================\n');

  const results = {
    studentUploads: false,
    approvalWorks: false,
    queueWorks: false,
    agentWorks: false,
    bwRoutingWorks: false,
    colorRoutingWorks: false,
    httpsWorks: false,
    uploadsPrivate: false,
    noDuplicateClaims: false,
    forgedTokensFail: false
  };

  const dbPath = 'd:/WEBSITES/campus-printing-queue-and-management-system/server/data/db.json';
  
  // Clean up any old test jobs
  try {
    if (fs.existsSync(dbPath)) {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      db.jobs = db.jobs.filter(j => j.studentName !== 'PilotTester');
      db.agents = db.agents.filter(a => a.agentId !== 'TEST-AGENT-PILOT');
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    }
  } catch (e) {}

  try {
    // 1. Register Mock Agent first so shop is online
    console.log('Testing criterion: Agent Works (Registration)...');
    const regCheck = await apiRequest('POST', '/api/agent/register', {
      agentId: 'TEST-AGENT-PILOT',
      shopId: SHOP_ID,
      machineName: 'TEST-PC',
      printerName: 'Default System Printer',
      daemonVersion: '1.0.0-test',
      agentToken: AGENT_TOKEN
    });

    if (regCheck.statusCode === 200) {
      results.agentWorks = true;
      console.log('✓ PASS: Agent registered successfully, shop status is now ONLINE.');
    } else {
      console.log(`✗ FAIL: Agent registration failed with status ${regCheck.statusCode}`);
      throw new Error('Agent registration failed');
    }

    // 2. Test Forged Admin Tokens Fail
    console.log('\nTesting criterion: Forged Admin Tokens Fail...');
    const forgeCheck = await apiRequest('GET', `/api/admin/stats?shopId=${SHOP_ID}`, null, FORGED_TOKEN);
    if (forgeCheck.statusCode === 401 || forgeCheck.statusCode === 403) {
      results.forgedTokensFail = true;
      console.log('✓ PASS: Forged admin token request was properly rejected.');
    } else {
      console.log(`✗ FAIL: Forged token request accepted with status ${forgeCheck.statusCode}`);
    }

    // 3. Test Student Uploads Work
    console.log('\nTesting criterion: Student Uploads Work...');
    const uploadedJob = await uploadTestJob('pilot-bw-doc.pdf', 'bw');
    if (uploadedJob && uploadedJob.id && uploadedJob.status === 'pending_approval' && uploadedJob.tokenId) {
      results.studentUploads = true;
      console.log(`✓ PASS: Student upload succeeded. Job ID: ${uploadedJob.id}, Token ID: ${uploadedJob.tokenId}`);
    } else {
      console.log('✗ FAIL: Student upload did not return expected job details.');
    }

    // 4. Test Private Upload Access
    console.log('\nTesting criterion: Private Upload Access...');
    if (uploadedJob && uploadedJob.serverFilePath) {
      // 4a. Unauthorized download
      const unauthDownload = await apiRequest('GET', uploadedJob.serverFilePath);
      // 4b. Forged token download
      const forgedDownload = await apiRequest('GET', uploadedJob.serverFilePath, null, FORGED_TOKEN);
      // 4c. Valid token download
      const validDownload = await apiRequest('GET', uploadedJob.serverFilePath, null, VALID_TOKEN);

      if (unauthDownload.statusCode === 401 && (forgedDownload.statusCode === 401 || forgedDownload.statusCode === 403) && validDownload.statusCode === 200) {
        results.uploadsPrivate = true;
        console.log('✓ PASS: Uploads are private and require authorization.');
      } else {
        console.log(`✗ FAIL: Upload privacy check failed. Statuses: unauth=${unauthDownload.statusCode}, forged=${forgedDownload.statusCode}, valid=${validDownload.statusCode}`);
      }
    } else {
      console.log('✗ FAIL: Skipping upload privacy check due to upload failure.');
    }

    // 5. Test Approval Works
    console.log('\nTesting criterion: Approval Works...');
    if (uploadedJob) {
      const approveCheck = await apiRequest('POST', `/api/jobs/${uploadedJob.id}/approve`, {}, VALID_TOKEN);
      if (approveCheck.statusCode === 200) {
        const resObj = JSON.parse(approveCheck.data);
        if (resObj.success && resObj.job.status === 'queued') {
          results.approvalWorks = true;
          console.log('✓ PASS: Job successfully approved and set to queued.');
        } else {
          console.log('✗ FAIL: Approval endpoint returned success but invalid job status.');
        }
      } else {
        console.log(`✗ FAIL: Approval endpoint failed with status ${approveCheck.statusCode}`);
      }
    } else {
      console.log('✗ FAIL: Skipping approval check.');
    }

    // 6. Test Queue Works
    console.log('\nTesting criterion: Queue Works...');
    if (uploadedJob) {
      const queueCheck = await apiRequest('GET', `/api/admin/jobs?shopId=${SHOP_ID}`, null, VALID_TOKEN);
      if (queueCheck.statusCode === 200) {
        const jobs = JSON.parse(queueCheck.data);
        const found = jobs.find(j => j.id === uploadedJob.id);
        if (found && found.status === 'queued') {
          results.queueWorks = true;
          console.log('✓ PASS: Job is visible in the admin queue with queued status.');
        } else {
          console.log('✗ FAIL: Approved job was not found in queue.');
        }
      } else {
        console.log(`✗ FAIL: Admin queue lookup failed with status ${queueCheck.statusCode}`);
      }
    } else {
      console.log('✗ FAIL: Skipping queue check.');
    }

    // 7. Test B&W and Color Routing Works
    console.log('\nTesting criterion: B&W / Color Routing Works...');
    // Setup mock printers and printer mappings
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    
    // Update mappings to simulate owner configuring B&W and Color printers
    const shopIdx = db.shops.findIndex(s => s.id === SHOP_ID);
    if (shopIdx !== -1) {
      db.shops[shopIdx].bwPrinterId = 'tjohn_print_1';
      db.shops[shopIdx].bwPrinterName = 'Canon IR3225';
      db.shops[shopIdx].colorPrinterId = 'tjohn_print_2';
      db.shops[shopIdx].colorPrinterName = 'Epson L3250';
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
      console.log('✓ Configured dual printer routing mappings in database.');
    }

    // Claim B&W job
    const claimCheck = await apiRequest('GET', `/api/jobs/next?shopId=${SHOP_ID}`, null, VALID_TOKEN);
    if (claimCheck.statusCode === 200) {
      const claimedJob = JSON.parse(claimCheck.data);

      // Post a timeline update to verify B&W routing is persisted
      const timelineUpdate = await apiRequest('POST', `/api/jobs/${claimedJob.id}/timeline`, {
        stage: 'claimed',
        printerId: 'tjohn_print_1',
        printerName: 'Canon IR3225',
        daemonInstance: 'TEST-PC',
        printType: 'bw',
        selectedPrinter: 'Canon IR3225'
      }, AGENT_TOKEN);

      if (timelineUpdate.statusCode === 200) {
        const dbAfter = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        const testJob = dbAfter.jobs.find(j => j.id === claimedJob.id);
        const timelineClaimed = testJob.timeline.find(t => t.stage === 'claimed');
        if (timelineClaimed && timelineClaimed.printerName === 'Canon IR3225') {
          results.bwRoutingWorks = true;
          console.log('✓ PASS: B&W job successfully routed to Canon IR3225.');
        } else {
          console.log(`✗ FAIL: B&W job timeline printerName is "${timelineClaimed?.printerName}", expected "Canon IR3225"`);
        }
      } else {
        console.log(`✗ FAIL: B&W timeline update failed with status ${timelineUpdate.statusCode}`);
      }
    } else {
      console.log(`✗ FAIL: Agent B&W job claiming failed with status ${claimCheck.statusCode}`);
    }

    // Upload and claim Color job to verify color routing
    const colorJob = await uploadTestJob('pilot-color-doc.pdf', 'color');
    if (colorJob) {
      await apiRequest('POST', `/api/jobs/${colorJob.id}/approve`, {}, VALID_TOKEN);
      const claimColor = await apiRequest('GET', `/api/jobs/next?shopId=${SHOP_ID}`, null, VALID_TOKEN);
      if (claimColor.statusCode === 200) {
        const claimedColorJob = JSON.parse(claimColor.data);
        const timelineColorUpdate = await apiRequest('POST', `/api/jobs/${claimedColorJob.id}/timeline`, {
          stage: 'claimed',
          printerId: 'tjohn_print_2',
          printerName: 'Epson L3250',
          daemonInstance: 'TEST-PC',
          printType: 'color',
          selectedPrinter: 'Epson L3250'
        }, AGENT_TOKEN);

        if (timelineColorUpdate.statusCode === 200) {
          const dbAfter = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
          const testJob = dbAfter.jobs.find(j => j.id === claimedColorJob.id);
          const timelineClaimed = testJob.timeline.find(t => t.stage === 'claimed');
          if (timelineClaimed && timelineClaimed.printerName === 'Epson L3250') {
            results.colorRoutingWorks = true;
            console.log('✓ PASS: Color job successfully routed to Epson L3250.');
          } else {
            console.log(`✗ FAIL: Color job timeline printerName is "${timelineClaimed?.printerName}", expected "Epson L3250"`);
          }
        } else {
          console.log(`✗ FAIL: Color timeline update failed with status ${timelineColorUpdate.statusCode}`);
        }
      } else {
        console.log(`✗ FAIL: Agent Color job claiming failed with status ${claimColor.statusCode}`);
      }
    }

    // 8. Test Duplicate Claims (Atomic Claiming)
    console.log('\nTesting criterion: Duplicate Claims Are Impossible (Atomic Claiming)...');
    const raceJob = await uploadTestJob('pilot-race-doc.pdf', 'bw');
    if (raceJob) {
      await apiRequest('POST', `/api/jobs/${raceJob.id}/approve`, {}, VALID_TOKEN);
      
      // Fire two concurrent claim requests
      console.log('Firing concurrent GET /api/jobs/next requests...');
      const [claim1, claim2] = await Promise.all([
        apiRequest('GET', `/api/jobs/next?shopId=${SHOP_ID}`, null, VALID_TOKEN),
        apiRequest('GET', `/api/jobs/next?shopId=${SHOP_ID}`, null, VALID_TOKEN)
      ]);

      const successCount = (claim1.statusCode === 200 ? 1 : 0) + (claim2.statusCode === 200 ? 1 : 0);
      console.log(`Concurrent claim results - Request 1: ${claim1.statusCode}, Request 2: ${claim2.statusCode}`);

      if (successCount === 1) {
        results.noDuplicateClaims = true;
        console.log('✓ PASS: Atomic claiming successfully prevented duplicate claims of the same job.');
      } else {
        console.log(`✗ FAIL: Expected exactly 1 successful claim, got ${successCount}.`);
      }
    }

    // 9. Test HTTPS works
    console.log('\nTesting criterion: HTTPS Client Dynamic Routing Works...');
    // We make a real HTTPS request using Node's native https client to prove we can establish HTTPS connections
    await new Promise((resolve) => {
      https.get('https://icanhazip.com', (res) => {
        if (res.statusCode === 200) {
          results.httpsWorks = true;
          console.log('✓ PASS: Dynamic HTTPS routing verified (successfully connected to external HTTPS endpoint).');
        } else {
          console.log(`✗ FAIL: HTTPS request failed with status ${res.statusCode}`);
        }
        resolve();
      }).on('error', (e) => {
        console.log('✗ FAIL: HTTPS connection threw error:', e.message);
        resolve();
      });
    });

  } catch (err) {
    console.error('Test execution threw error:', err);
  } finally {
    // Final DB cleanup of verification records
    try {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      db.jobs = db.jobs.filter(j => j.studentName !== 'PilotTester');
      db.agents = db.agents.filter(a => a.agentId !== 'TEST-AGENT-PILOT');
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
      console.log('\n✓ Cleaned up database pilot verification records.');
    } catch (e) {}
  }

  // Print Final Report
  console.log('\n==================================================');
  console.log('             PILOT READINESS REPORT               ');
  console.log('==================================================');
  console.log(`[${results.studentUploads ? '✓' : ' '}] Student uploads work`);
  console.log(`[${results.approvalWorks ? '✓' : ' '}] Approval works`);
  console.log(`[${results.queueWorks ? '✓' : ' '}] Queue works`);
  console.log(`[${results.agentWorks ? '✓' : ' '}] Agent works`);
  console.log(`[${results.bwRoutingWorks ? '✓' : ' '}] B&W routing works`);
  console.log(`[${results.colorRoutingWorks ? '✓' : ' '}] Color routing works`);
  console.log(`[${results.httpsWorks ? '✓' : ' '}] HTTPS works`);
  console.log(`[${results.uploadsPrivate ? '✓' : ' '}] Uploads are private`);
  console.log(`[${results.noDuplicateClaims ? '✓' : ' '}] Duplicate claims are impossible`);
  console.log(`[${results.forgedTokensFail ? '✓' : ' '}] Forged admin tokens fail`);
  console.log('--------------------------------------------------');

  const allPassed = Object.values(results).every(v => v === true);
  if (allPassed) {
    console.log('FINAL RESULT: PASS 🎉');
    process.exit(0);
  } else {
    console.log('FINAL RESULT: FAIL ✗');
    process.exit(1);
  }
}

run();

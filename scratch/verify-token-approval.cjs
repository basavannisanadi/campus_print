const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
const ADMIN_API_KEY = 'campusprint_admin_123';
const AGENT_TOKEN = 'campusprint_agent_token_123';
const SHOP_ID = 'tjohn_print';
let ADMIN_TOKEN = ''; // token for tjohn_print shop admin will be fetched dynamically

async function test() {
  console.log('=== STARTING TOKEN-BASED APPROVAL WORKFLOW VERIFICATION ===\n');

  try {
    const loginRes = await apiPost('/api/auth/login', {
      shopId: SHOP_ID,
      username: 'tjohn_admin',
      password: 'tjohn_password123'
    });
    ADMIN_TOKEN = loginRes.token;
    console.log('✓ Logged in and retrieved valid HMAC Admin Token.');
  } catch (e) {
    console.error('Failed to log in:', e.message);
    process.exit(1);
  }

  // Pre-test cleanup: remove any leftover test jobs
  try {
    const dbPath = 'd:/WEBSITES/campus-printing-queue-and-management-system/server/data/db.json';
    if (fs.existsSync(dbPath)) {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      db.jobs = db.jobs.filter(j => j.studentName !== 'Basav');
      db.agents = db.agents.filter(a => a.agentId !== 'TEST-AGENT-001');
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
      console.log('✓ Cleaned up any leftover test data from previous runs.');
    }
  } catch (e) {}

  try {
    // 1. Register a test agent to make the shop online
    console.log('Registering test agent to set shop status to online...');
    const regRes = await apiPost('/api/agent/register', {
      agentId: 'TEST-AGENT-001',
      shopId: SHOP_ID,
      machineName: 'TEST-MACHINE',
      printerName: 'Canon iR3225 Test',
      daemonVersion: '1.0.0-test',
      agentToken: AGENT_TOKEN
    });
    console.log('✓ Test agent registered:', regRes);

    // 2. Create a dummy file to upload
    const dummyFilePath = path.join(__dirname, 'test-doc.pdf');
    fs.writeFileSync(dummyFilePath, '%PDF-1.4\n1 0 obj\n<<\n/Type /Page\n>>\nendobj\n/Count 2\n%%EOF');
    console.log('✓ Created dummy PDF file for upload.');

    // 3. Perform multipart upload
    console.log('Testing Job Ingestion / Student Upload...');
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const fileContent = fs.readFileSync(dummyFilePath);
    
    let header = '';
    header += `--${boundary}\r\n`;
    header += `Content-Disposition: form-data; name="studentName"\r\n\r\n`;
    header += `Basav\r\n`;
    
    header += `--${boundary}\r\n`;
    header += `Content-Disposition: form-data; name="studentEmail"\r\n\r\n`;
    header += `basav@university.edu\r\n`;
    
    header += `--${boundary}\r\n`;
    header += `Content-Disposition: form-data; name="shopId"\r\n\r\n`;
    header += `${SHOP_ID}\r\n`;

    const configs = [
      {
        copies: 1,
        printMode: 'mono',
        sides: 'single',
        pageRange: ''
      }
    ];
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

    const uploadResponse = await new Promise((resolve, reject) => {
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
            reject(new Error(`Upload failed status ${res.statusCode}: ${body}`));
          } else {
            resolve(JSON.parse(body));
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    // Clean up local temp file
    try { fs.unlinkSync(dummyFilePath); } catch {}

    if (!Array.isArray(uploadResponse) || uploadResponse.length === 0) {
      throw new Error('Upload response is not an array or empty.');
    }

    const uploadedJob = uploadResponse[0];
    console.log('✓ Ingested Job Details:');
    console.log(`  - Job ID: ${uploadedJob.id}`);
    console.log(`  - Print Token: ${uploadedJob.token}`);
    console.log(`  - Approval Token (tokenId): ${uploadedJob.tokenId}`);
    console.log(`  - Status: ${uploadedJob.status}`);

    // Verify properties
    if (uploadedJob.status !== 'pending_approval') {
      throw new Error(`FAIL: Uploaded job status is "${uploadedJob.status}", expected "pending_approval"`);
    }
    if (!uploadedJob.tokenId || !uploadedJob.tokenId.startsWith('CP-')) {
      throw new Error(`FAIL: Uploaded job tokenId is "${uploadedJob.tokenId}", expected a valid CP-XXXX token`);
    }
    console.log('✓ PASS: Job initialized with pending_approval status and unique CP-XXXX token.\n');

    // 4. Test Token Search Endpoint
    console.log('Testing Token Search Endpoint (GET /api/jobs/token/:tokenId)...');
    const searchRes = await apiGet(`/api/jobs/token/${uploadedJob.tokenId}`, ADMIN_TOKEN);
    console.log('✓ Token Search Response:', searchRes);
    if (searchRes.id !== uploadedJob.id) {
      throw new Error('FAIL: Token search returned the wrong job!');
    }
    console.log('✓ PASS: Token search endpoint successfully found the job by tokenId.\n');

    // 5. Test Shop Isolation
    console.log('Testing Shop Isolation on Token Search...');
    try {
      // Use a token for another shop (e.g. token_other_shop)
      await apiGet(`/api/jobs/token/${uploadedJob.tokenId}`, 'token_other_shop');
      throw new Error('FAIL: Allowed cross-shop search for non-existent/different shop!');
    } catch (err) {
      if (err.message.includes('403') || err.message.includes('401')) {
        console.log('✓ PASS: Cross-shop token search rejected with Forbidden/Unauthorized.');
      } else {
        throw err;
      }
    }

    // 6. Test Approve Endpoint
    console.log('\nTesting Approve Endpoint (POST /api/jobs/:id/approve)...');
    const approveRes = await apiPost(`/api/jobs/${uploadedJob.id}/approve`, {}, ADMIN_TOKEN);
    console.log('✓ Approve Response:', approveRes);
    if (!approveRes.success || approveRes.job.status !== 'queued') {
      throw new Error('FAIL: Approve endpoint did not return success or transition status to queued!');
    }
    console.log('✓ PASS: Approve endpoint successfully completed.');

    // 7. Verify Database State
    console.log('\nVerifying Database and Telemetry state...');
    const verifyJob = await apiGet(`/api/admin/jobs/${uploadedJob.id}`, ADMIN_TOKEN);
    console.log('✓ Stored Job after approval:', verifyJob);
    if (verifyJob.status !== 'queued') {
      throw new Error(`FAIL: Database job status is "${verifyJob.status}", expected "queued"`);
    }

    // Check timeline stages
    const timelineStages = verifyJob.timeline.map(t => t.stage);
    console.log('✓ Job Timeline stages:', timelineStages);
    if (!timelineStages.includes('uploaded') || !timelineStages.includes('approved')) {
      throw new Error('FAIL: Timeline does not contain both "uploaded" and "approved" stages!');
    }
    console.log('✓ PASS: Database state and timeline telemetry updated correctly.');

    // 8. Verify print daemon next job endpoint behaves correctly
    console.log('\nTesting next queued job endpoint for agent retrieval...');
    const nextJob = await apiGet(`/api/jobs/next?shopId=${SHOP_ID}`, ADMIN_TOKEN);
    console.log('✓ Next queued job:', nextJob);
    if (nextJob.id !== uploadedJob.id) {
      throw new Error(`FAIL: Next queued job returned ${nextJob.id}, expected ${uploadedJob.id}`);
    }
    console.log('✓ PASS: Next job endpoint returns approved job for print agent processing.');

    console.log('\n==========================================');
    console.log('ALL TOKEN-BASED APPROVAL TESTS PASSED! ✓');
    console.log('==========================================');

    // Clean up database (job and agent)
    const dbPath = 'd:/WEBSITES/campus-printing-queue-and-management-system/server/data/db.json';
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    db.jobs = db.jobs.filter(j => j.studentName !== 'Basav');
    db.agents = db.agents.filter(a => a.agentId !== 'TEST-AGENT-001');
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    console.log('✓ Cleaned up verification print job and test agent.');

  } catch (err) {
    console.error('\nVerification failed: ✗', err.message);
    
    // Clean up database on failure
    try {
      const dbPath = 'd:/WEBSITES/campus-printing-queue-and-management-system/server/data/db.json';
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      db.jobs = db.jobs.filter(j => j.studentName !== 'Basav');
      db.agents = db.agents.filter(a => a.agentId !== 'TEST-AGENT-001');
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
      console.log('✓ Cleaned up test data on failure.');
    } catch {}

    process.exit(1);
  }
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

test();

const http = require('http');

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
const ADMIN_API_KEY = 'campusprint_admin_123';

async function test() {
  console.log('Starting Telemetry API Verification Tests...');

  try {
    // 1. Verify we can get public jobs
    console.log('\n--- 1. Testing GET /api/jobs (Public Queue) ---');
    const publicJobs = await apiGet('/api/jobs');
    console.log(`Success! Found ${publicJobs.length} public job(s).`);
    if (publicJobs.length > 0) {
      const sample = publicJobs[0];
      console.log('Sample job keys:', Object.keys(sample));
      if (sample.timeline || sample.metrics || sample.failureSnapshot) {
        throw new Error('FAIL: Public job endpoint leaks timeline/metrics/failureSnapshot!');
      }
      console.log('✓ PASS: Public job endpoint does not leak diagnostic telemetry data.');
    }

    // 2. Create a test job by posting directly (simulate upload)
    console.log('\n--- 2. Creating a test job via Mock Database direct insertion ---');
    // Since file upload requires multipart, we can just insert a job in the database directly for test,
    // or we can test an existing queued job.
    // Let's fetch admin jobs first
    const adminJobsBefore = await apiGet('/api/admin/jobs', true);
    let targetJob = adminJobsBefore.find(j => j.status === 'queued');
    
    if (!targetJob) {
      console.log('No queued jobs found. Creating a fake job in DB for test purposes...');
      // We will perform a direct require of server/db.js to add a job,
      // but since we are running as a separate process, it's easier to create it by reading/writing db.json directly.
      const fs = require('fs');
      const path = require('path');
      const dbPath = path.resolve(__dirname, '../server/data/db.json');
      if (fs.existsSync(dbPath)) {
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        targetJob = {
          id: 'job-test-telemetry',
          token: 'TELEMETRY_TEST',
          fileName: 'test-telemetry.pdf',
          fileSize: 1024,
          pageCount: 3,
          copies: 1,
          printMode: 'mono',
          sides: 'single',
          status: 'queued',
          studentName: 'Telemetry Tester',
          studentEmail: 'test@telemetry.com',
          createdAt: new Date().toISOString(),
          progressPercent: 0,
          serverFilePath: '/uploads/test.pdf',
          shopId: 'alliance_print',
          timeline: [
            {
              stage: 'uploaded',
              at: new Date().toISOString(),
              printerId: 'MOCK_PRINTER',
              printerName: 'Mock Printer'
            }
          ]
        };
        db.jobs.push(targetJob);
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        console.log('✓ Test job injected into db.json directly.');
      } else {
        throw new Error('db.json not found to inject test job');
      }
    }

    const job = targetJob;
    console.log(`Using Job: ${job.id} (Token: ${job.token})`);

    // 3. Test timeline endpoint
    console.log('\n--- 3. Testing POST /api/jobs/:id/timeline ---');
    
    console.log('Posting "claimed" stage...');
    let resJob = await apiPost(`/api/jobs/${job.id}/timeline`, {
      stage: 'claimed',
      printerId: 'VERIFY_PRINTER',
      printerName: 'Verify Printer Name',
      daemonInstance: 'VERIFY_DAEMON'
    });
    
    console.log('Posting "downloaded" stage...');
    // Introduce a brief sleep to simulate timing difference
    await new Promise(r => setTimeout(r, 200));
    resJob = await apiPost(`/api/jobs/${job.id}/timeline`, {
      stage: 'downloaded',
      printerId: 'VERIFY_PRINTER',
      printerName: 'Verify Printer Name',
      daemonInstance: 'VERIFY_DAEMON'
    });

    console.log('Posting "completed" stage...');
    await new Promise(r => setTimeout(r, 300));
    resJob = await apiPost(`/api/jobs/${job.id}/timeline`, {
      stage: 'completed',
      printerId: 'VERIFY_PRINTER',
      printerName: 'Verify Printer Name',
      daemonInstance: 'VERIFY_DAEMON'
    });

    console.log('✓ PASS: Timeline entries appended successfully.');
    console.log('Timeline content:', resJob.timeline);

    // 4. Verify Metrics calculation
    console.log('\n--- 4. Verifying dynamically computed JobMetrics ---');
    console.log('Job Metrics output:', resJob.metrics);
    if (!resJob.metrics || typeof resJob.metrics.claimToDownloadMs !== 'number' || typeof resJob.metrics.totalProcessingMs !== 'number') {
      throw new Error('FAIL: Metrics were not correctly computed on timeline update!');
    }
    console.log(`✓ PASS: Metrics calculated successfully (totalProcessingMs = ${resJob.metrics.totalProcessingMs}ms)`);

    // 5. Test failure-snapshot endpoint
    console.log('\n--- 5. Testing POST /api/jobs/:id/failure-snapshot ---');
    resJob = await apiPost(`/api/jobs/${job.id}/failure-snapshot`, {
      printerReported: 'ONLINE',
      physicalObservation: 'No paper output observed',
      paperOutput: false,
      operatorNotes: 'Telemetry test manual verification snapshot'
    });
    console.log('✓ PASS: Failure snapshot saved successfully.');
    console.log('Failure Snapshot:', resJob.failureSnapshot);

    // 6. Test GET /api/admin/jobs
    console.log('\n--- 6. Testing GET /api/admin/jobs (Admin Lookups) ---');
    const adminJobs = await apiGet('/api/admin/jobs', true);
    const retrievedJob = adminJobs.find(j => j.id === job.id);
    if (!retrievedJob || !retrievedJob.timeline || !retrievedJob.metrics || !retrievedJob.failureSnapshot) {
      throw new Error('FAIL: Admin jobs list does not return full telemetry details!');
    }
    console.log('✓ PASS: Admin jobs endpoint returns all telemetry details.');

    // 7. Test GET /api/admin/jobs/:id
    console.log('\n--- 7. Testing GET /api/admin/jobs/:id (Admin Single Lookup) ---');
    const retrievedSingleJob = await apiGet(`/api/admin/jobs/${job.id}`, true);
    if (retrievedSingleJob.id !== job.id || !retrievedSingleJob.timeline || !retrievedSingleJob.metrics) {
      throw new Error('FAIL: Admin single job endpoint fails or returns incomplete details!');
    }
    console.log('✓ PASS: Admin single job lookup returned complete details.');

    console.log('\n==========================================');
    console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY! ✓');
    console.log('==========================================');

    // Clean up test job from db.json
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.resolve(__dirname, '../server/data/db.json');
    if (fs.existsSync(dbPath)) {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      db.jobs = db.jobs.filter(j => j.id !== 'job-test-telemetry');
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
      console.log('Cleaned up telemetry test job from database.');
    }

  } catch (err) {
    console.error('Verification failed: ✗', err.message);
    process.exit(1);
  }
}

function apiGet(endpoint, auth = false) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (auth) headers['Authorization'] = `Bearer ${ADMIN_API_KEY}`;
    
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

function apiPost(endpoint, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${ADMIN_API_KEY}`
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

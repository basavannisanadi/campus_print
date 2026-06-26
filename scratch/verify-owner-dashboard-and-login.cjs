const http = require('http');

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log('Starting Verification Tests for Owner Dashboard & Shop Admin Login...');

  try {
    // 1. Test Owner Login
    console.log('\n--- 1. Testing Owner Login ---');
    const ownerLoginRes = await apiPost('/api/auth/login', {
      username: 'owner',
      password: 'campusprint_admin_123'
    });
    console.log('✓ PASS: Owner login successful. Response:', ownerLoginRes);
    if (ownerLoginRes.role !== 'owner' || ownerLoginRes.token !== 'campusprint_admin_123') {
      throw new Error('FAIL: Owner login returned incorrect role or token');
    }

    // 2. Test Owner Dashboard Access
    console.log('\n--- 2. Testing Owner Dashboard Access ---');
    // 2.1 Unauthenticated
    try {
      await apiGet('/api/owner/dashboard');
      throw new Error('FAIL: Allowed unauthenticated access to /api/owner/dashboard');
    } catch (err) {
      if (err.message.includes('401')) {
        console.log('✓ PASS: Unauthenticated access rejected with 401.');
      } else {
        throw err;
      }
    }

    // 2.2 Authenticated
    const dashboardData = await apiGet('/api/owner/dashboard', ownerLoginRes.token);
    console.log('✓ PASS: Owner dashboard retrieved successfully.');
    console.log('Keys in dashboard data:', Object.keys(dashboardData));
    if (!dashboardData.recentJobs || !dashboardData.failures || !dashboardData.stats || !('jobsToday' in dashboardData.stats)) {
      throw new Error('FAIL: Owner dashboard did not return expected aggregate structure');
    }

    // 3. Test Shop Admin Login
    console.log('\n--- 3. Testing Shop Admin Login (TJohn Print Center) ---');
    const shopAdminLoginRes = await apiPost('/api/auth/login', {
      shopId: 'tjohn_print',
      username: 'tjohn_admin',
      password: 'tjohn_password123'
    });
    console.log('✓ PASS: Shop admin login successful. Response:', shopAdminLoginRes);
    if (shopAdminLoginRes.role !== 'shop_admin' || shopAdminLoginRes.shopId !== 'tjohn_print' || !shopAdminLoginRes.token.startsWith('token_tjohn_print')) {
      throw new Error('FAIL: Shop admin login returned incorrect details');
    }

    // 3.1 Invalid credentials
    try {
      await apiPost('/api/auth/login', {
        shopId: 'tjohn_print',
        username: 'tjohn_admin',
        password: 'wrong_password'
      });
      throw new Error('FAIL: Allowed login with wrong credentials');
    } catch (err) {
      if (err.message.includes('401')) {
        console.log('✓ PASS: Login rejected with 401 on invalid password.');
      } else {
        throw err;
      }
    }

    // 4. Test Shop Isolation Blocks (403 Forbidden)
    console.log('\n--- 4. Testing Shop Isolation Rules ---');
    // TJohn admin accessing TJohn stats -> Should pass
    const tjohnStats = await apiGet('/api/admin/stats?shopId=tjohn_print', shopAdminLoginRes.token);
    console.log('✓ PASS: TJohn admin retrieved TJohn stats successfully.');

    // TJohn admin accessing another shop stats (e.g. alliance_print) -> Should return 403
    try {
      await apiGet('/api/admin/stats?shopId=alliance_print', shopAdminLoginRes.token);
      throw new Error('FAIL: TJohn admin was allowed to access alliance_print stats');
    } catch (err) {
      if (err.message.includes('403')) {
        console.log('✓ PASS: Access to alliance_print stats rejected with 403 Forbidden.');
      } else {
        throw err;
      }
    }

    // TJohn admin accessing health for alliance_print -> Should return 403
    try {
      await apiGet('/api/admin/health?shopId=alliance_print', shopAdminLoginRes.token);
      throw new Error('FAIL: TJohn admin was allowed to access alliance_print health');
    } catch (err) {
      if (err.message.includes('403')) {
        console.log('✓ PASS: Access to alliance_print health rejected with 403 Forbidden.');
      } else {
        throw err;
      }
    }

    // TJohn admin updating another shop pricing -> Should return 403
    try {
      await apiPut('/api/shops/alliance_print/pricing', {
        bwPrice: 10,
        colorPrice: 20,
        duplexPrice: 5
      }, shopAdminLoginRes.token);
      throw new Error('FAIL: TJohn admin was allowed to update alliance_print pricing');
    } catch (err) {
      if (err.message.includes('403')) {
        console.log('✓ PASS: Update to alliance_print pricing rejected with 403 Forbidden.');
      } else {
        throw err;
      }
    }

    console.log('\n======================================================');
    console.log('ALL OWNER DASHBOARD AND LOGIN TESTS PASSED SUCCESSFULLY! ✓');
    console.log('======================================================');

  } catch (err) {
    console.error('\nVerification failed: ✗', err.message);
    process.exit(1);
  }
}

function apiGet(endpoint, token = '') {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
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

function apiPost(endpoint, body, token = '') {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
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

function apiPut(endpoint, body, token = '') {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
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

runTests();

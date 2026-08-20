import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_TEST_PATH = path.resolve(__dirname, '../../server/data/db.test.json');
const UPLOADS_TEST_DIR = path.resolve(__dirname, '../../server/uploads-test');

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
    printerStatus: 'online',
    lastHeartbeat: new Date().toISOString(),
    adminUsername: 'tjohn_admin',
    adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00',
    bwStatusMode: 'online',
    colorStatusMode: 'online',
    bwMaintenanceMode: false,
    colorMaintenanceMode: false
  },
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
    printerStatus: 'online',
    lastHeartbeat: new Date().toISOString(),
    adminUsername: 'alliance_admin',
    adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00',
    bwStatusMode: 'online',
    colorStatusMode: 'online',
    bwMaintenanceMode: false,
    colorMaintenanceMode: false
  },
  {
    id: 'science_print',
    name: 'Science Print Center',
    ownerName: 'Science Staff',
    phoneNumber: '9876543212',
    phone: '9876543212',
    address: 'Science Department',
    maintenanceMode: false,
    bwPrice: 3,
    colorPrice: 5,
    duplexPrice: 3,
    isOpen: true,
    openingTime: '08:00 AM',
    closingTime: '08:00 PM',
    printerStatus: 'online',
    lastHeartbeat: new Date().toISOString(),
    adminUsername: 'science_admin',
    adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00',
    bwStatusMode: 'online',
    colorStatusMode: 'online',
    bwMaintenanceMode: false,
    colorMaintenanceMode: false
  }
];

const DEFAULT_PRINTER_SETTINGS = {
  status: 'online',
  expectedReturnTime: '2:00 PM',
  averagePrintSpeed: 5,
  adminOverrideStatus: 'online',
  availablePrinters: ['AlliancePrinter'],
  selectedPrinter: 'AlliancePrinter'
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

function resetDb() {
  const currentIso = new Date().toISOString();
  
  const shops = JSON.parse(JSON.stringify(DEFAULT_SHOPS));
  shops.forEach((s: any) => {
    s.lastHeartbeat = currentIso;
  });

  const agents = JSON.parse(JSON.stringify(DEFAULT_AGENTS));
  agents.forEach((a: any) => {
    a.lastSeen = currentIso;
  });

  const db = {
    jobs: [],
    shops,
    printerSettings: JSON.parse(JSON.stringify(DEFAULT_PRINTER_SETTINGS)),
    agents,
    printers: []
  };
  const dir = path.dirname(DB_TEST_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DB_TEST_PATH, JSON.stringify(db, null, 2), 'utf-8');

  // Clean uploads directory
  if (fs.existsSync(UPLOADS_TEST_DIR)) {
    const files = fs.readdirSync(UPLOADS_TEST_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(UPLOADS_TEST_DIR, file));
    }
  } else {
    fs.mkdirSync(UPLOADS_TEST_DIR, { recursive: true });
  }
}

test.describe('Student Portal Stale Database Error Regression', () => {
  test.beforeEach(async () => {
    resetDb();
  });

  test('should verify background API 503 failures do not create stale database error on document upload/configuration', async ({ page }) => {
    // 1. Authenticate via Google mock token
    const authRes = await page.request.post('http://127.0.0.1:3001/api/auth/google', {
      data: { idToken: 'mock_token_regression_tester' }
    });
    expect(authRes.ok()).toBe(true);
    const authData = await authRes.json();
    const studentToken = authData.sessionToken;

    // Authenticate shop admin
    const adminAuthRes = await page.request.post('http://127.0.0.1:3001/api/auth/login', {
      data: {
        shopId: 'alliance_print',
        username: 'alliance_admin',
        password: 'tjohn_password123'
      }
    });
    expect(adminAuthRes.ok()).toBe(true);
    const adminData = await adminAuthRes.json();

    // 2. Set tokens in sessionStorage and set selected shop
    await page.goto('/login');
    await page.evaluate(({ sToken, aToken, role, shopId }) => {
      sessionStorage.setItem('studentSessionToken', sToken);
      sessionStorage.setItem('adminToken', aToken);
      sessionStorage.setItem('role', role);
      sessionStorage.setItem('shopId', shopId);
      localStorage.setItem('selectedShopId', 'alliance_print');
    }, {
      sToken: studentToken,
      aToken: adminData.token,
      role: adminData.role,
      shopId: adminData.shopId
    });

    // 3. Intercept background history API to simulate 503 "Database service unavailable"
    await page.route('**/api/student/history**', route => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Database service unavailable' })
      });
    });

    // 4. Navigate to Student Portal
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Confirm transition into student portal dashboard
    await expect(page.locator('button:has-text("Sign Out")')).toBeVisible({ timeout: 10000 });

    // 5. Confirm background 503 history error does NOT render "Database service unavailable" banner on upload form
    await expect(page.locator('text=Database service unavailable')).toHaveCount(0);

    // 6. Select a valid PDF file
    const samplePdfPath = path.resolve(__dirname, '../fixtures/sample_preview_test.pdf');
    await page.setInputFiles('input[type="file"]', samplePdfPath);

    // 7. Wait for document selection and configuration to render
    await expect(page.locator('text=Print Configuration')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Live Order Summary')).toBeVisible();

    // 8. Configure document (adjust copies)
    const plusCopiesBtn = page.locator('button:has-text("+")');
    await plusCopiesBtn.click();

    // 9. BEFORE clicking "SUBMIT & SEND":
    //    - Assert configuration panel is visible
    //    - Assert "Database service unavailable" is NOT visible anywhere in submission banner
    //    - Assert submit button is enabled and shows correct file count
    await expect(page.locator('text=Print Configuration')).toBeVisible();
    await expect(page.locator('text=Database service unavailable')).toHaveCount(0);
    const submitBtn = page.locator('button[type="submit"]:has-text("Submit & Send")');
    await expect(submitBtn).toBeEnabled();

    // 10. Test genuine POST /api/jobs failure:
    //     Intercept POST /api/jobs to return 503 "Database service unavailable"
    let mockJobsFail = true;
    await page.route('**/api/jobs', async route => {
      if (route.request().method() === 'POST' && mockJobsFail) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Database service unavailable' })
        });
      } else {
        await route.continue();
      }
    });

    // Click submit and verify the genuine error banner is shown
    await submitBtn.click();
    await expect(page.locator('text=Database service unavailable').first()).toBeVisible({ timeout: 5000 });

    // 11. Modifying any configuration auto-clears the error banner
    await page.locator('button:has-text("Duplex")').click();
    await expect(page.locator('text=Database service unavailable')).toHaveCount(0);

    // 12. Test subsequent successful POST /api/jobs:
    //      Disable mock failure and submit
    mockJobsFail = false;
    await page.locator('button[type="submit"]:has-text("Submit & Send")').click();

    // Assert success view with Approval Token is shown
    await expect(page.locator('text=Upload Successful')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Your Approval Token').first()).toBeVisible();
    await expect(page.locator('text=Database service unavailable')).toHaveCount(0);
  });
});

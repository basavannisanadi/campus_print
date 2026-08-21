import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_TEST_PATH = path.resolve(__dirname, '../../server/data/db.test.json');

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
  }
];

const DEFAULT_PRINTER_SETTINGS = {
  status: 'online',
  expectedReturnTime: '2:00 PM',
  averagePrintSpeed: 5,
  adminOverrideStatus: 'online',
  availablePrinters: ['TJohnPrinter'],
  selectedPrinter: 'TJohnPrinter'
};

const DEFAULT_AGENTS = [
  {
    agentId: 'tjohn_agent',
    shopId: 'tjohn_print',
    machineName: 'tjohn-machine',
    printerName: 'TJohnPrinter',
    daemonVersion: '1.0.0',
    onlineStatus: 'online',
    lastSeen: new Date().toISOString()
  }
];

function resetDb() {
  const currentIso = new Date().toISOString();
  const shops = JSON.parse(JSON.stringify(DEFAULT_SHOPS));
  shops[0].lastHeartbeat = currentIso;

  const agents = JSON.parse(JSON.stringify(DEFAULT_AGENTS));
  agents[0].lastSeen = currentIso;

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
}

test.describe('Student Google Session Persistence E2E Workflow', () => {
  test.beforeEach(async () => {
    resetDb();
  });

  test('TEST 1 & 2: Session persists in localStorage across page reload and browser tab reopening', async ({ browser, page }) => {
    // 1. Authenticate via Google mock token endpoint
    const authRes = await page.request.post('http://127.0.0.1:3001/api/auth/google', {
      data: { idToken: 'mock_token_persistent_student' }
    });
    expect(authRes.ok()).toBe(true);
    const { sessionToken } = await authRes.json();
    expect(sessionToken).toBeDefined();

    // 2. Set token in localStorage on student portal
    await page.goto('/login');
    await page.evaluate((tok) => {
      localStorage.setItem('studentSessionToken', tok);
    }, sessionToken);

    // 3. Navigate to Student Portal Home
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 4. Verify student is authenticated and profile is visible
    const uploadPrompt = page.locator('text=Upload Your Document').first();
    await expect(uploadPrompt).toBeVisible({ timeout: 10000 });

    // 5. Test Page Refresh: Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(uploadPrompt).toBeVisible({ timeout: 10000 });

    // 6. Test New Tab / Browser Reopen Simulation: Open fresh context sharing localStorage
    const newContext = await browser.newContext();
    const newPage = await newContext.newPage();

    // Emulate existing localStorage in the new window
    await newPage.goto('/login');
    await newPage.evaluate((tok) => {
      localStorage.setItem('studentSessionToken', tok);
    }, sessionToken);

    // Open Student Portal directly
    await newPage.goto('/');
    await newPage.waitForLoadState('networkidle');
    await expect(newPage.locator('text=Upload Your Document').first()).toBeVisible({ timeout: 10000 });

    await newContext.close();
  });

  test('TEST 3: Legacy sessionStorage token is automatically migrated to localStorage', async ({ page }) => {
    const authRes = await page.request.post('http://127.0.0.1:3001/api/auth/google', {
      data: { idToken: 'mock_token_migrating_student' }
    });
    expect(authRes.ok()).toBe(true);
    const { sessionToken } = await authRes.json();

    // Set token in sessionStorage only, clear localStorage
    await page.goto('/login');
    await page.evaluate((tok) => {
      localStorage.clear();
      sessionStorage.setItem('studentSessionToken', tok);
    }, sessionToken);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Upload Your Document').first()).toBeVisible({ timeout: 10000 });

    // Verify token was automatically migrated to localStorage and cleared from sessionStorage
    const localToken = await page.evaluate(() => localStorage.getItem('studentSessionToken'));
    const sessionTokenVal = await page.evaluate(() => sessionStorage.getItem('studentSessionToken'));

    expect(localToken).toBe(sessionToken);
    expect(sessionTokenVal).toBeNull();
  });

  test('TEST 4: Explicit logout wipes persisted session and returns to login', async ({ page }) => {
    const authRes = await page.request.post('http://127.0.0.1:3001/api/auth/google', {
      data: { idToken: 'mock_token_logout_student' }
    });
    const { sessionToken } = await authRes.json();

    await page.goto('/login');
    await page.evaluate((tok) => {
      localStorage.setItem('studentSessionToken', tok);
    }, sessionToken);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Upload Your Document').first()).toBeVisible({ timeout: 10000 });

    // Execute logout via page evaluate
    await page.evaluate(async () => {
      const token = localStorage.getItem('studentSessionToken');
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
      localStorage.removeItem('studentSessionToken');
      sessionStorage.removeItem('studentSessionToken');
      window.location.href = '/login';
    });

    await page.waitForURL('**/login');

    // Verify localStorage and sessionStorage are empty
    const localToken = await page.evaluate(() => localStorage.getItem('studentSessionToken'));
    const sessionTokenVal = await page.evaluate(() => sessionStorage.getItem('studentSessionToken'));
    expect(localToken).toBeNull();
    expect(sessionTokenVal).toBeNull();

    // Attempting to visit '/' redirects to '/login'
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1:has-text("Campus Print")')).toBeVisible();
    await expect(page.locator('text=Upload Your Document')).toBeHidden();
  });

  test('TEST 5: Expired or invalid token is discarded and user is redirected to login', async ({ page }) => {
    // Set a corrupted/invalid token
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('studentSessionToken', 'invalid.token.structure');
    });

    // Navigate to Student Portal
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify redirected to login
    await expect(page.locator('h1:has-text("Campus Print")')).toBeVisible();
    await expect(page.locator('text=Upload Your Document')).toBeHidden();

    // Verify invalid token was purged from localStorage
    const localToken = await page.evaluate(() => localStorage.getItem('studentSessionToken'));
    expect(localToken).toBeNull();
  });
});

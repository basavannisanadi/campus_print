import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_TEST_PATH = path.resolve(__dirname, '../../../server/data/db.test.json');

const DEFAULT_SHOPS = [
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
    printerStatus: 'offline',
    lastHeartbeat: '',
    adminUsername: 'alliance_admin',
    adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00' // SHA-256 hash of 'tjohn_password123'
  }
];

const DEFAULT_PRINTER_SETTINGS = {
  status: 'offline',
  expectedReturnTime: '2:00 PM',
  averagePrintSpeed: 5,
  adminOverrideStatus: 'none'
};

function resetDb() {
  const db = {
    jobs: [],
    shops: JSON.parse(JSON.stringify(DEFAULT_SHOPS)),
    printerSettings: JSON.parse(JSON.stringify(DEFAULT_PRINTER_SETTINGS)),
    agents: [],
    printers: []
  };
  const dir = path.dirname(DB_TEST_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DB_TEST_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

test.describe('E2E Connection and Shop Admin Authentication Lifecycle', () => {
  test.beforeEach(async () => {
    resetDb();
  });

  test('should support Admin login, go online/offline connection control, and admin logout', async ({ page }) => {
    // 1. Navigate to admin console
    await page.goto('/admin');

    // 2. Perform real login
    await page.selectOption('select', 'alliance_print');
    await page.fill('input[placeholder="admin"]', 'alliance_admin');
    await page.fill('input[placeholder="••••••••"]', 'tjohn_password123');
    await page.click('button:has-text("Sign In to Console")');

    // 3. Verify dashboard loaded
    await expect(page.locator('h2:has-text("Administrator Console")')).toBeVisible();
    await expect(page.locator('button:has-text("Sign Out")')).toBeVisible();

    // Setup protocol call hook in iframe creation
    await page.evaluate(() => {
      (window as any).protocolCalls = [];
      const originalCreate = document.createElement;
      document.createElement = function(tagName: string, options?: ElementCreationOptions) {
        const element = originalCreate.call(document, tagName, options);
        if (tagName.toLowerCase() === 'iframe') {
          Object.defineProperty(element, 'src', {
            set(url: string) {
              if (url.startsWith('campusprint://')) {
                (window as any).protocolCalls.push(url);
              }
              this.setAttribute('src', url);
            },
            get() {
              return this.getAttribute('src');
            }
          });
        }
        return element;
      };
    });

    // Verify offline status badge
    const offlineBadge = page.locator('span:has-text("OFFLINE")').first();
    await expect(offlineBadge).toBeVisible();

    // Locate and click GO ONLINE
    const goOnlineBtn = page.locator('button:has-text("GO ONLINE")').last();
    await expect(goOnlineBtn).toBeVisible();

    // Perform rapid concurrent clicks to check double click protection
    await Promise.all([
      goOnlineBtn.dispatchEvent('click'),
      goOnlineBtn.dispatchEvent('click')
    ]);


    // Wait for connecting status Cancel button to appear
    const cancelBtn = page.locator('button:has-text("Cancel Connecting")').first();
    await expect(cancelBtn).toBeVisible();

    // Verify captured protocol calls
    const protocolCalls = await page.evaluate(() => (window as any).protocolCalls);
    expect(protocolCalls.length).toBe(1);
    expect(protocolCalls[0]).toContain('campusprint://start');
    expect(protocolCalls[0]).toContain('shopId=alliance_print');
    expect(protocolCalls[0]).toContain('token=token_alliance_print_');

    // Click Cancel Connecting
    await cancelBtn.click();

    // Verify state transitions back to OFFLINE
    await expect(page.locator('span:has-text("OFFLINE")').first()).toBeVisible();

    // Perform logout
    await page.click('button:has-text("Sign Out")');

    // Verify login form is visible again
    await expect(page.locator('button:has-text("Sign In to Console")')).toBeVisible();
  });
});

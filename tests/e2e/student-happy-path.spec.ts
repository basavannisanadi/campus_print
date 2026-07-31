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

test.describe('Student Happy Path Print Submission Workflow', () => {
  test.beforeEach(async () => {
    resetDb();
  });

  test('should support student login, upload PDF, configure copies/sides/range, verify pricing, and submit successfully', async ({ page }) => {
    // 1. Navigate to Student Portal
    await page.goto('/');

    // Authenticate as shop admin via the real login API to populate sessionStorage
    // with a valid admin token. This mirrors production where the admin and student
    // share a browser session — the admin goes online first, enabling system health.
    await page.evaluate(async () => {
      const res = await fetch('http://127.0.0.1:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: 'alliance_print',
          username: 'alliance_admin',
          password: 'tjohn_password123'
        })
      });
      const data = await res.json();
      sessionStorage.setItem('adminToken', data.token);
      sessionStorage.setItem('role', data.role);
      sessionStorage.setItem('shopId', data.shopId);
    });

    // Reload so fetchPrinterSettings runs with the admin token
    await page.reload();

    // 2. Perform student login via mock Google SSO flow
    await page.click('button:has-text("Continue with Google")');
    await page.click('button:has-text("basav@university.edu")');

    // Verify transition into main Student Dashboard
    await expect(page.locator('button:has-text("Sign Out")')).toBeVisible();

    // Select Alliance Print Center from the custom dropdown component
    const shopPillBtn = page.locator('button:has(svg.text-purple-500)');
    await expect(shopPillBtn).toBeVisible({ timeout: 10000 });
    await shopPillBtn.click();
    await page.click('button:has-text("Alliance Print Center")');

    // Wait for system health to update (submit button should not say "System Not Ready")
    await expect(page.locator('button:has-text("System Not Ready")')).toBeHidden({ timeout: 10000 });

    // 3. Upload real PDF document
    const pdfPath = path.resolve(__dirname, '../../Campus_Print_RC1.5_Technical_Release_Report.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);

    // Verify file is uploaded and visible using title tag
    await expect(page.locator('span[title="Campus_Print_RC1.5_Technical_Release_Report.pdf"]').first()).toBeVisible();

    // Verify PDF page count was parsed successfully (check sidebar and Page Range button)
    await expect(page.locator('text=2 pgs')).toBeVisible();
    await expect(page.locator('button:has-text("All Pages (2)")')).toBeVisible();

    // Verify initial pricing estimate (2 pages x 1 copy x ₹2 B&W rate = ₹4)
    // The Batch Total Estimate and Fare Estimate both show ₹4; use .first()
    await expect(page.locator('p:has-text("₹4")').first()).toBeVisible();

    // 4. Configure print options
    // Increment copies from 1 to 3
    const incrementBtn = page.locator('button:text("+")');
    await incrementBtn.click();
    await incrementBtn.click();

    const copiesInput = page.locator('input[type="number"]');
    await expect(copiesInput).toHaveValue('3');

    // Verify total cost updated (2 pages x 3 copies x ₹2 = ₹12)
    await expect(page.locator('p:has-text("₹12")').first()).toBeVisible();

    // Change sides to Duplex (2-Sided)
    await page.click('button:has-text("Duplex (2-Sided)")');

    // Verify total cost updates to duplex rate (3 copies x ceil(2/2) duplex pages x ₹3 = ₹9)
    await expect(page.locator('p:has-text("₹9")').first()).toBeVisible();

    // Enable custom range and specify page 1
    await page.click('button:has-text("Custom Range")');
    await expect(page.locator('text=Total document pages: 2')).toBeVisible();
    const rangeInput = page.locator('input[placeholder="e.g. 1-3, 5, 7-9"]');
    await expect(rangeInput).toBeVisible();
    await rangeInput.fill('1');

    // Verify price updates for 1 custom page (3 copies x ceil(1/2) duplex pages x ₹3 = ₹9)
    await expect(page.locator('p:has-text("₹9")').first()).toBeVisible();

    // 5. Submit Print Job
    await page.click('button:has-text("(1 file)")');

    // 6. Verify success confirmation and Approval Token displays
    await expect(page.locator('h2:has-text("Upload Successful")')).toBeVisible({ timeout: 15000 });

    const tokenContainer = page.locator('span.text-orange-600').first();
    const tokenId = (await tokenContainer.textContent())?.trim();
    expect(tokenId).toBeDefined();
    expect(tokenId!.length).toBeGreaterThan(0);

    // 7. Verify persisted database state matches expectations
    const dbRaw = fs.readFileSync(DB_TEST_PATH, 'utf-8');
    const db = JSON.parse(dbRaw);

    expect(db.jobs.length).toBe(1);
    const job = db.jobs[0];
    expect(job.studentName).toBe('Basav');
    expect(job.studentEmail).toBe('basav@university.edu');
    expect(job.copies).toBe(3);
    expect(job.sides).toBe('double');
    expect(job.printType).toBe('bw');
    expect(job.pageRange).toBe('1');
    expect(job.status).toBe('pending_approval');
    expect(job.tokenId).toBe(tokenId);

    // Verify uploaded file is saved in the testing directory
    const storedFilePath = path.join(UPLOADS_TEST_DIR, path.basename(job.serverFilePath));
    expect(fs.existsSync(storedFilePath)).toBe(true);
  });
});

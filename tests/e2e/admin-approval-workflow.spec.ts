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
  const db = {
    jobs: [],
    shops: JSON.parse(JSON.stringify(DEFAULT_SHOPS)),
    printerSettings: JSON.parse(JSON.stringify(DEFAULT_PRINTER_SETTINGS)),
    agents: JSON.parse(JSON.stringify(DEFAULT_AGENTS)),
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

test.describe('Admin Approval Workflow E2E Integration', () => {
  test.beforeEach(async () => {
    resetDb();
  });

  test('should support student print submission and subsequent admin release approval to queue', async ({ page }) => {
    // 1. Authenticate student via Google mock token
    const authRes = await page.request.post('http://127.0.0.1:3001/api/auth/google', {
      data: { idToken: 'mock_token_basav@university.edu' }
    });
    expect(authRes.ok()).toBe(true);
    const { sessionToken } = await authRes.json();

    // 2. Set token in localStorage and select alliance_print shop
    await page.goto('/login');
    await page.evaluate((tok) => {
      localStorage.setItem('studentSessionToken', tok);
      localStorage.setItem('selectedShopId', 'alliance_print');
    }, sessionToken);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for connection readiness
    await expect(page.locator('button:has-text("System Not Ready")')).toBeHidden({ timeout: 10000 });

    // Upload PDF document
    const pdfPath = path.resolve(__dirname, '../../Campus_Print_RC1.5_Technical_Release_Report.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);
    await expect(page.locator('span[title="Campus_Print_RC1.5_Technical_Release_Report.pdf"]').first()).toBeVisible();

    // Submit print job
    await page.click('button:has-text("(1 file)")');

    // Capture success validation and Approval Token ID
    await expect(page.locator('h2:has-text("Upload Successful")')).toBeVisible({ timeout: 15000 });
    const tokenContainer = page.locator('span.text-orange-600').first();
    const tokenId = (await tokenContainer.textContent())?.trim();
    expect(tokenId).toBeDefined();
    expect(tokenId!.length).toBeGreaterThan(0);

    // Verify initial database status is pending_approval
    const dbRaw = fs.readFileSync(DB_TEST_PATH, 'utf-8');
    const db = JSON.parse(dbRaw);
    expect(db.jobs.length).toBe(1);
    const initialJob = db.jobs[0];
    expect(initialJob.status).toBe('pending_approval');
    expect(initialJob.tokenId).toBe(tokenId);
    expect(initialJob.studentName.toLowerCase()).toBe('basav');
    expect(initialJob.studentEmail).toBe('basav@university.edu');

    // Retrieve the public job token (e.g. PRNT-XYZ) to track in Spooler Table
    const jobToken = initialJob.token;
    expect(jobToken).toBeDefined();

    // -------------------------------------------------------------------------
    // STEP 2 & 3: Admin Console Login and Pending Approvals Verification
    // -------------------------------------------------------------------------
    await page.goto('/admin');
    
    // Clear storage to force the real login form to show
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();

    // Select the shop from the login select dropdown
    const shopSelect = page.locator('select').first();
    await shopSelect.selectOption('alliance_print');
    
    await page.fill('input[placeholder="admin"]', 'alliance_admin');
    await page.fill('input[placeholder="••••••••"]', 'tjohn_password123');
    await page.click('button:has-text("Sign In to Console")');

    // Verify dashboard displays
    await expect(page.locator('h2:has-text("Administrator Console")')).toBeVisible();

    // Locate job in the Pending Approvals panel using its canonical token
    const approvalsCard = page.locator('div.bg-white', { has: page.locator('h3', { hasText: 'Pending Approvals & Release' }) }).first();
    await expect(approvalsCard).toBeVisible({ timeout: 10000 });
    const pendingRow = approvalsCard.locator('div.bg-slate-50', { hasText: jobToken }).first();
    await expect(pendingRow).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------------------
    // STEP 4: Approve / Release Job
    // -------------------------------------------------------------------------
    // Listen for alerts and log them
    page.on('dialog', async dialog => {
      console.log(`[ALERT DETECTED]: ${dialog.message()}`);
      await dialog.dismiss();
    });

    const approveBtn = pendingRow.getByRole('button', { name: 'Approve', exact: true });
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // Verify job leaves the Pending Approvals list
    await expect(pendingRow).toBeHidden({ timeout: 10000 });

    // Verify job appears in the Spooler Operational Table as Queued
    const spoolerRow = page.locator('tr', { has: page.locator('td', { hasText: jobToken }) });
    await expect(spoolerRow).toBeVisible();
    await expect(spoolerRow.locator('span:has-text("QUEUED")')).toBeVisible();

    // -------------------------------------------------------------------------
    // STEP 5: Persistence State Verification
    // -------------------------------------------------------------------------
    const dbRawUpdated = fs.readFileSync(DB_TEST_PATH, 'utf-8');
    const dbUpdated = JSON.parse(dbRawUpdated);
    const updatedJob = dbUpdated.jobs.find((j: any) => j.token === jobToken);
    
    expect(updatedJob).toBeDefined();
    expect(updatedJob.status).toBe('queued');
    expect(updatedJob.tokenId).toBe(tokenId);

    // Verify timeline transition records
    expect(updatedJob.timeline).toBeDefined();
    const approvedTimeline = updatedJob.timeline.find((t: any) => t.stage === 'approved');
    expect(approvedTimeline).toBeDefined();
    expect(approvedTimeline.at).toBeDefined();
    expect(approvedTimeline.printerName).toBe('AlliancePrinter');
  });
});

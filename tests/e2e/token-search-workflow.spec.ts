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

test.describe('Admin Token Search Workflow E2E Integration', () => {
  test.beforeEach(async () => {
    resetDb();
  });

  test('should support student print submission and subsequent admin token search and release', async ({ page }) => {
    // -------------------------------------------------------------------------
    // STEP 1: Student Portal Submission
    // -------------------------------------------------------------------------
    await page.goto('/');

    // Inject admin authentication session to populate system health variables
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

    await page.reload();

    // Student Login
    await page.fill('input[placeholder="e.g. basav"]', 'basav');
    await page.fill('input[placeholder="••••••••"]', 'password101');
    await page.click('button:has-text("Sign In & Connect")');
    await expect(page.locator('button:has-text("Sign Out")')).toBeVisible();

    // Select Alliance Shop and wait for connection readiness
    await expect(page.locator('select')).toBeVisible({ timeout: 10000 });
    await page.selectOption('select', 'alliance_print');
    await expect(page.locator('button:has-text("System Not Ready")')).toBeHidden({ timeout: 10000 });

    // Upload PDF document
    const pdfPath = path.resolve(__dirname, '../../Campus_Print_RC1.5_Technical_Release_Report.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);
    await expect(page.locator('span[title="Campus_Print_RC1.5_Technical_Release_Report.pdf"]').first()).toBeVisible();

    // Submit print job
    await page.click('button:has-text("(1 file)")');

    // Capture success validation and Approval Token ID
    await expect(page.locator('h2:has-text("Upload Successful")')).toBeVisible({ timeout: 15005 });
    const tokenContainer = page.locator('span.text-orange-600').first();
    const tokenId = (await tokenContainer.textContent())?.trim();
    expect(tokenId).toBeDefined();
    expect(tokenId!.length).toBeGreaterThan(0);

    // Verify initial database status is pending_approval and file exists
    const dbRaw = fs.readFileSync(DB_TEST_PATH, 'utf-8');
    const db = JSON.parse(dbRaw);
    expect(db.jobs.length).toBe(1);
    
    const initialJob = db.jobs[0];
    expect(initialJob.status).toBe('pending_approval');
    expect(initialJob.tokenId).toBe(tokenId);
    expect(initialJob.studentName).toBe('basav');
    expect(initialJob.studentEmail).toBe('basav@university.edu');
    expect(initialJob.shopId).toBe('alliance_print');

    const jobToken = initialJob.token;
    expect(jobToken).toBeDefined();

    // Verify file exists on disk in uploads-test
    const fileName = path.basename(initialJob.serverFilePath);
    const fullFilePath = path.join(UPLOADS_TEST_DIR, fileName);
    expect(fs.existsSync(fullFilePath)).toBe(true);

    // -------------------------------------------------------------------------
    // STEP 2: Admin Login
    // -------------------------------------------------------------------------
    await page.goto('/admin');

    // Clear session storage to force admin login form
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();

    // Select shop
    const adminShopSelect = page.locator('select').first();
    await adminShopSelect.selectOption('alliance_print');

    // Fill credentials
    await page.fill('input[placeholder="admin"]', 'alliance_admin');
    await page.fill('input[placeholder="••••••••"]', 'tjohn_password123');
    await page.click('button:has-text("Sign In to Console")');

    // Verify Admin Dashboard loads
    await expect(page.locator('h2:has-text("Administrator Console")')).toBeVisible();

    // Wait for System Ready status
    const systemReadyRow = page.locator('div', { has: page.locator('span', { hasText: '5. System Ready:' }) }).first();
    await expect(systemReadyRow).toContainText('🟢 READY', { timeout: 10000 });

    // Verify job displays in Pending Approvals
    const approvalsCard = page.locator('div.bg-white', { has: page.locator('h3', { hasText: 'Pending Approvals & Release' }) }).first();
    const pendingRow = approvalsCard.locator('div.bg-slate-50', { has: page.locator('p', { hasText: 'Campus_Print_RC1.5_Technical_Release_Report.pdf' }) }).first();
    await expect(pendingRow).toBeVisible();

    // -------------------------------------------------------------------------
    // STEP 3: Invalid Token Search
    // -------------------------------------------------------------------------
    const tokenSearchCard = page.locator('div', { has: page.locator('h4', { hasText: 'Token Search' }) }).first();
    const searchInput = tokenSearchCard.locator('input[placeholder="Enter Token (e.g. CP-4578)"]').first();
    const searchBtn = tokenSearchCard.locator('button:has-text("Search")').first();
    
    await searchInput.fill('CP-9999');
    await searchBtn.click();

    // Verify error behaviour "Job not found with this token"
    const errorBox = tokenSearchCard.locator('text=Job not found with this token');
    await expect(errorBox).toBeVisible();

    // Verify database remains unchanged
    const dbRawInvalid = fs.readFileSync(DB_TEST_PATH, 'utf-8');
    const dbInvalid = JSON.parse(dbRawInvalid);
    expect(dbInvalid.jobs[0].status).toBe('pending_approval');

    // -------------------------------------------------------------------------
    // STEP 4: Valid Token Search
    // -------------------------------------------------------------------------
    await searchInput.fill(tokenId!);
    await searchBtn.click();

    // Verify error disappears
    await expect(errorBox).toBeHidden();

    // Verify returned job information matches print configuration details
    const searchResultCard = tokenSearchCard.locator('div.bg-slate-50\\/55').first();
    await expect(searchResultCard).toBeVisible();
    await expect(searchResultCard.locator('span.text-indigo-600')).toContainText(tokenId!);
    await expect(searchResultCard.locator('span.text-slate-400')).toContainText(jobToken);
    await expect(searchResultCard).toContainText('Campus_Print_RC1.5_Technical_Release_Report.pdf');
    await expect(searchResultCard).toContainText('2 Pages');
    await expect(searchResultCard).toContainText('Type: B&W');
    await expect(searchResultCard).toContainText('Student: basav');
    await expect(searchResultCard).toContainText('Pending Approval');

    // -------------------------------------------------------------------------
    // STEP 5: Release From Search
    // -------------------------------------------------------------------------
    const releaseBtn = searchResultCard.locator('button:has-text("Release To Queue")');
    await expect(releaseBtn).toBeVisible();
    await releaseBtn.click();

    // Verify search result card is cleared and search query input is empty
    await expect(searchResultCard).toBeHidden({ timeout: 10000 });
    await expect(searchInput).toHaveValue('');

    // Verify job leaves the Pending Approvals list
    await expect(pendingRow).toBeHidden({ timeout: 10000 });

    // Verify job appears in Operational Queue table as QUEUED
    const spoolerRow = page.locator('tr', { has: page.locator('td', { hasText: jobToken }) });
    await expect(spoolerRow).toBeVisible();
    await expect(spoolerRow.locator('span:has-text("QUEUED")')).toBeVisible();

    // -------------------------------------------------------------------------
    // STEP 6: Database Verification
    // -------------------------------------------------------------------------
    const dbRawUpdated = fs.readFileSync(DB_TEST_PATH, 'utf-8');
    const dbUpdated = JSON.parse(dbRawUpdated);
    const updatedJob = dbUpdated.jobs.find((j: any) => j.token === jobToken);

    expect(updatedJob).toBeDefined();
    expect(updatedJob.status).toBe('queued');
    expect(updatedJob.tokenId).toBe(tokenId);

    // Verify approved timeline stage is present
    expect(updatedJob.timeline).toBeDefined();
    const approvedStage = updatedJob.timeline.find((t: any) => t.stage === 'approved');
    expect(approvedStage).toBeDefined();
    expect(approvedStage.printerName).toBe('AlliancePrinter');

    // Verify file still exists on disk
    expect(fs.existsSync(fullFilePath)).toBe(true);
  });
});

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

test.describe('Admin Queue Pause and Retry Workflow E2E Integration', () => {
  test.beforeEach(async () => {
    resetDb();
  });

  test('should support student submission, admin approval, pausing, and retrying the print job', async ({ page }) => {
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
    await expect(page.locator('h2:has-text("Upload Successful")')).toBeVisible({ timeout: 15000 });
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
    // STEP 2: Admin Portal Approve Job
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

    // Locate job in Pending Approvals
    const approvalsCard = page.locator('div.bg-white', { has: page.locator('h3', { hasText: 'Pending Approvals & Release' }) }).first();
    const pendingRow = approvalsCard.locator('div.bg-slate-50', { has: page.locator('p', { hasText: 'Campus_Print_RC1.5_Technical_Release_Report.pdf' }) }).first();
    await expect(pendingRow).toBeVisible();

    // Dismiss alert dialogs just in case
    page.on('dialog', async dialog => {
      console.log(`[ALERT DETECTED]: ${dialog.message()}`);
      await dialog.dismiss();
    });

    // Approve the job
    const approveBtn = pendingRow.getByRole('button', { name: 'Approve', exact: true });
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // Verify job leaves the Pending list
    await expect(pendingRow).toBeHidden({ timeout: 10000 });

    // Verify job appears in the Spooler Operational Table as QUEUED
    const spoolerRow = page.locator('tr', { has: page.locator('td', { hasText: jobToken }) });
    await expect(spoolerRow).toBeVisible();
    await expect(spoolerRow.locator('span:has-text("QUEUED")')).toBeVisible();

    // Verify database status is queued
    let dbRawApp = fs.readFileSync(DB_TEST_PATH, 'utf-8');
    let dbApp = JSON.parse(dbRawApp);
    let appJob = dbApp.jobs.find((j: any) => j.token === jobToken);
    expect(appJob).toBeDefined();
    expect(appJob.status).toBe('queued');
    expect(appJob.tokenId).toBe(tokenId);

    // Verify approved stage is present in timeline
    expect(appJob.timeline).toBeDefined();
    const approvedStage = appJob.timeline.find((t: any) => t.stage === 'approved');
    expect(approvedStage).toBeDefined();
    expect(approvedStage.printerName).toBe('AlliancePrinter');

    // -------------------------------------------------------------------------
    // STEP 3: Pause Workflow
    // -------------------------------------------------------------------------
    const pauseBtn = spoolerRow.locator('button:has-text("Pause")').first();
    await expect(pauseBtn).toBeVisible();
    await pauseBtn.click();

    // Verify UI updates to PAUSED
    await expect(spoolerRow.locator('span:has-text("PAUSED")')).toBeVisible();

    // Verify Pause button is hidden/disappeared
    await expect(pauseBtn).toBeHidden();

    // Verify DB status is paused
    let dbRawPaused = fs.readFileSync(DB_TEST_PATH, 'utf-8');
    let dbPaused = JSON.parse(dbRawPaused);
    let pausedJob = dbPaused.jobs.find((j: any) => j.token === jobToken);
    expect(pausedJob).toBeDefined();
    expect(pausedJob.status).toBe('paused');

    // Verify timeline matches production implementation (exactly 2 entries: uploaded, approved)
    expect(pausedJob.timeline.length).toBe(2);
    expect(pausedJob.timeline[0].stage).toBe('uploaded');
    expect(pausedJob.timeline[1].stage).toBe('approved');

    // -------------------------------------------------------------------------
    // STEP 4: Retry Workflow
    // -------------------------------------------------------------------------
    const retryBtn = spoolerRow.locator('button:has-text("Retry")').first();
    await expect(retryBtn).toBeVisible();
    await retryBtn.click();

    // Verify UI transitions back to QUEUED
    await expect(spoolerRow.locator('span:has-text("QUEUED")')).toBeVisible();

    // Verify Retry button is hidden/disappeared
    await expect(retryBtn).toBeHidden();

    // -------------------------------------------------------------------------
    // STEP 5: Final Database & Disk Integrity Verification
    // -------------------------------------------------------------------------
    let dbRawFinal = fs.readFileSync(DB_TEST_PATH, 'utf-8');
    let dbFinal = JSON.parse(dbRawFinal);
    let finalJob = dbFinal.jobs.find((j: any) => j.token === jobToken);

    expect(finalJob).toBeDefined();
    expect(finalJob.status).toBe('queued');
    expect(finalJob.tokenId).toBe(tokenId);
    
    // Verify configurations are fully preserved
    expect(finalJob.copies).toBe(1);
    expect(finalJob.sides).toBe('single');
    expect(finalJob.pageRange).toBeUndefined();
    expect(finalJob.printMode).toBe('mono');
    expect(finalJob.printType).toBe('bw');
    expect(finalJob.shopId).toBe('alliance_print');
    expect(finalJob.studentName).toBe('basav');
    expect(finalJob.studentEmail).toBe('basav@university.edu');

    // Verify uploaded file still exists on disk
    expect(fs.existsSync(fullFilePath)).toBe(true);

    // Verify timeline remains correct
    expect(finalJob.timeline.length).toBe(2);
    expect(finalJob.timeline[0].stage).toBe('uploaded');
    expect(finalJob.timeline[1].stage).toBe('approved');
  });
});

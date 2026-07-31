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

test.describe('Admin Force Complete Workflow E2E Integration', () => {
  test.beforeEach(async () => {
    resetDb();
  });

  test('should support student submission, admin approval, simulating print agent transition to printing, and force completing the job', async ({ page }) => {
    // -------------------------------------------------------------------------
    // STEP 1: Student Portal Submission
    // -------------------------------------------------------------------------
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

    // Perform student login via mock Google SSO flow
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

    // Upload real PDF document
    const pdfPath = path.resolve(__dirname, '../../Campus_Print_RC1.5_Technical_Release_Report.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);

    // Verify file is uploaded and visible
    await expect(page.locator('span[title="Campus_Print_RC1.5_Technical_Release_Report.pdf"]').first()).toBeVisible();

    // Click submit
    await page.click('button:has-text("(1 file)")');

    // Verify success confirmation and grab Approval Token
    await expect(page.locator('h2:has-text("Upload Successful")')).toBeVisible({ timeout: 15000 });

    const tokenContainer = page.locator('span.text-orange-600').first();
    const tokenId = (await tokenContainer.textContent())?.trim();
    expect(tokenId).toBeDefined();
    expect(tokenId!.length).toBeGreaterThan(0);

    // Verify DB state
    const dbRaw = fs.readFileSync(DB_TEST_PATH, 'utf-8');
    const db = JSON.parse(dbRaw);
    expect(db.jobs.length).toBe(1);
    const submittedJob = db.jobs[0];
    expect(submittedJob.status).toBe('pending_approval');
    expect(submittedJob.studentName).toBe('Basav');
    expect(submittedJob.studentEmail).toBe('basav@university.edu');
    expect(submittedJob.shopId).toBe('alliance_print');
    expect(submittedJob.tokenId).toBe(tokenId);

    const jobToken = submittedJob.token;
    expect(jobToken).toBeDefined();

    // Verify file exists on disk
    const fileName = path.basename(submittedJob.serverFilePath);
    const fullFilePath = path.join(UPLOADS_TEST_DIR, fileName);
    expect(fs.existsSync(fullFilePath)).toBe(true);

    // -------------------------------------------------------------------------
    // STEP 2: Admin Approval
    // -------------------------------------------------------------------------
    await page.goto('/admin');

    // Perform login in Administrator Console
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.selectOption('select', 'alliance_print');
    await page.fill('input[placeholder="admin"]', 'alliance_admin');
    await page.fill('input[placeholder="••••••••"]', 'tjohn_password123');
    await page.click('button:has-text("Sign In to Console")');

    // Verify dashboard loaded
    await expect(page.locator('h2:has-text("Administrator Console")')).toBeVisible();

    // Wait for system health to resolve and show system ready status
    const systemReadyRow = page.locator('div', { has: page.locator('span', { hasText: '5. System Ready:' }) }).first();
    await expect(systemReadyRow).toContainText('🟢 READY', { timeout: 10000 });

    // Locate job in the Pending Approvals panel using its filename, scoped to the Pending Approvals card
    const approvalsCard = page.locator('div.bg-white', { has: page.locator('h3', { hasText: 'Pending Approvals & Release' }) }).first();
    const pendingRow = approvalsCard.locator('div.bg-slate-50', { has: page.locator('p', { hasText: 'Campus_Print_RC1.5_Technical_Release_Report.pdf' }) }).first();
    await expect(pendingRow).toBeVisible();

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

    // -------------------------------------------------------------------------
    // STEP 3: Simulate Agent Transition to PRINTING
    // -------------------------------------------------------------------------
    // Retrieve adminToken from session storage
    const adminToken = await page.evaluate(() => sessionStorage.getItem('adminToken'));
    expect(adminToken).toBeDefined();

    // Call status API to transition job to 'printing'
    await page.evaluate(async ({ jobId, token }) => {
      const res = await fetch(`/api/jobs/${jobId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'printing', progressPercent: 50 })
      });
      if (!res.ok) {
        throw new Error(`Failed to transition to printing: ${res.statusText}`);
      }
    }, { jobId: appJob.id, token: adminToken });

    // Verify UI updates to PRINTING
    await expect(spoolerRow.locator('span:has-text("PRINTING")')).toBeVisible({ timeout: 10000 });

    // Verify DB status is printing
    let dbRawPrinting = fs.readFileSync(DB_TEST_PATH, 'utf-8');
    let dbPrinting = JSON.parse(dbRawPrinting);
    let printingJob = dbPrinting.jobs.find((j: any) => j.token === jobToken);
    expect(printingJob).toBeDefined();
    expect(printingJob.status).toBe('printing');
    expect(printingJob.progressPercent).toBe(50);

    // -------------------------------------------------------------------------
    // STEP 4: Force Complete Workflow
    // -------------------------------------------------------------------------
    const forceCompleteBtn = spoolerRow.locator('button:has-text("Force Complete")').first();
    await expect(forceCompleteBtn).toBeVisible();
    await forceCompleteBtn.click();

    // Verify UI transitions to COMPLETED
    await expect(spoolerRow.locator('span:has-text("COMPLETED")')).toBeVisible({ timeout: 10000 });

    // Verify Force Complete button is hidden/disappeared
    await expect(forceCompleteBtn).toBeHidden();

    // -------------------------------------------------------------------------
    // STEP 5: Final Database & Disk Integrity Verification
    // -------------------------------------------------------------------------
    let dbRawFinal = fs.readFileSync(DB_TEST_PATH, 'utf-8');
    let dbFinal = JSON.parse(dbRawFinal);
    let finalJob = dbFinal.jobs.find((j: any) => j.token === jobToken);

    expect(finalJob).toBeDefined();
    expect(finalJob.status).toBe('completed');
    expect(finalJob.progressPercent).toBe(100);
    expect(finalJob.tokenId).toBe(tokenId);

    // Verify configurations are fully preserved
    expect(finalJob.copies).toBe(1);
    expect(finalJob.sides).toBe('single');
    expect(finalJob.printMode).toBe('mono');
    expect(finalJob.printType).toBe('bw');
    expect(finalJob.shopId).toBe('alliance_print');
    expect(finalJob.studentName).toBe('Basav');
    expect(finalJob.studentEmail).toBe('basav@university.edu');

    // Verify uploaded file is deleted from server disk
    expect(fs.existsSync(fullFilePath)).toBe(false);

    // Verify timeline includes the completion stage with timestamp
    expect(finalJob.timeline).toBeDefined();
    const completedStage = finalJob.timeline.find((t: any) => t.stage === 'completed');
    expect(completedStage).toBeDefined();
    expect(completedStage.at).toBeDefined();

    // Verify metrics if production provides them
    if (finalJob.metrics) {
      expect(typeof finalJob.metrics.totalProcessingMs).toBe('number');
    }

    // Verify no database pollution
    expect(dbFinal.jobs.length).toBe(1);
  });
});

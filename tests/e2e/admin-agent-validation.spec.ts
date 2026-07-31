import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execPromise = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_TEST_PATH = path.resolve(__dirname, '../../server/data/db.test.json');
const UPLOADS_TEST_DIR = path.resolve(__dirname, '../../server/uploads-test');
const CLIENT_DIR = path.resolve(__dirname, '../../print-client');

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
    printerStatus: 'offline',
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

function getDefaultPrinterName(): string {
  try {
    const cmd = 'powershell -Command "Get-CimInstance -ClassName Win32_Printer | Where-Object Default -eq `$true | Select-Object -ExpandProperty Name"';
    const stdout = execSync(cmd).toString().trim();
    if (stdout) return stdout;
    const fallbackCmd = '(Get-Printer | Where-Object UseDefault).Name';
    return execSync(`powershell -Command "${fallbackCmd}"`).toString().trim();
  } catch (err) {
    return 'HP Officejet J4500 series';
  }
}

function resetDb() {
  const defaultPrinter = getDefaultPrinterName();
  const db = {
    jobs: [],
    shops: JSON.parse(JSON.stringify(DEFAULT_SHOPS)),
    printerSettings: {
      status: 'online',
      expectedReturnTime: '2:00 PM',
      averagePrintSpeed: 5,
      adminOverrideStatus: 'none',
      availablePrinters: [defaultPrinter],
      selectedPrinter: defaultPrinter
    },
    agents: [],
    printers: []
  };

  const allianceShop = db.shops.find((s: any) => s.id === 'alliance_print');
  if (allianceShop) {
    allianceShop.bwPrinterName = defaultPrinter;
    allianceShop.colorPrinterName = defaultPrinter;
  }

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

function cleanClientFiles() {
  const lockFile = path.join(CLIENT_DIR, 'daemon.lock');
  const signalFile = path.join(CLIENT_DIR, 'shutdown.signal');
  const runtimeJson = path.join(CLIENT_DIR, 'runtime.json');
  const runtimeTmp = path.join(CLIENT_DIR, 'runtime.tmp');
  
  try { if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile); } catch {}
  try { if (fs.existsSync(signalFile)) fs.unlinkSync(signalFile); } catch {}
  try { if (fs.existsSync(runtimeJson)) fs.unlinkSync(runtimeJson); } catch {}
  try { if (fs.existsSync(runtimeTmp)) fs.unlinkSync(runtimeTmp); } catch {}
  
  const tempDir = path.join(CLIENT_DIR, 'temp');
  const outputDir = path.join(CLIENT_DIR, 'printed_output');
  
  if (fs.existsSync(tempDir)) {
    try { fs.readdirSync(tempDir).forEach(f => fs.unlinkSync(path.join(tempDir, f))); } catch {}
  }
  if (fs.existsSync(outputDir)) {
    try { fs.readdirSync(outputDir).forEach(f => fs.unlinkSync(path.join(outputDir, f))); } catch {}
  }
}

function writeCleanConfig() {
  const configPath = path.join(CLIENT_DIR, 'config.json');
  const cleanConfig = {
    serverUrl: 'http://127.0.0.1:3001',
    pollIntervalMs: 2000,
    mockPrinter: false,
    printerName: '',
    shopId: 'alliance_print',
    agentId: 'CP-AGENT-E2E-TEST',
    machineName: 'TEST-MACHINE',
    daemonVersion: '1.0.0',
    protocolVersion: '1.0.0',
    token: ''
  };
  fs.writeFileSync(configPath, JSON.stringify(cleanConfig, null, 2), 'utf-8');
}

test.describe('Desktop Print Agent Validation End-to-End Suite', () => {
  test.beforeEach(async () => {
    resetDb();
    
    // Stop any existing daemon process cleanly first
    try {
      execSync('node bridge.cjs stop', { cwd: CLIENT_DIR });
    } catch {}
    
    // Wait a brief moment for the existing daemon to exit
    const lockFile = path.join(CLIENT_DIR, 'daemon.lock');
    for (let i = 0; i < 10; i++) {
      if (!fs.existsSync(lockFile)) break;
      await new Promise(r => setTimeout(r, 500));
    }
    
    cleanClientFiles();
    writeCleanConfig();
  });

  test.afterAll(async () => {
    // Ensure agent is shut down after tests
    try {
      execSync('node bridge.cjs stop', { cwd: CLIENT_DIR });
    } catch {}
  });

  test('should register print agent, maintain heartbeat online/offline state, dynamically sync discovered printers, and process backlog automatically', async ({ page }) => {
    test.setTimeout(240000);
    // -------------------------------------------------------------------------
    // STEP 1: Admin Authentication to retrieve dynamic signed shop token
    // -------------------------------------------------------------------------
    await page.goto('/');

    const token = await page.evaluate(async () => {
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
      return data.token;
    });

    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThan(0);

    // -------------------------------------------------------------------------
    // STEP 2: Launch Real Desktop Print Agent via Bridge
    // -------------------------------------------------------------------------
    const launchCmd = `node bridge.cjs "campusprint://start?serverUrl=http://127.0.0.1:3001&shopId=alliance_print&token=${token}"`;
    await execPromise(launchCmd, { cwd: CLIENT_DIR });

    // Assert that the lock file gets generated
    const lockFile = path.join(CLIENT_DIR, 'daemon.lock');
    let lockCreated = false;
    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(lockFile)) {
        lockCreated = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    expect(lockCreated).toBe(true);

    // -------------------------------------------------------------------------
    // STEP 3: Validate Successful Registration & Discovered Printers
    // -------------------------------------------------------------------------
    let registered = false;
    for (let i = 0; i < 30; i++) {
      const dbRaw = fs.readFileSync(DB_TEST_PATH, 'utf-8');
      const db = JSON.parse(dbRaw);
      if (db.agents && db.agents.length > 0) {
        registered = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    expect(registered).toBe(true);

    let dbRaw = fs.readFileSync(DB_TEST_PATH, 'utf-8');
    let db = JSON.parse(dbRaw);
    const agent = db.agents[0];
    expect(agent.agentId).toBe('CP-AGENT-E2E-TEST');
    expect(agent.shopId).toBe('alliance_print');
    expect(agent.machineName).toBe(os.hostname() || 'UNKNOWN');
    expect(agent.onlineStatus).toBe('online');

    // Verify dynamic printer table populated (via the initial heartbeat)
    let printersSynced = false;
    for (let i = 0; i < 30; i++) {
      const dbRawCheck = fs.readFileSync(DB_TEST_PATH, 'utf-8');
      const dbCheck = JSON.parse(dbRawCheck);
      if (dbCheck.printers && dbCheck.printers.length > 0) {
        printersSynced = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    expect(printersSynced).toBe(true);

    // -------------------------------------------------------------------------
    // STEP 4: Verify Admin Console displays agent as ONLINE
    // -------------------------------------------------------------------------
    await page.goto('/admin');
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();

    await page.locator('select').first().selectOption('alliance_print');
    await page.fill('input[placeholder="admin"]', 'alliance_admin');
    await page.fill('input[placeholder="••••••••"]', 'tjohn_password123');
    await page.click('button:has-text("Sign In to Console")');

    await expect(page.locator('h2:has-text("Administrator Console")')).toBeVisible();

    const systemReadyRow = page.locator('div', { has: page.locator('span', { hasText: '5. System Ready:' }) }).first();
    await expect(systemReadyRow).toContainText('🟢 READY', { timeout: 10000 });

    const statusBadge = page.locator('span:has-text("ONLINE")').first();
    await expect(statusBadge).toBeVisible();

    // -------------------------------------------------------------------------
    // STEP 5: Heartbeat Interruption & Offline Status transition
    // -------------------------------------------------------------------------
    // Shutdown the agent cleanly using the stop command
    await execPromise('node bridge.cjs stop', { cwd: CLIENT_DIR });

    let stopped = false;
    for (let i = 0; i < 15; i++) {
      if (!fs.existsSync(lockFile)) {
        stopped = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    expect(stopped).toBe(true);

    // Manually backdate the agent's lastSeen timestamp in the DB to trigger offline sweep
    let dbForBackdate = JSON.parse(fs.readFileSync(DB_TEST_PATH, 'utf-8'));
    dbForBackdate.agents[0].lastSeen = new Date(Date.now() - 65000).toISOString();
    fs.writeFileSync(DB_TEST_PATH, JSON.stringify(dbForBackdate, null, 2), 'utf-8');

    // Wait for the 10-second sweep interval on the backend to trigger offline transition
    await page.waitForTimeout(12000);

    // Verify Admin Console displays OFFLINE
    await page.reload();
    const offlineBadge = page.locator('span:has-text("OFFLINE")').first();
    await expect(offlineBadge).toBeVisible();

    // -------------------------------------------------------------------------
    // STEP 6: Recovery & Reconnect
    // -------------------------------------------------------------------------
    // Clean any residual shutdown.signal before restarting
    const signalFile = path.join(CLIENT_DIR, 'shutdown.signal');
    try { if (fs.existsSync(signalFile)) fs.unlinkSync(signalFile); } catch {}
    await page.waitForTimeout(500);

    // Restart the agent
    console.log('Restarting agent with launchCmd:', launchCmd);
    const restartResult = await execPromise(launchCmd, { cwd: CLIENT_DIR });
    console.log('Restart stdout:', restartResult.stdout);
    console.log('Restart stderr:', restartResult.stderr);

    let restartedOnline = false;
    for (let i = 0; i < 30; i++) {
      const dbCheck = JSON.parse(fs.readFileSync(DB_TEST_PATH, 'utf-8'));
      if (dbCheck.agents && dbCheck.agents[0] && dbCheck.agents[0].onlineStatus === 'online') {
        restartedOnline = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    expect(restartedOnline).toBe(true);

    await page.reload();
    await expect(systemReadyRow).toContainText('🟢 READY', { timeout: 10000 });
    await expect(statusBadge).toBeVisible();

    // -------------------------------------------------------------------------
    // STEP 7: Queue Backlog / Job Processing Execution
    // -------------------------------------------------------------------------
    // Submit a student print job
    await page.goto('/');
    
    // Inject the admin session storage for student portal readiness check
    await page.evaluate(async (tok) => {
      sessionStorage.setItem('adminToken', tok);
      sessionStorage.setItem('role', 'shop_admin');
      sessionStorage.setItem('shopId', 'alliance_print');
    }, token);

    await page.reload();

    // Student login via mock Google SSO flow
    await page.click('button:has-text("Continue with Google")');
    await page.click('button:has-text("basav@university.edu")');
    await expect(page.locator('button:has-text("Sign Out")')).toBeVisible();

    // Select Alliance Shop and wait for connection readiness
    const shopPillBtn = page.locator('button:has(svg.text-purple-500)');
    await expect(shopPillBtn).toBeVisible({ timeout: 10000 });
    await shopPillBtn.click();
    await page.click('button:has-text("Alliance Print Center")');
    await expect(page.locator('button:has-text("System Not Ready")')).toBeHidden({ timeout: 10000 });

    const pdfPath = path.resolve(__dirname, '../../Campus_Print_RC1.5_Technical_Release_Report.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);
    await expect(page.locator('span[title="Campus_Print_RC1.5_Technical_Release_Report.pdf"]').first()).toBeVisible();

    await page.click('button:has-text("(1 file)")');
    await expect(page.locator('h2:has-text("Upload Successful")')).toBeVisible({ timeout: 15000 });

    const tokenContainer = page.locator('span.text-orange-600').first();
    const tokenId = (await tokenContainer.textContent())?.trim();
    expect(tokenId).toBeDefined();

    // Approve the job from Admin Console
    await page.goto('/admin');
    const approvalsCard = page.locator('div.bg-white', { has: page.locator('h3', { hasText: 'Pending Approvals & Release' }) }).first();
    const pendingRow = approvalsCard.locator('div.bg-slate-50', { has: page.locator('p', { hasText: 'Campus_Print_RC1.5_Technical_Release_Report.pdf' }) }).first();
    await expect(pendingRow).toBeVisible();

    const approveBtn = pendingRow.getByRole('button', { name: 'Approve', exact: true });
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    await expect(pendingRow).toBeHidden({ timeout: 10000 });

    // Wait until the agent has spooled the job and it is detected in the spooler
    let spooled = false;
    for (let i = 0; i < 100; i++) {
      const dbCheck = JSON.parse(fs.readFileSync(DB_TEST_PATH, 'utf-8'));
      const job = dbCheck.jobs[0];
      if (job && job.timeline && job.timeline.some((t: any) => t.stage === 'spooler_job_detected')) {
        spooled = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    expect(spooled).toBe(true);

    // Now remove it from the Windows spooler to simulate physical print completion
    try {
      const printer = getDefaultPrinterName();
      execSync(`powershell -Command "Get-PrintJob -PrinterName '${printer.replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Remove-PrintJob -ErrorAction SilentlyContinue"`);
      console.log('Successfully cleared print job from Windows spooler to simulate completion.');
    } catch (e) {}

    // Wait for the agent to detect, claim, print (via SumatraPDF), and complete the job
    let jobCompleted = false;
    for (let i = 0; i < 300; i++) {
      const dbCheck = JSON.parse(fs.readFileSync(DB_TEST_PATH, 'utf-8'));
      const job = dbCheck.jobs[0];
      if (job && job.status === 'completed') {
        jobCompleted = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    expect(jobCompleted).toBe(true);

    // Verify DB consistency
    const dbFinal = JSON.parse(fs.readFileSync(DB_TEST_PATH, 'utf-8'));
    const finalJob = dbFinal.jobs[0];
    expect(finalJob.status).toBe('completed');
    expect(finalJob.progressPercent).toBe(100);
    expect(finalJob.timeline).toBeDefined();
    
    const completedStage = finalJob.timeline.find((t: any) => t.stage === 'completed');
    expect(completedStage).toBeDefined();
    expect(completedStage.at).toBeDefined();

    // Verify metrics are computed correctly
    expect(finalJob.metrics).toBeDefined();
    expect(typeof finalJob.metrics.totalProcessingMs).toBe('number');
    expect(finalJob.metrics.totalProcessingMs).toBeGreaterThan(0);

    // Verify uploaded file is deleted from server disk
    const fileName = path.basename(finalJob.serverFilePath);
    const fullFilePath = path.join(UPLOADS_TEST_DIR, fileName);
    expect(fs.existsSync(fullFilePath)).toBe(false);
  });
});

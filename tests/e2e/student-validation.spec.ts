import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_TEST_PATH = path.resolve(__dirname, '../../server/data/db.test.json');
const UPLOADS_TEST_DIR = path.resolve(__dirname, '../../server/uploads-test');
const TEMP_TEST_DIR = path.resolve(__dirname, '../../server/temp-test-fixtures');

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

  // Prepare temp directory for synthetic test fixtures
  if (fs.existsSync(TEMP_TEST_DIR)) {
    const tempFiles = fs.readdirSync(TEMP_TEST_DIR);
    for (const file of tempFiles) {
      fs.unlinkSync(path.join(TEMP_TEST_DIR, file));
    }
  } else {
    fs.mkdirSync(TEMP_TEST_DIR, { recursive: true });
  }
}

/** Verify the test database has no print jobs and no uploaded files. */
function assertCleanState() {
  const db = JSON.parse(fs.readFileSync(DB_TEST_PATH, 'utf-8'));
  expect(db.jobs.length).toBe(0);

  if (fs.existsSync(UPLOADS_TEST_DIR)) {
    const uploads = fs.readdirSync(UPLOADS_TEST_DIR);
    expect(uploads.length).toBe(0);
  }
}

/**
 * Shared helper: navigate to the Student Portal, authenticate the admin session
 * (so systemHealth is populated), and sign in as a student.
 */
async function loginAsStudent(page: import('@playwright/test').Page) {
  await page.goto('/');

  // Authenticate admin session for systemHealth (mirrors production session sharing)
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

  // Student login
  await page.fill('input[placeholder="e.g. basav"]', 'testuser');
  await page.fill('input[placeholder="••••••••"]', 'password101');
  await page.click('button:has-text("Sign In & Connect")');
  await expect(page.locator('button:has-text("Sign Out")')).toBeVisible();

  // Select alliance shop and wait for system readiness
  await expect(page.locator('select')).toBeVisible({ timeout: 10000 });
  await page.selectOption('select', 'alliance_print');
  await expect(page.locator('button:has-text("System Not Ready")')).toBeHidden({ timeout: 10000 });
}

test.describe('Student Validation & Error Handling', () => {
  test.beforeEach(async () => {
    resetDb();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 1 — Unsupported File Type
  // ─────────────────────────────────────────────────────────────────────────
  test('Scenario 1: should reject unsupported file types (audio/video) and display validation message', async ({ page }) => {
    await loginAsStudent(page);

    // Create a synthetic .mp3 file and attempt upload via setInputFiles
    // (bypasses the browser file dialog's accept filter)
    const fakeAudioBuffer = Buffer.alloc(256, 0xFF);
    const fakeAudioPath = path.join(TEMP_TEST_DIR, 'test_audio.mp3');
    fs.writeFileSync(fakeAudioPath, fakeAudioBuffer);

    await page.setInputFiles('input[type="file"]', fakeAudioPath);

    // Verify the validation error message
    await expect(page.locator('text=is not a supported format')).toBeVisible({ timeout: 5000 });

    // Verify the file was NOT added to the upload queue
    await expect(page.locator('span[title="test_audio.mp3"]')).toBeHidden();

    // Verify submit button stays in zero-files state
    await expect(page.locator('button[type="submit"]')).toBeDisabled();

    // Verify database is clean
    assertCleanState();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 2 — File Size Limit
  // ─────────────────────────────────────────────────────────────────────────
  test('Scenario 2: should reject files exceeding the 50MB size limit', async ({ page }) => {
    await loginAsStudent(page);

    // Create a file just over 50MB (50 * 1024 * 1024 + 1 bytes)
    const oversizedPath = path.join(TEMP_TEST_DIR, 'oversized_test.pdf');
    const pdfHeader = Buffer.from('%PDF-1.4\n');
    const fillSize = 50 * 1024 * 1024 + 1 - pdfHeader.length;
    const fillBuffer = Buffer.alloc(fillSize, 0x00);
    fs.writeFileSync(oversizedPath, Buffer.concat([pdfHeader, fillBuffer]));

    await page.setInputFiles('input[type="file"]', oversizedPath);

    // Verify the size limit validation message
    await expect(page.locator('text=exceeds the 50MB limit')).toBeVisible({ timeout: 5000 });

    // Verify the file was NOT added to the upload queue
    await expect(page.locator('span[title="oversized_test.pdf"]')).toBeHidden();

    // Verify submit button stays in zero-files state
    await expect(page.locator('button[type="submit"]')).toBeDisabled();

    // Verify database is clean
    assertCleanState();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 3 — Invalid Page Range
  // ─────────────────────────────────────────────────────────────────────────
  test('Scenario 3: should handle invalid page ranges by falling back to all pages (client) and rejecting malformed ranges (server)', async ({ page }) => {
    await loginAsStudent(page);

    // Upload a valid PDF (2 pages)
    const pdfPath = path.resolve(__dirname, '../../Campus_Print_RC1.5_Technical_Release_Report.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);
    await expect(page.locator('text=2 pgs')).toBeVisible();

    // Switch to Custom Range mode
    await page.click('button:has-text("Custom Range")');
    const rangeInput = page.locator('input[placeholder="e.g. 1-3, 5, 7-9"]');
    await expect(rangeInput).toBeVisible();

    // --- Sub-case A: Out-of-range pages (e.g., 10-15 on a 2-page doc) ---
    // The client-side countPagesFromRange silently filters out-of-range pages
    // and falls back to totalPages when no valid pages remain.
    await rangeInput.fill('10-15');

    // Verify the fare estimate still shows the full-document price (fallback)
    // 2 pages x 1 copy x ₹2 = ₹4
    await expect(page.locator('p:has-text("₹4")').first()).toBeVisible();

    // --- Sub-case B: Malformed range with text (e.g., "1-3,foo") ---
    // Client-side: countPagesFromRange parses "1-3" and ignores "foo" (NaN).
    // Since only pages 1-2 exist in the 2-page doc, only 2 pages are valid.
    await rangeInput.fill('1-3,foo');

    // Verify price reflects 2 valid pages (₹4 = 2 pages x ₹2)
    await expect(page.locator('p:has-text("₹4")').first()).toBeVisible();

    // --- Sub-case C: Submit with the malformed range to test server-side rejection ---
    // The server regex /^\d+(-\d+)?(,\d+(-\d+)?)*$/ will reject "1-3,foo".
    await page.click('button:has-text("(1 file)")');

    // The server should return a 400 error with the validation message
    await expect(page.locator('text=Invalid page range format')).toBeVisible({ timeout: 10000 });

    // Verify no job was created
    assertCleanState();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 4 — Empty Submission
  // ─────────────────────────────────────────────────────────────────────────
  test('Scenario 4: should prevent submission when no files are uploaded', async ({ page }) => {
    await loginAsStudent(page);

    // Verify the submit button is disabled with zero files
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeDisabled();

    // The button should show "(0 files)" since no files are added
    await expect(submitBtn).toContainText('0 files');

    // Attempt a programmatic form submit to test the handleSubmit guard
    const errorShown = await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) {
        // Dispatch submit event (bypasses disabled button)
        const event = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(event);
      }
      // Wait briefly for React state update
      return new Promise(resolve => setTimeout(() => {
        const errorEl = document.querySelector('.bg-red-50');
        resolve(errorEl ? errorEl.textContent : null);
      }, 500));
    });

    // The handleSubmit guard should display: "Please upload at least one file to print."
    expect(errorShown).toContain('Please upload at least one file to print.');

    // Verify database is clean
    assertCleanState();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 5 — Missing Student Information
  // ─────────────────────────────────────────────────────────────────────────
  test('Scenario 5: should prevent login without username or password, auto-populates identity after login', async ({ page }) => {
    await page.goto('/');

    // --- Sub-case A: Attempt login with empty username ---
    await page.fill('input[placeholder="••••••••"]', 'password101');
    await page.click('button:has-text("Sign In & Connect")');

    // Login validation should display error
    await expect(page.locator('text=Please enter a username or email')).toBeVisible({ timeout: 3000 });

    // Should still be on the login form (Sign Out not visible)
    await expect(page.locator('button:has-text("Sign Out")')).toBeHidden();

    // --- Sub-case B: Attempt login with empty password ---
    await page.fill('input[placeholder="e.g. basav"]', 'testuser');
    await page.fill('input[placeholder="••••••••"]', '');
    await page.click('button:has-text("Sign In & Connect")');

    await expect(page.locator('text=Please enter a password')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('button:has-text("Sign Out")')).toBeHidden();

    // --- Sub-case C: Successful login auto-populates identity ---
    // After login, studentName and studentEmail are automatically set from the
    // username, so "missing student info" can't occur during submission.
    await page.fill('input[placeholder="e.g. basav"]', 'testuser');
    await page.fill('input[placeholder="••••••••"]', 'password101');
    await page.click('button:has-text("Sign In & Connect")');

    await expect(page.locator('button:has-text("Sign Out")')).toBeVisible();

    // Verify that identity is populated (the student's name should appear in the UI)
    await expect(page.getByText('testuser', { exact: true })).toBeVisible();

    // Verify database is clean (no jobs created during login validation)
    assertCleanState();
  });
});

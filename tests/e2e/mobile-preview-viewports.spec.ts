import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_TEST_PATH = path.resolve(__dirname, '../../server/data/db.test.json');
const UPLOADS_TEST_DIR = path.resolve(__dirname, '../../server/uploads-test');

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
    printerStatus: 'online',
    lastHeartbeat: new Date().toISOString(),
    adminUsername: 'alliance_admin',
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

  if (fs.existsSync(UPLOADS_TEST_DIR)) {
    const files = fs.readdirSync(UPLOADS_TEST_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(UPLOADS_TEST_DIR, file));
    }
  } else {
    fs.mkdirSync(UPLOADS_TEST_DIR, { recursive: true });
  }
}

const VIEWPORTS = [
  { width: 320, height: 800, name: '320x800 (Small Mobile)' },
  { width: 360, height: 800, name: '360x800 (Galaxy S8/S9)' },
  { width: 375, height: 812, name: '375x812 (iPhone X/11/12 Mini)' },
  { width: 390, height: 844, name: '390x844 (iPhone 12/13/14 Pro)' },
  { width: 412, height: 915, name: '412x915 (Pixel 7 / Galaxy S20)' },
  { width: 430, height: 932, name: '430x932 (iPhone 14/15 Pro Max)' },
  { width: 768, height: 1024, name: '768x1024 (iPad / Tablet Portrait)' },
  { width: 1440, height: 900, name: '1440x900 (Desktop)' }
];

test.describe('Mobile Document Preview & Responsive Viewports Audit', () => {
  let samplePdfPath: string;
  let samplePngPath: string;

  test.beforeAll(async () => {
    resetDb();
    const fixtureDir = path.join(__dirname, '../fixtures');
    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }

    samplePdfPath = path.join(fixtureDir, 'sample_preview_test.pdf');
    samplePngPath = path.join(fixtureDir, 'sample_image_test.png');

    // Create minimal valid 1-page PDF fixture
    const minimalPdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << >> >> endobj
4 0 obj << /Length 21 >> stream
BT /F1 12 Tf ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
trailer << /Size 5 /Root 1 0 R >>
startxref
284
%%EOF`;
    fs.writeFileSync(samplePdfPath, minimalPdf, 'utf-8');

    // 1x1 PNG pixel fixture
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    fs.writeFileSync(samplePngPath, Buffer.from(pngBase64, 'base64'));
  });

  test.beforeEach(async () => {
    resetDb();
  });

  for (const vp of VIEWPORTS) {
    test(`Viewport ${vp.name}: PDF and Image preview rendered without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // 1. Authenticate via Google mock token
      const authRes = await page.request.post('http://127.0.0.1:3001/api/auth/google', {
        data: { idToken: 'mock_token_viewport_tester' }
      });
      expect(authRes.ok()).toBe(true);
      const authData = await authRes.json();
      const token = authData.sessionToken;

      // 2. Set token in sessionStorage and navigate to Student Portal
      await page.goto('/login');
      await page.evaluate((t) => {
        sessionStorage.setItem('studentSessionToken', t);
      }, token);

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Verify Student Dashboard is rendered
      const uploadArea = page.locator('text=Upload Your Document').first();
      await expect(uploadArea).toBeVisible({ timeout: 10000 });

      // 3. Check no horizontal overflow on initial dashboard
      const hasHorizontalScrollInit = await page.evaluate(() => {
        return document.documentElement.scrollWidth <= window.innerWidth;
      });
      expect(hasHorizontalScrollInit).toBe(true);

      // 4. Upload PDF file
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(samplePdfPath);

      // Verify selected document card appears
      await expect(page.locator('text=sample_preview_test.pdf').first()).toBeVisible({ timeout: 5000 });

      // Verify Visual Print Confirmation / Preview Container is rendered
      const previewHeading = page.locator('text=Visual Print Confirmation').first();
      await expect(previewHeading).toBeVisible({ timeout: 5000 });

      // Wait for canvas to render
      const canvasLocator = page.locator('canvas').first();
      await expect(canvasLocator).toBeVisible({ timeout: 10000 });

      // 5. Verify Canvas dimensions and containment within viewport
      const canvasBox = await canvasLocator.boundingBox();
      expect(canvasBox).not.toBeNull();
      expect(canvasBox!.width).toBeGreaterThan(50);
      expect(canvasBox!.height).toBeGreaterThan(50);
      expect(canvasBox!.width).toBeLessThanOrEqual(vp.width);

      // 6. Verify no horizontal overflow after PDF preview renders
      const hasHorizontalScrollPdf = await page.evaluate(() => {
        return document.documentElement.scrollWidth <= window.innerWidth;
      });
      expect(hasHorizontalScrollPdf).toBe(true);

      // 7. Verify Submit CTA button is visible
      const submitCta = page.locator('button[type="submit"]').first();
      await expect(submitCta).toBeVisible();

      // 8. Test PNG/JPG Image Preview
      await fileInput.setInputFiles(samplePngPath);
      await expect(page.locator('text=sample_image_test.png').first()).toBeVisible({ timeout: 5000 });

      // Click to switch active file to image
      await page.locator('text=sample_image_test.png').first().click();

      // Verify image tag preview is visible
      const imgPreview = page.locator('img[alt="sample_image_test.png"]').first();
      await expect(imgPreview).toBeVisible({ timeout: 10000 });

      // 9. Verify no horizontal overflow after image preview renders
      const hasHorizontalScrollImg = await page.evaluate(() => {
        return document.documentElement.scrollWidth <= window.innerWidth;
      });
      expect(hasHorizontalScrollImg).toBe(true);
    });
  }
});

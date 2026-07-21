# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-approval-workflow.spec.ts >> Admin Approval Workflow E2E Integration >> should support student print submission and subsequent admin release approval to queue
- Location: tests\e2e\admin-approval-workflow.spec.ts:134:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('h2:has-text("Upload Successful")')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('h2:has-text("Upload Successful")')

```

```yaml
- banner:
  - heading "Campus Print Hub" [level=1]
  - text: 📍 Alliance Print Center
  - paragraph: Fast, reliable campus printing
  - paragraph: 🔴 OFFLINE
  - paragraph: Service Inactive
- main:
  - text: "Shop:"
  - combobox:
    - option "TJohn Print Center"
    - option "Alliance Print Center" [selected]
    - option "Science Print Center"
  - text: Alliance Main Block 9876543211
  - button "Sign Out"
  - heading "Printing service is currently unavailable." [level=4]
  - paragraph: Please try again later or contact the print administrator.
  - heading "Upload to Print" [level=2]
  - paragraph: Configure settings and send queues
  - text: B
  - paragraph: basav
  - paragraph: basav@university.edu
  - text: Ingestion File
  - paragraph: Drag files here or click to browse
  - paragraph: PDF, DOC, DOCX, PPT, PPTX, PNG, JPG (Max 50MB)
  - text: ❌ The print shop is currently offline. Print submissions are temporarily disabled.
  - paragraph: Campus_Print_RC1.5_Technical_Release_Report.pdf
  - paragraph: 6.0 KB · 2 pgs
  - text: ₹4
  - button
  - text: Batch Total Estimate
  - paragraph: ₹4
  - text: 1 File
  - button "Queue for Later (1 file)"
  - text: 📄 PREVIEW CANVAS Campus_Print_RC1.5_Technical_Release_Report.pdf
  - iframe
  - text: "FORMAT: PDF SIZE: 6.0 KB PAGES: 2"
  - heading "🎛️ PRINTER CHANNELS CONSOLE" [level=3]
  - text: Copies
  - button "-" [disabled]
  - spinbutton: "1"
  - button "+"
  - text: Printing Sides
  - button "Simplex (1-Sided)"
  - button "Duplex (2-Sided)"
  - text: Page Range
  - button "All Pages (2)"
  - button "Custom Range"
  - text: Print Type
  - button "Black & White"
  - button "Color"
  - paragraph: Select whether you want this document printed in Black & White or in full Color.
  - text: Fare Estimate
  - paragraph: ₹4
  - text: ₹2/page
- contentinfo: © 2026 Campus Print Hub · All rights reserved
```

# Test source

```ts
  79  |     colorMaintenanceMode: false
  80  |   }
  81  | ];
  82  | 
  83  | const DEFAULT_PRINTER_SETTINGS = {
  84  |   status: 'online',
  85  |   expectedReturnTime: '2:00 PM',
  86  |   averagePrintSpeed: 5,
  87  |   adminOverrideStatus: 'online',
  88  |   availablePrinters: ['AlliancePrinter'],
  89  |   selectedPrinter: 'AlliancePrinter'
  90  | };
  91  | 
  92  | const DEFAULT_AGENTS = [
  93  |   {
  94  |     agentId: 'alliance_agent',
  95  |     shopId: 'alliance_print',
  96  |     machineName: 'alliance-machine',
  97  |     printerName: 'AlliancePrinter',
  98  |     daemonVersion: '1.0.0',
  99  |     onlineStatus: 'online',
  100 |     lastSeen: new Date().toISOString()
  101 |   }
  102 | ];
  103 | 
  104 | function resetDb() {
  105 |   const db = {
  106 |     jobs: [],
  107 |     shops: JSON.parse(JSON.stringify(DEFAULT_SHOPS)),
  108 |     printerSettings: JSON.parse(JSON.stringify(DEFAULT_PRINTER_SETTINGS)),
  109 |     agents: JSON.parse(JSON.stringify(DEFAULT_AGENTS)),
  110 |     printers: []
  111 |   };
  112 |   const dir = path.dirname(DB_TEST_PATH);
  113 |   if (!fs.existsSync(dir)) {
  114 |     fs.mkdirSync(dir, { recursive: true });
  115 |   }
  116 |   fs.writeFileSync(DB_TEST_PATH, JSON.stringify(db, null, 2), 'utf-8');
  117 | 
  118 |   // Clean uploads directory
  119 |   if (fs.existsSync(UPLOADS_TEST_DIR)) {
  120 |     const files = fs.readdirSync(UPLOADS_TEST_DIR);
  121 |     for (const file of files) {
  122 |       fs.unlinkSync(path.join(UPLOADS_TEST_DIR, file));
  123 |     }
  124 |   } else {
  125 |     fs.mkdirSync(UPLOADS_TEST_DIR, { recursive: true });
  126 |   }
  127 | }
  128 | 
  129 | test.describe('Admin Approval Workflow E2E Integration', () => {
  130 |   test.beforeEach(async () => {
  131 |     resetDb();
  132 |   });
  133 | 
  134 |   test('should support student print submission and subsequent admin release approval to queue', async ({ page }) => {
  135 |     // -------------------------------------------------------------------------
  136 |     // STEP 1: Student Portal Submission
  137 |     // -------------------------------------------------------------------------
  138 |     await page.goto('/');
  139 | 
  140 |     // Inject admin authentication session to populate system health variables
  141 |     await page.evaluate(async () => {
  142 |       const res = await fetch('http://127.0.0.1:3001/api/auth/login', {
  143 |         method: 'POST',
  144 |         headers: { 'Content-Type': 'application/json' },
  145 |         body: JSON.stringify({
  146 |           shopId: 'alliance_print',
  147 |           username: 'alliance_admin',
  148 |           password: 'tjohn_password123'
  149 |         })
  150 |       });
  151 |       const data = await res.json();
  152 |       sessionStorage.setItem('adminToken', data.token);
  153 |       sessionStorage.setItem('role', data.role);
  154 |       sessionStorage.setItem('shopId', data.shopId);
  155 |     });
  156 | 
  157 |     await page.reload();
  158 | 
  159 |     // Student Login
  160 |     await page.fill('input[placeholder="e.g. basav"]', 'basav');
  161 |     await page.fill('input[placeholder="••••••••"]', 'password101');
  162 |     await page.click('button:has-text("Sign In & Connect")');
  163 |     await expect(page.locator('button:has-text("Sign Out")')).toBeVisible();
  164 | 
  165 |     // Select Alliance Shop and wait for connection readiness
  166 |     await expect(page.locator('select')).toBeVisible({ timeout: 10000 });
  167 |     await page.selectOption('select', 'alliance_print');
  168 |     await expect(page.locator('button:has-text("System Not Ready")')).toBeHidden({ timeout: 10000 });
  169 | 
  170 |     // Upload PDF document
  171 |     const pdfPath = path.resolve(__dirname, '../../Campus_Print_RC1.5_Technical_Release_Report.pdf');
  172 |     await page.setInputFiles('input[type="file"]', pdfPath);
  173 |     await expect(page.locator('span[title="Campus_Print_RC1.5_Technical_Release_Report.pdf"]').first()).toBeVisible();
  174 | 
  175 |     // Submit print job
  176 |     await page.click('button:has-text("(1 file)")');
  177 | 
  178 |     // Capture success validation and Approval Token ID
> 179 |     await expect(page.locator('h2:has-text("Upload Successful")')).toBeVisible({ timeout: 15000 });
      |                                                                    ^ Error: expect(locator).toBeVisible() failed
  180 |     const tokenContainer = page.locator('span.text-orange-600').first();
  181 |     const tokenId = (await tokenContainer.textContent())?.trim();
  182 |     expect(tokenId).toBeDefined();
  183 |     expect(tokenId!.length).toBeGreaterThan(0);
  184 | 
  185 |     // Verify initial database status is pending_approval
  186 |     const dbRaw = fs.readFileSync(DB_TEST_PATH, 'utf-8');
  187 |     const db = JSON.parse(dbRaw);
  188 |     expect(db.jobs.length).toBe(1);
  189 |     const initialJob = db.jobs[0];
  190 |     expect(initialJob.status).toBe('pending_approval');
  191 |     expect(initialJob.tokenId).toBe(tokenId);
  192 |     expect(initialJob.studentName).toBe('basav');
  193 |     expect(initialJob.studentEmail).toBe('basav@university.edu');
  194 | 
  195 |     // Retrieve the public job token (e.g. PRNT-XYZ) to track in Spooler Table
  196 |     const jobToken = initialJob.token;
  197 |     expect(jobToken).toBeDefined();
  198 | 
  199 |     // -------------------------------------------------------------------------
  200 |     // STEP 2 & 3: Admin Console Login and Pending Approvals Verification
  201 |     // -------------------------------------------------------------------------
  202 |     await page.goto('/admin');
  203 |     
  204 |     // Clear storage to force the real login form to show
  205 |     await page.evaluate(() => sessionStorage.clear());
  206 |     await page.reload();
  207 | 
  208 |     // Select the shop from the login select dropdown
  209 |     const shopSelect = page.locator('select').first();
  210 |     await shopSelect.selectOption('alliance_print');
  211 |     
  212 |     await page.fill('input[placeholder="admin"]', 'alliance_admin');
  213 |     await page.fill('input[placeholder="••••••••"]', 'tjohn_password123');
  214 |     await page.click('button:has-text("Sign In to Console")');
  215 | 
  216 |     // Verify dashboard displays
  217 |     await expect(page.locator('h2:has-text("Administrator Console")')).toBeVisible();
  218 | 
  219 |     // Wait for system health to resolve and show system ready status (prevents race conditions)
  220 |     const systemReadyRow = page.locator('div', { has: page.locator('span', { hasText: '5. System Ready:' }) }).first();
  221 |     await expect(systemReadyRow).toContainText('🟢 READY', { timeout: 10000 });
  222 | 
  223 |     // Locate job in the Pending Approvals panel using its filename, scoped to the Pending Approvals card
  224 |     const approvalsCard = page.locator('div.bg-white', { has: page.locator('h3', { hasText: 'Pending Approvals & Release' }) }).first();
  225 |     const pendingRow = approvalsCard.locator('div.bg-slate-50', { has: page.locator('p', { hasText: 'Campus_Print_RC1.5_Technical_Release_Report.pdf' }) }).first();
  226 |     await expect(pendingRow).toBeVisible();
  227 |     await expect(pendingRow).toContainText('2 pgs · B&W');
  228 | 
  229 |     // -------------------------------------------------------------------------
  230 |     // STEP 4: Approve / Release Job
  231 |     // -------------------------------------------------------------------------
  232 |     // Listen for alerts and log them
  233 |     page.on('dialog', async dialog => {
  234 |       console.log(`[ALERT DETECTED]: ${dialog.message()}`);
  235 |       await dialog.dismiss();
  236 |     });
  237 | 
  238 |     const approveBtn = pendingRow.getByRole('button', { name: 'Approve', exact: true });
  239 |     await expect(approveBtn).toBeVisible();
  240 |     await approveBtn.click();
  241 | 
  242 |     // Verify job leaves the Pending Approvals list
  243 |     await expect(pendingRow).toBeHidden({ timeout: 10000 });
  244 | 
  245 |     // Verify job appears in the Spooler Operational Table as Queued
  246 |     const spoolerRow = page.locator('tr', { has: page.locator('td', { hasText: jobToken }) });
  247 |     await expect(spoolerRow).toBeVisible();
  248 |     await expect(spoolerRow.locator('span:has-text("QUEUED")')).toBeVisible();
  249 | 
  250 |     // -------------------------------------------------------------------------
  251 |     // STEP 5: Persistence State Verification
  252 |     // -------------------------------------------------------------------------
  253 |     const dbRawUpdated = fs.readFileSync(DB_TEST_PATH, 'utf-8');
  254 |     const dbUpdated = JSON.parse(dbRawUpdated);
  255 |     const updatedJob = dbUpdated.jobs.find((j: any) => j.token === jobToken);
  256 |     
  257 |     expect(updatedJob).toBeDefined();
  258 |     expect(updatedJob.status).toBe('queued');
  259 |     expect(updatedJob.tokenId).toBe(tokenId);
  260 | 
  261 |     // Verify timeline transition records
  262 |     expect(updatedJob.timeline).toBeDefined();
  263 |     const approvedTimeline = updatedJob.timeline.find((t: any) => t.stage === 'approved');
  264 |     expect(approvedTimeline).toBeDefined();
  265 |     expect(approvedTimeline.at).toBeDefined();
  266 |     expect(approvedTimeline.printerName).toBe('AlliancePrinter');
  267 |   });
  268 | });
  269 | 
```
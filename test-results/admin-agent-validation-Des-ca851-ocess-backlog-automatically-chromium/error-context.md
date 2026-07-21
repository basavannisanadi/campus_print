# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-agent-validation.spec.ts >> Desktop Print Agent Validation End-to-End Suite >> should register print agent, maintain heartbeat online/offline state, dynamically sync discovered printers, and process backlog automatically
- Location: tests\e2e\admin-agent-validation.spec.ts:207:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
  162 | 
  163 | function writeCleanConfig() {
  164 |   const configPath = path.join(CLIENT_DIR, 'config.json');
  165 |   const cleanConfig = {
  166 |     serverUrl: 'http://127.0.0.1:3001',
  167 |     pollIntervalMs: 2000,
  168 |     mockPrinter: false,
  169 |     printerName: '',
  170 |     shopId: 'alliance_print',
  171 |     agentId: 'CP-AGENT-E2E-TEST',
  172 |     machineName: 'TEST-MACHINE',
  173 |     daemonVersion: '1.0.0',
  174 |     protocolVersion: '1.0.0',
  175 |     token: ''
  176 |   };
  177 |   fs.writeFileSync(configPath, JSON.stringify(cleanConfig, null, 2), 'utf-8');
  178 | }
  179 | 
  180 | test.describe('Desktop Print Agent Validation End-to-End Suite', () => {
  181 |   test.beforeEach(async () => {
  182 |     resetDb();
  183 |     
  184 |     // Stop any existing daemon process cleanly first
  185 |     try {
  186 |       execSync('node bridge.cjs stop', { cwd: CLIENT_DIR });
  187 |     } catch {}
  188 |     
  189 |     // Wait a brief moment for the existing daemon to exit
  190 |     const lockFile = path.join(CLIENT_DIR, 'daemon.lock');
  191 |     for (let i = 0; i < 10; i++) {
  192 |       if (!fs.existsSync(lockFile)) break;
  193 |       await new Promise(r => setTimeout(r, 500));
  194 |     }
  195 |     
  196 |     cleanClientFiles();
  197 |     writeCleanConfig();
  198 |   });
  199 | 
  200 |   test.afterAll(async () => {
  201 |     // Ensure agent is shut down after tests
  202 |     try {
  203 |       execSync('node bridge.cjs stop', { cwd: CLIENT_DIR });
  204 |     } catch {}
  205 |   });
  206 | 
  207 |   test('should register print agent, maintain heartbeat online/offline state, dynamically sync discovered printers, and process backlog automatically', async ({ page }) => {
  208 |     test.setTimeout(240000);
  209 |     // -------------------------------------------------------------------------
  210 |     // STEP 1: Admin Authentication to retrieve dynamic signed shop token
  211 |     // -------------------------------------------------------------------------
  212 |     await page.goto('/');
  213 | 
  214 |     const token = await page.evaluate(async () => {
  215 |       const res = await fetch('http://127.0.0.1:3001/api/auth/login', {
  216 |         method: 'POST',
  217 |         headers: { 'Content-Type': 'application/json' },
  218 |         body: JSON.stringify({
  219 |           shopId: 'alliance_print',
  220 |           username: 'alliance_admin',
  221 |           password: 'tjohn_password123'
  222 |         })
  223 |       });
  224 |       const data = await res.json();
  225 |       return data.token;
  226 |     });
  227 | 
  228 |     expect(token).toBeDefined();
  229 |     expect(token.length).toBeGreaterThan(0);
  230 | 
  231 |     // -------------------------------------------------------------------------
  232 |     // STEP 2: Launch Real Desktop Print Agent via Bridge
  233 |     // -------------------------------------------------------------------------
  234 |     const launchCmd = `node bridge.cjs "campusprint://start?serverUrl=http://127.0.0.1:3001&shopId=alliance_print&token=${token}"`;
  235 |     await execPromise(launchCmd, { cwd: CLIENT_DIR });
  236 | 
  237 |     // Assert that the lock file gets generated
  238 |     const lockFile = path.join(CLIENT_DIR, 'daemon.lock');
  239 |     let lockCreated = false;
  240 |     for (let i = 0; i < 10; i++) {
  241 |       if (fs.existsSync(lockFile)) {
  242 |         lockCreated = true;
  243 |         break;
  244 |       }
  245 |       await page.waitForTimeout(500);
  246 |     }
  247 |     expect(lockCreated).toBe(true);
  248 | 
  249 |     // -------------------------------------------------------------------------
  250 |     // STEP 3: Validate Successful Registration & Discovered Printers
  251 |     // -------------------------------------------------------------------------
  252 |     let registered = false;
  253 |     for (let i = 0; i < 30; i++) {
  254 |       const dbRaw = fs.readFileSync(DB_TEST_PATH, 'utf-8');
  255 |       const db = JSON.parse(dbRaw);
  256 |       if (db.agents && db.agents.length > 0) {
  257 |         registered = true;
  258 |         break;
  259 |       }
  260 |       await page.waitForTimeout(500);
  261 |     }
> 262 |     expect(registered).toBe(true);
      |                        ^ Error: expect(received).toBe(expected) // Object.is equality
  263 | 
  264 |     let dbRaw = fs.readFileSync(DB_TEST_PATH, 'utf-8');
  265 |     let db = JSON.parse(dbRaw);
  266 |     const agent = db.agents[0];
  267 |     expect(agent.agentId).toBe('CP-AGENT-E2E-TEST');
  268 |     expect(agent.shopId).toBe('alliance_print');
  269 |     expect(agent.machineName).toBe(os.hostname() || 'UNKNOWN');
  270 |     expect(agent.onlineStatus).toBe('online');
  271 | 
  272 |     // Verify dynamic printer table populated (via the initial heartbeat)
  273 |     let printersSynced = false;
  274 |     for (let i = 0; i < 30; i++) {
  275 |       const dbRawCheck = fs.readFileSync(DB_TEST_PATH, 'utf-8');
  276 |       const dbCheck = JSON.parse(dbRawCheck);
  277 |       if (dbCheck.printers && dbCheck.printers.length > 0) {
  278 |         printersSynced = true;
  279 |         break;
  280 |       }
  281 |       await page.waitForTimeout(500);
  282 |     }
  283 |     expect(printersSynced).toBe(true);
  284 | 
  285 |     // -------------------------------------------------------------------------
  286 |     // STEP 4: Verify Admin Console displays agent as ONLINE
  287 |     // -------------------------------------------------------------------------
  288 |     await page.goto('/admin');
  289 |     await page.evaluate(() => sessionStorage.clear());
  290 |     await page.reload();
  291 | 
  292 |     await page.locator('select').first().selectOption('alliance_print');
  293 |     await page.fill('input[placeholder="admin"]', 'alliance_admin');
  294 |     await page.fill('input[placeholder="••••••••"]', 'tjohn_password123');
  295 |     await page.click('button:has-text("Sign In to Console")');
  296 | 
  297 |     await expect(page.locator('h2:has-text("Administrator Console")')).toBeVisible();
  298 | 
  299 |     const systemReadyRow = page.locator('div', { has: page.locator('span', { hasText: '5. System Ready:' }) }).first();
  300 |     await expect(systemReadyRow).toContainText('🟢 READY', { timeout: 10000 });
  301 | 
  302 |     const statusBadge = page.locator('span:has-text("ONLINE")').first();
  303 |     await expect(statusBadge).toBeVisible();
  304 | 
  305 |     // -------------------------------------------------------------------------
  306 |     // STEP 5: Heartbeat Interruption & Offline Status transition
  307 |     // -------------------------------------------------------------------------
  308 |     // Shutdown the agent cleanly using the stop command
  309 |     await execPromise('node bridge.cjs stop', { cwd: CLIENT_DIR });
  310 | 
  311 |     let stopped = false;
  312 |     for (let i = 0; i < 15; i++) {
  313 |       if (!fs.existsSync(lockFile)) {
  314 |         stopped = true;
  315 |         break;
  316 |       }
  317 |       await page.waitForTimeout(500);
  318 |     }
  319 |     expect(stopped).toBe(true);
  320 | 
  321 |     // Manually backdate the agent's lastSeen timestamp in the DB to trigger offline sweep
  322 |     let dbForBackdate = JSON.parse(fs.readFileSync(DB_TEST_PATH, 'utf-8'));
  323 |     dbForBackdate.agents[0].lastSeen = new Date(Date.now() - 65000).toISOString();
  324 |     fs.writeFileSync(DB_TEST_PATH, JSON.stringify(dbForBackdate, null, 2), 'utf-8');
  325 | 
  326 |     // Wait for the 10-second sweep interval on the backend to trigger offline transition
  327 |     await page.waitForTimeout(12000);
  328 | 
  329 |     // Verify Admin Console displays OFFLINE
  330 |     await page.reload();
  331 |     const offlineBadge = page.locator('span:has-text("OFFLINE")').first();
  332 |     await expect(offlineBadge).toBeVisible();
  333 | 
  334 |     // -------------------------------------------------------------------------
  335 |     // STEP 6: Recovery & Reconnect
  336 |     // -------------------------------------------------------------------------
  337 |     // Clean any residual shutdown.signal before restarting
  338 |     const signalFile = path.join(CLIENT_DIR, 'shutdown.signal');
  339 |     try { if (fs.existsSync(signalFile)) fs.unlinkSync(signalFile); } catch {}
  340 |     await page.waitForTimeout(500);
  341 | 
  342 |     // Restart the agent
  343 |     console.log('Restarting agent with launchCmd:', launchCmd);
  344 |     const restartResult = await execPromise(launchCmd, { cwd: CLIENT_DIR });
  345 |     console.log('Restart stdout:', restartResult.stdout);
  346 |     console.log('Restart stderr:', restartResult.stderr);
  347 | 
  348 |     let restartedOnline = false;
  349 |     for (let i = 0; i < 30; i++) {
  350 |       const dbCheck = JSON.parse(fs.readFileSync(DB_TEST_PATH, 'utf-8'));
  351 |       if (dbCheck.agents && dbCheck.agents[0] && dbCheck.agents[0].onlineStatus === 'online') {
  352 |         restartedOnline = true;
  353 |         break;
  354 |       }
  355 |       await page.waitForTimeout(500);
  356 |     }
  357 |     expect(restartedOnline).toBe(true);
  358 | 
  359 |     await page.reload();
  360 |     await expect(systemReadyRow).toContainText('🟢 READY', { timeout: 10000 });
  361 |     await expect(statusBadge).toBeVisible();
  362 | 
```
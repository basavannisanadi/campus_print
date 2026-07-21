import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import cp from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Agent Registration Success Integration Test', () => {
  const printClientDir = path.resolve(__dirname, '../../../print-client');
  const tempDir = path.join(printClientDir, 'temp-success');
  const runtimeJsonPath = path.join(tempDir, 'runtime.json');
  const configJsonPath = path.join(tempDir, 'config.json');
  const lockFilePath = path.join(tempDir, 'daemon.lock');
  const logFilePath = path.join(tempDir, 'logs/client.log');

  let server: http.Server;
  let dynamicPort: number;
  let registerCallsCount = 0;
  let childProcess: cp.ChildProcess | null = null;

  beforeEach(() => {
    registerCallsCount = 0;
    childProcess = null;

    // 1. Setup isolated temporary directory
    if (fs.existsSync(tempDir)) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'logs'), { recursive: true });

    // Copy client.cjs to the temp directory so it runs relative to it
    fs.copyFileSync(path.join(printClientDir, 'client.cjs'), path.join(tempDir, 'client.cjs'));

    // Create a 0-byte SumatraPDF.exe to satisfy ensureSumatraPDF() check quickly
    fs.writeFileSync(path.join(tempDir, 'SumatraPDF.exe'), '');

    // 2. Spin up mock local HTTP server on dynamic port (0)
    server = http.createServer((req, res) => {
      console.log(`[INTEGRATION TEST SERVER - SUCCESS] ${req.method} ${req.url}`);
      
      if (req.url?.startsWith('/api/printers/mapping')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          bwPrinterId: 'bw-123',
          bwPrinterName: 'BwMockPrinter',
          colorPrinterId: 'color-123',
          colorPrinterName: 'ColorMockPrinter'
        }));
      } else if (req.url === '/api/agent/register') {
        registerCallsCount++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Registered successfully' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    return new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        dynamicPort = (server.address() as any).port;
        
        // 3. Write test configuration inside the isolated directory
        const testConfig = {
          version: '1.0.0',
          daemonVersion: '1.0.0',
          protocolVersion: '1.0.0',
          agentId: 'CP-TEST-REG-SUCCESS',
          shopId: 'alliance_print',
          serverUrl: `http://127.0.0.1:${dynamicPort}`,
          mockPrinter: true
        };
        fs.writeFileSync(configJsonPath, JSON.stringify(testConfig, null, 2), 'utf8');

        // 4. Write test runtime payload inside the isolated directory
        const testRuntime = {
          serverUrl: `http://127.0.0.1:${dynamicPort}`,
          shopId: 'alliance_print',
          token: 'mock_valid_token'
        };
        fs.writeFileSync(runtimeJsonPath, JSON.stringify(testRuntime, null, 2), 'utf8');

        resolve();
      });
    });
  });

  afterEach(() => {
    // 1. Terminate child process if running
    if (childProcess && !childProcess.killed) {
      try { childProcess.kill('SIGKILL'); } catch {}
    }

    // 2. Close HTTP server
    const closeServer = new Promise<void>((resolve) => {
      if (server) {
        server.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });

    return closeServer.then(() => {
      // 3. Clean up the isolated temporary directory recursively
      if (fs.existsSync(tempDir)) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
      }
    });
  });

  test('should verify runtime configuration loading, HTTP 200 success registration, daemon keep-alive state, and check lockfile remains', () => {
    return new Promise<void>((resolve, reject) => {
      const clientCjsPath = path.join(tempDir, 'client.cjs');

      // Spawn client.cjs asynchronously within the temp directory
      childProcess = cp.spawn(process.execPath, [clientCjsPath], {
        cwd: tempDir,
        env: {
          ...process.env,
          CP_TEST_DISABLE_HEARTBEAT: 'true',
          CP_TEST_DISABLE_SSE: 'true',
          CP_TEST_DISABLE_POLLING: 'true'
        }
      });

      let stdout = '';
      let stderr = '';
      childProcess.stdout?.on('data', (data) => stdout += data.toString());
      childProcess.stderr?.on('data', (data) => stderr += data.toString());

      // Let the child process execute and verify it remains alive for 2.5 seconds
      const observationTime = 2500;
      setTimeout(() => {
        try {
          // 1. Verify that the process has NOT terminated (remains alive)
          expect(childProcess?.exitCode).toBeNull();
          expect(childProcess?.killed).toBe(false);

          // 2. Verify that daemon.lock is written and remains present
          expect(fs.existsSync(lockFilePath)).toBe(true);

          // 3. Verify exactly one POST registration request occurred and no duplicates are sent
          expect(registerCallsCount).toBe(1);

          // 4. Verify logs in client.log
          expect(fs.existsSync(logFilePath)).toBe(true);
          const logContent = fs.readFileSync(logFilePath, 'utf8');

          // Confirms runtime config was parsed and loaded successfully
          expect(logContent).toContain(`Runtime loaded: http://127.0.0.1:${dynamicPort} / alliance_print`);

          // Confirms "/api/agent/register" succeeded and logged "Registration success"
          expect(logContent).toContain('Registration success');

          // Confirms heartbeats, SSE, and polling loops were bypassed in this sprint
          expect(logContent).toContain('Heartbeat disabled via test flag');
          expect(logContent).toContain('SSE stream connection disabled via test flag');
          expect(logContent).toContain('Backlog polling disabled via test flag');
          expect(logContent).not.toContain('Initial Heartbeat');
          expect(logContent).not.toContain('Heartbeat started');

          resolve();
        } catch (err) {
          reject(err);
        }
      }, observationTime);

      childProcess.on('exit', (code) => {
        // If the process exits prematurely before the 2.5s observation window, fail the test
        if (code !== null) {
          reject(new Error(`Child process terminated prematurely with exit code: ${code}. stderr: ${stderr}, stdout: ${stdout}`));
        }
      });
    });
  });
});

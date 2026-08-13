import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import cp from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Agent Registration 401 Regression Test', () => {
  const printClientDir = path.resolve(__dirname, '../../../print-client');
  const tempDir = path.join(printClientDir, 'temp-401');
  const runtimeJsonPath = path.join(tempDir, 'runtime.json');
  const configJsonPath = path.join(tempDir, 'config.json');
  const lockFilePath = path.join(tempDir, 'daemon.lock');
  const logFilePath = path.join(tempDir, 'logs/client.log');

  let server: http.Server;
  let dynamicPort: number;
  let childProcess: cp.ChildProcess | null = null;

  beforeEach(() => {
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
      console.log(`[INTEGRATION TEST SERVER - 401] ${req.method} ${req.url}`);
      if (req.url?.startsWith('/api/printers/mapping')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          bwPrinterId: 'bw-123',
          bwPrinterName: 'BwMockPrinter',
          colorPrinterId: 'color-123',
          colorPrinterName: 'ColorMockPrinter'
        }));
      } else if (req.url === '/api/agent/register') {
        // Return intentional 401 Unauthorized error
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized: Invalid token' }));
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
          agentId: 'CP-TEST-AGENT',
          shopId: 'alliance_print',
          serverUrl: `http://127.0.0.1:${dynamicPort}`,
          mockPrinter: true
        };
        fs.writeFileSync(configJsonPath, JSON.stringify(testConfig, null, 2), 'utf8');

        // 4. Write test runtime payload inside the isolated directory
        const testRuntime = {
          serverUrl: `http://127.0.0.1:${dynamicPort}`,
          shopId: 'alliance_print',
          token: 'mock_unauthorized_token'
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

  test('should throw error, bypass registration success log, clean lockfile, and terminate process on register 401', () => {
    return new Promise<void>((resolve, reject) => {
      const clientCjsPath = path.join(tempDir, 'client.cjs');

      // Spawn client.cjs asynchronously
      childProcess = cp.spawn(process.execPath, [clientCjsPath], {
        cwd: tempDir
      });

      let stdout = '';
      let stderr = '';
      childProcess.stdout?.on('data', (data) => stdout += data.toString());
      childProcess.stderr?.on('data', (data) => stderr += data.toString());

      childProcess.on('exit', (code) => {
        console.log('[SPAWNED STDOUT]:', stdout);
        console.log('[SPAWNED STDERR]:', stderr);

        if (fs.existsSync(logFilePath)) {
          console.log('[SPAWNED LOG FILE CONTENT]:', fs.readFileSync(logFilePath, 'utf8'));
        }

        try {
          // 1. Verify process exits with status code 1 (failure path)
          expect(code).toBe(1);

          // 2. Verify daemon.lock is removed during error cleanup
          expect(fs.existsSync(lockFilePath)).toBe(false);

          // 3. Verify logs in client.log
          expect(fs.existsSync(logFilePath)).toBe(true);
          const logContent = fs.readFileSync(logFilePath, 'utf8');

          // Confirms registerAgent() throws and apiPost prints the failed response
          expect(logContent).toContain('HTTP POST /api/agent/register Failed: HTTP 401');

          // Confirms startup sequence caught the rejection and exited through the error path
          expect(logContent).toContain('STARTUP FAILED: HTTP 401');

          // Confirms "Registration success" and subsequent heartbeat pings were bypassed/never executed
          expect(logContent).not.toContain('Registration success');
          expect(logContent).not.toContain('Initial Heartbeat');
          expect(logContent).not.toContain('Heartbeat started');

          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }, 15000);
});

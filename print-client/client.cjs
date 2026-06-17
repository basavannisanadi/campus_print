const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');

function sanitizeCmdArg(str) {
  if (!str) return '';
  return str.toString().replace(/["&|;$`()<>\\^]/g, '');
}

// Ensure single instance via lockfile
const LOCK_FILE = path.join(__dirname, 'daemon.lock');
if (fs.existsSync(LOCK_FILE)) {
  console.error("Another instance of the daemon is already running (daemon.lock exists). Exiting.");
  process.exit(1);
}
fs.writeFileSync(LOCK_FILE, process.pid.toString());
process.on('exit', () => { try { fs.unlinkSync(LOCK_FILE); } catch {} });
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
process.on('uncaughtException', (err) => { console.error(err); process.exit(1); });

// --- CONFIG ---
const CONFIG_PATH = path.join(__dirname, 'config.json');
let config = {
  serverUrl: 'http://localhost:3001',
  pollIntervalMs: 10000, // safety polling fallback (10s)
  mockPrinter: true,     // Set false when real printer is connected
  printerName: '',       // Leave empty for default printer
  shopId: 'alliance_print', // shop to poll for print jobs
};

if (fs.existsSync(CONFIG_PATH)) {
  try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) }; } catch {}
}

// Ensure temp directories
const TEMP_DIR = path.join(__dirname, 'temp');
const OUTPUT_DIR = path.join(__dirname, 'printed_output');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// HTTP helpers
function apiGet(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, config.serverUrl);
    http.get(url, { 
      timeout: 10000, 
      headers: { 'Authorization': `Bearer ${config.apiKey || 'campusprint_admin_123'}` } 
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 404) return reject(new Error('404'));
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

function apiPost(endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, config.serverUrl);
    const payload = JSON.stringify(body);
    const req = http.request(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${config.apiKey || 'campusprint_admin_123'}`
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(payload);
    req.end();
  });
}

function downloadFile(filePath, dest) {
  return new Promise((resolve, reject) => {
    const url = new URL(filePath, config.serverUrl);
    http.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', () => ws.close(resolve));
      ws.on('error', reject);
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Download timeout')); });
  });
}

function progressBar(current, total) {
  const w = 30;
  const pct = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * w);
  return `[${'='.repeat(filled)}>${' '.repeat(w - filled)}] ${pct}%`;
}

// Download SumatraPDF if missing
async function ensureSumatraPDF() {
  const sumatraPath = path.join(__dirname, 'SumatraPDF.exe');
  if (fs.existsSync(sumatraPath)) {
    return;
  }
  
  const namedPath = path.join(__dirname, 'SumatraPDF-3.6.1-64.exe');
  if (fs.existsSync(namedPath)) {
    fs.renameSync(namedPath, sumatraPath);
    return;
  }
  
  console.log('  [SETUP] SumatraPDF.exe is missing. Downloading portable version...');
  
  const zipPath = path.join(__dirname, 'sumatra.zip');
  const url = 'https://www.sumatrapdfreader.org/dl/rel/3.6.1/SumatraPDF-3.6.1-64.zip';
  
  try {
    const cmd = `powershell -Command "Invoke-WebRequest -Uri '${url}' -OutFile '${zipPath}'; Expand-Archive -Path '${zipPath}' -DestinationPath '${__dirname}' -Force; Remove-Item '${zipPath}'"`;
    await new Promise((resolve, reject) => {
      exec(cmd, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    if (fs.existsSync(namedPath)) {
      fs.renameSync(namedPath, sumatraPath);
    }
    
    console.log('  [SETUP] SumatraPDF.exe downloaded and extracted successfully.');
  } catch (err) {
    console.error('  [SETUP] Failed to download SumatraPDF automatically:', err.message);
    console.log('  [SETUP] Fallback printing methods (PowerShell Start-Process) will be used.');
  }
}

// Show native Windows desktop notification
function showNotification(title, message) {
  const cleanMsg = message.replace(/'/g, "''").replace(/"/g, '\"');
  const cleanTitle = title.replace(/'/g, "''").replace(/"/g, '\"');
  const cmd = `powershell -Command "[void] [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); $objNotifyIcon = New-Object System.Windows.Forms.NotifyIcon; $objNotifyIcon.Icon = [System.Drawing.SystemIcons]::Information; $objNotifyIcon.BalloonTipIcon = 'Info'; $objNotifyIcon.BalloonTipText = '${cleanMsg}'; $objNotifyIcon.BalloonTipTitle = '${cleanTitle}'; $objNotifyIcon.Visible = $True; $objNotifyIcon.ShowBalloonTip(5000)"`;
  exec(cmd, () => {});
}

function getDefaultPrinter() {
  return new Promise((resolve) => {
    const cmd = `powershell -Command "Get-CimInstance -ClassName Win32_Printer | Where-Object Default -eq \\\`$true | Select-Object -ExpandProperty Name"`;
    exec(cmd, (err, stdout) => {
      if (err) resolve('');
      else resolve(stdout.trim());
    });
  });
}

function getPrinterStatus(printerName) {
  return new Promise((resolve) => {
    if (!printerName) return resolve(null);
    const escapedPrinter = printerName.replace(/'/g, "''");
    // Query Win32_Printer via Get-CimInstance for accurate live hardware connectivity detection
    const cmd = `powershell -Command "Get-CimInstance -ClassName Win32_Printer | Where-Object Name -eq '${escapedPrinter}' | Select-Object PrinterStatus, WorkOffline, DetectedErrorState, ExtendedPrinterStatus | ConvertTo-Json"`;
    exec(cmd, (err, stdout) => {
      if (err || !stdout.trim()) {
        // Fallback to classic Get-Printer if CIM is unavailable
        const fallbackCmd = `powershell -Command "Get-Printer -Name '${escapedPrinter}' | Select-Object PrinterStatus, WorkOffline | ConvertTo-Json"`;
        exec(fallbackCmd, (fallbackErr, fallbackStdout) => {
          if (fallbackErr || !fallbackStdout.trim()) {
            return resolve(null);
          }
          try {
            resolve(JSON.parse(fallbackStdout));
          } catch {
            resolve(null);
          }
        });
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve(null);
      }
    });
  });
}

function getSpoolerJobs(printerName) {
  return new Promise((resolve) => {
    if (!printerName) return resolve([]);
    const escapedPrinter = printerName.replace(/'/g, "''");
    const cmd = `powershell -Command "Get-PrintJob -PrinterName '${escapedPrinter}' | Select-Object Id, DocumentName, JobStatus, PagesPrinted, TotalPages | ConvertTo-Json"`;
    exec(cmd, (err, stdout) => {
      if (err || !stdout.trim()) {
        return resolve([]);
      }
      try {
        const parsed = JSON.parse(stdout);
        if (Array.isArray(parsed)) {
          resolve(parsed);
        } else if (parsed && typeof parsed === 'object') {
          resolve([parsed]);
        } else {
          resolve([]);
        }
      } catch {
        resolve([]);
      }
    });
  });
}

async function monitorPrintJob(printerName, localPath, totalPages, job) {
  const normalizedLocalPath = path.resolve(localPath).toLowerCase();
  console.log(`  [MONITOR] Monitoring spooler job for: ${path.basename(localPath)}`);
  
  // Wait up to 5 seconds for the job to show up in the spooler
  let spoolerJob = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const jobs = await getSpoolerJobs(printerName);
    spoolerJob = jobs.find(j => j.DocumentName && path.resolve(j.DocumentName).toLowerCase() === normalizedLocalPath);
    if (spoolerJob) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  
  if (!spoolerJob) {
    console.log('  [MONITOR] Job not found in spooler, assuming processed or printed instantly.');
    return;
  }
  
  console.log(`  [MONITOR] Found spooler Job ID: ${spoolerJob.Id}. Status: ${spoolerJob.JobStatus}`);
  
  let lastProgress = 0;
  let stuckCount = 0;
  
  while (true) {
    await new Promise(r => setTimeout(r, 1500));
    
    // Check if printer is work offline
    const printerStatus = await getPrinterStatus(printerName);
    if (printerStatus) {
      const isOffline = printerStatus.WorkOffline === true || 
                        printerStatus.PrinterStatus === 7 || 
                        printerStatus.PrinterStatus === '7' || 
                        printerStatus.PrinterStatus === 'Offline';
      if (isOffline) {
        if (!isQueuePaused) {
          console.log('  [MONITOR] Printer Offline. Pausing until resolved...');
          isQueuePaused = true;
          showNotification('Campus Print Hub', 'Printer Offline. Waiting...');
          startRecoveryLoop();
        }
        continue; // Wait patiently
      }
    }
    
    const jobs = await getSpoolerJobs(printerName);
    const activeJob = jobs.find(j => j.Id === spoolerJob.Id);
    
    if (!activeJob) {
      console.log('  [MONITOR] Job completed and left the print spooler queue.');
      break; 
    }
    
    // Check job status for errors
    const status = (activeJob.JobStatus || '').toString().toLowerCase();
    if (status.includes('error') || status.includes('offline') || status.includes('paperout') || status.includes('userintervention') || status.includes('paper_empty')) {
      if (!isQueuePaused) {
         console.log(`  [MONITOR] Spooler Error: ${activeJob.JobStatus}. Pausing until resolved...`);
         isQueuePaused = true;
         showNotification('Campus Print Hub', `Paused: ${activeJob.JobStatus}`);
         startRecoveryLoop();
      }
      continue; // Wait patiently
    }
    
    // Update progress based on actual pages printed
    if (activeJob.PagesPrinted !== undefined && activeJob.TotalPages) {
      const progressPercent = Math.min(99, Math.round((activeJob.PagesPrinted / activeJob.TotalPages) * 100));
      if (progressPercent > lastProgress) {
        lastProgress = progressPercent;
        console.log(`  [MONITOR] Printing: ${progressPercent}% (${activeJob.PagesPrinted}/${activeJob.TotalPages} pages)`);
        await apiPost(`/api/jobs/${job.id}/status`, { status: 'printing', progressPercent });
        stuckCount = 0;
      } else {
        stuckCount++;
        if (stuckCount > 40) { // ~60 seconds
          throw new Error('Printing stuck: printer requires user intervention');
        }
      }
    }
  }
}

let busy = false;
let isQueuePaused = false;
let recoveryActive = false;

function startRecoveryLoop() {
  if (recoveryActive) return;
  recoveryActive = true;
  console.log(`  [RECOVERY] Starting hardware recovery loop. Checking printer every 5 seconds...`);
  
  const recoveryInterval = setInterval(async () => {
    try {
      const activePrinter = config.printerName || await getDefaultPrinter();
      const status = await getPrinterStatus(activePrinter);
      if (status) {
        const isOffline = status.WorkOffline === true || 
                          status.PrinterStatus === 7 || 
                          status.PrinterStatus === '7' || 
                          status.PrinterStatus === 'Offline';
        
        const jobs = await getSpoolerJobs(activePrinter);
        const hasErrorJobs = jobs.some(j => {
          const s = (j.JobStatus || '').toString().toLowerCase();
          return s.includes('error') || s.includes('offline') || s.includes('paperout') || s.includes('userintervention');
        });

        if (!isOffline && !hasErrorJobs) {
          console.log(`  [RECOVERY] Printer is back online and clear. Resuming queue...`);
          clearInterval(recoveryInterval);
          recoveryActive = false;
          isQueuePaused = false;
          showNotification('Campus Print Hub', `Resuming: Printer is back online!`);
          poll();
        }
      }
    } catch (e) {
      // ignore errors
    }
  }, 5000);
}

async function processJob(job) {
  try {
    console.log(`\n  NEW JOB RECEIVED: ${job.token}`);
    console.log(`  File: ${job.fileName}`);
    console.log(`  Pages: ${job.pageCount} | Copies: ${job.copies} | Mode: ${job.printMode === 'color' ? 'Color' : 'Black & White'}`);
    console.log(`  Student: ${job.studentName}`);
    console.log('');

    // Mark as printing
    await apiPost(`/api/jobs/${job.id}/status`, { status: 'printing', progressPercent: 0 });

    // Download file
    const safeFileName = sanitizeCmdArg(path.basename(job.fileName));
    const localPath = path.join(TEMP_DIR, job.id + '-' + safeFileName);
    console.log('  Downloading file...');
    await downloadFile(job.serverFilePath, localPath);
    console.log('  Download complete.');

    const totalPages = job.pageCount * job.copies;

    if (config.mockPrinter) {
      // --- MOCK: simulate printing ---
      console.log('  [MOCK MODE] Simulating print (no physical printer)...');
      console.log(`  [MOCK SETTINGS] Mode: ${job.printMode} | Sides: ${job.sides} | Copies: ${job.copies}${job.pageRange ? ' | Pages: ' + job.pageRange : ''}`);
      
      // Copy to printed out folder
      const printedPath = path.join(OUTPUT_DIR, `${job.token}-${safeFileName}`);
      fs.copyFileSync(localPath, printedPath);
      
      // Show toast notification
      showNotification('Campus Print Hub', `Simulated Print: ${job.token} - ${job.fileName} (${job.copies} copies)`);
      
      // Open the file on the screen
      console.log('  Opening document on screen...');
      exec(`cmd /c start "" "${printedPath}"`, () => {});

      // Custom failure testing hooks based on file names
      if (job.fileName.toLowerCase().includes('fail_offline')) {
        throw new Error('Printer Offline');
      } else if (job.fileName.toLowerCase().includes('fail_paper')) {
        throw new Error('Paper Empty');
      } else if (job.fileName.toLowerCase().includes('fail')) {
        throw new Error('Spooler error: print failed');
      }

      for (let p = 1; p <= totalPages; p++) {
        await new Promise(r => setTimeout(r, 400)); // simulate printing speed
        const pct = Math.round((p / totalPages) * 100);
        process.stdout.write(`\r  Printing: ${progressBar(p, totalPages)} (${p}/${totalPages} pages)`);
        await apiPost(`/api/jobs/${job.id}/status`, { status: 'printing', progressPercent: pct });
      }
      console.log('\n');
    } else {
      // --- REAL PRINT ---
      const activePrinter = config.printerName || resolvedPrinterName;
      
      // Check printer status before sending job
      if (activePrinter) {
        const status = await getPrinterStatus(activePrinter);
        if (status) {
          const isOffline = status.WorkOffline === true || 
                            status.PrinterStatus === 7 || 
                            status.PrinterStatus === '7' || 
                            status.PrinterStatus === 'Offline';
          if (isOffline) {
            throw new Error('Printer Offline');
          }
        }
      }

      console.log('  Sending job to printer spooler...');
      
      // Show toast notification
      showNotification('Campus Print Hub', `Printing: ${job.token} - ${job.fileName} (${job.copies} copies)`);

      const sumatraPath = path.join(__dirname, 'SumatraPDF.exe');
      
      if (fs.existsSync(sumatraPath)) {
        const printer = config.printerName ? `-print-to "${config.printerName}"` : '-print-to-default';
        
        const modeSetting = job.printMode === 'color' ? 'color' : 'monochrome';
        const sidesSetting = job.sides === 'double' ? 'duplexlong' : 'simplex';
        const safeCopies = Math.max(1, parseInt(job.copies, 10) || 1);
        
        // SumatraPDF format: Nx for copies (e.g. 3x), bare range for pages (e.g. 1-3,5)
        let settings = `fit,${modeSetting},${sidesSetting},${safeCopies}x`;
        
        if (job.pageRange) {
          settings += `,${sanitizeCmdArg(job.pageRange)}`;
        }
        
        console.log(`  [SPOOLING] SumatraPDF settings: "${settings}"`);
        const cmd = `"${sumatraPath}" ${printer} -print-settings "${settings}" "${localPath}"`;
        await new Promise((resolve, reject) => {
          exec(cmd, (err) => err ? reject(err) : resolve());
        });
      } else {
        // Fallback
        const cmd = `powershell -Command "Start-Process -FilePath '${localPath.replace(/'/g, "''")}' -Verb Print -WindowStyle Hidden"`;
        await new Promise((resolve, reject) => {
          exec(cmd, (err) => err ? reject(err) : resolve());
        });
      }
      console.log('  Spooler command issued successfully.');

      // Monitor the actual print job in the spooler to track real progress & check for offline errors
      await monitorPrintJob(activePrinter, localPath, totalPages, job);
    }

    // Mark completed
    await apiPost(`/api/jobs/${job.id}/status`, { status: 'completed', progressPercent: 100 });
    
    // Cleanup temp file
    try { fs.unlinkSync(localPath); } catch {}
    
    console.log(`  ✓ JOB COMPLETE: Token ${job.token} is ready for pickup.\n`);
    showNotification('Campus Print Hub', `Done: Job ${job.token} is ready for pickup!`);
  } catch (err) {
    console.error(`\n  ❌ JOB FAILED: Token ${job.token} | Error: ${err.message}\n`);
    
    // Cleanup temp file
    const safeFileNameInner = sanitizeCmdArg(path.basename(job.fileName));
    const localPathInner = path.join(TEMP_DIR, job.id + '-' + safeFileNameInner);
    try { if (fs.existsSync(localPathInner)) fs.unlinkSync(localPathInner); } catch {}

    const isHardwareError = err.message.includes('Printer Offline') || err.message.includes('Paper Empty');
    
    if (isHardwareError) {
      console.log(`  [PAUSE] Hardware error detected: ${err.message}. Pausing queue processing.`);
      isQueuePaused = true;
      
      // Keep it in the queue for the student, resetting progress to 0
      await apiPost(`/api/jobs/${job.id}/status`, {
        status: 'queued',
        progressPercent: 0
      });

      showNotification('Campus Print Hub', `Paused: ${err.message}. Please fix to auto-resume.`);
      
      if (!recoveryActive) {
        startRecoveryLoop();
      }
    } else {
      let targetStatus = 'failed';
      await apiPost(`/api/jobs/${job.id}/status`, {
        status: targetStatus,
        reason: err.message || 'Unknown printing error'
      });
      showNotification('Campus Print Hub', `Failed: Job ${job.token} error - ${err.message}`);
    }
  }
}

async function poll() {
  if (busy || isQueuePaused) return;
  busy = true;
  try {
    let hasMore = true;
    while (hasMore) {
      let job = null;
      try {
        const endpoint = config.shopId ? `/api/jobs/next?shopId=${encodeURIComponent(config.shopId)}` : '/api/jobs/next';
        job = await apiGet(endpoint);
      } catch (err) {
        if (!err.message.includes('404')) {
          console.error('  [Error fetching next job]', err.message);
        }
        hasMore = false;
      }

      if (job && job.id) {
        await processJob(job);
      } else {
        hasMore = false;
      }
    }
  } catch (err) {
    console.error('  [Poll loop error]', err.message);
  } finally {
    busy = false;
  }
}

// SSE Event Stream connection
let sseRequest = null;
function connectSSE() {
  if (sseRequest) {
    try { sseRequest.destroy(); } catch {}
  }

  const streamUrl = new URL('/api/jobs/stream', config.serverUrl);
  
  sseRequest = http.get(streamUrl, {
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  }, (res) => {
    if (res.statusCode !== 200) {
      console.error(`  SSE stream error: HTTP ${res.statusCode}. Retrying in 10s...`);
      setTimeout(connectSSE, 10000);
      return;
    }

    console.log('  ✓ Connected to real-time server stream (SSE).');

    res.on('data', (chunk) => {
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.substring(5).trim());
            if (data.type === 'new_job') {
              console.log(`  [SSE Notification] New job: ${data.job.token}`);
              poll(); // instantly pull
            }
          } catch {}
        }
      }
    });

    res.on('end', () => {
      console.log('  SSE stream connection ended. Reconnecting in 5s...');
      setTimeout(connectSSE, 5000);
    });
  });

  sseRequest.on('error', (err) => {
    console.error('  SSE connection error:', err.message);
    console.log('  Retrying SSE connection in 10s...');
    setTimeout(connectSSE, 10000);
  });
}

async function sendHeartbeat() {
  try {
    let printerStatus = 'offline';
    if (!config.mockPrinter) {
      const activePrinter = config.printerName || resolvedPrinterName;
      if (activePrinter) {
        const status = await getPrinterStatus(activePrinter);
        if (status) {
          const isOffline = status.WorkOffline === true || 
                            status.PrinterStatus === 7 || 
                            status.PrinterStatus === '7' || 
                            status.PrinterStatus === 'Offline';
          if (!isOffline) {
            printerStatus = 'online';
          }
        }
      }
    } else {
      printerStatus = 'online'; // Mock mode is always online
    }
    
    await apiPost('/api/printer/status', { status: printerStatus });
  } catch (err) {
    console.error('  [Heartbeat Error]', err.message);
  }
}

let resolvedPrinterName = '';

// --- START ---
async function main() {
  // Resolve printer name
  resolvedPrinterName = config.printerName;
  if (!resolvedPrinterName && !config.mockPrinter) {
    resolvedPrinterName = await getDefaultPrinter();
  }

  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║   CAMPUS PRINT CLIENT v3.0 (REAL-TIME)    ║');
  console.log('  ╠═══════════════════════════════════════════╣');
  console.log(`  ║  Server: ${config.serverUrl.padEnd(33)}║`);
  console.log(`  ║  Mode:   ${(config.mockPrinter ? 'MOCK (simulate + popup)' : 'LIVE ETHERNET PRINTER').padEnd(33)}║`);
  console.log(`  ║  Printer: ${(resolvedPrinterName || 'System Default').padEnd(32)}║`);
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');

  // Check and setup SumatraPDF
  await ensureSumatraPDF();

  if (!config.mockPrinter && resolvedPrinterName) {
    const status = await getPrinterStatus(resolvedPrinterName);
    if (status) {
      console.log(`  [PRINTER] Initial Status: ${status.PrinterStatus} | WorkOffline: ${status.WorkOffline}`);
    }
  }

  // Report initial heartbeat
  await sendHeartbeat();
  // Keep reporting heartbeat every 8 seconds
  setInterval(sendHeartbeat, 8000);

  console.log('  Initializing real-time stream and backlog drain...');
  
  // Establish real-time SSE stream
  connectSSE();
  
  // Backlog check on startup
  poll();
  
  // Safety polling fallback every 15 seconds
  setInterval(poll, 15000);
}

main().catch(console.error);

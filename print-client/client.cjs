const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { exec, spawn } = require('child_process');
const os = require('os');

function getHttpClient(url) {
  return url.protocol === 'https:' ? https : http;
}

function sanitizeCmdArg(str) {
  if (!str) return '';
  return str.toString().replace(/["&|;$`()<>\\^%!\n\r]/g, '');
}

function formatPrinterId(printerName) {
  if (!printerName) return 'UNKNOWN';
  return printerName
    .toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Ensure single instance via lockfile
const LOCK_FILE = path.join(__dirname, 'daemon.lock');
if (fs.existsSync(LOCK_FILE)) {
  let isRunning = false;
  let existingPid = null;
  try {
    const lockContent = fs.readFileSync(LOCK_FILE, 'utf8').trim();
    existingPid = parseInt(lockContent, 10);
    if (existingPid && !isNaN(existingPid)) {
      try {
        process.kill(existingPid, 0);
        isRunning = true;
      } catch (err) {
        isRunning = err.code === 'EPERM'; // If EPERM, process exists but we lack permissions
      }
    }
  } catch (err) {
    console.warn(`  [STARTUP WARNING] Failed to read lockfile: ${err.message}`);
  }

  if (isRunning) {
    console.error(`Another instance of the daemon (PID ${existingPid}) is already running (daemon.lock exists). Exiting.`);
    process.exit(1);
  } else {
    console.log(`  [STARTUP] Stale lockfile detected (PID ${existingPid} is not running). Removing it...`);
    try { fs.unlinkSync(LOCK_FILE); } catch {}
  }
}
fs.writeFileSync(LOCK_FILE, process.pid.toString());
process.on('exit', () => { try { fs.unlinkSync(LOCK_FILE); } catch {} });
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
process.on('uncaughtException', (err) => { console.error(err); process.exit(1); });

// --- CONFIG ---
const CONFIG_PATH = path.join(__dirname, 'config.json');
let config = {
  serverUrl: 'https://campus-print-backend.onrender.com',
  pollIntervalMs: 10000, // safety polling fallback (10s)
  mockPrinter: true,     // Set false when real printer is connected
  printerName: '',       // Leave empty for default printer
  shopId: 'alliance_print', // shop to poll for print jobs
  agentId: 'AGENT-001',
  machineName: os.hostname() || 'SHOP-PC-01',
  daemonVersion: '1.0.0',
  agentToken: 'campusprint_agent_token_123'
};

if (fs.existsSync(CONFIG_PATH)) {
  try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) }; } catch {}
}

// Local cache for printer mappings (Correction #1)
let cachedPrinterMapping = {
  bwPrinterId: '',
  bwPrinterName: '',
  colorPrinterId: '',
  colorPrinterName: ''
};

let currentJobPrintType = '';
let currentJobSelectedPrinter = '';

async function refreshPrinterMapping() {
  try {
    const mapping = await apiGet(`/api/printers/mapping?shopId=${config.shopId || 'alliance_print'}`);
    if (mapping) {
      cachedPrinterMapping = {
        bwPrinterId: mapping.bwPrinterId || '',
        bwPrinterName: mapping.bwPrinterName || '',
        colorPrinterId: mapping.colorPrinterId || '',
        colorPrinterName: mapping.colorPrinterName || ''
      };
      console.log('  [AGENT] Locally cached printer mappings updated successfully.');
    }
  } catch (err) {
    console.error('  [AGENT] Failed to refresh printer mapping:', err.message);
  }
}

async function resolvePrinterForJob(job) {
  const printType = job.printType || 'bw';
  const printerName = printType === 'color' ? cachedPrinterMapping.colorPrinterName : cachedPrinterMapping.bwPrinterName;
  if (printerName) {
    console.log(`  [ROUTING] Routing printJob ${job.token} to mapped ${printType.toUpperCase()} printer: "${printerName}"`);
    return printerName;
  }

  if (config.mockPrinter) {
    return 'MockPrinter';
  }
  
  // Fallback to legacy active printer
  console.log(`  [ROUTING] Mapped ${printType.toUpperCase()} printer not configured. Falling back to active printer.`);
  return resolveActivePrinter();
}

// Ensure temp directories
const TEMP_DIR = path.join(__dirname, 'temp');
const OUTPUT_DIR = path.join(__dirname, 'printed_output');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// HTTP helpers
function getAuthHeader() {
  return `Bearer ${config.agentToken || config.apiKey || 'campusprint_agent_token_123'}`;
}

function apiGet(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, config.serverUrl);
    const client = getHttpClient(url);
    client.get(url, { 
      timeout: 10000, 
      headers: { 'Authorization': getAuthHeader() } 
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
    // Append routing telemetry if posting to timeline (Correction #3)
    if (endpoint && endpoint.includes('/timeline') && body && typeof body === 'object') {
      if (body.printType === undefined && currentJobPrintType) {
        body.printType = currentJobPrintType;
      }
      if (body.selectedPrinter === undefined && currentJobSelectedPrinter) {
        body.selectedPrinter = currentJobSelectedPrinter;
      }
    }
    const payload = JSON.stringify(body);
    const client = getHttpClient(url);
    const req = client.request(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': getAuthHeader()
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
    const client = getHttpClient(url);
    client.get(url, { 
      timeout: 30000,
      headers: { 'Authorization': getAuthHeader() }
    }, (res) => {
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

function convertToPdf(localPath) {
  return new Promise((resolve) => {
    const ext = path.extname(localPath).toLowerCase();
    if (ext === '.pdf') {
      return resolve(localPath);
    }
    if (ext !== '.doc' && ext !== '.docx' && ext !== '.ppt' && ext !== '.pptx') {
      return resolve(localPath);
    }

    const absoluteLocalPath = path.resolve(localPath);
    const pdfPath = absoluteLocalPath.substring(0, absoluteLocalPath.lastIndexOf('.')) + '.pdf';

    console.log(`  [CONVERT] Converting ${path.basename(localPath)} to PDF...`);

    let cmd = '';
    if (ext === '.doc' || ext === '.docx') {
      const escapedDocPath = absoluteLocalPath.replace(/'/g, "''");
      const escapedPdfPath = pdfPath.replace(/'/g, "''");
      cmd = `powershell -Command "$word = New-Object -ComObject Word.Application; $word.Visible = $false; try { $doc = $word.Documents.Open('${escapedDocPath}'); $doc.SaveAs([ref] '${escapedPdfPath}', [ref] 17); $doc.Close(); } finally { $word.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null; }"`;
    } else if (ext === '.ppt' || ext === '.pptx') {
      const escapedPptPath = absoluteLocalPath.replace(/'/g, "''");
      const escapedPdfPath = pdfPath.replace(/'/g, "''");
      cmd = `powershell -Command "$ppt = New-Object -ComObject PowerPoint.Application; try { $pres = $ppt.Presentations.Open('${escapedPptPath}', [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse); $pres.SaveAs('${escapedPdfPath}', 32); $pres.Close(); } finally { $ppt.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null; }"`;
    }

    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error(`  [CONVERT] Conversion failed: ${err.message}`);
        return resolve(localPath);
      }
      if (fs.existsSync(pdfPath)) {
        console.log(`  [CONVERT] Conversion successful: ${path.basename(pdfPath)}`);
        return resolve(pdfPath);
      }
      return resolve(localPath);
    });
  });
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

// Show native Windows desktop notification safely via spawn (mitigates command injection)
function showNotification(title, message) {
  const psScript = `& {
    param($msg, $title)
    [void] [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')
    $objNotifyIcon = New-Object System.Windows.Forms.NotifyIcon
    $objNotifyIcon.Icon = [System.Drawing.SystemIcons]::Information
    $objNotifyIcon.BalloonTipIcon = 'Info'
    $objNotifyIcon.BalloonTipText = $msg
    $objNotifyIcon.BalloonTipTitle = $title
    $objNotifyIcon.Visible = $True
    $objNotifyIcon.ShowBalloonTip(5000)
  }`;
  try {
    const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript, message || '', title || '']);
    ps.on('error', (err) => {
      console.error('  [NOTIFICATION ERROR]', err.message);
    });
  } catch (err) {
    console.error('  [NOTIFICATION ERROR]', err.message);
  }
}

function getDefaultPrinter() {
  return new Promise((resolve) => {
    const cmd = `powershell -Command "Get-CimInstance -ClassName Win32_Printer | Where-Object Default -eq \\\`$true | Select-Object -ExpandProperty Name"`;
    exec(cmd, (err, stdout) => {
      if (err || !stdout.trim()) {
        const fallbackCmd = `powershell -Command "(Get-Printer | Where-Object UseDefault -eq \\\`$true).Name"`;
        exec(fallbackCmd, (fallbackErr, fallbackStdout) => {
          if (fallbackErr) resolve('');
          else resolve(fallbackStdout.trim());
        });
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function getInstalledPrinters() {
  return new Promise((resolve) => {
    const cmd = `powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"`;
    exec(cmd, (err, stdout) => {
      if (err || !stdout.trim()) {
        const fallbackCmd = `powershell -Command "Get-CimInstance -ClassName Win32_Printer | Select-Object -ExpandProperty Name"`;
        exec(fallbackCmd, (fallbackErr, fallbackStdout) => {
          if (fallbackErr) resolve([]);
          else {
            const printers = fallbackStdout.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
            resolve(printers);
          }
        });
      } else {
        const printers = stdout.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
        resolve(printers);
      }
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

function resolveActivePrinter() {
  return new Promise(async (resolve) => {
    if (config.mockPrinter) {
      return resolve('MockPrinter');
    }
    try {
      const settings = await apiGet('/api/printer/settings');
      if (settings && settings.selectedPrinter) {
        return resolve(settings.selectedPrinter);
      }
    } catch (err) {
      // Silently fall back
    }
    if (config.printerName) {
      return resolve(config.printerName);
    }
    const defaultPrinter = await getDefaultPrinter();
    resolve(defaultPrinter || '');
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

async function monitorPrintJob(printerName, localPath, totalPages, job, initialSpoolerJob, daemonInstance) {
  const normalizedLocalPath = path.resolve(localPath).toLowerCase();
  console.log(`  [MONITOR] Monitoring spooler job for: ${path.basename(localPath)}`);
  
  let spoolerJob = initialSpoolerJob || null;
  if (!spoolerJob) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const jobs = await getSpoolerJobs(printerName);
      spoolerJob = jobs.find(j => {
        if (!j.DocumentName) return false;
        const spoolDocLower = j.DocumentName.toLowerCase();
        const localDocLower = normalizedLocalPath;
        const spoolBasename = path.basename(spoolDocLower);
        const localBasename = path.basename(localDocLower);
        return spoolDocLower === localDocLower || spoolBasename === localBasename || spoolDocLower.includes(localBasename);
      });
      if (spoolerJob) break;
      await new Promise(r => setTimeout(r, 1000));
    }
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
      // Telemetry: spooler_job_removed
      try {
        const printerId = formatPrinterId(printerName);
        await apiPost(`/api/jobs/${job.id}/timeline`, {
          stage: 'spooler_job_removed',
          printerId,
          printerName,
          daemonInstance
        });
      } catch (e) {
        console.error('  [Telemetry Error] Failed to record spooler_job_removed stage:', e.message);
      }
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
      const activePrinter = resolvedPrinterName || await getDefaultPrinter();
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
    currentJobPrintType = job.printType || 'bw';
    console.log(`\n  NEW JOB RECEIVED: ${job.token}`);
    console.log(`  File: ${job.fileName}`);
    console.log(`  Pages: ${job.pageCount} | Copies: ${job.copies} | Mode: ${job.printMode === 'color' ? 'Color' : 'Black & White'}`);
    console.log(`  Student: ${job.studentName}`);
    console.log('');

    const activePrinter = await resolvePrinterForJob(job);
    currentJobSelectedPrinter = activePrinter || 'UNKNOWN';
    const printerName = activePrinter || 'UNKNOWN';
    const printerId = formatPrinterId(printerName);
    const daemonInstance = config.daemonInstance || os.hostname() || 'SHOP_PC_01';

    // Telemetry: claimed
    try {
      await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'claimed', printerId, printerName, daemonInstance });
    } catch (e) {
      console.error('  [Telemetry Error] Failed to record claimed stage:', e.message);
    }

    // Mark as printing
    await apiPost(`/api/jobs/${job.id}/status`, { status: 'printing', progressPercent: 0 });

    // Download file
    const safeFileName = sanitizeCmdArg(path.basename(job.fileName));
    const localPath = path.join(TEMP_DIR, job.id + '-' + safeFileName);
    console.log('  Downloading file...');
    await downloadFile(job.serverFilePath, localPath);
    console.log('  Download complete.');

    // Telemetry: downloaded
    try {
      await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'downloaded', printerId, printerName, daemonInstance });
    } catch (e) {
      console.error('  [Telemetry Error] Failed to record downloaded stage:', e.message);
    }

    // Convert Word/PowerPoint to PDF if Office is available
    const printablePath = await convertToPdf(localPath);

    const totalPages = job.pageCount * job.copies;

    if (config.mockPrinter) {
      // --- MOCK: simulate printing ---
      console.log('  [MOCK MODE] Simulating print (no physical printer)...');
      console.log(`  [MOCK SETTINGS] Mode: ${job.printMode} | Sides: ${job.sides} | Copies: ${job.copies}${job.pageRange ? ' | Pages: ' + job.pageRange : ''}`);
      
      // Copy to printed out folder
      const printedPath = path.join(OUTPUT_DIR, `${job.token}-${path.basename(printablePath)}`);
      fs.copyFileSync(printablePath, printedPath);
      
      // Show toast notification
      showNotification('Campus Print Hub', `Simulated Print: ${job.token} - ${job.fileName} (${job.copies} copies)`);
      
      // Open the file on the screen
      console.log('  Opening document on screen...');
      exec(`cmd /c start "" "${printedPath}"`, () => {});

      // Telemetry: spool_command_sent & spooler_job_detected
      try {
        await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'spool_command_sent', printerId, printerName, daemonInstance });
        await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'spooler_job_detected', printerId, printerName, daemonInstance });
      } catch (e) {
        console.error('  [Telemetry Error] Failed to record mock spool stages:', e.message);
      }

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

      // Telemetry: spooler_job_removed
      try {
        await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'spooler_job_removed', printerId, printerName, daemonInstance });
      } catch (e) {
        console.error('  [Telemetry Error] Failed to record mock spooler_job_removed stage:', e.message);
      }
    } else {
      // --- REAL PRINT ---
      // 1. Re-resolve printer name dynamically before every job (Priority 1)
      const activePrinter = await resolvePrinterForJob(job);
      resolvedPrinterName = activePrinter;
      currentJobSelectedPrinter = activePrinter || 'UNKNOWN';
      
      if (!activePrinter) {
        throw new Error('No active printer resolved. Print aborted.');
      }

      const sumatraPath = path.join(__dirname, 'SumatraPDF.exe');
      if (!fs.existsSync(sumatraPath)) {
        throw new Error('Print engine (SumatraPDF) is unavailable. Silent fallback printing is disabled.');
      }
      
      // Check printer status before sending job
      const statusCheck = await getPrinterStatus(activePrinter);
      if (statusCheck) {
        const isOffline = statusCheck.WorkOffline === true || 
                          statusCheck.PrinterStatus === 7 || 
                          statusCheck.PrinterStatus === '7' || 
                          statusCheck.PrinterStatus === 'Offline';
        if (isOffline) {
          throw new Error('Printer Offline');
        }
      }

      console.log('  Sending job to printer spooler...');
      
      // Show toast notification
      showNotification('Campus Print Hub', `Printing: ${job.token} - ${job.fileName} (${job.copies} copies)`);

      const printer = `-print-to "${activePrinter}"`;
      const modeSetting = job.printMode === 'color' ? 'color' : 'monochrome';
      const sidesSetting = job.sides === 'double' ? 'duplexlong' : 'simplex';
      const safeCopies = Math.max(1, parseInt(job.copies, 10) || 1);
      
      // SumatraPDF format: Nx for copies (e.g. 3x), bare range for pages (e.g. 1-3,5)
      let settings = `fit,${modeSetting},${sidesSetting},${safeCopies}x`;
      
      if (job.pageRange) {
        settings += `,${sanitizeCmdArg(job.pageRange)}`;
      }
      
      console.log(`  [SPOOLING] SumatraPDF settings: "${settings}"`);
      const cmd = `"${sumatraPath}" ${printer} -print-settings "${settings}" "${printablePath}"`;
      
      // Execute SumatraPDF and wait for exit status (Priority 3)
      await new Promise((resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
          if (err) {
            reject(new Error(`SumatraPDF failed to print: ${err.message}`));
          } else {
            resolve();
          }
        });
      });
      console.log('  Spooler command issued successfully.');

      // Telemetry: spool_command_sent
      try {
        await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'spool_command_sent', printerId, printerName, daemonInstance });
      } catch (e) {
        console.error('  [Telemetry Error] Failed to record spool_command_sent stage:', e.message);
      }

      // 2. Positive Evidence-Based Confirmation (Priority 3)
      console.log('  [SPOOLING] Verifying job acceptance in spooler queue...');
      const normalizedLocalPath = path.resolve(printablePath).toLowerCase();
      let spoolerJob = null;
      
      for (let attempt = 0; attempt < 15; attempt++) {
        const jobs = await getSpoolerJobs(activePrinter);
        spoolerJob = jobs.find(j => {
          if (!j.DocumentName) return false;
          const spoolDocLower = j.DocumentName.toLowerCase();
          const localDocLower = normalizedLocalPath;
          const spoolBasename = path.basename(spoolDocLower);
          const localBasename = path.basename(localDocLower);
          return spoolDocLower === localDocLower || spoolBasename === localBasename || spoolDocLower.includes(localBasename);
        });
        if (spoolerJob) break;
        await new Promise(r => setTimeout(r, 200));
      }

      if (spoolerJob) {
        // Telemetry: spooler_job_detected
        try {
          await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'spooler_job_detected', printerId, printerName, daemonInstance });
        } catch (e) {
          console.error('  [Telemetry Error] Failed to record spooler_job_detected stage:', e.message);
        }

        console.log(`  [SPOOLING] Job accepted! Spooler Job ID: ${spoolerJob.Id}.`);
        // Monitor the actual print job in the spooler to track real progress & check for offline errors
        await monitorPrintJob(activePrinter, printablePath, totalPages, job, spoolerJob, daemonInstance);
      } else {
        // Not found in spooler, check print status for positive evidence (instant print)
        console.log('  [SPOOLING] Job not detected in spooler queue. Checking printer status for evidence of success...');
        const finalStatus = await getPrinterStatus(activePrinter);
        if (finalStatus) {
          const isOffline = finalStatus.WorkOffline === true || 
                            finalStatus.PrinterStatus === 7 || 
                            finalStatus.PrinterStatus === '7' || 
                            finalStatus.PrinterStatus === 'Offline';
          const hasError = finalStatus.DetectedErrorState !== 0 && finalStatus.DetectedErrorState !== undefined;
          if (isOffline || hasError) {
            throw new Error(`Print spooler confirmation failed: Printer status is offline/error (Status: ${finalStatus.PrinterStatus}, ErrorState: ${finalStatus.DetectedErrorState})`);
          }
        }
        console.log('  [SPOOLING] Positive evidence confirmed: SumatraPDF exited with code 0 and printer is online and healthy.');
      }
    }

    // Telemetry: completed
    try {
      await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'completed', printerId, printerName, daemonInstance });
    } catch (e) {
      console.error('  [Telemetry Error] Failed to record completed stage:', e.message);
    }

    // Mark completed
    await apiPost(`/api/jobs/${job.id}/status`, { status: 'completed', progressPercent: 100 });
    
    // Cleanup temp files
    try { fs.unlinkSync(localPath); } catch {}
    if (printablePath !== localPath) {
      try { fs.unlinkSync(printablePath); } catch {}
    }
    
    console.log(`  ✓ JOB COMPLETE: Token ${job.token} is ready for pickup.\n`);
    showNotification('Campus Print Hub', `Done: Job ${job.token} is ready for pickup!`);
  } catch (err) {
    console.error(`\n  ❌ JOB FAILED: Token ${job.token} | Error: ${err.message}\n`);
    
    // Cleanup temp files
    const safeFileNameInner = sanitizeCmdArg(path.basename(job.fileName));
    const localPathInner = path.join(TEMP_DIR, job.id + '-' + safeFileNameInner);
    try { if (fs.existsSync(localPathInner)) fs.unlinkSync(localPathInner); } catch {}
    const pdfPathInner = localPathInner.substring(0, localPathInner.lastIndexOf('.')) + '.pdf';
    try { if (fs.existsSync(pdfPathInner)) fs.unlinkSync(pdfPathInner); } catch {}

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
  const client = getHttpClient(streamUrl);
  
  sseRequest = client.get(streamUrl, {
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Authorization': getAuthHeader()
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
            } else if (data.type === 'scan_printers' && data.shopId === config.shopId) {
              console.log('  [SSE Notification] Scan printers request received. Running scan...');
              activeScanRequested = true;
              sendHeartbeat();
            } else if (data.type === 'shop_updated' && data.shop && data.shop.id === config.shopId) {
              console.log('  [SSE Notification] Shop configuration updated. Refreshing printer mapping...');
              refreshPrinterMapping();
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

let activeScanRequested = true;

async function registerAgent() {
  try {
    resolvedPrinterName = await resolveActivePrinter();
    const payload = {
      agentId: config.agentId || 'AGENT-001',
      shopId: config.shopId || 'alliance_print',
      machineName: config.machineName || os.hostname() || 'SHOP-PC-01',
      printerName: resolvedPrinterName || 'System Default',
      daemonVersion: config.daemonVersion || '1.0.0',
      agentToken: config.agentToken || 'campusprint_agent_token_123'
    };
    console.log('  [AGENT] Registering remote print agent with server...');
    await apiPost('/api/agent/register', payload);
    console.log('  [AGENT] Registration successful.');
  } catch (err) {
    console.error('  [AGENT] Registration failed:', err.message);
  }
}

async function sendHeartbeat() {
  try {
    await refreshPrinterMapping();
    resolvedPrinterName = await resolveActivePrinter();
    let printersToSend = null;
    
    // Only query printers list when requested by the server
    if (activeScanRequested) {
      console.log('  [PRINTER] Scanning local printers...');
      const currentPrinters = await getInstalledPrinters();
      printersToSend = currentPrinters;
      activeScanRequested = false;
      console.log(`  [PRINTER] Scan complete. Found ${currentPrinters.length} printer(s).`);
    }

    let printerStatus = 'offline';
    if (!config.mockPrinter) {
      const activePrinter = resolvedPrinterName;
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

    // Call the remote agent heartbeat endpoint (Requirement 4)
    try {
      const hbPayload = {
        agentId: config.agentId || 'AGENT-001',
        shopId: config.shopId || 'alliance_print',
        printerName: resolvedPrinterName || 'System Default',
        daemonVersion: config.daemonVersion || '1.0.0'
      };
      if (printersToSend) {
        hbPayload.printers = printersToSend;
      }
      const hbRes = await apiPost('/api/agent/heartbeat', hbPayload);
      if (hbRes && hbRes.scanRequested && !activeScanRequested) {
        console.log('  [PRINTER] Scan request received from Server via heartbeat. Running scan on next heartbeat...');
        activeScanRequested = true;
        setTimeout(sendHeartbeat, 100);
      }
    } catch (e) {
      console.error('  [AGENT] Remote heartbeat failed:', e.message);
    }
    
    const payload = { status: printerStatus };
    if (printersToSend) {
      payload.printers = printersToSend;
    }
    
    const res = await apiPost('/api/printer/status', payload);
    if (res && res.settings) {
      // Check if server is requesting a scan
      if (res.settings.scanRequested && !activeScanRequested) {
        console.log('  [PRINTER] Scan request received from Server. Running scan on next heartbeat...');
        activeScanRequested = true;
        // Trigger heartbeat immediately to report results fast
        setTimeout(sendHeartbeat, 100);
      }

      const serverSelected = res.settings.selectedPrinter;
      if (serverSelected && serverSelected !== resolvedPrinterName) {
        console.log(`  [PRINTER] Active printer changed by Admin to: ${serverSelected}`);
        resolvedPrinterName = serverSelected;
      } else if (!serverSelected && resolvedPrinterName !== config.printerName) {
        resolvedPrinterName = config.printerName || await getDefaultPrinter();
      }
    }
  } catch (err) {
    console.error('  [Heartbeat Error]', err.message);
  }
}

function validateStartupReadiness() {
  return new Promise(async (resolve) => {
    const reportLines = [];
    reportLines.push('===================================================');
    reportLines.push('       CAMPUS PRINT CLIENT STARTUP REPORT          ');
    reportLines.push('===================================================');
    reportLines.push(`Timestamp: ${new Date().toISOString()}`);
    reportLines.push('');

    let sumatraOk = false;
    let printerOk = false;
    let spoolerOk = false;
    let dirsOk = false;
    let officeOk = false;
    let officeWarning = '';

    // 1. SumatraPDF Check
    const sumatraPath = path.join(__dirname, 'SumatraPDF.exe');
    if (fs.existsSync(sumatraPath)) {
      sumatraOk = true;
      reportLines.push('✓ SumatraPDF Found');
    } else {
      reportLines.push('✗ SumatraPDF Missing');
    }

    // 2. Printer Check
    let printerNameResolved = '';
    try {
      printerNameResolved = await resolveActivePrinter();
      if (printerNameResolved) {
        printerOk = true;
        reportLines.push(`✓ Printer Found: "${printerNameResolved}"`);
      } else {
        reportLines.push('✗ Printer Not Found (No default or configured printer)');
      }
    } catch {
      reportLines.push('✗ Printer Check Failed');
    }

    // 3. Spooler Check
    try {
      const spoolerStatus = await new Promise((res) => {
        exec('powershell -Command "Get-Service -Name Spooler | Select-Object -ExpandProperty Status"', (err, stdout) => {
          if (err) res('');
          else res(stdout.trim().toLowerCase());
        });
      });
      if (spoolerStatus === 'running') {
        spoolerOk = true;
        reportLines.push('✓ Print Spooler Running');
      } else {
        reportLines.push(`✗ Print Spooler Service Status: ${spoolerStatus || 'Stopped'}`);
      }
    } catch {
      reportLines.push('✗ Print Spooler Check Failed');
    }

    // 4. Local Directories Check
    try {
      const tempPath = path.join(__dirname, 'temp');
      const outputPath = path.join(__dirname, 'printed_output');
      if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });
      if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });
      dirsOk = true;
      reportLines.push('✓ Directories Ready');
    } catch (err) {
      reportLines.push(`✗ Directories Check Failed: ${err.message}`);
    }

    // 5. Office Conversion Check (Warning only, non-blocking)
    try {
      const officeStatus = await new Promise((res) => {
        const checkCmd = `powershell -Command "try { $word = New-Object -ComObject Word.Application; [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null; $wordOk = $true } catch { $wordOk = $false }; try { $ppt = New-Object -ComObject PowerPoint.Application; [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null; $pptOk = $true } catch { $pptOk = $false }; echo \\\"Word:$wordOk,PPT:$pptOk\\\""`;
        exec(checkCmd, (err, stdout) => {
          if (err) res('Word:false,PPT:false');
          else res(stdout.trim());
        });
      });
      const hasWord = officeStatus.includes('Word:True');
      const hasPpt = officeStatus.includes('PPT:True');
      if (hasWord && hasPpt) {
        officeOk = true;
        reportLines.push('✓ Office Conversion Available');
      } else {
        officeWarning = `⚠ Office Conversion Unavailable (Word: ${hasWord ? 'Available' : 'Missing'}, PowerPoint: ${hasPpt ? 'Available' : 'Missing'}) - DOCX/PPTX printing disabled`;
        reportLines.push(officeWarning);
      }
    } catch {
      officeWarning = '⚠ Office Conversion Unavailable - Check Failed';
      reportLines.push(officeWarning);
    }

    reportLines.push('');
    reportLines.push('===================================================');

    // Determine readiness status
    const isCriticalReady = sumatraOk && printerOk && spoolerOk && dirsOk;
    
    if (isCriticalReady) {
      reportLines.push('STATUS: SYSTEM READY');
    } else {
      const reasons = [];
      if (!sumatraOk) reasons.push('SumatraPDF Missing');
      if (!printerOk) reasons.push('Printer Missing');
      if (!spoolerOk) reasons.push('Print Spooler Stopped');
      if (!dirsOk) reasons.push('Local Directories Inaccessible');
      reportLines.push(`STATUS: SYSTEM NOT READY (Reason: ${reasons.join(', ')})`);
    }
    reportLines.push('===================================================');

    const reportContent = reportLines.join('\n');
    
    // Output report to console
    console.log(reportContent);

    // Save report to logs/startup-report.txt
    try {
      const logsDir = path.join(__dirname, 'logs');
      if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
      fs.writeFileSync(path.join(logsDir, 'startup-report.txt'), reportContent);
    } catch (err) {
      console.error('  [WARN] Failed to write startup report log file:', err.message);
    }

    resolve(isCriticalReady);
  });
}

let resolvedPrinterName = '';

// --- START ---
async function main() {
  // Resolve printer name dynamically (Priority 1)
  resolvedPrinterName = await resolveActivePrinter();

  // Try to setup SumatraPDF if missing first
  await ensureSumatraPDF();

  // Load printer mapping once on startup (Correction #1)
  await refreshPrinterMapping();

  // Validate startup readiness on boot (Priority 5)
  const isReady = await validateStartupReadiness();
  if (!isReady) {
    console.error('\n  [ERROR] Campus Print Client is NOT ready for operational printing. Exiting daemon.\n');
    process.exit(1);
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

  if (!config.mockPrinter && resolvedPrinterName) {
    const status = await getPrinterStatus(resolvedPrinterName);
    if (status) {
      console.log(`  [PRINTER] Initial Status: ${status.PrinterStatus} | WorkOffline: ${status.WorkOffline}`);
    }
  }

  // Register agent with backend
  await registerAgent();

  // Report initial heartbeat
  await sendHeartbeat();
  // Keep reporting heartbeat every 30 seconds (Requirement: Heartbeat interval: 30 seconds)
  setInterval(sendHeartbeat, 30000);

  console.log('  Initializing real-time stream and backlog drain...');
  
  // Establish real-time SSE stream
  connectSSE();
  
  // Backlog check on startup
  poll();
  
  // Safety polling fallback every 15 seconds
  setInterval(poll, 15000);
}

main().catch(console.error);

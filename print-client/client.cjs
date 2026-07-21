const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const cp = require('child_process');
const os = require('os');

const logFile = path.join(__dirname, 'logs', 'client.log');
if (!fs.existsSync(path.dirname(logFile))) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
}
function logToFile(msg) {
  const line = `[Client] [${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(logFile, line); } catch(e) {}
}

logToFile('Started');

// Overwrite child_process.exec to force windowsHide: true on Windows systems (eliminates all flashing CMD windows)
const originalExec = cp.exec;
cp.exec = function (cmd, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};
  if (options.windowsHide === undefined) {
    options.windowsHide = true;
  }
  return originalExec(cmd, options, callback);
};

// Overwrite child_process.spawn to force windowsHide: true on Windows systems (eliminates all flashing CMD windows)
const originalSpawn = cp.spawn;
cp.spawn = function (command, args, options) {
  let finalArgs = args;
  let finalOptions = options;
  if (args && !Array.isArray(args)) {
    finalOptions = args;
    finalArgs = [];
  }
  finalOptions = finalOptions || {};
  if (finalOptions.windowsHide === undefined) {
    finalOptions.windowsHide = true;
  }
  return originalSpawn(command, finalArgs, finalOptions);
};

const exec = cp.exec;
const spawn = cp.spawn;

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
        isRunning = err.code === 'EPERM';
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
process.on('SIGINT', () => gracefulShutdown());
process.on('SIGTERM', () => gracefulShutdown());
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  process.exit(1);
});

// --- CONFIG ---
const CONFIG_PATH = path.join(__dirname, 'config.json');
let config = {
  serverUrl: 'http://localhost:3001',
  pollIntervalMs: 10000,
  mockPrinter: false,
  printerName: '',
  shopId: 'tjohn_print',
  agentId: 'AGENT-001',
  machineName: os.hostname() || 'SHOP-PC-01',
  daemonVersion: '1.0.0',
  protocolVersion: '1.0.0'
};

if (fs.existsSync(CONFIG_PATH)) {
  try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) }; } catch {}
}

// Parse command-line args override
let argServerUrl = '';
let argShopId = '';

process.argv.forEach(val => {
  if (val.startsWith('--server-url=')) {
    argServerUrl = val.substring(13);
  } else if (val.startsWith('--shop-id=')) {
    argShopId = val.substring(10);
  }
});

if (argServerUrl) config.serverUrl = argServerUrl;
if (argShopId) config.shopId = argShopId;

// Runtime state variables
let cachedPrinterMapping = {
  bwPrinterId: '',
  bwPrinterName: '',
  colorPrinterId: '',
  colorPrinterName: ''
};
let currentJobPrintType = '';
let currentJobSelectedPrinter = '';
let lastPrintTime = '';
let resolvedPrinterName = '';
let activeJobToken = null;

let busy = false;
let isQueuePaused = false;
let recoveryActive = false;
let heartbeatTimer = null;
let pollTimer = null;
let isShuttingDown = false;
let isRegistered = false;

// Ensure directories
const TEMP_DIR = path.join(__dirname, 'temp');
const OUTPUT_DIR = path.join(__dirname, 'printed_output');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// HTTP helpers
function getAuthHeader() {
  const tokenForLog = config.token || '';
  logToFile(`[DIAGNOSTIC] getAuthHeader() config.token: "${tokenForLog.substring(0, 20)}"`);
  return `Bearer ${config.token || ''}`;
}

function apiGet(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, config.serverUrl);
    const client = getHttpClient(url);
    client.get(url, { 
      timeout: 10000, 
      headers: { 'Authorization': getAuthHeader() },
      agent: false
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
      agent: false
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          logToFile(`HTTP POST ${endpoint} Failed: HTTP ${res.statusCode} - ${data}`);
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', (err) => {
      logToFile(`Network error on POST ${endpoint}: ${err.message}`);
      reject(err);
    });
    req.on('timeout', () => { 
      logToFile(`Timeout on POST ${endpoint}`);
      req.destroy(); 
      reject(new Error('Timeout')); 
    });
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
      headers: { 'Authorization': getAuthHeader() },
      agent: false
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', () => ws.close(resolve));
      ws.on('error', reject);
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Download timeout')); });
  });
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

    exec(cmd, (err) => {
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
  if (fs.existsSync(sumatraPath)) return;
  
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
  }
}

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
    ps.on('error', (err) => console.error('  [NOTIFICATION ERROR]', err.message));
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
    const cmd = "powershell -Command \"Get-Printer | Where-Object PortName -notlike 'PORTPROMPT*' | Where-Object PortName -notlike 'nul*' | Where-Object PortName -notlike 'Microsoft*' | Where-Object Name -notlike '*PDF*' | Where-Object Name -notlike '*XPS*' | Where-Object Name -notlike '*OneNote*' | Where-Object Name -notlike '*Fax*' | Where-Object Name -notlike '*Send to*' | Where-Object Name -notlike '*AnyDesk*' | Where-Object Name -notlike '*PDF24*' | Select-Object -ExpandProperty Name\"";
    exec(cmd, { timeout: 10000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        logToFile(`[WARN] Primary printer query failed or timed out: ${err ? err.message : 'Empty stdout'}`);
        const fallbackCmd = "powershell -Command \"Get-CimInstance -ClassName Win32_Printer | Where-Object PortName -notlike 'PORTPROMPT*' | Where-Object PortName -notlike 'nul*' | Where-Object PortName -notlike 'Microsoft*' | Where-Object Name -notlike '*PDF*' | Where-Object Name -notlike '*XPS*' | Where-Object Name -notlike '*OneNote*' | Where-Object Name -notlike '*Fax*' | Where-Object Name -notlike '*Send to*' | Where-Object Name -notlike '*AnyDesk*' | Where-Object Name -notlike '*PDF24*' | Select-Object -ExpandProperty Name\"";
        exec(fallbackCmd, { timeout: 10000 }, (fallbackErr, fallbackStdout) => {
          if (fallbackErr || !fallbackStdout.trim()) {
            logToFile(`[WARN] Fallback printer query failed or timed out: ${fallbackErr ? fallbackErr.message : 'Empty stdout'}`);
            resolve([]);
          } else {
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
    const cmd = `powershell -Command "Get-CimInstance -ClassName Win32_Printer | Where-Object Name -eq '${escapedPrinter}' | Select-Object PrinterStatus, WorkOffline, DetectedErrorState, ExtendedPrinterStatus | ConvertTo-Json"`;
    exec(cmd, (err, stdout) => {
      if (err || !stdout.trim()) {
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
      if (err || !stdout.trim()) return resolve([]);
      try {
        const parsed = JSON.parse(stdout);
        if (Array.isArray(parsed)) resolve(parsed);
        else if (parsed && typeof parsed === 'object') resolve([parsed]);
        else resolve([]);
      } catch {
        resolve([]);
      }
    });
  });
}

async function refreshPrinterMapping() {
  try {
    const mapping = await apiGet(`/api/printers/mapping?shopId=${config.shopId || 'tjohn_print'}`);
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
    return printerName;
  }
  if (config.mockPrinter) {
    return 'MockPrinter';
  }
  const defaultPrinter = await getDefaultPrinter();
  return defaultPrinter || '';
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
    console.log('  [MONITOR] Job not found in spooler, assuming processed instantly.');
    return;
  }
  
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
          console.log('  [MONITOR] Printer Offline. Pausing queue...');
          isQueuePaused = true;
          showNotification('Campus Print Hub', 'Printer Offline. Waiting...');
          startRecoveryLoop();
        }
        continue;
      }
    }
    
    const jobs = await getSpoolerJobs(printerName);
    const activeJob = jobs.find(j => j.Id === spoolerJob.Id);
    
    if (!activeJob) {
      try {
        const printerId = formatPrinterId(printerName);
        await apiPost(`/api/jobs/${job.id}/timeline`, {
          stage: 'spooler_job_removed',
          printerId,
          printerName,
          daemonInstance
        });
      } catch (e) {
        console.error('  [Telemetry Error] Failed to record spooler_job_removed:', e.message);
      }
      break; 
    }
    
    const status = (activeJob.JobStatus || '').toString().toLowerCase();
    if (status.includes('error') || status.includes('offline') || status.includes('paperout') || status.includes('userintervention')) {
      if (!isQueuePaused) {
         console.log(`  [MONITOR] Spooler Error: ${activeJob.JobStatus}. Pausing queue...`);
         isQueuePaused = true;
         showNotification('Campus Print Hub', `Paused: ${activeJob.JobStatus}`);
         startRecoveryLoop();
      }
      continue;
    }
    
    if (activeJob.PagesPrinted !== undefined && activeJob.TotalPages) {
      const progressPercent = Math.min(99, Math.round((activeJob.PagesPrinted / activeJob.TotalPages) * 100));
      if (progressPercent > lastProgress) {
        lastProgress = progressPercent;
        console.log(`  [MONITOR] Printing: ${progressPercent}% (${activeJob.PagesPrinted}/${activeJob.TotalPages} pages)`);
        await apiPost(`/api/jobs/${job.id}/status`, { status: 'printing', progressPercent });
        stuckCount = 0;
      } else {
        stuckCount++;
        if (stuckCount > 40) {
          throw new Error('Printing stuck: printer requires user intervention');
        }
      }
    }
  }
}

function startRecoveryLoop() {
  if (recoveryActive) return;
  recoveryActive = true;
  
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
          console.log(`  [RECOVERY] Printer back online. Resuming...`);
          clearInterval(recoveryInterval);
          recoveryActive = false;
          isQueuePaused = false;
          showNotification('Campus Print Hub', `Resuming: Printer is back online!`);
          poll();
        }
      }
    } catch (e) {}
  }, 5000);
}

async function processJob(job) {
  try {
    currentJobPrintType = job.printType || 'bw';
    activeJobToken = job.token;
    
    console.log(`\n  NEW JOB RECEIVED: ${job.token}`);
    
    const activePrinter = await resolvePrinterForJob(job);
    currentJobSelectedPrinter = activePrinter || 'UNKNOWN';
    const printerName = activePrinter || 'UNKNOWN';
    const printerId = formatPrinterId(printerName);
    const daemonInstance = config.machineName || os.hostname() || 'SHOP-PC-01';

    try {
      await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'claimed', printerId, printerName, daemonInstance });
    } catch (e) {
      console.error('  [Telemetry Error] Failed timeline claimed:', e.message);
    }

    await apiPost(`/api/jobs/${job.id}/status`, { status: 'printing', progressPercent: 0 });

    const safeFileName = sanitizeCmdArg(path.basename(job.fileName));
    const localPath = path.join(TEMP_DIR, job.id + '-' + safeFileName);
    console.log('  Downloading file...');
    await downloadFile(job.serverFilePath, localPath);
    console.log('  Download complete.');

    try {
      await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'downloaded', printerId, printerName, daemonInstance });
    } catch (e) {
      console.error('  [Telemetry Error] Failed timeline downloaded:', e.message);
    }

    const printablePath = await convertToPdf(localPath);
    const totalPages = job.pageCount * job.copies;

    if (config.mockPrinter) {
      console.log('  [MOCK MODE] Simulating print...');
      const printedPath = path.join(OUTPUT_DIR, `${job.token}-${path.basename(printablePath)}`);
      fs.copyFileSync(printablePath, printedPath);
      
      showNotification('Campus Print Hub', `Simulated Print: ${job.token}`);
      exec(`cmd /c start "" "${printedPath}"`, () => {});

      try {
        await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'spool_command_sent', printerId, printerName, daemonInstance });
        await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'spooler_job_detected', printerId, printerName, daemonInstance });
      } catch (e) {}

      for (let p = 1; p <= totalPages; p++) {
        await new Promise(r => setTimeout(r, 400));
        const pct = Math.round((p / totalPages) * 100);
        await apiPost(`/api/jobs/${job.id}/status`, { status: 'printing', progressPercent: pct });
      }

      try {
        await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'spooler_job_removed', printerId, printerName, daemonInstance });
      } catch (e) {}
    } else {
      const sumatraPath = path.join(__dirname, 'SumatraPDF.exe');
      if (!fs.existsSync(sumatraPath)) {
        throw new Error('Print engine (SumatraPDF) is unavailable.');
      }
      
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
      showNotification('Campus Print Hub', `Printing: ${job.token} (${job.copies} copies)`);

      const printer = `-print-to "${activePrinter}"`;
      const modeSetting = job.printMode === 'color' ? 'color' : 'monochrome';
      const sidesSetting = job.sides === 'double' ? 'duplexlong' : 'simplex';
      const safeCopies = Math.max(1, parseInt(job.copies, 10) || 1);
      
      let settings = `fit,${modeSetting},${sidesSetting},${safeCopies}x`;
      if (job.pageRange) {
        settings += `,${sanitizeCmdArg(job.pageRange)}`;
      }
      
      const cmd = `"${sumatraPath}" ${printer} -print-settings "${settings}" "${printablePath}"`;
      
      await new Promise((resolve, reject) => {
        exec(cmd, (err) => {
          if (err) reject(new Error(`SumatraPDF failed to print: ${err.message}`));
          else resolve();
        });
      });

      try {
        await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'spool_command_sent', printerId, printerName, daemonInstance });
      } catch (e) {}

      // Spooler acceptance check
      const normalizedLocalPath = path.resolve(printablePath).toLowerCase();
      let spoolerJob = null;
      
      for (let attempt = 0; attempt < 15; attempt++) {
        const jobs = await getSpoolerJobs(activePrinter);
        spoolerJob = jobs.find(j => {
          if (!j.DocumentName) return false;
          const spoolDocLower = j.DocumentName.toLowerCase();
          const spoolBasename = path.basename(spoolDocLower);
          const localBasename = path.basename(normalizedLocalPath);
          return spoolDocLower === normalizedLocalPath || spoolBasename === localBasename || spoolDocLower.includes(localBasename);
        });
        if (spoolerJob) break;
        await new Promise(r => setTimeout(r, 200));
      }

      if (spoolerJob) {
        try {
          await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'spooler_job_detected', printerId, printerName, daemonInstance });
        } catch (e) {}
        await monitorPrintJob(activePrinter, printablePath, totalPages, job, spoolerJob, daemonInstance);
      }
    }

    try {
      await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'completed', printerId, printerName, daemonInstance });
    } catch (e) {}

    await apiPost(`/api/jobs/${job.id}/status`, { status: 'completed', progressPercent: 100 });
    
    try { fs.unlinkSync(localPath); } catch {}
    if (printablePath !== localPath) {
      try { fs.unlinkSync(printablePath); } catch {}
    }
    
    lastPrintTime = new Date().toISOString();
    console.log(`  ✓ JOB COMPLETE: Token ${job.token} is ready.\n`);
    showNotification('Campus Print Hub', `Done: Job ${job.token} is ready!`);
  } catch (err) {
    console.error(`\n  ❌ JOB FAILED: Token ${job.token} | Error: ${err.message}\n`);
    
    const isHardwareError = err.message.includes('Printer Offline') || err.message.includes('Paper Empty');
    if (isHardwareError) {
      isQueuePaused = true;
      await apiPost(`/api/jobs/${job.id}/status`, { status: 'queued', progressPercent: 0 });
      showNotification('Campus Print Hub', `Paused: ${err.message}`);
      if (!recoveryActive) startRecoveryLoop();
    } else {
      await apiPost(`/api/jobs/${job.id}/status`, { status: 'failed', reason: err.message || 'Unknown printing error' });
      showNotification('Campus Print Hub', `Failed: Job ${job.token} - ${err.message}`);
    }
  } finally {
    activeJobToken = null;
  }
}

async function poll() {
  if (!cachedPrinterMapping.bwPrinterName && !cachedPrinterMapping.colorPrinterName) {
    return;
  }
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
        hasMore = false;
      }

      if (job && job.id) {
        await processJob(job);
      } else {
        hasMore = false;
      }
    }
  } catch (err) {
    console.error('  [Poll error]', err.message);
  } finally {
    busy = false;
  }
}

// SSE Connection
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
    },
    agent: false
  }, (res) => {
    if (res.statusCode !== 200) {
      setTimeout(connectSSE, 10000);
      return;
    }

    // Set 45s inactivity timeout on socket (server sends keep-alive every 15s)
    if (res.socket) {
      res.socket.setTimeout(45000);
      res.socket.on('timeout', () => {
        logToFile('[SSE] Socket timeout (45s inactivity). Reconnecting...');
        try { res.destroy(); } catch {}
        setTimeout(connectSSE, 3000);
      });
    }

    res.on('data', (chunk) => {
      // Reset socket timeout timer on receiving any chunk (including keep-alives)
      if (res.socket) {
        res.socket.setTimeout(45000);
      }
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.substring(5).trim());
            if (data.type === 'new_job') {
              poll();
            } else if (data.type === 'scan_printers' && data.shopId === config.shopId) {
              activeScanRequested = true;
              sendHeartbeat();
            } else if (data.type === 'shop_updated' && data.shop && data.shop.id === config.shopId) {
              refreshPrinterMapping();
            } else if (data.type === 'agent_control' && data.shopId === config.shopId) {
              if (data.action === 'GO_OFFLINE') {
                gracefulShutdown();
              }
            }
          } catch {}
        }
      }
    });

    res.on('end', () => {
      setTimeout(connectSSE, 5000);
    });
  });

  sseRequest.on('error', (err) => {
    logToFile(`[SSE Stream Error] ${err ? err.message : 'Unknown'}`);
    setTimeout(connectSSE, 10000);
  });
}

let activeScanRequested = true;

async function sendHeartbeat() {
  try {
    await refreshPrinterMapping();
    resolvedPrinterName = await resolvePrinterForJob({ printType: 'bw' });

    let printersCount = 0;
    let printersList = undefined;
    if (activeScanRequested) {
      const currentPrinters = await getInstalledPrinters();
      printersCount = currentPrinters.length;
      printersList = currentPrinters;
      activeScanRequested = false;
    }

    let printerStatus = 'unknown';
    if (!config.mockPrinter) {
      const status = await getPrinterStatus(resolvedPrinterName);
      if (status) {
        const isOffline = status.WorkOffline === true || 
                          status.PrinterStatus === 7 || 
                          status.PrinterStatus === '7' || 
                          status.PrinterStatus === 'Offline';
        printerStatus = isOffline ? 'offline' : 'online';
      }
    } else {
      printerStatus = 'online';
    }

    const hbPayload = {
      agentId: config.agentId || 'AGENT-001',
      shopId: config.shopId || 'tjohn_print',
      daemonVersion: config.daemonVersion || '1.0.0',
      protocolVersion: config.protocolVersion || '1.0.0',
      installedVersion: config.daemonVersion || '1.0.0',
      selectedPrinter: resolvedPrinterName || 'System Default',
      printerCount: printersCount,
      printers: printersList,
      printerStatus: printerStatus,
      queueLength: busy ? 1 : 0,
      currentJob: activeJobToken,
      lastPrintTime: lastPrintTime,
      agentUptime: Math.round(process.uptime()),
      windowsVersion: `${os.type()} ${os.release()}`,
      lastCommunication: new Date().toISOString()
    };

    const res = await apiPost('/api/agent/heartbeat', hbPayload);
    if (res && res.command === 'SHUTDOWN') {
      gracefulShutdown();
      return;
    }
  } catch (err) {
    console.error('  [Heartbeat Error]', err.message);
  }
}

function gracefulShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n  [SHUTDOWN] Starting graceful shutdown...');
  
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (pollTimer) clearInterval(pollTimer);
  if (sseRequest) {
    try { sseRequest.destroy(); } catch {}
  }
  
  const checkExit = async () => {
    if (busy) {
      console.log('  [SHUTDOWN] Spooler busy. Waiting for job completion...');
      setTimeout(checkExit, 1500);
    } else {
      console.log('  [SHUTDOWN] Spooler idle. Releasing print lock and notifying backend...');
      try {
        await apiPost('/api/agent/shutdown', {});
      } catch (e) {}
      try {
        if (fs.existsSync(LOCK_FILE)) {
          fs.unlinkSync(LOCK_FILE);
        }
      } catch (e) {}
      process.exit(0);
    }
  };
  checkExit();
}

// Watch for manual stop signal files from the bridge
setInterval(() => {
  const signalPath = path.join(__dirname, 'shutdown.signal');
  if (fs.existsSync(signalPath)) {
    console.log('  [SIGNAL] Shutdown signal file detected. Terminating...');
    try { fs.unlinkSync(signalPath); } catch (e) {}
    gracefulShutdown();
  }
}, 2000);

// --- REGISTRATION & HEARTBEAT SYSTEM ---
async function registerAgent() {
  const list = await getInstalledPrinters();
  const payload = {
    agentId: config.agentId,
    shopId: config.shopId,
    machineName: os.hostname() || 'SHOP-PC-01',
    printerName: cachedPrinterMapping.bwPrinterName || cachedPrinterMapping.colorPrinterName || 'System Default',
    daemonVersion: config.daemonVersion || '1.0.0',
    printers: list
  };
  logToFile(`Registering with backend...`);
  await apiPost('/api/agent/register', payload);
  isRegistered = true;
  logToFile(`Registration success`);
}

// --- MAIN STARTUP SEQUENCE ---
async function main() {
  logToFile('Main Startup Sequence Initiated');
  
  try {
    // 1. Read runtime.json if it exists (written by launcher bridge)
    const RUNTIME_PATH = path.join(__dirname, 'runtime.json');
    if (fs.existsSync(RUNTIME_PATH)) {
      try {
        const runtime = JSON.parse(fs.readFileSync(RUNTIME_PATH, 'utf-8'));
        logToFile(`[DIAGNOSTIC] runtime.json read. runtime.token exists: ${!!runtime.token}`);
        if (runtime.serverUrl) config.serverUrl = runtime.serverUrl;
        if (runtime.shopId) config.shopId = runtime.shopId;
        if (runtime.token) {
          logToFile(`[DIAGNOSTIC] runtime.token: "${runtime.token.substring(0, 20)}"`);
          config.token = runtime.token;
          logToFile(`[DIAGNOSTIC] config.token before persistence: "${config.token.substring(0, 20)}"`);
          try {
            logToFile(`[DIAGNOSTIC] Writing to config.json at ${CONFIG_PATH}...`);
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
            logToFile(`[DIAGNOSTIC] config.json write successful`);
          } catch (err) {
            logToFile(`[DIAGNOSTIC] config.json write failed with exception: ${err.message}`);
          }
          // Temporary Implementation (RC-Connection Milestone Only)
          // Erase the Shop Admin token from disk immediately to ensure it is never persisted beyond startup.
          delete runtime.token;
          try { fs.writeFileSync(RUNTIME_PATH, JSON.stringify(runtime, null, 2), 'utf-8'); } catch {}
        }
        logToFile(`Runtime loaded: ${config.serverUrl} / ${config.shopId}`);
      } catch (err) {
        logToFile(`Failed to read runtime.json: ${err.message}`);
      }
    }

    // 2. Generate persistent agentId inside config.json if missing
    if (!config.agentId || config.agentId === 'AGENT-001') {
      config.agentId = 'CP-AGENT-' + Math.random().toString(36).substring(2, 9).toUpperCase() + '-' + Math.random().toString(36).substring(2, 9).toUpperCase();
      try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
      } catch (err) {}
    }

    // 3. Ensure SumatraPDF is present
    logToFile(`Ensuring SumatraPDF...`);
    await ensureSumatraPDF();

    // 4. Load configured printer mappings from backend
    logToFile(`Refreshing mappings...`);
    await refreshPrinterMapping();

    // 5. Always call register (idempotent synchronization upsert)
    logToFile('Authentication started');
    await registerAgent();

    // 6. Perform initial heartbeat connection immediately
    if (process.env.CP_TEST_DISABLE_HEARTBEAT !== 'true') {
      logToFile(`Initial Heartbeat...`);
      await sendHeartbeat();

      // 7. Start heartbeat loop every 10 seconds
      heartbeatTimer = setInterval(sendHeartbeat, 10000);
      logToFile(`Heartbeat started`);
    } else {
      logToFile(`Heartbeat disabled via test flag`);
    }

  } catch (err) {
    logToFile(`STARTUP FAILED: ${err.message}`);
    // Cleanup and exit
    try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch (e) {}
    process.exit(1);
  }

  // --- RUNTIME POLLING LOOPS ---
  // Establish real-time SSE stream
  if (process.env.CP_TEST_DISABLE_SSE !== 'true') {
    connectSSE();
  } else {
    logToFile(`SSE stream connection disabled via test flag`);
  }
  
  // Backlog poll checks
  if (process.env.CP_TEST_DISABLE_POLLING !== 'true') {
    poll();
    pollTimer = setInterval(poll, 15000);
  } else {
    logToFile(`Backlog polling disabled via test flag`);
  }
}

main().catch((err) => {
  console.error('[CRITICAL RUNTIME ERROR]', err);
  process.exit(1);
});

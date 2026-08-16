const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const cp = require('child_process');
const os = require('os');

function resolveLocalRequire(relativePath) {
  const localPath = path.join(__dirname, relativePath);
  if (fs.existsSync(localPath)) {
    return localPath;
  }
  const parentPath = path.join(__dirname, '..', relativePath);
  if (fs.existsSync(parentPath)) {
    return parentPath;
  }
  return relativePath;
}

const printerManager = require(resolveLocalRequire('./PrinterManager/index.cjs'));

const logFile = path.join(__dirname, 'logs', 'client.log');
if (!fs.existsSync(path.dirname(logFile))) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
}
const diagLogFile = path.join(__dirname, 'logs', 'diagnostic_execution.log');
if (!fs.existsSync(path.dirname(diagLogFile))) {
  try { fs.mkdirSync(path.dirname(diagLogFile), { recursive: true }); } catch (e) {}
}

function diagLog(msg) {
  const entry = `[DIAGNOSTIC] [${new Date().toISOString()}] PID:${process.pid} PPID:${process.ppid} | ${msg}\n`;
  try { fs.appendFileSync(diagLogFile, entry); } catch (e) {}
  console.log(entry.trim());
}

diagLog(`CLIENT EXECUTION STARTED | Argv: ${JSON.stringify(process.argv)} | Cwd: ${process.cwd()} | Node: ${process.version}`);

process.on('exit', (code) => {
  diagLog(`CLIENT PROCESS EXITING | Code: ${code}`);
});

// --- CONSOLIDATED DIAGNOSTIC GENERATOR ---
const DIAGNOSTIC_DIR = path.join(__dirname, 'diagnostics');
const DIAGNOSTIC_REPORT_PATH = path.join(DIAGNOSTIC_DIR, 'diagnostics_report.txt');
if (!fs.existsSync(DIAGNOSTIC_DIR)) {
  try { fs.mkdirSync(DIAGNOSTIC_DIR, { recursive: true }); } catch (e) {}
}

const diagState = {
  agentVersion: '1.0.0',
  nodeVersion: process.version,
  windowsVersion: `${os.type()} ${os.release()} (${os.arch()})`,
  machineName: os.hostname() || 'UNKNOWN',
  serverUrl: '',
  shopId: '',
  pid: process.pid,
  ppid: process.ppid,
  startupStages: [],
  networkErrors: [],
  refreshPrinterMappingTimeMs: 0,
  registration: { sent: false, httpStatus: null, responseBody: null },
  heartbeat: { loopStarted: false, firstSent: false, httpStatus: null, responseBody: null },
  sse: { connected: false, status: 'Not Connected' },
  exceptions: [],
  rejections: []
};

function writeDiagnosticReport() {
  try {
    const report = [];
    report.push('================================================================');
    report.push('         CAMPUS PRINT AGENT — CONSOLIDATED DIAGNOSTIC REPORT     ');
    report.push('================================================================');
    report.push(`Generated At            : ${new Date().toISOString()}`);
    report.push(`Agent Version           : ${diagState.agentVersion}`);
    report.push(`Node.js Version         : ${diagState.nodeVersion}`);
    report.push(`Windows OS Version      : ${diagState.windowsVersion}`);
    report.push(`Machine Name (Hostname) : ${diagState.machineName}`);
    report.push(`Target Server URL       : ${config.serverUrl || diagState.serverUrl || 'Unset'}`);
    report.push(`Shop ID                 : ${config.shopId || diagState.shopId || 'Unset'}`);
    report.push(`Daemon PID              : ${diagState.pid}`);
    report.push(`Parent PID (PPID)       : ${diagState.ppid}`);
    report.push('----------------------------------------------------------------');
    report.push('1. CONFIGURATION & RUNTIME FILES:');
    
    const RUNTIME_PATH = path.join(__dirname, 'runtime.json');
    const CONFIG_PATH = path.join(__dirname, 'config.json');

    try {
      const runtimeRaw = fs.existsSync(RUNTIME_PATH) ? fs.readFileSync(RUNTIME_PATH, 'utf8') : 'FILE NOT FOUND';
      report.push(`  runtime.json: ${runtimeRaw.trim()}`);
    } catch (e) { report.push(`  runtime.json error: ${e.message}`); }
    
    try {
      const configRaw = fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {};
      if (configRaw.token) configRaw.token = configRaw.token.substring(0, 10) + '...[MASKED]';
      report.push(`  config.json : ${JSON.stringify(configRaw, null, 2)}`);
    } catch (e) { report.push(`  config.json error: ${e.message}`); }

    report.push('----------------------------------------------------------------');
    report.push('2. 10-STAGE STARTUP PROGRESSION:');
    if (diagState.startupStages.length === 0) {
      report.push('  No startup stages recorded yet.');
    } else {
      diagState.startupStages.forEach(s => report.push(`  ${s}`));
    }

    report.push('----------------------------------------------------------------');
    report.push('3. REGISTRATION STATUS:');
    report.push(`  Request Sent        : ${diagState.registration.sent}`);
    report.push(`  HTTP Status Code    : ${diagState.registration.httpStatus || 'N/A'}`);
    report.push(`  Response Payload    : ${JSON.stringify(diagState.registration.responseBody || {})}`);

    report.push('----------------------------------------------------------------');
    report.push('4. HEARTBEAT SYSTEM STATUS:');
    report.push(`  Heartbeat Loop Started : ${diagState.heartbeat.loopStarted}`);
    report.push(`  First Heartbeat Sent   : ${diagState.heartbeat.firstSent}`);
    report.push(`  HTTP Status Code       : ${diagState.heartbeat.httpStatus || 'N/A'}`);
    report.push(`  Response Payload       : ${JSON.stringify(diagState.heartbeat.responseBody || {})}`);

    report.push('----------------------------------------------------------------');
    report.push('5. REAL-TIME STREAM (SSE) STATUS:');
    report.push(`  SSE Stream Connected   : ${diagState.sse.connected}`);
    report.push(`  SSE Stream Status      : ${diagState.sse.status}`);

    report.push('----------------------------------------------------------------');
    report.push('6. PRINTER DISCOVERY BENCHMARKS:');
    report.push(`  refreshPrinterMapping() Total Time : ${diagState.refreshPrinterMappingTimeMs} ms`);

    report.push('----------------------------------------------------------------');
    report.push('7. NETWORK & PROTOCOL ERRORS:');
    if (diagState.networkErrors.length === 0) {
      report.push('  None recorded.');
    } else {
      diagState.networkErrors.forEach(err => report.push(`  [ERROR] ${err}`));
    }

    report.push('----------------------------------------------------------------');
    report.push('8. UNCAUGHT EXCEPTIONS & UNHANDLED REJECTIONS:');
    if (diagState.exceptions.length === 0 && diagState.rejections.length === 0) {
      report.push('  None recorded.');
    } else {
      diagState.exceptions.forEach(e => report.push(`  [EXCEPTION] ${e}`));
      diagState.rejections.forEach(r => report.push(`  [REJECTION] ${r}`));
    }

    report.push('----------------------------------------------------------------');
    report.push('9. LAUNCHER LOG (TAIL 30 LINES):');
    try {
      const launcherLogPath = path.join(__dirname, 'logs', 'launcher.log');
      if (fs.existsSync(launcherLogPath)) {
        const lines = fs.readFileSync(launcherLogPath, 'utf8').trim().split(/\r?\n/);
        lines.slice(-30).forEach(l => report.push(`  ${l}`));
      } else { report.push('  launcher.log file not found'); }
    } catch (e) { report.push(`  Error reading launcher.log: ${e.message}`); }

    report.push('----------------------------------------------------------------');
    report.push('10. CLIENT LOG (TAIL 40 LINES):');
    try {
      const clientLogPath = path.join(__dirname, 'logs', 'client.log');
      if (fs.existsSync(clientLogPath)) {
        const lines = fs.readFileSync(clientLogPath, 'utf8').trim().split(/\r?\n/);
        lines.slice(-40).forEach(l => report.push(`  ${l}`));
      } else { report.push('  client.log file not found'); }
    } catch (e) { report.push(`  Error reading client.log: ${e.message}`); }

    report.push('================================================================');
    report.push('                     END OF DIAGNOSTIC REPORT                   ');
    report.push('================================================================\n');

    fs.writeFileSync(DIAGNOSTIC_REPORT_PATH, report.join('\n'), 'utf8');
  } catch (err) {
    console.error('Failed to write diagnostic report:', err.message);
  }
}

process.on('uncaughtException', (err) => {
  const msg = err ? err.stack || err.message || String(err) : 'Unknown error';
  diagLog(`CLIENT UNCAUGHT EXCEPTION: ${msg}`);
  diagState.exceptions.push(`[${new Date().toISOString()}] ${msg}`);
  writeDiagnosticReport();
});

process.on('unhandledRejection', (reason, promise) => {
  const msg = reason ? reason.stack || reason.message || String(reason) : 'Unknown rejection';
  diagLog(`CLIENT UNHANDLED REJECTION: ${msg}`);
  diagState.rejections.push(`[${new Date().toISOString()}] ${msg}`);
  writeDiagnosticReport();
});

function logToFile(msg) {
  const timestamp = new Date().toLocaleTimeString();
  diagLog(msg);
  const line = `[Client] [${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(logFile, line); } catch(e) {}
  
  if (msg.includes('[')) {
    diagState.startupStages.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
  }
  writeDiagnosticReport();
}

logToFile('Campus Print Agent Daemon Started');

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

// --- P1 PREFETCH CACHE & PERFORMANCE INSTRUMENTATION ---
const prefetchedJobs = new Map();
const activePrefetches = new Set();
let lastSumatraExitTime = 0;

async function prefetchNextJob(nextJob, currentJob) {
  if (!nextJob || !nextJob.id || !nextJob.serverFilePath) return;

  // 1. Customer Order Boundary Check
  if (currentJob && currentJob.orderId && nextJob.orderId !== currentJob.orderId) {
    logToFile(`[PREFETCH SKIP] Customer boundary mismatch: nextJob.orderId (${nextJob.orderId}) !== currentJob.orderId (${currentJob.orderId})`);
    return;
  }

  // 2. Deduplication & In-Flight Check
  if (prefetchedJobs.has(nextJob.id) || activePrefetches.has(nextJob.id)) {
    logToFile(`[PREFETCH SKIP] Job ${nextJob.id} is already prefetched or downloading.`);
    return;
  }

  // 3. Resource Limit: Max 1 prefetched file on disk. Clean up previous prefetch cache entries if any.
  for (const [id, item] of prefetchedJobs.entries()) {
    logToFile(`[PREFETCH CLEANUP] Evicting stale prefetched file for job ${id}`);
    try { if (fs.existsSync(item.localPath)) fs.unlinkSync(item.localPath); } catch {}
    if (item.printablePath !== item.localPath) {
      try { if (fs.existsSync(item.printablePath)) fs.unlinkSync(item.printablePath); } catch {}
    }
    prefetchedJobs.delete(id);
  }

  activePrefetches.add(nextJob.id);
  const tPrefetchStart = Date.now();
  logToFile(`[PREFETCH START] Pre-fetching next job ${nextJob.token} (${nextJob.fileName}) for order ${nextJob.orderId}`);

  try {
    const safeFileName = sanitizeCmdArg(path.basename(nextJob.fileName));
    const prefetchLocalPath = path.join(TEMP_DIR, 'prefetch-' + nextJob.id + '-' + safeFileName);

    await downloadFile(nextJob.serverFilePath, prefetchLocalPath);

    if (!fs.existsSync(prefetchLocalPath) || fs.statSync(prefetchLocalPath).size === 0) {
      throw new Error('Downloaded prefetch file is zero bytes or missing');
    }

    const printablePath = await convertToPdf(prefetchLocalPath);
    const tPrefetchEnd = Date.now();
    const durationMs = tPrefetchEnd - tPrefetchStart;

    logToFile(`[PREFETCH COMPLETE] Job ${nextJob.token} prefetched in ${durationMs}ms | Local Path: ${prefetchLocalPath}`);

    prefetchedJobs.set(nextJob.id, {
      localPath: prefetchLocalPath,
      printablePath: printablePath,
      orderId: nextJob.orderId,
      downloadedAt: tPrefetchEnd,
      job: nextJob
    });
  } catch (err) {
    // Prefetch failure MUST NOT fail current job or disrupt printing
    logToFile(`[PREFETCH FAILED] Job ${nextJob.token} prefetch error: ${err.message}. Fallback to standard download upon execution.`);
  } finally {
    activePrefetches.delete(nextJob.id);
  }
}

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
    logToFile(`\n[DIAGNOSTIC REQUEST]`);
    logToFile(`SERVER URL = ${config.serverUrl}`);
    logToFile(`GET = ${url.href}`);
    logToFile(`HTTP METHOD = GET`);
    
    const client = getHttpClient(url);
    client.get(url, { 
      timeout: 10000, 
      headers: { 'Authorization': getAuthHeader() },
      agent: false
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        logToFile(`[DIAGNOSTIC RESPONSE]`);
        logToFile(`GET = ${url.href}`);
        logToFile(`STATUS CODE = ${res.statusCode}`);
        logToFile(`RESPONSE BODY = ${data}`);
        if (res.statusCode === 404) return reject(new Error('404'));
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    }).on('error', (err) => {
      logToFile(`[DIAGNOSTIC ERROR]`);
      logToFile(`GET = ${url.href}`);
      logToFile(`ERROR = ${err.message}`);
      reject(err);
    }).on('timeout', function() { 
      this.destroy(); 
      logToFile(`[DIAGNOSTIC TIMEOUT]`);
      logToFile(`GET = ${url.href}`);
      reject(new Error('Timeout')); 
    });
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
    logToFile(`\n[DIAGNOSTIC REQUEST]`);
    logToFile(`SERVER URL = ${config.serverUrl}`);
    logToFile(`POST = ${url.href}`);
    logToFile(`HTTP METHOD = POST`);
    logToFile(`REQUEST BODY = ${payload}`);
    
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
        logToFile(`[DIAGNOSTIC RESPONSE]`);
        logToFile(`POST = ${url.href}`);
        logToFile(`STATUS CODE = ${res.statusCode}`);
        logToFile(`RESPONSE BODY = ${data}`);
        if (res.statusCode >= 400) {
          logToFile(`HTTP POST ${endpoint} Failed: HTTP ${res.statusCode} - ${data}`);
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', (err) => {
      logToFile(`[DIAGNOSTIC ERROR]`);
      logToFile(`POST = ${url.href}`);
      logToFile(`ERROR = ${err.message}`);
      reject(err);
    });
    req.on('timeout', () => { 
      logToFile(`[DIAGNOSTIC TIMEOUT]`);
      logToFile(`POST = ${url.href}`);
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
    logToFile(`\n[DIAGNOSTIC REQUEST]`);
    logToFile(`SERVER URL = ${config.serverUrl}`);
    logToFile(`GET = ${url.href}`);
    logToFile(`HTTP METHOD = GET (File Download)`);
    
    const client = getHttpClient(url);
    client.get(url, { 
      timeout: 30000,
      headers: { 'Authorization': getAuthHeader() },
      agent: false
    }, (res) => {
      logToFile(`[DIAGNOSTIC RESPONSE]`);
      logToFile(`GET = ${url.href}`);
      logToFile(`STATUS CODE = ${res.statusCode}`);
      if (res.statusCode !== 200) { 
        res.resume(); 
        return reject(new Error(`HTTP ${res.statusCode}`)); 
      }
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', () => ws.close(resolve));
      ws.on('error', reject);
    }).on('error', (err) => {
      logToFile(`[DIAGNOSTIC ERROR]`);
      logToFile(`GET = ${url.href}`);
      logToFile(`ERROR = ${err.message}`);
      reject(err);
    }).on('timeout', function() { 
      this.destroy(); 
      logToFile(`[DIAGNOSTIC TIMEOUT]`);
      logToFile(`GET = ${url.href}`);
      reject(new Error('Download timeout')); 
    });
  });
}

function convertToPdf(localPath) {
  return new Promise((resolve) => {
    const ext = path.extname(localPath).toLowerCase();
    if (ext === '.pdf') {
      return resolve(localPath);
    }
    if (ext === '.pdf') return resolve(localPath);

    const pdfPath = localPath.replace(new RegExp(ext + '$', 'i'), '.pdf');
    if (fs.existsSync(pdfPath)) return resolve(pdfPath);

    console.log(`  [CONVERT] Converting ${path.basename(localPath)} to PDF...`);

    let script = '';
    if (ext === '.doc' || ext === '.docx') {
      script = `
        $docPath = $args[0]
        $pdfPath = $args[1]
        $word = New-Object -ComObject Word.Application
        $word.Visible = $false
        try {
          $doc = $word.Documents.Open($docPath)
          $doc.SaveAs([ref] $pdfPath, [ref] 17)
          $doc.Close()
        } finally {
          $word.Quit()
          [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
        }
      `;
    } else if (ext === '.ppt' || ext === '.pptx') {
      script = `
        $pptPath = $args[0]
        $pdfPath = $args[1]
        $ppt = New-Object -ComObject PowerPoint.Application
        try {
          $pres = $ppt.Presentations.Open($pptPath, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
          $pres.SaveAs($pdfPath, 32)
          $pres.Close()
        } finally {
          $ppt.Quit()
          [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
        }
      `;
    } else {
      return resolve(localPath);
    }

    const absoluteLocalPath = path.resolve(localPath);
    const absolutePdfPath = path.resolve(pdfPath);

    const child = cp.spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
      absoluteLocalPath,
      absolutePdfPath
    ], { windowsHide: true });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`  [CONVERT] Conversion failed with exit code: ${code}`);
        return resolve(localPath);
      }
      if (fs.existsSync(pdfPath)) {
        console.log(`  [CONVERT] Conversion successful: ${path.basename(pdfPath)}`);
        return resolve(pdfPath);
      }
      return resolve(localPath);
    });

    child.on('error', (err) => {
      console.error(`  [CONVERT] Conversion spawn error: ${err.message}`);
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

function runPowershell(script, args = [], timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let finalScript = script;
    if (Array.isArray(args) && args.length > 0) {
      args.forEach((arg, idx) => {
        const safeArg = String(arg || '').replace(/'/g, "''");
        finalScript = finalScript.replace(new RegExp(`\\$args\\[${idx}\\]`, 'g'), `'${safeArg}'`);
      });
    }
    const child = cp.spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      finalScript
    ], { windowsHide: true });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      reject(new Error('Powershell execution timeout'));
    }, timeoutMs);
    
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Powershell exited with code ${code}. Stderr: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
    
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function getDefaultPrinter() {
  return new Promise(async (resolve) => {
    const script = `Get-CimInstance -ClassName Win32_Printer | Where-Object Default -eq $true | Select-Object -ExpandProperty Name`;
    try {
      const out = await runPowershell(script);
      if (out.trim()) return resolve(out.trim());
    } catch (_) {}
    
    const fallbackScript = `(Get-Printer | Where-Object UseDefault -eq $true).Name`;
    try {
      const out = await runPowershell(fallbackScript);
      resolve(out.trim());
    } catch (_) {
      resolve('');
    }
  });
}

function getInstalledPrinters() {
  return new Promise(async (resolve) => {
    if (config.mockPrinter) {
      return resolve(['BwMockPrinter', 'ColorMockPrinter']);
    }
    const script = `Get-CimInstance -ClassName Win32_Printer | Where-Object PortName -notlike 'PORTPROMPT*' | Where-Object PortName -notlike 'nul*' | Where-Object PortName -notlike 'Microsoft*' | Where-Object Name -notlike '*PDF*' | Where-Object Name -notlike '*XPS*' | Where-Object Name -notlike '*OneNote*' | Where-Object Name -notlike '*Fax*' | Where-Object Name -notlike '*Send to*' | Where-Object Name -notlike '*AnyDesk*' | Where-Object Name -notlike '*PDF24*' | Select-Object -ExpandProperty Name`;
    try {
      const out = await runPowershell(script, [], 3000);
      if (out.trim()) {
        return resolve(out.split(/\r?\n/).map(p => p.trim()).filter(Boolean));
      }
    } catch (err) {
      logToFile(`[WARN] Primary printer query failed: ${err.message}`);
    }
    
    const fallbackScript = `Get-Printer | Where-Object PortName -notlike 'PORTPROMPT*' | Where-Object PortName -notlike 'nul*' | Where-Object PortName -notlike 'Microsoft*' | Where-Object Name -notlike '*PDF*' | Where-Object Name -notlike '*XPS*' | Where-Object Name -notlike '*OneNote*' | Where-Object Name -notlike '*Fax*' | Where-Object Name -notlike '*Send to*' | Where-Object Name -notlike '*AnyDesk*' | Where-Object Name -notlike '*PDF24*' | Select-Object -ExpandProperty Name`;
    try {
      const out = await runPowershell(fallbackScript, [], 3000);
      resolve(out.split(/\r?\n/).map(p => p.trim()).filter(Boolean));
    } catch (err) {
      logToFile(`[WARN] Fallback printer query failed: ${err.message}`);
      resolve([]);
    }
  });
}

function getPrinterStatus(printerName) {
  return new Promise(async (resolve) => {
    if (!printerName) return resolve(null);
    const script = `Get-CimInstance -ClassName Win32_Printer | Where-Object Name -eq $args[0] | Select-Object PrinterStatus, WorkOffline, DetectedErrorState, ExtendedPrinterStatus | ConvertTo-Json`;
    try {
      const out = await runPowershell(script, [printerName]);
      if (out.trim()) return resolve(JSON.parse(out));
    } catch (_) {}
    
    const fallbackScript = `Get-Printer -Name $args[0] | Select-Object PrinterStatus, WorkOffline | ConvertTo-Json`;
    try {
      const out = await runPowershell(fallbackScript, [printerName]);
      if (out.trim()) return resolve(JSON.parse(out));
    } catch (_) {}
    
    resolve(null);
  });
}

function getSpoolerJobs(printerName) {
  return new Promise(async (resolve) => {
    if (!printerName) return resolve([]);
    const script = `Get-PrintJob -PrinterName $args[0] | Select-Object Id, DocumentName, JobStatus, PagesPrinted, TotalPages | ConvertTo-Json`;
    try {
      const out = await runPowershell(script, [printerName]);
      if (!out.trim()) return resolve([]);
      const parsed = JSON.parse(out);
      if (Array.isArray(parsed)) resolve(parsed);
      else if (parsed && typeof parsed === 'object') resolve([parsed]);
      else resolve([]);
    } catch (_) {
      resolve([]);
    }
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
          processNextDispatchedJob();
          poll();
        }
      }
    } catch (e) {}
  }, 5000);
}

async function processJob(job) {
  logToFile(`[DIAG][processJob] Started | jobId=${job.id} token=${job.token} fileName=${job.fileName}`);
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
    const defaultLocalPath = path.join(TEMP_DIR, job.id + '-' + safeFileName);
    let localPath = defaultLocalPath;
    let printablePath = null;
    let prefetchHit = false;

    // Check P1 prefetch cache
    if (prefetchedJobs.has(job.id)) {
      const cached = prefetchedJobs.get(job.id);
      prefetchedJobs.delete(job.id);

      if (cached && fs.existsSync(cached.localPath) && fs.statSync(cached.localPath).size > 0) {
        prefetchHit = true;
        localPath = cached.localPath;
        printablePath = cached.printablePath;
        logToFile(`[PREFETCH HIT] Job ${job.token} (${job.fileName}) ready locally! Network download skipped.`);
        try {
          await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'downloaded', printerId, printerName, daemonInstance });
        } catch (e) {}
      } else {
        logToFile(`[PREFETCH MISS] Cached file for ${job.token} missing or invalid. Falling back to normal download.`);
      }
    }

    if (!prefetchHit) {
      logToFile(`[PREFETCH MISS] Downloading file for ${job.token}...`);
      console.log('  Downloading file...');
      const tDownloadStart = Date.now();
      logToFile(`[PERF][T12] PDF download started at ${tDownloadStart} (${new Date(tDownloadStart).toISOString()})`);
      await downloadFile(job.serverFilePath, localPath);
      const tDownloadEnd = Date.now();
      logToFile(`[PERF][T13] PDF download completed at ${tDownloadEnd} (${new Date(tDownloadEnd).toISOString()}) — duration: ${tDownloadEnd - tDownloadStart}ms`);
      logToFile(`[DOWNLOAD END] Job ${job.token} downloaded in ${tDownloadEnd - tDownloadStart}ms`);
      console.log('  Download complete.');

      try {
        await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'downloaded', printerId, printerName, daemonInstance });
      } catch (e) {
        console.error('  [Telemetry Error] Failed timeline downloaded:', e.message);
      }

      printablePath = await convertToPdf(localPath);
    } else {
      const t13Hit = Date.now();
      logToFile(`[PERF][T12/T13 HIT] Prefetch hit — PDF download skipped at ${t13Hit}`);
    }

    // Trigger N+1 background prefetch for next job in order (if present and matching customer order)
    if (job._nextJob) {
      prefetchNextJob(job._nextJob, job).catch(e => {
        logToFile(`[PREFETCH ERROR] Background prefetch error: ${e.message}`);
      });
    }

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

      const modeSetting = job.printMode === 'color' ? 'color' : 'monochrome';
      const sidesSetting = job.sides === 'double' ? 'duplexlong' : 'simplex';
      const safeCopies = Math.max(1, parseInt(job.copies, 10) || 1);
      
      let settings = `fit,${modeSetting},${sidesSetting},${safeCopies}x`;
      if (job.pageRange) {
        settings += `,${sanitizeCmdArg(job.pageRange)}`;
      }
      
      const spawnArgs = [
        '-print-to', activePrinter,
        '-print-settings', settings,
        printablePath
      ];
      
      const tSumatraStart = Date.now();
      logToFile(`[PERF][T14] SumatraPDF spawn started at ${tSumatraStart} (${new Date(tSumatraStart).toISOString()}) for job ${job.token}`);
      logToFile(`[PRINT START] Job ${job.token} sending to printer spooler at ${tSumatraStart}`);

      if (lastSumatraExitTime > 0) {
        const interFileGap = tSumatraStart - lastSumatraExitTime;
        logToFile(`[PERF METRIC] INTER_FILE_GAP = ${interFileGap}ms (Previous Sumatra exit -> Current Sumatra start for job ${job.token})`);
      }

      console.log(`  [spool] Executing: "${sumatraPath}" ${spawnArgs.join(' ')}`);
      
      await new Promise((resolve, reject) => {
        const child = cp.spawn(sumatraPath, spawnArgs, { windowsHide: true });
        let stderr = '';
        child.stderr.on('data', (data) => { stderr += data; });
        child.on('error', (err) => {
          reject(new Error(`SumatraPDF failed to spawn: ${err.message}`));
        });
        child.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`SumatraPDF print failed with code ${code}. Stderr: ${stderr}`));
          } else {
            resolve();
          }
        });
      });

      const tSumatraExit = Date.now();
      lastSumatraExitTime = tSumatraExit;
      logToFile(`[PERF][T15] SumatraPDF process exited at ${tSumatraExit} (${new Date(tSumatraExit).toISOString()}) — duration: ${tSumatraExit - tSumatraStart}ms`);
      logToFile(`[SUMATRA EXIT] Job ${job.token} SumatraPDF process exited in ${tSumatraExit - tSumatraStart}ms`);

      try {
        await apiPost(`/api/jobs/${job.id}/timeline`, { stage: 'spool_command_sent', printerId, printerName, daemonInstance });
      } catch (e) {}

      // Spooler acceptance check
      const normalizedLocalPath = path.resolve(printablePath).toLowerCase();
      let spoolerJob = null;
      
      for (let attempt = 0; attempt < 15; attempt++) {
        const jobs = await getSpoolerJobs(activePrinter);
        if (jobs.length > 0) {
          spoolerJob = jobs.find(j => {
            if (!j.DocumentName) return false;
            const spoolDocLower = j.DocumentName.toLowerCase();
            const spoolBasename = path.basename(spoolDocLower);
            const localBasename = path.basename(normalizedLocalPath);
            return spoolDocLower === normalizedLocalPath || spoolBasename === localBasename || spoolDocLower.includes(localBasename);
          }) || jobs[jobs.length - 1];
        }
        if (spoolerJob) break;
        await new Promise(r => setTimeout(r, 200));
      }

      if (spoolerJob) {
        const t16 = Date.now();
        logToFile(`[PERF][T16] Windows Print Spooler job detected (Spooler ID ${spoolerJob.Id}) at ${t16} (${new Date(t16).toISOString()})`);
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
    logToFile(`[DIAG][processJob] Finished successfully | jobId=${job.id} token=${job.token}`);
    console.log(`  ✓ JOB COMPLETE: Token ${job.token} is ready.\n`);
    showNotification('Campus Print Hub', `Done: Job ${job.token} is ready!`);
  } catch (err) {
    logToFile(`[DIAG][processJob] Failed | jobId=${job.id} token=${job.token} error=${err.message}`);
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
    logToFile(`[DIAG][processJob] finally — busy will be cleared by .finally() chain or poll()`);
  }
}

const pendingDispatchedJobs = [];

function enqueueAndProcessDispatchedJob(job, nextJob) {
  if (job && job.id) {
    if (nextJob) {
      job._nextJob = nextJob;
    }
    if (!pendingDispatchedJobs.some(j => j.id === job.id)) {
      pendingDispatchedJobs.push(job);
      const t10 = Date.now();
      logToFile(`[PERF][T10] Agent enqueued job ${job.token} (id=${job.id}) at ${t10} (${new Date(t10).toISOString()})`);
      logToFile(`[DISPATCH QUEUE] Enqueued job ${job.token} (${job.fileName}) | Total queued: ${pendingDispatchedJobs.length}`);
    }
  }
  processNextDispatchedJob();
}

async function processNextDispatchedJob() {
  if (busy || isQueuePaused || pendingDispatchedJobs.length === 0) return;
  busy = true;
  const job = pendingDispatchedJobs.shift();
  const t11 = Date.now();
  logToFile(`[PERF][T11] Agent dequeued job ${job.token} and starting processJob() at ${t11} (${new Date(t11).toISOString()})`);
  logToFile(`[DISPATCH QUEUE] Dequeued job ${job.token} (${job.fileName}) for execution | Remaining: ${pendingDispatchedJobs.length}`);
  try {
    await processJob(job);
  } catch (err) {
    logToFile(`[JOB ERROR] ${err.message}`);
  } finally {
    busy = false;
    setTimeout(processNextDispatchedJob, 50);
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
  streamUrl.searchParams.set('agentId', config.agentId);
  streamUrl.searchParams.set('shopId', config.shopId);
  streamUrl.searchParams.set('protocolVersion', 'v2');
  logToFile(`\n[DIAGNOSTIC REQUEST]`);
  logToFile(`SERVER URL = ${config.serverUrl}`);
  logToFile(`GET = ${streamUrl.href}`);
  logToFile(`HTTP METHOD = GET (SSE Stream v2)`);
  
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
    logToFile(`[DIAGNOSTIC RESPONSE]`);
    logToFile(`GET = ${streamUrl.href}`);
    logToFile(`STATUS CODE = ${res.statusCode}`);
    
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
            if (data.type === 'dispatch_job' && data.job) {
              const t9 = Date.now();
              logToFile(`[PERF][T9] Agent received SSE dispatch_job for jobId=${data.job.id} at ${t9} (${new Date(t9).toISOString()})`);
              // Server-push dispatch: backend has pre-claimed this job (includes optional nextJob for P1 prefetch)
              logToFile(`[DISPATCH] Received job: ${data.job.token} — ${data.job.fileName} (nextJob: ${data.nextJob?.token || 'none'})`);
              logToFile(`[DIAG][SSE] dispatch_job received | jobId=${data.job.id} token=${data.job.token} nextJobId=${data.nextJob?.id || 'none'}`);
              logToFile(`[DIAG][SSE] Agent state | busy=${busy} paused=${isQueuePaused}`);
              if (!isQueuePaused) {
                enqueueAndProcessDispatchedJob(data.job, data.nextJob);
              } else {
                logToFile(`[DISPATCH] Ignored due to queue paused`);
              }
            } else if (data.type === 'new_job') {
              poll();
            } else if (data.type === 'scan_printers' && data.shopId === config.shopId) {
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
    logToFile(`[DIAGNOSTIC ERROR]`);
    logToFile(`GET = ${streamUrl.href}`);
    logToFile(`ERROR = ${err ? err.message : 'Unknown'}`);
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

    let printerState = null;
    try {
      printerState = printerManager.getState();
    } catch (_) {}

    if (!printerState) {
      const { createPrinterState } = require(resolveLocalRequire('./PrinterManager/models/PrinterState.cjs'));
      printerState = createPrinterState({
        printerName: resolvedPrinterName || 'System Default',
        provider: 'none',
        status: 'unknown',
        reachable: false,
      });
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
      lastCommunication: new Date().toISOString(),
      printerIntelligence: printerState
    };

    const res = await apiPost('/api/agent/heartbeat', hbPayload);
    if (res && res.command === 'SHUTDOWN') {
      gracefulShutdown();
      return;
    }
  } catch (err) {
    console.error('  [Heartbeat Error]', err.message);
    if (err.message && (err.message.includes('404') || err.message.includes('not registered'))) {
      console.log('  [HEARTBEAT RECOVERY] Backend restart detected. Re-synchronizing registration...');
      try {
        await registerAgent();
      } catch (regErr) {
        console.error('  [Registration Recovery Failed]', regErr.message);
      }
    }
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
  logToFile('[6/10] Registration request sent');
  const list = await getInstalledPrinters();
  const payload = {
    agentId: config.agentId,
    shopId: config.shopId,
    machineName: os.hostname() || 'SHOP-PC-01',
    printerName: cachedPrinterMapping.bwPrinterName || cachedPrinterMapping.colorPrinterName || 'System Default',
    daemonVersion: config.daemonVersion || '1.0.0',
    printers: list
  };
  await apiPost('/api/agent/register', payload);
  isRegistered = true;
  logToFile('[7/10] Registration acknowledged');
  logToFile('Registration success');
}

// --- MAIN STARTUP SEQUENCE ---
async function main() {
  logToFile('[1/10] Agent launched');
  console.log('\n==============================================================');
  console.log('             CAMPUS PRINT AGENT — LIVE LOG CONSOLE            ');
  console.log('==============================================================');
  console.log(`  Shop ID : ${config.shopId}`);
  console.log(`  Server  : ${config.serverUrl}`);
  console.log('  Status  : CONNECTING TO CAMPUS PRINT HUB...');
  console.log('  Notice  : Keep this window open while taking print requests.');
  console.log('            Click GO OFFLINE in Admin Console to close.');
  console.log('==============================================================\n');

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
          try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
          } catch (err) {
            logToFile(`[DIAGNOSTIC] config.json write failed: ${err.message}`);
          }
          delete runtime.token;
          try { fs.writeFileSync(RUNTIME_PATH, JSON.stringify(runtime, null, 2), 'utf-8'); } catch {}
        }
        logToFile('[2/10] runtime.json loaded');
        logToFile(`Runtime loaded: ${config.serverUrl} / ${config.shopId}`);
      } catch (err) {
        logToFile(`Failed to read runtime.json: ${err.message}`);
      }
    }

    if (!config.serverUrl || !config.shopId) {
      logToFile('[ERROR] Configuration invalid: Missing serverUrl or shopId');
      process.exit(1);
    }
    logToFile('[3/10] Configuration validated');

    // 2. Generate persistent agentId inside config.json if missing
    if (!config.agentId || config.agentId === 'AGENT-001') {
      config.agentId = 'CP-AGENT-' + Math.random().toString(36).substring(2, 9).toUpperCase() + '-' + Math.random().toString(36).substring(2, 9).toUpperCase();
      try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
      } catch (err) {}
    }

    // Check backend reachability
    try {
      await apiGet('/api/shops/' + config.shopId);
      logToFile('[4/10] Backend reachable');
    } catch (e) {
      logToFile(`[4/10 WARN] Backend reachability test failed: ${e.message}`);
    }

    // 3. Ensure SumatraPDF is present
    logToFile(`Ensuring SumatraPDF...`);
    await ensureSumatraPDF();

    // 4. Load configured printer mappings from backend
    logToFile(`Refreshing mappings...`);
    await refreshPrinterMapping();

    // 5. Always call register (idempotent synchronization upsert)
    logToFile('[5/10] Authentication successful');
    await registerAgent();

    // Initialize PrinterManager
    logToFile('[PrinterManager] Initializing printer intelligence layer...');
    await printerManager.init({
      printerName: config.printerName || '',
      mockMode: config.mockPrinter || false
    });

    // 6. Perform initial heartbeat connection immediately
    if (process.env.CP_TEST_DISABLE_HEARTBEAT !== 'true') {
      logToFile('[8/10] Initial heartbeat sent');
      await sendHeartbeat();
      logToFile('[9/10] Heartbeat acknowledged by backend');
      logToFile('Agent marked LIVE');

      // 7. Start heartbeat loop every 10 seconds
      heartbeatTimer = setInterval(async () => {
        try {
          await sendHeartbeat();
          logToFile('[HEARTBEAT] Backend acknowledged');
        } catch (e) {
          logToFile(`[HEARTBEAT ERROR] ${e.message}`);
        }
      }, 10000);
      logToFile('[10/10] Agent ready');
    } else {
      logToFile(`Heartbeat disabled via test flag`);
    }

  } catch (err) {
    logToFile(`STARTUP FAILED: ${err.message}`);
    try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch (e) {}
    process.exit(1);
  }

  // --- RUNTIME POLLING LOOPS & SHUTDOWN WATCHER ---
  setInterval(() => {
    const signalPath = path.join(__dirname, 'shutdown.signal');
    if (fs.existsSync(signalPath)) {
      console.log('\n  🛑 SHUTDOWN SIGNAL DETECTED: Terminating Campus Print Agent daemon...\n');
      logToFile('[SHUTDOWN] Shutdown signal file detected. Terminating daemon.');
      try { fs.unlinkSync(signalPath); } catch {}
      try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch {}
      
      // Dispose PrinterManager
      try {
        printerManager.dispose().catch((e) => {
          console.error('[PrinterManager] Dispose error:', e.message);
        });
      } catch (e) {
        console.error('[PrinterManager] Dispose error:', e.message);
      }
      
      process.exit(0);
    }
  }, 1000);

  // Establish real-time SSE stream
  if (process.env.CP_TEST_DISABLE_SSE !== 'true') {
    connectSSE();
  } else {
    logToFile(`SSE stream connection disabled via test flag`);
  }
  
  // One-time backlog drain on startup (no recurring poll — dispatch is push-based)
  if (process.env.CP_TEST_DISABLE_POLLING !== 'true') {
    poll();
  } else {
    logToFile(`Backlog polling disabled via test flag`);
  }
}

main().catch((err) => {
  console.error('[CRITICAL RUNTIME ERROR]', err);
  process.exit(1);
});

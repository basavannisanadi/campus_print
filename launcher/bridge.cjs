const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const diagLogFile = path.join(__dirname, 'logs', 'diagnostic_execution.log');
if (!fs.existsSync(path.dirname(diagLogFile))) {
  try { fs.mkdirSync(path.dirname(diagLogFile), { recursive: true }); } catch (e) {}
}

function diagLog(msg) {
  const entry = `[DIAGNOSTIC] [${new Date().toISOString()}] PID:${process.pid} PPID:${process.ppid} | ${msg}\n`;
  try { fs.appendFileSync(diagLogFile, entry); } catch (e) {}
  console.log(entry.trim());
}

diagLog(`BRIDGE EXECUTION STARTED | Argv: ${JSON.stringify(process.argv)} | Cwd: ${process.cwd()} | Node: ${process.version}`);

process.on('exit', (code) => {
  diagLog(`BRIDGE PROCESS EXITING | Code: ${code}`);
});

process.on('uncaughtException', (err) => {
  diagLog(`BRIDGE UNCAUGHT EXCEPTION: ${err ? err.stack || err.message || err : 'Unknown error'}`);
});

process.on('unhandledRejection', (reason, promise) => {
  diagLog(`BRIDGE UNHANDLED REJECTION: ${reason ? reason.stack || reason.message || reason : 'Unknown rejection'}`);
});

// Patches child_process.exec and child_process.spawn to run silently on Windows
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

const spawn = cp.spawn;

// Determine target directory where client.cjs and config.json reside.
// In production (installed), they are side-by-side in __dirname.
// In development workspace, launcher/ is separate from print-client/.
let targetDir = __dirname;
let clientPath = path.join(targetDir, 'client.cjs');

if (!fs.existsSync(clientPath)) {
  const devClientDir = path.resolve(__dirname, '../print-client');
  const devClientPath = path.join(devClientDir, 'client.cjs');
  if (fs.existsSync(devClientPath)) {
    targetDir = devClientDir;
    clientPath = devClientPath;
  }
}

const lockFilePath = path.join(targetDir, 'daemon.lock');
const configFilePath = path.join(targetDir, 'config.json');
const runtimeTmpPath = path.join(targetDir, 'runtime.tmp');
const runtimeJsonPath = path.join(targetDir, 'runtime.json');
const logDir = path.join(targetDir, 'logs');

if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, 'launcher.log');

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  const dateStr = new Date().toISOString().split('T')[0];
  const logLine = `[${dateStr} ${timestamp}] ${message}`;
  console.log(logLine);
  fs.appendFileSync(logPath, logLine + '\n', 'utf8');
}

// Parse custom protocol arguments (e.g. campusprint://start?serverUrl=...&shopId=...)
const rawUrl = process.argv[2] || '';
let action = 'start';
let serverUrl = '';
let shopId = '';
let token = '';

try {
  if (rawUrl.startsWith('campusprint://')) {
    const pathAndQuery = rawUrl.substring(14);
    const queryIdx = pathAndQuery.indexOf('?');
    const actionPart = queryIdx === -1 ? pathAndQuery : pathAndQuery.substring(0, queryIdx);
    action = actionPart.replace(/\/$/, '').toLowerCase();

    if (queryIdx !== -1) {
      const queryString = pathAndQuery.substring(queryIdx + 1);
      const params = new URLSearchParams(queryString);
      serverUrl = params.get('serverUrl') || '';
      shopId = params.get('shopId') || '';
      token = params.get('token') || '';
      log(`Parsed serverUrl: ${serverUrl}`);
      log(`Parsed shopId: ${shopId}`);
      log(`Parsed token: ${token ? '[HIDDEN]' : 'none'}`);
    }
  } else {
    action = rawUrl.trim().toLowerCase();
  }
} catch (err) {
  log(`Failed to parse protocol URL: ${err.message}`);
}

log(`Invoked: "${rawUrl}" -> Action: ${action.toUpperCase()}`);

function getExistingPid() {
  if (!fs.existsSync(lockFilePath)) return null;
  try {
    const pidStr = fs.readFileSync(lockFilePath, 'utf8').trim();
    const pid = parseInt(pidStr, 10);
    return isNaN(pid) ? null : pid;
  } catch (err) {
    return null;
  }
}

function isProcessRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function handleStart() {
  // 1. Verify installation integrity
  if (!fs.existsSync(clientPath) || !fs.existsSync(configFilePath)) {
    log(`Installation corrupted: client.cjs (${clientPath}) or config.json (${configFilePath}) is missing. Aborting launch.`);
    process.exit(1);
  }

  // Clear any existing shutdown signal before starting the daemon
  const signalPath = path.join(targetDir, 'shutdown.signal');
  if (fs.existsSync(signalPath)) {
    try {
      fs.unlinkSync(signalPath);
      log("Cleared existing shutdown signal file before startup.");
    } catch (e) {
      log(`Failed to clear shutdown signal: ${e.message}`);
    }
  }

  // 2. Validate parameters & check if configuration changed
  let configChanged = true;
  if (serverUrl && shopId) {
    try {
      if (fs.existsSync(runtimeJsonPath)) {
        const currentRuntime = JSON.parse(fs.readFileSync(runtimeJsonPath, 'utf8'));
        if (
          currentRuntime.serverUrl === serverUrl &&
          currentRuntime.shopId === shopId &&
          currentRuntime.token === token
        ) {
          configChanged = false;
        }
      } else if (fs.existsSync(configFilePath)) {
        const currentConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        if (
          currentConfig.serverUrl === serverUrl &&
          currentConfig.shopId === shopId &&
          currentConfig.token === token
        ) {
          configChanged = false;
        }
      }
    } catch (e) {
      configChanged = true;
    }

    try {
      const tempConfig = { serverUrl, shopId, token };
      fs.writeFileSync(runtimeTmpPath, JSON.stringify(tempConfig, null, 2), 'utf8');
      
      // Validate configuration before renaming
      if (!serverUrl.trim() || !shopId.trim()) {
        log("Validation failed: serverUrl or shopId is empty inside temporary config. Aborting launch.");
        try { fs.unlinkSync(runtimeTmpPath); } catch (e) {}
        process.exit(1);
      }

      // Rename atomically to prevent corruption
      fs.renameSync(runtimeTmpPath, runtimeJsonPath);
      log(`Runtime configuration updated atomically: ${serverUrl} / ${shopId}`);
    } catch (e) {
      log(`Failed to write/rename runtime configuration: ${e.message}`);
      process.exit(1);
    }
  } else {
    // If start is invoked without parameters, check if runtime.json exists
    if (!fs.existsSync(runtimeJsonPath)) {
      log("No valid runtime configuration (runtime.json) exists and none was provided. Aborting launch.");
      process.exit(1);
    }
    configChanged = false; // Starting manually without params preserves active config
  }

  // 3. Check daemon.lock process life (Restart if config changed)
  const existingPid = getExistingPid();
  if (existingPid) {
    if (isProcessRunning(existingPid)) {
      if (configChanged) {
        log(`Config change detected. Restarting active daemon PID ${existingPid}...`);
        
        // Write stop signal
        try {
          const signalPath = path.join(targetDir, 'shutdown.signal');
          fs.writeFileSync(signalPath, 'stop', 'utf8');
        } catch (e) {}
        
        // Force kill the process tree to guarantee it stops immediately
        try {
          cp.execSync(`taskkill /F /PID ${existingPid} /T`, { windowsHide: true });
        } catch (e) {
          try { process.kill(existingPid, 'SIGKILL'); } catch (e2) {}
        }
        
        // Wait a brief moment to ensure ports and lockfiles are released
        let retries = 10;
        while (isProcessRunning(existingPid) && retries > 0) {
          cp.execSync('choice /d y /t 1 > nul', { windowsHide: true });
          retries--;
        }
        
        // Remove stale lock file if it still exists
        try {
          if (fs.existsSync(lockFilePath)) {
            fs.unlinkSync(lockFilePath);
          }
        } catch (e) {}
        
        log("Existing daemon stopped. Starting new daemon with updated config.");
      } else {
        log(`Start ignored: Agent daemon process is already running with PID ${existingPid} and identical config.`);
        process.exit(0);
      }
    } else {
      log(`Stale lock file found for dead PID ${existingPid}. Removing lock.`);
      try { fs.unlinkSync(lockFilePath); } catch (e) {}
    }
  }

  // 4. Run client.cjs directly in this visible console window
  log(`Starting Print Agent daemon (client.cjs) in Taskbar window...`);
  try {
    require(clientPath);
  } catch (err) {
    log(`Fatal error starting agent daemon: ${err.message}`);
    console.error('\n==================================================');
    console.error('  [FATAL] Agent failed to start.');
    console.error('  Error: ' + err.message);
    console.error('  Logs:  ' + logPath);
    console.error('==================================================');
    console.error('Press Ctrl+C to close this window.\n');
    // Keep process alive so the user can read the error
    setInterval(() => {}, 60000);
  }
}

function handleStop() {
  log("Stopping Print Agent: Writing stop signal to shutdown.signal...");
  try {
    const signalPath = path.join(__dirname, 'shutdown.signal');
    fs.writeFileSync(signalPath, 'stop', 'utf8');
    log("Stop signal written successfully.");
  } catch (err) {
    log(`Failed to write stop signal: ${err.message}`);
  }
  const pid = getExistingPid();
  if (pid) {
    log(`Attempting process termination for PID ${pid}...`);
    try {
      cp.execSync(`taskkill /F /PID ${pid} /T`, { windowsHide: true });
      log(`Process tree for PID ${pid} killed via taskkill.`);
    } catch (e) {
      try { process.kill(pid, 'SIGKILL'); } catch (e2) {}
    }
  }
  try {
    if (fs.existsSync(lockFilePath)) {
      fs.unlinkSync(lockFilePath);
      log("daemon.lock removed.");
    }
  } catch (e) {}
  log("Print Agent shutdown completed.");
  process.exit(0);
}

if (action === 'start') {
  handleStart();
} else if (action === 'stop') {
  handleStop();
} else {
  log(`Unknown command: ${action}`);
  process.exit(0);
}

const cp = require('child_process');
const fs = require('fs');
const path = require('path');

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

const lockFilePath = path.join(__dirname, 'daemon.lock');
const configFilePath = path.join(__dirname, 'config.json');
const runtimeTmpPath = path.join(__dirname, 'runtime.tmp');
const runtimeJsonPath = path.join(__dirname, 'runtime.json');
const logDir = path.join(__dirname, 'logs');

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
  const clientPath = path.join(__dirname, 'client.cjs');

  // 1. Verify installation integrity
  if (!fs.existsSync(clientPath) || !fs.existsSync(configFilePath)) {
    log("Installation corrupted: client.cjs or config.json is missing. Aborting launch.");
    process.exit(1);
  }

  // Clear any existing shutdown signal before starting the daemon
  const signalPath = path.join(__dirname, 'shutdown.signal');
  if (fs.existsSync(signalPath)) {
    try {
      fs.unlinkSync(signalPath);
      log("Cleared existing shutdown signal file before startup.");
    } catch (e) {
      log(`Failed to clear shutdown signal: ${e.message}`);
    }
  }

  // 2. Validate parameters & write configuration atomically
  if (serverUrl && shopId) {
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
  }

  // 3. Check daemon.lock process life (Check process, but let client write it)
  const existingPid = getExistingPid();
  if (existingPid) {
    if (isProcessRunning(existingPid)) {
      log(`Start ignored: Agent daemon process is already running with PID ${existingPid}.`);
      process.exit(0);
    } else {
      log(`Stale lock file found for dead PID ${existingPid}. Removing lock.`);
      try { fs.unlinkSync(lockFilePath); } catch (e) {}
    }
  }

  // 4. Launch client.cjs in a visible terminal window using 'start'
  log(`Spawning print-client daemon (client.cjs) in a visible console window...`);
  const command = `start "Campus Print Agent" "${process.execPath}" "client.cjs"`;
  originalExec(command, {
    cwd: __dirname,
    windowsHide: false
  });

  log("Print Agent spawned. Exiting bridge.");
  process.exit(0);
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

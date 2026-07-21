const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const net = require('net');

const PORT = 3002;
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, 'launcher.log');

// Clear log file on startup
fs.writeFileSync(logPath, '', 'utf8');

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  const dateStr = new Date().toISOString().split('T')[0];
  const logLine = `[${dateStr} ${timestamp}] ${message}`;
  console.log(logLine);
  fs.appendFileSync(logPath, logLine + '\n', 'utf8');
}

log("Launcher Daemon Started.");

let backendProcess = null;
let frontendProcess = null;
let agentProcess = null;

let isStarting = false;
let hasOpenedAdmin = false;

function isPortActive(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

function getAgentStatusFromDb() {
  try {
    const dbPath = path.resolve(__dirname, '../server/data/db.json');
    if (!fs.existsSync(dbPath)) {
      return { registered: false, online: false, printers: 0 };
    }
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    // Find TJohn print center agent or first available agent
    const agent = db.agents && db.agents.find(a => a.shopId === 'tjohn_print') || (db.agents && db.agents[0]);
    if (!agent) {
      return { registered: false, online: false, printers: 0 };
    }
    
    const lastSeenTime = new Date(agent.lastSeen).getTime();
    const isOnline = (Date.now() - lastSeenTime) < 60000;
    const online = isOnline && agent.onlineStatus === 'online';
    
    // Count printers for this shop
    const shopPrinters = (db.printers || []).filter(p => p.shopId === agent.shopId);
    
    return {
      registered: true,
      online: online,
      printers: shopPrinters.length
    };
  } catch (err) {
    return { registered: false, online: false, printers: 0 };
  }
}

function killProcessTree(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    exec(`taskkill /pid ${pid} /f /t`, (err) => {
      resolve();
    });
  });
}

async function stopHub() {
  log("Stopping Campus Print stack...");

  if (agentProcess) {
    log("Stopping Print Agent...");
    await killProcessTree(agentProcess.pid);
    agentProcess = null;
  }

  if (frontendProcess) {
    log("Stopping Frontend web app...");
    await killProcessTree(frontendProcess.pid);
    frontendProcess = null;
  }

  if (backendProcess) {
    log("Stopping Backend server...");
    await killProcessTree(backendProcess.pid);
    backendProcess = null;
  }

  log("All managed services stopped. Ports released.");
  hasOpenedAdmin = false;
  return { success: true };
}

async function startHub() {
  if (isStarting) return { success: false, error: "Startup already in progress." };
  isStarting = true;
  hasOpenedAdmin = false;
  log("Starting Campus Print stack...");

  try {
    // 1. Backend
    const backendActive = await isPortActive(3001);
    if (backendActive) {
      log("Backend is already running on port 3001.");
    } else {
      log("Starting Backend server...");
      backendProcess = spawn('cmd.exe', ['/c', 'npm run server'], {
        cwd: path.resolve(__dirname, '..'),
        detached: false
      });
      backendProcess.stdout.on('data', (d) => log(`[Backend] ${d.toString().trim()}`));
      backendProcess.stderr.on('data', (d) => log(`[Backend Error] ${d.toString().trim()}`));
      
      // Wait for backend health
      let backendHealthy = false;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (await isPortActive(3001)) {
          backendHealthy = true;
          break;
        }
      }
      if (!backendHealthy) {
        throw new Error("Backend failed to start. Port 3001 did not respond.");
      }
      log("Backend online.");
    }

    // 2. Frontend
    const frontendActive = await isPortActive(3000);
    if (frontendActive) {
      log("Frontend is already running on port 3000.");
    } else {
      log("Starting Frontend web app...");
      frontendProcess = spawn('cmd.exe', ['/c', 'npm run dev'], {
        cwd: path.resolve(__dirname, '..'),
        detached: false
      });
      frontendProcess.stdout.on('data', (d) => log(`[Frontend] ${d.toString().trim()}`));
      frontendProcess.stderr.on('data', (d) => log(`[Frontend Error] ${d.toString().trim()}`));

      // Wait for frontend
      let frontendHealthy = false;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (await isPortActive(3000)) {
          frontendHealthy = true;
          break;
        }
      }
      if (!frontendHealthy) {
        throw new Error("Frontend failed to start. Port 3000 did not respond.");
      }
      log("Frontend running.");
    }

    // 3. Print Agent
    log("Starting Print Agent...");
    agentProcess = spawn('node', ['print-client/client.cjs'], {
      cwd: path.resolve(__dirname, '..')
    });
    agentProcess.stdout.on('data', (d) => log(`[Agent] ${d.toString().trim()}`));
    agentProcess.stderr.on('data', (d) => log(`[Agent Error] ${d.toString().trim()}`));
    
    // Wait for agent registration and online status
    let agentRegistered = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const status = getAgentStatusFromDb();
      if (status.online) {
        agentRegistered = true;
        break;
      }
    }
    if (!agentRegistered) {
      throw new Error("Print Agent failed to register. Please verify configuration and shop ID.");
    }
    log("Agent registered.");

    // Open Admin Portal
    if (!hasOpenedAdmin) {
      log("Opening Admin Portal...");
      exec('start http://localhost:3000/admin');
      hasOpenedAdmin = true;
    }
    log("Launcher Ready.");
    return { success: true };
  } catch (err) {
    log(`Startup Failed: ${err.message}`);
    await stopHub();
    return { success: false, error: err.message };
  } finally {
    isStarting = false;
  }
}

// HTTP Server implementation
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API Router
  if (req.url === '/api/status' && req.method === 'GET') {
    const backendOnline = await isPortActive(3001);
    const frontendOnline = await isPortActive(3000);
    const agentInfo = getAgentStatusFromDb();

    // Read log tail
    let logs = [];
    if (fs.existsSync(logPath)) {
      logs = fs.readFileSync(logPath, 'utf8').trim().split('\n').slice(-25);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      backend: backendOnline ? 'ONLINE' : (backendProcess ? 'STARTING' : 'OFFLINE'),
      frontend: frontendOnline ? 'ONLINE' : (frontendProcess ? 'STARTING' : 'OFFLINE'),
      agent: agentInfo.online ? 'ONLINE' : (agentProcess ? 'STARTING' : 'OFFLINE'),
      printers: agentInfo.printers,
      logs: logs
    }));
    return;
  }

  if (req.url === '/api/start' && req.method === 'POST') {
    const result = await startHub();
    res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (req.url === '/api/stop' && req.method === 'POST') {
    const result = await stopHub();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // Static File Router
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const extname = path.extname(filePath);
  
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  log(`Launcher web server listening on http://localhost:${PORT}`);
});

// Process hooks for clean exit
process.on('SIGINT', async () => {
  await stopHub();
  process.exit();
});
process.on('SIGTERM', async () => {
  await stopHub();
  process.exit();
});

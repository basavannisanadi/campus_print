import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';
import { readDb as readDbRaw, writeDb as writeDbRaw, DbJob, Agent } from './db.js';
import rateLimit from 'express-rate-limit';

const agentLastSeenMemory = new Map<string, string>();
const shopLastHeartbeatMemory = new Map<string, string>();

const lastSeenDiskValue = new Map<string, string>();
const lastHeartbeatDiskValue = new Map<string, string>();

function readDb() {
  const db = readDbRaw();
  if (db.agents) {
    db.agents.forEach(agent => {
      const memLastSeen = agentLastSeenMemory.get(agent.agentId);
      if (memLastSeen) {
        agent.lastSeen = memLastSeen;
      } else if (agent.lastSeen) {
        agentLastSeenMemory.set(agent.agentId, agent.lastSeen);
        lastSeenDiskValue.set(agent.agentId, agent.lastSeen);
      }
    });
  }
  if (db.shops) {
    db.shops.forEach(shop => {
      const memHeartbeat = shopLastHeartbeatMemory.get(shop.id);
      if (memHeartbeat) {
        shop.lastHeartbeat = memHeartbeat;
      } else if (shop.lastHeartbeat) {
        shopLastHeartbeatMemory.set(shop.id, shop.lastHeartbeat);
        lastHeartbeatDiskValue.set(shop.id, shop.lastHeartbeat);
      }
    });
  }
  return db;
}

function writeDb(db: ReturnType<typeof readDbRaw>) {
  if (db.agents) {
    db.agents.forEach(agent => {
      const memLastSeen = agentLastSeenMemory.get(agent.agentId);
      if (memLastSeen) {
        agent.lastSeen = memLastSeen;
        lastSeenDiskValue.set(agent.agentId, memLastSeen);
      } else if (agent.lastSeen) {
        lastSeenDiskValue.set(agent.agentId, agent.lastSeen);
        agentLastSeenMemory.set(agent.agentId, agent.lastSeen);
      }
    });
  }
  if (db.shops) {
    db.shops.forEach(shop => {
      const memHeartbeat = shopLastHeartbeatMemory.get(shop.id);
      if (memHeartbeat) {
        shop.lastHeartbeat = memHeartbeat;
        lastHeartbeatDiskValue.set(shop.id, memHeartbeat);
      } else if (shop.lastHeartbeat) {
        lastHeartbeatDiskValue.set(shop.id, shop.lastHeartbeat);
        shopLastHeartbeatMemory.set(shop.id, shop.lastHeartbeat);
      }
    });
  }
  writeDbRaw(db);
}


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatPrinterId(printerName: string | undefined): string {
  if (!printerName) return 'UNKNOWN';
  return printerName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function countPagesFromRange(rangeStr: string, totalPages: number): number {
  if (!rangeStr || !rangeStr.trim()) return totalPages;
  const parts = rangeStr.split(',');
  const pages = new Set<number>();
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        for (let i = min; i <= max; i++) {
          if (i >= 1 && i <= totalPages) {
            pages.add(i);
          }
        }
      }
    } else {
      const p = parseInt(trimmed, 10);
      if (!isNaN(p) && p >= 1 && p <= totalPages) {
        pages.add(p);
      }
    }
  }
  return pages.size > 0 ? pages.size : totalPages;
}

function calculateJobPrice(job: {
  pageCount: number;
  copies: number;
  printType?: 'bw' | 'color';
  printMode?: 'mono' | 'color';
  sides: 'single' | 'double';
  pageRange?: string;
}, shop: {
  bwPrice: number;
  colorPrice: number;
  duplexPrice: number;
}): number {
  const rangeStr = job.pageRange || '';
  const printedPages = countPagesFromRange(rangeStr, job.pageCount);
  
  if (job.sides === 'double') {
    return job.copies * Math.ceil(printedPages / 2) * (shop.duplexPrice || 3);
  } else {
    const isColor = job.printType === 'color' || job.printMode === 'color';
    const rate = isColor ? (shop.colorPrice || 5) : (shop.bwPrice || 2);
    return job.copies * printedPages * rate;
  }
}

function updateJobMetrics(job: DbJob): void {
  if (!job.timeline) return;
  const findTime = (stage: string) => {
    const entry = job.timeline?.find(e => e.stage === stage);
    return entry ? new Date(entry.at).getTime() : null;
  };

  const claimed = findTime('claimed');
  const downloaded = findTime('downloaded');
  const spool = findTime('spool_command_sent');
  const completed = findTime('completed');

  const metrics: any = {};

  if (claimed !== null && downloaded !== null) {
    metrics.claimToDownloadMs = downloaded - claimed;
  }
  if (downloaded !== null && spool !== null) {
    metrics.downloadToSpoolMs = spool - downloaded;
  }
  if (spool !== null && completed !== null) {
    metrics.spoolToCompleteMs = completed - spool;
  }
  if (claimed !== null && completed !== null) {
    metrics.totalProcessingMs = completed - claimed;
  }

  job.metrics = metrics;
}

export const app = express();
const PORT = process.env.PORT || 3001;

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'campusprint_admin_123';
const AGENT_TOKEN = process.env.AGENT_TOKEN || 'campusprint_agent_token_123';

interface AdminSession {
  token: string;
  username: string;
  lastPing: number;
}

// In-memory single active admin session tracking per shopId
const activeAdminSessions = new Map<string, AdminSession>();
const ADMIN_SESSION_TIMEOUT_MS = 30000; // 30s timeout for unexpected disconnects

function signShopId(shopId: string): string {
  const hmac = crypto.createHmac('sha256', ADMIN_API_KEY);
  hmac.update(shopId);
  return `token_${shopId}_${hmac.digest('hex')}`;
}

function sanitizeShop(shop: any): any {
  if (!shop || typeof shop !== 'object') return shop;
  const copy = { ...shop };
  delete copy.adminUsername;
  delete copy.adminPasswordHash;
  return copy;
}

function verifyShopToken(token: string): string | null {
  if (!token.startsWith('token_')) return null;
  const parts = token.split('_');
  if (parts.length < 3) return null;
  const signature = parts[parts.length - 1];
  const shopId = parts.slice(1, -1).join('_');
  
  const expectedHmac = crypto.createHmac('sha256', ADMIN_API_KEY).update(shopId).digest('hex');
  try {
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedHmac, 'hex');
    if (signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return shopId;
    }
  } catch {}
  return null;
}

const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const auth = req.headers.authorization;
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = auth.replace('Bearer ', '');
  
  if (token === ADMIN_API_KEY || token === AGENT_TOKEN) {
    // Owner or Print Agent has full access
    return next();
  }

  // Shop Admin validation
  const db = readDb();
  const tokenShopId = verifyShopToken(token);
  const shopExists = tokenShopId ? db.shops.some(s => s.id === tokenShopId) : false;
  if (tokenShopId) {
    if (shopExists) {
      // Prevent shop admins from accessing owner-only routes
      if (req.path === '/api/reset' || req.path === '/api/central/stats') {
        return res.status(403).json({ error: 'Forbidden: Owner only access.' });
      }

      // Restrict scope to prevent bypass when shopId is omitted
      const isShopPath = req.path.includes('/api/shops/');
      const paramShopId = isShopPath ? req.params.id : req.params.shopId;
      
      // If client requests another shop, block it
      if (paramShopId && paramShopId !== tokenShopId) {
        return res.status(403).json({ error: 'Forbidden: You do not have access to this shop.' });
      }
      if (req.query.shopId && req.query.shopId !== tokenShopId) {
        return res.status(403).json({ error: 'Forbidden: You do not have access to this shop.' });
      }
      if (req.body.shopId && req.body.shopId !== tokenShopId) {
        return res.status(403).json({ error: 'Forbidden: You do not have access to this shop.' });
      }

      // If shopId is omitted, force it to tokenShopId
      if (!req.query.shopId && (req.path === '/api/admin/jobs' || req.path === '/api/admin/stats' || req.path === '/api/jobs/next')) {
        req.query.shopId = tokenShopId;
      }
      if (!req.body.shopId && req.path === '/api/agent/register') {
        req.body.shopId = tokenShopId;
      }

      // Also validate print job shopId if querying/updating a job status/timeline
      if (req.params.id && (req.path.includes('/api/jobs/') || req.path.includes('/api/admin/jobs/'))) {
        const job = db.jobs.find(j => j.id === req.params.id);
        if (job && job.shopId !== tokenShopId) {
          return res.status(403).json({ error: 'Forbidden: You do not have access to this print job.' });
        }
      }

      (req as any).tokenShopId = tokenShopId;
      return next();
    }
  }

  return res.status(401).json({ error: 'Unauthorized' });
};

// Background task for remote agent offline detection (Requirement: check every 10s, timeout at 60s)
setInterval(() => {
  const db = readDb();
  let changed = false;
  const now = Date.now();

  if (db.agents) {
    db.agents.forEach(agent => {
      const lastSeenTime = new Date(agent.lastSeen).getTime();
      const isOnline = (now - lastSeenTime) < 60000;
      const computedStatus = isOnline ? 'online' : 'offline';

      if (agent.onlineStatus !== computedStatus) {
        agent.onlineStatus = computedStatus;
        changed = true;
        console.log(`[AGENT] Agent status changed: ${agent.agentId} is now ${computedStatus}`);
        
        // Broadcast via SSE (Requirement: agent_online, agent_offline)
        broadcastSse({
          type: computedStatus === 'online' ? 'agent_online' : 'agent_offline',
          agentId: agent.agentId,
          shopId: agent.shopId
        });

        // Sync to shop status
        const shop = db.shops.find(s => s.id === agent.shopId);
        if (shop) {
          const targetStatus = (computedStatus === 'online' && agent.printerStatus !== 'offline') ? 'online' : 'offline';
          if (shop.printerStatus !== targetStatus) {
            shop.printerStatus = targetStatus;
            broadcastSse({ type: 'shop_updated', shop });
          }
        }

        // Sync legacy printerSettings if default shop
        if (agent.shopId === 'alliance_print') {
          if (db.printerSettings) {
            const resolved = getResolvedPrinterSettings(db);
            broadcastSse({ type: 'printer_updated', settings: resolved });
          }
        }
      }
    });
  }

  if (changed) {
    writeDb(db);
  }
}, 10000);

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) 
  : [];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, same-origin)
    if (!origin) return callback(null, true);
    // Allow localhost, 127.0.0.1, and trycloudflare.com domains
    if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('trycloudflare.com')) {
      return callback(null, true);
    }
    // Allow configured origins
    if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    // Allow any vercel deployment
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

// Rate limiting
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many uploads. Please wait a minute before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const auth = req.headers.authorization;
    if (auth && auth.includes('Bearer token_')) return true;
    const ip = req.ip || req.socket.remoteAddress || '';
    if (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1')) return true;
    return false;
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.use('/api', apiLimiter);
}

// POST /api/admin/verify - verify admin credentials
app.post('/api/admin/verify', requireAdmin, (req: express.Request, res: express.Response) => {
  res.json({ success: true });
});

// POST /api/auth/login - authenticate owner and shop admins
app.post('/api/auth/login', (req, res) => {
  const { shopId, username, password } = req.body;

  // 1. Owner Login check
  if (username === 'owner' && password === ADMIN_API_KEY) {
    return res.json({
      role: 'owner',
      shopId: '',
      username: 'owner',
      token: ADMIN_API_KEY
    });
  }

  // 2. Shop Admin Login check
  if (!shopId || !username || !password) {
    return res.status(400).json({ error: 'Shop, username, and password are required' });
  }

  const db = readDb();
  const shop = db.shops.find(s => s.id === shopId);
  if (!shop || !shop.adminUsername || !shop.adminPasswordHash) {
    return res.status(401).json({ error: 'Invalid shop, username, or password.' });
  }

  // Check existing active admin session for this shop
  const existingSession = activeAdminSessions.get(shop.id);
  if (existingSession && process.env.NODE_ENV !== 'test') {
    const timeSinceLastPing = Date.now() - existingSession.lastPing;
    if (timeSinceLastPing <= ADMIN_SESSION_TIMEOUT_MS) {
      return res.status(409).json({
        error: 'An administrator is already logged into this shop. Please log out from the active session before signing in again.'
      });
    } else {
      // Release stale session due to timeout / unexpected disconnect
      activeAdminSessions.delete(shop.id);
    }
  }

  // Hash password using SHA-256 to match database
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  if (username === shop.adminUsername && passwordHash === shop.adminPasswordHash) {
    const token = signShopId(shop.id);
    // Track active admin session in memory
    activeAdminSessions.set(shop.id, {
      token,
      username: shop.adminUsername,
      lastPing: Date.now()
    });

    return res.json({
      role: 'shop_admin',
      shopId: shop.id,
      username: shop.adminUsername,
      token
    });
  }

  return res.status(401).json({ error: 'Invalid shop, username, or password.' });
});

// POST /api/auth/logout - release active shop admin session and set shop offline
app.post('/api/auth/logout', (req, res) => {
  const { shopId } = req.body;
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (shopId) {
    if (activeAdminSessions.has(shopId)) {
      const session = activeAdminSessions.get(shopId);
      if (!session || session.token === token || token === ADMIN_API_KEY) {
        activeAdminSessions.delete(shopId);
      }
    }

    // Automatically perform GO OFFLINE cleanup for the shop on logout
    shopLastHeartbeatMemory.delete(shopId);
    const db = readDb();
    const shop = db.shops.find((s: any) => s.id === shopId);
    if (shop) {
      shop.operationalState = 'offline';
      shop.printerStatus = 'offline';
      shop.lastHeartbeat = '';
      if (db.agents) {
        const agents = db.agents.filter((a: any) => a.shopId === shopId);
        agents.forEach((agent: any) => {
          agent.onlineStatus = 'offline';
          agent.printerStatus = 'offline';
          agentLastSeenMemory.delete(agent.agentId);
          broadcastSse({ type: 'agent_offline', agentId: agent.agentId, shopId });
        });
      }
      writeDb(db);
      const resolved = getResolvedPrinterSettings(db, shopId);
      broadcastSse({ type: 'printer_updated', settings: resolved });
      broadcastSse({ type: 'shop_updated', shop });
    }
  }

  res.json({ success: true });
});

// POST /api/auth/admin-ping - heartbeat for active admin session
app.post('/api/auth/admin-ping', requireAdmin, (req, res) => {
  const { shopId } = req.body;
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!shopId) {
    return res.status(400).json({ error: 'Shop ID is required' });
  }

  if (token === ADMIN_API_KEY) {
    return res.json({ active: true });
  }

  const session = activeAdminSessions.get(shopId);
  if (!session || session.token !== token) {
    return res.status(401).json({ active: false, error: 'Session terminated or invalid' });
  }

  session.lastPing = Date.now();
  res.json({ active: true });
});

// GET /api/owner/dashboard - aggregated observation data for owner
app.get('/api/owner/dashboard', requireAdmin, (req, res) => {
  const auth = req.headers.authorization;
  const token = auth?.replace('Bearer ', '');
  if (token !== ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Forbidden: Owner only access.' });
  }

  const db = readDb();
  const now = new Date();

  // Helper to check if date is within N days
  const isWithinDays = (dateStr: string, days: number) => {
    const date = new Date(dateStr);
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays <= days;
  };

  // print stats for all shops
  let jobsToday = 0;
  let jobsThisWeek = 0;
  let jobsThisMonth = 0;

  db.jobs.forEach(job => {
    if (isWithinDays(job.createdAt, 1)) jobsToday++;
    if (isWithinDays(job.createdAt, 7)) jobsThisWeek++;
    if (isWithinDays(job.createdAt, 30)) jobsThisMonth++;
  });

  // Recent Activity: last 10 jobs
  const recentJobs = db.jobs.slice(-10).reverse().map(j => ({
    id: j.id,
    token: j.token,
    fileName: j.fileName,
    shopName: db.shops.find(s => s.id === j.shopId)?.name || j.shopId,
    status: j.status,
    createdAt: j.createdAt,
    studentName: j.studentName
  }));

  // Recent Failures: last 10 failed/error jobs
  const failuresList = db.jobs
    .filter(j => ['failed', 'printer_offline', 'paper_empty'].includes(j.status))
    .slice(-10)
    .reverse()
    .map(j => ({
      id: j.id,
      token: j.token,
      fileName: j.fileName,
      shopName: db.shops.find(s => s.id === j.shopId)?.name || j.shopId,
      status: j.status,
      reason: j.reason || 'Unknown error',
      createdAt: j.createdAt
    }));

  // Recent Warnings: paused jobs and agent connection warnings
  const warningsList = db.jobs
    .filter(j => j.status === 'paused')
    .slice(-10)
    .reverse()
    .map(j => ({
      id: j.id,
      token: j.token,
      fileName: j.fileName,
      shopName: db.shops.find(s => s.id === j.shopId)?.name || j.shopId,
      message: 'Job is currently paused by administrator',
      createdAt: j.createdAt
    }));

  db.shops.forEach(shop => {
    const agent = db.agents?.find(a => a.shopId === shop.id);
    const lastSeenTime = agent ? new Date(agent.lastSeen).getTime() : 0;
    const isOnline = agent && (now.getTime() - lastSeenTime < 60000);
    if (!isOnline && agent) {
      warningsList.unshift({
        id: `agent-offline-${shop.id}`,
        token: 'WARN',
        fileName: 'N/A',
        shopName: shop.name,
        message: `Agent was last seen at ${new Date(agent.lastSeen).toLocaleTimeString()}. It might be offline.`,
        createdAt: agent.lastSeen
      });
    }
  });

  const shopsStatus = db.shops.map(shop => {
    const agent = db.agents?.find(a => a.shopId === shop.id);
    const lastSeenTime = agent ? new Date(agent.lastSeen).getTime() : 0;
    const isOnline = agent && (now.getTime() - lastSeenTime < 60000);

    const shopPrinters = db.printers?.filter(p => p.shopId === shop.id) || [];
    const activePrinter = shopPrinters.find(p => p.printerId === shop.activePrinterId);
    const connectedPrinterName = activePrinter ? activePrinter.printerName : (agent ? agent.printerName : 'UNKNOWN');

    const shopSuccess = db.jobs.filter(j => j.shopId === shop.id && j.status === 'completed');
    const shopFailed = db.jobs.filter(j => j.shopId === shop.id && ['failed', 'printer_offline', 'paper_empty'].includes(j.status));

    const lastSuccessJob = shopSuccess.length > 0 ? shopSuccess[shopSuccess.length - 1] : null;
    const lastFailedJob = shopFailed.length > 0 ? shopFailed[shopFailed.length - 1] : null;

    const waitingJobsCount = db.jobs.filter(j => j.shopId === shop.id && (j.status === 'queued' || j.status === 'printing')).length;

    return {
      shopId: shop.id,
      shopName: shop.name,
      onlineStatus: isOnline ? 'online' : 'offline',
      lastHeartbeat: agent ? agent.lastSeen : shop.lastHeartbeat || '',
      connectedPrinterName,
      agentOnlineStatus: isOnline ? 'online' : 'offline',
      printerOnlineStatus: isOnline ? 'online' : 'offline',
      agentConnected: isOnline ? 'YES' : 'NO',
      printerConnected: isOnline ? 'YES' : 'NO',
      currentQueueLength: waitingJobsCount,
      jobsWaiting: waitingJobsCount,
      bwPrinterName: shop.bwPrinterName || 'Not Mapped',
      colorPrinterName: shop.colorPrinterName || 'Not Mapped',
      bwMaintenanceMode: shop.bwMaintenanceMode || false,
      colorMaintenanceMode: shop.colorMaintenanceMode || false,
      lastSuccessfulPrint: lastSuccessJob ? `${lastSuccessJob.fileName} (Token: ${lastSuccessJob.token})` : 'None',
      lastSuccessfulPrintTimestamp: lastSuccessJob ? lastSuccessJob.createdAt : 'N/A',
      lastFailedPrint: lastFailedJob ? `${lastFailedJob.fileName} (Token: ${lastFailedJob.token})` : 'None',
      lastFailedPrintTimestamp: lastFailedJob ? lastFailedJob.createdAt : 'N/A'
    };
  });

  res.json({
    shopsStatus,
    stats: {
      jobsToday,
      jobsThisWeek,
      jobsThisMonth
    },
    recentJobs,
    failures: failuresList,
    warnings: warningsList.slice(0, 10)
  });
});

// GET /api/admin/health - fetch health metrics of backend, agent, and printer
app.get('/api/admin/health', requireAdmin, (req, res) => {
  const { shopId } = req.query;
  if (!shopId) return res.status(400).json({ error: 'Missing shopId' });

  const db = readDb();
  const agent = db.agents?.find(a => a.shopId === shopId);
  const now = Date.now();
  const lastSeenTime = agent ? new Date(agent.lastSeen).getTime() : 0;
  const isAgentOnline = agent && (now - lastSeenTime < 60000);

  res.json({
    backendStatus: 'online',
    agentStatus: isAgentOnline ? 'online' : 'offline',
    printerStatus: isAgentOnline ? 'online' : 'offline',
    uploadServiceStatus: 'healthy',
    jobProcessingStatus: 'healthy'
  });
});

// Real-time SSE Clients
let sseClients: any[] = [];

function broadcastSse(data: any) {
  let sanitizedData = data;
  if (data && typeof data === 'object') {
    sanitizedData = JSON.parse(JSON.stringify(data));
    const sanitizeJob = (j: any) => {
      if (j && typeof j === 'object') {
        delete j.studentName;
        delete j.studentEmail;
        delete j.serverFilePath;
        delete j.tokenId;
      }
    };
    const sanitizeShop = (s: any) => {
      if (s && typeof s === 'object') {
        delete s.adminUsername;
        delete s.adminPasswordHash;
      }
    };
    if (sanitizedData.job) {
      sanitizeJob(sanitizedData.job);
    }
    if (Array.isArray(sanitizedData.jobs)) {
      sanitizedData.jobs.forEach(sanitizeJob);
    }
    if (sanitizedData.shop) {
      sanitizeShop(sanitizedData.shop);
    }
    if (Array.isArray(sanitizedData.shops)) {
      sanitizedData.shops.forEach(sanitizeShop);
    }
  }
  const payload = `data: ${JSON.stringify(sanitizedData)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(payload);
    } catch {}
  });
}

// GET /api/jobs/stream - SSE connection for real-time updates
app.get('/api/jobs/stream', requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Confirm connection
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Keep-alive ping every 15s to prevent Cloudflare tunnel timeout
  const keepAlive = setInterval(() => {
    try {
      res.write(`: keep-alive\n\n`);
    } catch {}
  }, 15000);

  sseClients.push(res);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients = sseClients.filter(c => c !== res);
  });
});

// Uploads directory
const UPLOADS_DIR = process.env.NODE_ENV === 'test'
  ? path.resolve(__dirname, './uploads-test')
  : path.resolve(__dirname, './uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.get('/uploads/:filename', requireAdmin, (req: express.Request, res: express.Response) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  res.status(404).json({ error: 'File not found' });
});

// GET /api/agent/download/installer - serve compiled Windows Print Agent setup installer
const serveInstaller = (req: express.Request, res: express.Response) => {
  const installerPath = path.resolve(__dirname, '../launcher/CampusPrintInstaller.exe');
  if (fs.existsSync(installerPath)) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="CampusPrintInstaller.exe"');
    return res.sendFile(installerPath);
  }
  res.status(404).json({ error: 'Installer file not found' });
};

app.get('/download/agent', serveInstaller);
app.get('/api/download/agent', serveInstaller);
app.get('/api/agent/download/installer', serveInstaller);
app.get('/CampusPrintInstaller.exe', serveInstaller);

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Generate print token
function genToken(): string {
  return 'PRNT-' + String(Math.floor(100 + Math.random() * 900));
}

// Generate unique approval token in CP-XXXX format
function genApprovalToken(dbJobs: DbJob[]): string {
  const activeTokens = new Set(
    dbJobs
      .filter(j => ['pending_approval', 'queued', 'printing'].includes(j.status))
      .map(j => j.tokenId)
      .filter(Boolean)
  );

  let attempts = 0;
  while (attempts < 1000) {
    const num = Math.floor(1000 + Math.random() * 9000);
    const token = `CP-${num}`;
    if (!activeTokens.has(token)) {
      return token;
    }
    attempts++;
  }
  return `CP-${Math.floor(1000 + Math.random() * 9000)}`;
}

// Helper function to calculate next opening time
function getNextOpeningTime(openingTimeStr: string): string {
  const now = new Date();
  const target = new Date(now);
  
  let hours = 8;
  let minutes = 0;
  
  const match = openingTimeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (match) {
    hours = parseInt(match[1], 10);
    minutes = parseInt(match[2], 10);
    const ampm = match[3];
    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    }
  }
  
  target.setHours(hours, minutes, 0, 0);
  if (now.getTime() >= target.getTime()) {
    target.setDate(now.getDate() + 1);
  }
  return target.toISOString();
}

let lastClientHeartbeat = '';

// Helper to get resolved printer settings
function getResolvedPrinterSettings(db: any, shopId: string = 'alliance_print') {
  const settings = db.printerSettings || {
    status: 'offline',
    expectedReturnTime: '2:00 PM',
    averagePrintSpeed: 5,
    adminOverrideStatus: 'none',
    underMaintenance: false,
    availablePrinters: [],
    selectedPrinter: '',
    scanRequested: false,
    lastHeartbeat: ''
  };

  const shop = db.shops.find((s: any) => s.id === shopId);
  const agent = db.agents?.find((a: any) => a.shopId === shopId);
  const lastSeenTime = agent ? new Date(agent.lastSeen).getTime() : 0;
  const isAgentOnline = agent && agent.onlineStatus === 'online' && (Date.now() - lastSeenTime) < 15000;
  const isPrinterOnline = isAgentOnline && agent.printerStatus !== 'offline';
  
  let updatedScanStatus = agent ? (agent as any).scanStatus || 'idle' : 'idle';
  if (agent && agent.scanStatus === 'scanning' && agent.scanStartedAt) {
    const elapsed = Date.now() - new Date(agent.scanStartedAt).getTime();
    if (elapsed > 30000) {
      agent.scanStatus = 'timeout';
      agent.scanRequested = false;
      updatedScanStatus = 'timeout';
      writeDb(db);
    }
  }
  
  // Scanned printer list lookup
  const shopPrinters = db.printers?.filter((p: any) => p.shopId === shopId) || [];
  const activePrinterObj = shopPrinters.find((p: any) => p.printerId === shop?.activePrinterId);
  const activePrinterName = activePrinterObj ? activePrinterObj.printerName : (agent ? agent.printerName : settings.selectedPrinter || '');

  const bwMaintenance = shop ? (shop.bwMaintenanceMode ?? false) : false;
  const bwStatusMode = shop ? (shop.bwStatusMode ?? 'auto') : 'auto';
  let bwStatus = 'offline';
  if (bwMaintenance) {
    bwStatus = 'offline';
  } else if (bwStatusMode === 'offline') {
    bwStatus = 'offline';
  } else if (bwStatusMode === 'online') {
    bwStatus = 'online';
  } else {
    bwStatus = isPrinterOnline ? 'online' : 'offline';
  }

  const colorMaintenance = shop ? (shop.colorMaintenanceMode ?? false) : false;
  const colorStatusMode = shop ? (shop.colorStatusMode ?? 'auto') : 'auto';
  let colorStatus = 'offline';
  if (colorMaintenance) {
    colorStatus = 'offline';
  } else if (colorStatusMode === 'offline') {
    colorStatus = 'offline';
  } else if (colorStatusMode === 'online') {
    colorStatus = 'online';
  } else {
    colorStatus = isPrinterOnline ? 'online' : 'offline';
  }

  const isGlobalMaintenance = bwMaintenance && colorMaintenance;
  const overallStatus = isGlobalMaintenance ? 'offline' : (
    (bwStatus === 'online' || colorStatus === 'online') ? 'online' : 'offline'
  );

  return {
    ...settings,
    status: overallStatus,
    underMaintenance: isGlobalMaintenance,
    availablePrinters: shopPrinters.map((p: any) => p.printerName),
    selectedPrinter: activePrinterName,
    bw: {
      status: bwStatus,
      underMaintenance: bwMaintenance,
      selectedPrinterId: shop ? (shop.bwPrinterId || '') : '',
      selectedPrinterName: shop ? (shop.bwPrinterName || '') : '',
      statusMode: bwStatusMode,
      expectedReturnTime: shop ? (shop.bwExpectedReturnTime || '06:02 PM') : '06:02 PM'
    },
    color: {
      status: colorStatus,
      underMaintenance: colorMaintenance,
      selectedPrinterId: shop ? (shop.colorPrinterId || '') : '',
      selectedPrinterName: shop ? (shop.colorPrinterName || '') : '',
      statusMode: colorStatusMode,
      expectedReturnTime: shop ? (shop.colorExpectedReturnTime || '06:02 PM') : '06:02 PM'
    },
    scanRequested: agent ? (agent as any).scanRequested || false : false,
    scanStatus: updatedScanStatus,
    scanStartedAt: agent ? (agent as any).scanStartedAt || '' : '',
    lastHeartbeat: agent ? agent.lastSeen : settings.lastHeartbeat || '',
    lastHeartbeatTime: agent ? agent.lastSeen : (shop ? shop.lastHeartbeat || '' : ''),
    agentId: agent ? agent.agentId : '',
    agentMachineName: agent ? agent.machineName : '',
    agentPrinterName: agent ? agent.printerName : '',
    agentDaemonVersion: agent ? agent.daemonVersion : '',
    agentOnlineStatus: agent ? agent.onlineStatus : 'offline',
    operationalState: shop ? (shop.operationalState || 'offline') : 'offline',
    systemHealth: (() => {
      const agentConnected = isAgentOnline;
      const printerOnline = isPrinterOnline;
      const printersDiscovered = shopPrinters.length > 0 || (settings.availablePrinters && settings.availablePrinters.length > 0);
      const bwPrinterSelected = !!(shop && shop.bwPrinterName);
      const colorPrinterSelected = !!(shop && shop.colorPrinterName);
      const uploadsEnabled = !isGlobalMaintenance && printerOnline;
      const approvalsEnabled = !isGlobalMaintenance && printerOnline;

      const blockers: string[] = [];
      if (!agentConnected) blockers.push('Print agent is not connected');
      if (!printerOnline) blockers.push('Printer is offline');
      if (!printersDiscovered) blockers.push('No printers discovered');
      if (isGlobalMaintenance) blockers.push('Shop is under maintenance');

      const systemReady = agentConnected && printerOnline && !isGlobalMaintenance;

      return {
        agentConnected,
        printerOnline,
        printersDiscovered,
        bwPrinterSelected,
        colorPrinterSelected,
        systemReady,
        uploadsEnabled,
        approvalsEnabled,
        currentState: systemReady ? 'READY' : 'NOT_READY',
        blockers,
        timestamp: new Date().toISOString()
      };
    })()
  };
}

// GET /api/printer/settings - fetch current printer settings and status
app.get('/api/printer/settings', requireAdmin, (req, res) => {
  const db = readDb();
  const shopId = (req.query.shopId as string) || 'alliance_print';
  const resolved = getResolvedPrinterSettings(db, shopId);
  res.json(resolved);
});

// GET /api/printer/settings/public - public printer settings and status for students
app.get('/api/printer/settings/public', (req, res) => {
  const db = readDb();
  const shopId = (req.query.shopId as string) || 'alliance_print';
  const resolved = getResolvedPrinterSettings(db, shopId);
  
  // Return only non-sensitive public fields required by the Student Portal
  res.json({
    status: resolved.status,
    underMaintenance: resolved.underMaintenance,
    expectedReturnTime: resolved.expectedReturnTime,
    averagePrintSpeed: resolved.averagePrintSpeed,
    agentOnlineStatus: resolved.agentOnlineStatus,
    systemHealth: resolved.systemHealth ? {
      agentConnected: resolved.systemHealth.agentConnected,
      printerOnline: resolved.systemHealth.printerOnline,
      printersDiscovered: resolved.systemHealth.printersDiscovered,
      bwPrinterSelected: resolved.systemHealth.bwPrinterSelected,
      colorPrinterSelected: resolved.systemHealth.colorPrinterSelected,
      systemReady: resolved.systemHealth.systemReady,
      uploadsEnabled: resolved.systemHealth.uploadsEnabled,
      approvalsEnabled: resolved.systemHealth.approvalsEnabled,
      currentState: resolved.systemHealth.currentState,
      blockers: resolved.systemHealth.blockers,
      timestamp: resolved.systemHealth.timestamp
    } : undefined
  });
});

// POST /api/printer/status - receive heartbeat from print client
app.post('/api/printer/status', requireAdmin, (req, res) => {
  const db = readDb();
  if (!db.printerSettings) {
    db.printerSettings = {
      status: 'offline',
      expectedReturnTime: '2:00 PM',
      averagePrintSpeed: 5,
      adminOverrideStatus: 'none',
      underMaintenance: false,
      availablePrinters: [],
      selectedPrinter: ''
    };
  }

  const { status, printers } = req.body;
  lastClientHeartbeat = new Date().toISOString();
  
  let hasChanged = false;

  if (db.printerSettings.adminOverrideStatus === 'none' && status !== undefined && db.printerSettings.status !== status) {
    db.printerSettings.status = status;
    hasChanged = true;
  }

  if (printers !== undefined && Array.isArray(printers)) {
    const current = db.printerSettings.availablePrinters || [];
    const isDifferent = current.length !== printers.length || 
                        !printers.every((p, idx) => p === current[idx]);
    if (isDifferent) {
      db.printerSettings.availablePrinters = printers;
      hasChanged = true;
    }
    if (db.printerSettings.scanRequested) {
      db.printerSettings.scanRequested = false;
      hasChanged = true;
    }
  }

  if (hasChanged) {
    writeDb(db);
  }

  const resolved = getResolvedPrinterSettings(db);
  broadcastSse({ type: 'printer_updated', settings: resolved });
  
  // For compatibility with any legacy code looking at shop status
  const shop = db.shops.find(s => s.id === 'alliance_print');
  if (shop) {
    let shopChanged = false;
    if (shop.printerStatus !== resolved.status) {
      shop.printerStatus = resolved.status;
      shopChanged = true;
    }
    if (shopChanged) {
      writeDb(db);
    }
    // Track heartbeat timestamp in memory only (Rule 4)
    const shopWithInMemoryHeartbeat = {
      ...shop,
      lastHeartbeat: lastClientHeartbeat
    };
    broadcastSse({ type: 'shop_updated', shop: shopWithInMemoryHeartbeat });
  }

  res.json({ success: true, settings: resolved });
});

// POST /api/printer/settings - configure printer settings from admin portal
app.post('/api/printer/settings', requireAdmin, (req, res) => {
  const db = readDb();
  if (!db.printerSettings) {
    db.printerSettings = {
      status: 'offline',
      expectedReturnTime: '2:00 PM',
      averagePrintSpeed: 5,
      adminOverrideStatus: 'none',
      underMaintenance: false
    };
  }

  const { shopId, printerType, adminOverrideStatus, expectedReturnTime, averagePrintSpeed, underMaintenance, selectedPrinter, selectedPrinterId, selectedPrinterName } = req.body;
  const targetShopId = shopId || (req as any).tokenShopId || 'tjohn_print';
  const shopIdx = db.shops.findIndex((s: any) => s.id === targetShopId);

  if (shopIdx !== -1) {
    const shop = db.shops[shopIdx];
    if (printerType === 'bw') {
      if (underMaintenance !== undefined) shop.bwMaintenanceMode = !!underMaintenance;
      if (adminOverrideStatus !== undefined) shop.bwStatusMode = adminOverrideStatus;
      if (expectedReturnTime !== undefined) shop.bwExpectedReturnTime = expectedReturnTime;
      if (selectedPrinterId !== undefined) shop.bwPrinterId = selectedPrinterId;
      if (selectedPrinterName !== undefined) shop.bwPrinterName = selectedPrinterName;
    } else if (printerType === 'color') {
      if (underMaintenance !== undefined) shop.colorMaintenanceMode = !!underMaintenance;
      if (adminOverrideStatus !== undefined) shop.colorStatusMode = adminOverrideStatus;
      if (expectedReturnTime !== undefined) shop.colorExpectedReturnTime = expectedReturnTime;
      if (selectedPrinterId !== undefined) shop.colorPrinterId = selectedPrinterId;
      if (selectedPrinterName !== undefined) shop.colorPrinterName = selectedPrinterName;
    } else {
      // Legacy updates
      if (adminOverrideStatus !== undefined) {
        db.printerSettings.adminOverrideStatus = adminOverrideStatus;
        if (adminOverrideStatus !== 'none') {
          db.printerSettings.status = adminOverrideStatus;
        }
      }
      if (expectedReturnTime !== undefined) {
        db.printerSettings.expectedReturnTime = expectedReturnTime;
      }
      if (averagePrintSpeed !== undefined) {
        db.printerSettings.averagePrintSpeed = Math.max(1, parseInt(averagePrintSpeed, 10) || 5);
      }
      if (underMaintenance !== undefined) {
        db.printerSettings.underMaintenance = !!underMaintenance;
        shop.maintenanceMode = !!underMaintenance;
      }
      if (selectedPrinter !== undefined) {
        db.printerSettings.selectedPrinter = selectedPrinter;
      }
    }

    writeDb(db);
    const resolved = getResolvedPrinterSettings(db, targetShopId);
    broadcastSse({ type: 'printer_updated', settings: resolved });
    
    // Sync shop status for compatibility
    shop.printerStatus = resolved.status;
    writeDb(db);
    broadcastSse({ type: 'shop_updated', shop });

    return res.json({ success: true, settings: resolved });
  }

  res.status(404).json({ error: 'Shop not found' });
});

// POST /api/printer/scan - trigger printer scan request
app.post('/api/printer/scan', requireAdmin, (req, res) => {
  const db = readDb();
  if (!db.printerSettings) {
    db.printerSettings = {
      status: 'offline',
      expectedReturnTime: '2:00 PM',
      averagePrintSpeed: 5,
      adminOverrideStatus: 'none',
      underMaintenance: false,
      availablePrinters: [],
      selectedPrinter: '',
      scanRequested: false
    };
  }
  db.printerSettings.scanRequested = true;
  writeDb(db);
  const resolved = getResolvedPrinterSettings(db);
  broadcastSse({ type: 'printer_updated', settings: resolved });

  // Auto-timeout scan request after 20 seconds to prevent getting stuck
  setTimeout(() => {
    const currentDb = readDb();
    if (currentDb.printerSettings && currentDb.printerSettings.scanRequested) {
      currentDb.printerSettings.scanRequested = false;
      writeDb(currentDb);
      const updatedResolved = getResolvedPrinterSettings(currentDb);
      broadcastSse({ type: 'printer_updated', settings: updatedResolved });
    }
  }, 20000);

  res.json({ success: true, settings: resolved });
});

// POST /api/shop/go-online - transition shop operationalState to connecting
app.post('/api/shop/go-online', requireAdmin, (req, res) => {
  const { shopId } = req.body;
  if (!shopId) {
    return res.status(400).json({ error: 'Missing shopId' });
  }

  const db = readDb();
  const shop = db.shops.find((s: any) => s.id === shopId);
  if (!shop) {
    return res.status(404).json({ error: `Shop "${shopId}" not found.` });
  }

  shop.operationalState = 'connecting';
  writeDb(db);

  const resolved = getResolvedPrinterSettings(db, shopId);
  broadcastSse({ type: 'printer_updated', settings: resolved });

  res.json({ success: true });
});

// POST /api/shop/go-offline - transition shop operationalState to offline
app.post('/api/shop/go-offline', requireAdmin, (req, res) => {
  const { shopId } = req.body;
  if (!shopId) {
    return res.status(400).json({ error: 'Missing shopId' });
  }

  // Clear in-memory tracking maps
  shopLastHeartbeatMemory.delete(shopId);

  const db = readDb();
  const shop = db.shops.find((s: any) => s.id === shopId);
  if (!shop) {
    return res.status(404).json({ error: `Shop "${shopId}" not found.` });
  }

  shop.operationalState = 'offline';
  shop.printerStatus = 'offline';
  shop.lastHeartbeat = '';

  // Mark matching agent as offline if any and clear memory
  if (db.agents) {
    const agents = db.agents.filter((a: any) => a.shopId === shopId);
    agents.forEach((agent: any) => {
      agent.onlineStatus = 'offline';
      agent.printerStatus = 'offline';
      agentLastSeenMemory.delete(agent.agentId);
      broadcastSse({ type: 'agent_offline', agentId: agent.agentId, shopId });
    });
  }

  writeDb(db);

  const resolved = getResolvedPrinterSettings(db, shopId);
  broadcastSse({ type: 'printer_updated', settings: resolved });
  broadcastSse({ type: 'shop_updated', shop });

  res.json({ success: true });
});

// GET /api/shops - list all print shops with dynamic heartbeat status checks
app.get('/api/shops', (req, res) => {
  const db = readDb();
  
  const mappedShops = db.shops.map(shop => {
    const agent = db.agents?.find(a => a.shopId === shop.id);
    const now = Date.now();
    const lastSeenTime = agent && agent.lastSeen ? new Date(agent.lastSeen).getTime() : 0;
    const isOnline = agent && agent.onlineStatus === 'online' && (now - lastSeenTime) < 15000;
    const printerStatus = isOnline ? 'online' : 'offline';
    
    return {
      ...sanitizeShop(shop),
      printerStatus,
      lastHeartbeat: agent && lastSeenTime > 0 ? agent.lastSeen : shop.lastHeartbeat || '',
      printerName: agent ? agent.printerName : (shop.id === 'alliance_print' ? (db.printerSettings?.selectedPrinter || 'UNKNOWN') : 'UNKNOWN'),
      daemonVersion: agent ? agent.daemonVersion : '1.0.0'
    };
  });
  
  res.json(mappedShops);
});

// GET /api/shops/:id - get shop details by ID
app.get('/api/shops/:id', (req, res) => {
  const db = readDb();
  const shop = db.shops.find(s => s.id === req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });
  
  const agent = db.agents?.find(a => a.shopId === shop.id);
  const now = Date.now();
  const lastSeenTime = agent ? new Date(agent.lastSeen).getTime() : 0;
  const isOnline = agent && agent.onlineStatus === 'online' && (now - lastSeenTime) < 15000;
  const printerStatus = isOnline ? 'online' : 'offline';

  const shopPrinters = db.printers?.filter(p => p.shopId === shop.id) || [];
  const activePrinter = shopPrinters.find(p => p.printerId === shop.activePrinterId);

  res.json({
    ...sanitizeShop(shop),
    printerStatus,
    lastHeartbeat: agent && lastSeenTime > 0 ? agent.lastSeen : shop.lastHeartbeat || '',
    printerName: agent ? agent.printerName : 'UNKNOWN',
    daemonVersion: agent ? agent.daemonVersion : '1.0.0',
    printers: shopPrinters,
    activePrinter: activePrinter || null
  });
});

// PUT /api/shops/:id/settings - configure shop details
app.put('/api/shops/:id/settings', requireAdmin, (req, res) => {
  const { name, ownerName, phoneNumber, address } = req.body;
  const db = readDb();
  const shopIdx = db.shops.findIndex(s => s.id === req.params.id);
  if (shopIdx === -1) return res.status(404).json({ error: 'Shop not found' });
  
  const shop = db.shops[shopIdx];
  if (name) shop.name = name;
  if (ownerName) shop.ownerName = ownerName;
  if (phoneNumber) {
    shop.phoneNumber = phoneNumber;
    shop.phone = phoneNumber; // sync legacy
  }
  if (address) shop.address = address;
  
  writeDb(db);
  broadcastSse({ type: 'shop_updated', shop });
  res.json(sanitizeShop(shop));
});

// PUT /api/shops/:id/pricing - configure shop pricing
app.put('/api/shops/:id/pricing', requireAdmin, (req, res) => {
  const { bwPrice, colorPrice, duplexPrice } = req.body;
  const db = readDb();
  const shopIdx = db.shops.findIndex(s => s.id === req.params.id);
  if (shopIdx === -1) return res.status(404).json({ error: 'Shop not found' });
  
  const shop = db.shops[shopIdx];
  if (bwPrice !== undefined) shop.bwPrice = Number(bwPrice);
  if (colorPrice !== undefined) shop.colorPrice = Number(colorPrice);
  if (duplexPrice !== undefined) shop.duplexPrice = Number(duplexPrice);
  
  writeDb(db);
  broadcastSse({ type: 'shop_updated', shop });
  res.json(sanitizeShop(shop));
});

// PUT /api/shops/:id/maintenance - toggle maintenance mode
app.put('/api/shops/:id/maintenance', requireAdmin, (req, res) => {
  const { maintenanceMode } = req.body;
  const db = readDb();
  const shopIdx = db.shops.findIndex(s => s.id === req.params.id);
  if (shopIdx === -1) return res.status(404).json({ error: 'Shop not found' });
  
  const shop = db.shops[shopIdx];
  shop.maintenanceMode = !!maintenanceMode;
  shop.bwMaintenanceMode = !!maintenanceMode;
  shop.colorMaintenanceMode = !!maintenanceMode;
  
  writeDb(db);
  
  const resolved = getResolvedPrinterSettings(db, req.params.id);
  broadcastSse({ type: 'printer_updated', settings: resolved });
  
  // Sync shop status
  shop.printerStatus = resolved.status;
  writeDb(db);
  broadcastSse({ type: 'shop_updated', shop });
  
  res.json(sanitizeShop(shop));
});

// PUT /api/shops/:id/select-printer - select active printer
app.put('/api/shops/:id/select-printer', requireAdmin, (req, res) => {
  const { printerId } = req.body;
  const db = readDb();
  const shopIdx = db.shops.findIndex(s => s.id === req.params.id);
  if (shopIdx === -1) return res.status(404).json({ error: 'Shop not found' });
  
  const shop = db.shops[shopIdx];
  shop.activePrinterId = printerId;
  
  // Update legacy selectedPrinter if it's the default shop
  const printer = db.printers?.find(p => p.printerId === printerId);
  if (printer && shop.id === 'alliance_print') {
    if (db.printerSettings) {
      db.printerSettings.selectedPrinter = printer.printerName;
    }
  }
  
  writeDb(db);
  broadcastSse({ type: 'shop_updated', shop });
  res.json(shop);
});

// GET /api/printers/mapping - fetch printer mapping for a shop
app.get('/api/printers/mapping', requireAdmin, (req, res) => {
  const shopId = (req.query.shopId as string) || (req as any).tokenShopId || 'tjohn_print';
  const db = readDb();
  const shop = db.shops.find(s => s.id === shopId);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });
  
  res.json({
    bwPrinterId: shop.bwPrinterId || '',
    bwPrinterName: shop.bwPrinterName || '',
    colorPrinterId: shop.colorPrinterId || '',
    colorPrinterName: shop.colorPrinterName || ''
  });
});

// PUT /api/printers/mapping - configure printer mappings for a shop
app.put('/api/printers/mapping', requireAdmin, (req, res) => {
  const shopId = (req.body.shopId as string) || (req as any).tokenShopId || 'tjohn_print';
  const { bwPrinterId, bwPrinterName, colorPrinterId, colorPrinterName } = req.body;
  const db = readDb();
  const shopIdx = db.shops.findIndex(s => s.id === shopId);
  if (shopIdx === -1) return res.status(404).json({ error: 'Shop not found' });
  
  const shop = db.shops[shopIdx];
  if (bwPrinterId !== undefined) shop.bwPrinterId = bwPrinterId;
  if (bwPrinterName !== undefined) shop.bwPrinterName = bwPrinterName;
  if (colorPrinterId !== undefined) shop.colorPrinterId = colorPrinterId;
  if (colorPrinterName !== undefined) shop.colorPrinterName = colorPrinterName;
  
  writeDb(db);
  broadcastSse({ type: 'shop_updated', shop });
  
  res.json({
    bwPrinterId: shop.bwPrinterId || '',
    bwPrinterName: shop.bwPrinterName || '',
    colorPrinterId: shop.colorPrinterId || '',
    colorPrinterName: shop.colorPrinterName || ''
  });
});

// PUT /api/printers/bw - configure B&W printer settings (bwPrinterId, bwPrinterName, bwMaintenanceMode)
app.put('/api/printers/bw', requireAdmin, (req, res) => {
  const shopId = (req.body.shopId as string) || (req as any).tokenShopId || 'tjohn_print';
  let { bwPrinterId, bwPrinterName, bwMaintenanceMode } = req.body;
  const db = readDb();
  const shopIdx = db.shops.findIndex(s => s.id === shopId);
  if (shopIdx === -1) return res.status(404).json({ error: 'Shop not found' });
  
  const shop = db.shops[shopIdx];
  if (bwPrinterId !== undefined) {
    shop.bwPrinterId = bwPrinterId;
  }
  if (!bwPrinterName && shop.bwPrinterId) {
    const match = db.printers?.find(p => p.printerId === shop.bwPrinterId && p.shopId === shopId);
    bwPrinterName = match ? match.printerName : shop.bwPrinterId.replace(/_/g, ' ');
  }
  if (bwPrinterName) shop.bwPrinterName = bwPrinterName;
  if (bwMaintenanceMode !== undefined) shop.bwMaintenanceMode = !!bwMaintenanceMode;
  
  writeDb(db);
  const resolved = getResolvedPrinterSettings(db, shopId);
  broadcastSse({ type: 'printer_updated', settings: resolved });
  
  // Sync shop status for compatibility
  shop.printerStatus = resolved.status;
  writeDb(db);
  broadcastSse({ type: 'shop_updated', shop });
  
  res.json({
    bwPrinterId: shop.bwPrinterId || '',
    bwPrinterName: shop.bwPrinterName || '',
    bwMaintenanceMode: shop.bwMaintenanceMode || false
  });
});

// PUT /api/printers/color - configure Color printer settings (colorPrinterId, colorPrinterName, colorMaintenanceMode)
app.put('/api/printers/color', requireAdmin, (req, res) => {
  const shopId = (req.body.shopId as string) || (req as any).tokenShopId || 'tjohn_print';
  let { colorPrinterId, colorPrinterName, colorMaintenanceMode } = req.body;
  const db = readDb();
  const shopIdx = db.shops.findIndex(s => s.id === shopId);
  if (shopIdx === -1) return res.status(404).json({ error: 'Shop not found' });
  
  const shop = db.shops[shopIdx];
  if (colorPrinterId !== undefined) {
    shop.colorPrinterId = colorPrinterId;
  }
  if (!colorPrinterName && shop.colorPrinterId) {
    const match = db.printers?.find(p => p.printerId === shop.colorPrinterId && p.shopId === shopId);
    colorPrinterName = match ? match.printerName : shop.colorPrinterId.replace(/_/g, ' ');
  }
  if (colorPrinterName) shop.colorPrinterName = colorPrinterName;
  if (colorMaintenanceMode !== undefined) shop.colorMaintenanceMode = !!colorMaintenanceMode;
  
  writeDb(db);
  const resolved = getResolvedPrinterSettings(db, shopId);
  broadcastSse({ type: 'printer_updated', settings: resolved });
  
  // Sync shop status for compatibility
  shop.printerStatus = resolved.status;
  writeDb(db);
  broadcastSse({ type: 'shop_updated', shop });
  
  res.json({
    colorPrinterId: shop.colorPrinterId || '',
    colorPrinterName: shop.colorPrinterName || '',
    colorMaintenanceMode: shop.colorMaintenanceMode || false
  });
});

// POST /api/agent/scan-printers - trigger scan for a shop's agent
app.post('/api/agent/scan-printers', requireAdmin, (req, res) => {
  const { shopId } = req.body;
  if (!shopId) return res.status(400).json({ error: 'Missing shopId' });
  
  const db = readDb();
  const agent = db.agents?.find(a => a.shopId === shopId);
  if (!agent) return res.status(404).json({ error: 'No active agent registered for this shop' });
  
  // Check for timeout first to clear any stale scanning state
  if (agent.scanStatus === 'scanning' && agent.scanStartedAt) {
    const elapsed = Date.now() - new Date(agent.scanStartedAt).getTime();
    if (elapsed > 30000) {
      agent.scanStatus = 'timeout';
      agent.scanRequested = false;
    }
  }

  if (agent.scanStatus === 'scanning') {
    return res.status(400).json({ error: 'Printer discovery already in progress' });
  }
  
  // Set scan fields on the agent record
  agent.scanRequested = true;
  agent.scanStatus = 'scanning';
  agent.scanStartedAt = new Date().toISOString();
  writeDb(db);
  
  // Broadcast SSE event for print client
  broadcastSse({ type: 'scan_printers', shopId });
  
  // Broadcast printer settings update to frontend to instantly show loading states
  broadcastSse({ type: 'printer_updated', settings: getResolvedPrinterSettings(db, shopId) });
  
  res.json({ success: true, message: 'Scan initiated' });
});

// POST /api/agent/register - Register a remote print agent
app.post('/api/agent/register', requireAdmin, (req, res) => {
  const { agentId, shopId, machineName, printerName, daemonVersion, printers } = req.body;

  if (!agentId || !shopId) {
    return res.status(400).json({ error: 'Missing agentId or shopId' });
  }

  const db = readDb();
  if (!db.agents) {
    db.agents = [];
  }

  let agentIdx = db.agents.findIndex(a => a.shopId === shopId);
  const now = new Date().toISOString();

  const newAgent: Agent = {
    agentId,
    shopId,
    machineName: machineName || 'UNKNOWN',
    printerName: printerName || 'UNKNOWN',
    daemonVersion: daemonVersion || '1.0.0',
    onlineStatus: 'online',
    lastSeen: now
  };

  if (agentIdx !== -1) {
    db.agents[agentIdx] = newAgent;
  } else {
    db.agents.push(newAgent);
  }

  // Update printers database table if provided
  if (Array.isArray(printers)) {
    if (!db.printers) db.printers = [];
    db.printers = db.printers.filter(p => p.shopId !== shopId);
    printers.forEach(pName => {
      db.printers!.push({
        printerId: formatPrinterId(pName),
        shopId,
        printerName: pName,
        status: 'online',
        discoveredAt: now
      });
    });
  }

  // Sync shop status to online
  const shop = db.shops.find(s => s.id === shopId);
  if (!shop) {
    return res.status(404).json({ error: `Shop "${shopId}" is not registered on the platform.` });
  }
  shop.printerStatus = 'online';
  shop.operationalState = 'online';

  // Sync legacy printerSettings if default shop
  if (shopId === 'alliance_print') {
    if (!db.printerSettings) {
      db.printerSettings = {
        status: 'online',
        expectedReturnTime: '2:00 PM',
        averagePrintSpeed: 5,
        adminOverrideStatus: 'none',
        availablePrinters: [printerName].filter(Boolean),
        selectedPrinter: printerName || ''
      };
    } else {
      if (db.printerSettings.adminOverrideStatus === 'none') {
        db.printerSettings.status = 'online';
      }
      if (printerName && !db.printerSettings.availablePrinters?.includes(printerName)) {
        db.printerSettings.availablePrinters = db.printerSettings.availablePrinters || [];
        db.printerSettings.availablePrinters.push(printerName);
      }
    }
  }

  writeDb(db);

  // Broadcast events via SSE (Requirement: agent_registered, agent_online)
  broadcastSse({
    type: 'agent_registered',
    agentId,
    shopId
  });
  broadcastSse({
    type: 'agent_online',
    agentId,
    shopId
  });
  if (shop) {
    broadcastSse({ type: 'shop_updated', shop });
  }
  if (shopId === 'alliance_print') {
    broadcastSse({ type: 'printer_updated', settings: getResolvedPrinterSettings(db) });
  }

  res.json({ success: true });
});

// POST /api/agent/heartbeat - Update heartbeat for a remote print agent
app.post('/api/agent/heartbeat', requireAdmin, (req, res) => {
  const { agentId, shopId, printerName, daemonVersion, printers, printerStatus } = req.body;

  if (!agentId || !shopId) {
    return res.status(400).json({ error: 'Missing agentId or shopId' });
  }

  const now = new Date().toISOString();
  // Update in memory maps first
  agentLastSeenMemory.set(agentId, now);
  shopLastHeartbeatMemory.set(shopId, now);

  const db = readDb();
  if (!db.agents) {
    db.agents = [];
  }

  const agentIdx = db.agents.findIndex(a => a.agentId === agentId);
  if (agentIdx === -1) {
    return res.status(404).json({ error: 'Agent not registered. Please register first.' });
  }

  const agent = db.agents[agentIdx];
  let changed = false;
  let statusChanged = false;

  agent.lastSeen = now;

  if (printerName !== undefined && agent.printerName !== printerName) {
    agent.printerName = printerName;
    changed = true;
  }
  if (daemonVersion !== undefined && agent.daemonVersion !== daemonVersion) {
    agent.daemonVersion = daemonVersion;
    changed = true;
  }
  if (printerStatus !== undefined && agent.printerStatus !== printerStatus) {
    agent.printerStatus = printerStatus;
    changed = true;
  }
  
  if (agent.onlineStatus !== 'online') {
    agent.onlineStatus = 'online';
    statusChanged = true;
    changed = true;
  }

  // Update printers database table if changed
  if (Array.isArray(printers)) {
    if (!db.printers) db.printers = [];
    const currentShopPrinters = db.printers.filter(p => p.shopId === shopId);
    
    // Check if the printers list actually changed
    let printersListChanged = false;
    if (currentShopPrinters.length !== printers.length) {
      printersListChanged = true;
    } else {
      for (let i = 0; i < printers.length; i++) {
        if (currentShopPrinters[i].printerName !== printers[i]) {
          printersListChanged = true;
          break;
        }
      }
    }

    if (printersListChanged) {
      db.printers = db.printers.filter(p => p.shopId !== shopId);
      printers.forEach((pName: string, idx: number) => {
        db.printers!.push({
          printerId: `${shopId}_${idx + 1}`,
          shopId,
          printerName: pName,
          status: 'online',
          discoveredAt: now
        });
      });
      changed = true;
    }

    if ((agent as any).scanStatus === 'scanning') {
      (agent as any).scanStatus = 'completed';
      changed = true;
    } else if ((agent as any).scanStatus !== 'idle' && (agent as any).scanStatus !== 'completed' && (agent as any).scanStatus !== 'timeout' && (agent as any).scanStatus !== 'error') {
      (agent as any).scanStatus = 'idle';
      changed = true;
    }
  }

  // Sync shop status to reported printer status
  const shop = db.shops.find(s => s.id === shopId);
  if (shop) {
    const targetStatus = printerStatus === 'offline' ? 'offline' : 'online';
    if (shop.printerStatus !== targetStatus) {
      shop.printerStatus = targetStatus;
      changed = true;
    }
    if (shop.operationalState !== 'online') {
      shop.operationalState = 'online';
      changed = true;
    }
    shop.lastHeartbeat = now;
  }

  // Sync legacy printerSettings if default shop
  if (shopId === 'alliance_print') {
    if (db.printerSettings && db.printerSettings.adminOverrideStatus === 'none') {
      const targetStatus = printerStatus === 'offline' ? 'offline' : 'online';
      if (db.printerSettings.status !== targetStatus) {
        db.printerSettings.status = targetStatus;
        changed = true;
      }
    }
  }

  const scanRequested = (agent as any).scanRequested || false;
  if (scanRequested) {
    (agent as any).scanRequested = false;
    changed = true;
  }

  if (changed) {
    writeDb(db);
  }

  // Broadcast events via SSE using current merged DB
  broadcastSse({
    type: 'heartbeat_received',
    agentId,
    shopId
  });
  if (statusChanged) {
    broadcastSse({
      type: 'agent_online',
      agentId,
      shopId
    });
  }
  if (shop) {
    broadcastSse({ type: 'shop_updated', shop });
  }
  
  const resolved = getResolvedPrinterSettings(db, shopId);
  broadcastSse({ type: 'printer_updated', settings: resolved });

  res.json({
    success: true,
    acknowledged: true,
    serverTime: now,
    scanRequested
  });
});

// POST /api/agent/shutdown - Agent process graceful shutdown notification
app.post('/api/agent/shutdown', requireAdmin, (req, res) => {
  const { agentId, shopId } = req.body;
  const db = readDb();
  
  if (shopId) {
    shopLastHeartbeatMemory.delete(shopId);
    const shop = db.shops.find((s: any) => s.id === shopId);
    if (shop) {
      shop.operationalState = 'offline';
      shop.printerStatus = 'offline';
      shop.lastHeartbeat = '';
    }
  }

  if (agentId && db.agents) {
    const agent = db.agents.find((a: any) => a.agentId === agentId);
    if (agent) {
      agent.onlineStatus = 'offline';
      agent.printerStatus = 'offline';
      agentLastSeenMemory.delete(agentId);
      broadcastSse({ type: 'agent_offline', agentId, shopId: agent.shopId });
    }
  }

  writeDb(db);
  if (shopId) {
    const resolved = getResolvedPrinterSettings(db, shopId);
    broadcastSse({ type: 'printer_updated', settings: resolved });
    const shop = db.shops.find((s: any) => s.id === shopId);
    if (shop) broadcastSse({ type: 'shop_updated', shop });
  }

  res.json({ success: true });
});

// POST /api/shops/:id/heartbeat - legacy heartbeat support redirecting to printer status
app.post('/api/shops/:id/heartbeat', requireAdmin, (req, res) => {
  const db = readDb();
  const { printerStatus } = req.body;
  
  let hasChanged = false;
  if (req.params.id === 'alliance_print') {
    if (!db.printerSettings) {
      db.printerSettings = {
        status: 'offline',
        expectedReturnTime: '2:00 PM',
        averagePrintSpeed: 5,
        adminOverrideStatus: 'none'
      };
      hasChanged = true;
    }
    lastClientHeartbeat = new Date().toISOString();
    shopLastHeartbeatMemory.set(req.params.id, lastClientHeartbeat);
    if (db.printerSettings.adminOverrideStatus === 'none' && printerStatus !== undefined && db.printerSettings.status !== printerStatus) {
      db.printerSettings.status = printerStatus;
      hasChanged = true;
    }
    if (hasChanged) {
      writeDb(db);
    }
  }

  const shop = db.shops.find(s => s.id === req.params.id);
  let responseShop = shop;
  if (shop) {
    let shopChanged = false;
    if (shop.printerStatus !== printerStatus) {
      shop.printerStatus = printerStatus;
      shopChanged = true;
    }
    if (shopChanged) {
      writeDb(db);
    }
    // Track heartbeat timestamp in memory only (Rule 4)
    lastClientHeartbeat = new Date().toISOString();
    shopLastHeartbeatMemory.set(req.params.id, lastClientHeartbeat);
    responseShop = {
      ...sanitizeShop(shop),
      lastHeartbeat: lastClientHeartbeat
    };
    broadcastSse({ type: 'shop_updated', shop: responseShop });
  }
  
  res.json({ success: true, shop: responseShop });
});

// POST /api/shops/:id - update shop status and settings
app.post('/api/shops/:id', requireAdmin, (req, res) => {
  const db = readDb();
  const shop = db.shops.find(s => s.id === req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });
  
  const { name, phone, address, isOpen, openingTime, closingTime } = req.body;
  if (name !== undefined) shop.name = name;
  if (phone !== undefined) shop.phone = phone;
  if (address !== undefined) shop.address = address;
  if (isOpen !== undefined) shop.isOpen = isOpen;
  if (openingTime !== undefined) shop.openingTime = openingTime;
  if (closingTime !== undefined) shop.closingTime = closingTime;
  
  writeDb(db);
  broadcastSse({ type: 'shop_updated', shop });
  res.json(sanitizeShop(shop));
});

// GET /api/jobs - list all jobs (most recent first)
// Public endpoint: only returns safe fields (no student PII)
app.get('/api/jobs', (req, res) => {
  const { shopId } = req.query;
  const db = readDb();
  let jobsList = db.jobs;
  if (shopId) {
    jobsList = jobsList.filter(j => j.shopId === shopId);
  }
  // Strip sensitive student data for public access
  const safeJobs = jobsList.slice().reverse().map(j => ({
    id: j.id,
    token: j.token,
    fileName: j.fileName,
    fileSize: j.fileSize,
    pageCount: j.pageCount,
    copies: j.copies,
    printMode: j.printMode,
    sides: j.sides,
    status: j.status,
    createdAt: j.createdAt,
    progressPercent: j.progressPercent,
    reason: j.reason,
    scheduledFor: j.scheduledFor,
    shopId: j.shopId,
  }));
  res.json(safeJobs);
});

app.post('/api/jobs', uploadLimiter, upload.array('files', 10), async (req, res) => {
  try {
    const { studentName, studentEmail, configs, scheduledFor, shopId } = req.body;
    const targetShopId = shopId || 'alliance_print';

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    let configList: any[] = [];
    try {
      if (configs) {
        configList = JSON.parse(configs);
      }
    } catch (err) {
      console.error('Failed to parse configs JSON:', err);
    }

    // Strict page range regex validation (Priority 4)
    const pageRangeRegex = /^\d+(-\d+)?(,\d+(-\d+)?)*$/;
    for (let idx = 0; idx < configList.length; idx++) {
      const conf = configList[idx];
      if (conf && conf.pageRange && conf.pageRange.trim()) {
        const trimmedRange = conf.pageRange.trim();
        if (!pageRangeRegex.test(trimmedRange)) {
          if (files && files.length > 0) {
            files.forEach(f => {
              try { fs.unlinkSync(f.path); } catch {}
            });
          }
          return res.status(400).json({ 
            error: `Invalid page range format: "${conf.pageRange}". Please use numbers, hyphens, and commas (e.g. '1-3,5').` 
          });
        }
      }
    }

    let hasBw = false;
    let hasColor = false;
    const parsedFiles: {
      file: Express.Multer.File;
      pageCount: number;
      copiesNum: number;
      printType: 'bw' | 'color';
      printMode: 'mono' | 'color';
      sides: 'single' | 'double';
      pageRange?: string;
    }[] = [];

    // 1. Process files asynchronously (running PDF loading, signatures validation, extension checks)
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileConfig = configList[i] || {};
      
      const ext = path.extname(file.originalname).toLowerCase();
      const mime = file.mimetype.toLowerCase();

      // 1.1 Extension and MIME type check
      const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.ppt', '.pptx'];
      const allowedMimes = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/pjpeg',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ];

      if (!allowedExts.includes(ext) || !allowedMimes.includes(mime)) {
        try { fs.unlinkSync(file.path); } catch {}
        for (let j = i + 1; j < files.length; j++) {
          try { fs.unlinkSync(files[j].path); } catch {}
        }
        return res.status(400).json({ 
          error: `Invalid file type for "${file.originalname}". Only PDF, images, Word (.doc/.docx), and PowerPoint (.ppt/.pptx) are supported.` 
        });
      }

      // 1.2 Magic Bytes Check
      let isSignatureValid = false;
      try {
        const buffer = Buffer.alloc(8);
        const fd = fs.openSync(file.path, 'r');
        fs.readSync(fd, buffer, 0, 8, 0);
        fs.closeSync(fd);

        const hex = buffer.toString('hex').toUpperCase();

        if (ext === '.pdf') {
          isSignatureValid = hex.startsWith('25504446');
        } else if (ext === '.png') {
          isSignatureValid = hex.startsWith('89504E47');
        } else if (ext === '.jpg' || ext === '.jpeg') {
          isSignatureValid = hex.startsWith('FFD8FF');
        } else if (ext === '.docx' || ext === '.pptx') {
          isSignatureValid = hex.startsWith('504B0304');
        } else if (ext === '.doc' || ext === '.ppt') {
          isSignatureValid = hex.startsWith('D0CF11E0');
        }
      } catch (err) {
        console.error('Magic bytes read failed:', err);
      }

      if (!isSignatureValid) {
        try { fs.unlinkSync(file.path); } catch {}
        for (let j = i + 1; j < files.length; j++) {
          try { fs.unlinkSync(files[j].path); } catch {}
        }
        return res.status(400).json({ 
          error: `Security verification failed: File contents of "${file.originalname}" do not match its extension (${ext}).` 
        });
      }

      const copiesNum = Math.max(1, Math.min(10, parseInt(fileConfig.copies, 10) || 1));
      const printType = fileConfig.printType === 'color' ? 'color' : 'bw';
      const printMode = printType === 'color' ? 'color' : 'mono';
      const sides = fileConfig.sides === 'double' ? 'double' : 'single';
      const pageRange = fileConfig.pageRange || undefined;

      if (printType === 'color') hasColor = true;
      else hasBw = true;

      let pageCount = 1;
      if (ext === '.pdf') {
        try {
          const fileBuffer = fs.readFileSync(file.path);
          const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
          pageCount = pdfDoc.getPageCount();
        } catch (err) {
          console.error('pdf-lib failed to read page count, falling back to regex:', err);
          try {
            const buf = fs.readFileSync(file.path, 'latin1');
            const match = buf.match(/\/Count\s+(\d+)/g);
            if (match) {
              const counts = match.map(m => parseInt(m.replace(/\/Count\s+/, ''), 10)).filter(n => !isNaN(n));
              if (counts.length > 0) pageCount = Math.max(...counts);
            }
          } catch {}
        }
      }

      parsedFiles.push({
        file,
        pageCount,
        copiesNum,
        printType,
        printMode,
        sides,
        pageRange
      });
    }

    // 2. Synchronous Database Update Block (Fully atomic)
    const db = readDb();
    const shop = db.shops.find(s => s.id === targetShopId);
    if (!shop) {
      if (files && files.length > 0) {
        files.forEach(f => {
          try { fs.unlinkSync(f.path); } catch {}
        });
      }
      return res.status(404).json({ error: `Shop "${targetShopId}" is not registered on the platform.` });
    }

    const isGlobalMaintenance = !!shop.bwMaintenanceMode && !!shop.colorMaintenanceMode;
    if (isGlobalMaintenance) {
      if (files && files.length > 0) {
        files.forEach(f => {
          try { fs.unlinkSync(f.path); } catch {}
        });
      }
      return res.status(503).json({ error: 'This print shop is currently under maintenance.' });
    }

    if (hasBw && shop.bwMaintenanceMode) {
      if (files && files.length > 0) {
        files.forEach(f => {
          try { fs.unlinkSync(f.path); } catch {}
        });
      }
      return res.status(503).json({ error: 'The Black & White printer is currently under maintenance. B&W print submissions are temporarily disabled.' });
    }

    if (hasColor && shop.colorMaintenanceMode) {
      if (files && files.length > 0) {
        files.forEach(f => {
          try { fs.unlinkSync(f.path); } catch {}
        });
      }
      return res.status(503).json({ error: 'The Color printer is currently under maintenance. Color print submissions are temporarily disabled.' });
    }

    const shopAgent = db.agents?.find((a: any) => a.shopId === targetShopId);
    const isAgentOffline = !shopAgent || shopAgent.onlineStatus === 'offline';
    const isPrinterOffline = shopAgent && shopAgent.printerStatus === 'offline';
    if (isAgentOffline || isPrinterOffline) {
      if (files && files.length > 0) {
        files.forEach(f => {
          try { fs.unlinkSync(f.path); } catch {}
        });
      }
      const errMsg = isPrinterOffline 
        ? 'The print shop printer is currently offline. Print submissions are temporarily disabled.'
        : 'The print shop is currently offline. Print submissions are temporarily disabled.';
      return res.status(503).json({ error: errMsg });
    }

    // Auto schedule if the shop is closed
    let finalScheduledFor = scheduledFor || undefined;
    if (shop && !shop.isOpen) {
      finalScheduledFor = getNextOpeningTime(shop.openingTime);
    }

    const createdJobs: DbJob[] = [];

    for (const parsed of parsedFiles) {
      const { file, pageCount, copiesNum, printType, printMode, sides, pageRange } = parsed;
      const job: DbJob = {
        id: 'job-' + Date.now() + '-' + Math.round(Math.random() * 1e5),
        token: genToken(),
        fileName: file.originalname,
        fileSize: file.size,
        pageCount,
        copies: copiesNum,
        printMode,
        printType,
        sides,
        pageRange,
        status: 'pending_approval',
        chargedAmount: calculateJobPrice({ pageCount, copies: copiesNum, printType, printMode, sides, pageRange }, shop),
        tokenId: genApprovalToken(db.jobs),
        studentName: studentName || 'Student',
        studentEmail: studentEmail || '',
        createdAt: new Date().toISOString(),
        progressPercent: 0,
        serverFilePath: '/uploads/' + file.filename,
        scheduledFor: finalScheduledFor,
        shopId: targetShopId,
        timeline: [
          {
            stage: 'uploaded',
            at: new Date().toISOString(),
            printerId: formatPrinterId(db.printerSettings?.selectedPrinter || 'UNKNOWN'),
            printerName: db.printerSettings?.selectedPrinter || 'UNKNOWN'
          }
        ]
      };

      db.jobs.push(job);
      createdJobs.push(job);

      console.log(`[NEW JOB] ${job.token} | ${job.fileName} | ${job.pageCount} pages x ${job.copies} copies | Mode: ${job.printMode} | Shop: ${job.shopId}`);
    }

    writeDb(db);

    // Broadcast real-time SSE event to print client and browsers for each job
    createdJobs.forEach(job => {
      broadcastSse({ type: 'new_job', job });
    });

    res.status(201).json(createdJobs);
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/jobs/next - get next queued job for print client (atomic claim)
app.get('/api/jobs/next', requireAdmin, (req, res) => {
  const { shopId } = req.query;
  const db = readDb();

  // Block if printer is offline
  const resolved = getResolvedPrinterSettings(db, shopId as string);
  if (resolved.status === 'offline') {
    return res.status(404).json({ message: 'Printer is offline. Queue is paused.' });
  }

  const now = new Date();
  const next = db.jobs.find(j => {
    if (j.status !== 'queued') return false;
    if (shopId && j.shopId !== shopId) return false;
    if (j.scheduledFor) {
      const scheduledTime = new Date(j.scheduledFor);
      return now >= scheduledTime;
    }
    return true;
  });
  if (!next) return res.status(404).json({ message: 'No queued jobs' });

  // Atomic Claim: Immediately change status to printing and write to db
  next.status = 'printing';
  next.progressPercent = 0;
  if (!next.timeline) next.timeline = [];
  
  const defaultPrinterName = db.printerSettings?.selectedPrinter || 'UNKNOWN';
  next.timeline.push({
    stage: 'claimed',
    at: new Date().toISOString(),
    printerId: formatPrinterId(defaultPrinterName),
    printerName: defaultPrinterName
  });

  writeDb(db);
  broadcastSse({ type: 'job_updated', job: next });

  res.json(next);
});

// POST /api/jobs/:id/approve - approve print job (shop admin only)
app.post('/api/jobs/:id/approve', requireAdmin, (req, res) => {
  const db = readDb();
  const idx = db.jobs.findIndex(j => j.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Print job not found' });
  }

  const job = db.jobs[idx];
  if (job.status !== 'pending_approval') {
    return res.status(400).json({ error: 'Job is not pending approval' });
  }

  job.status = 'queued';
  if (!job.timeline) job.timeline = [];
  job.timeline.push({
    stage: 'approved',
    at: new Date().toISOString(),
    printerId: formatPrinterId(db.printerSettings?.selectedPrinter || 'UNKNOWN'),
    printerName: db.printerSettings?.selectedPrinter || 'UNKNOWN'
  });

  writeDb(db);
  broadcastSse({ type: 'job_updated', job });
  res.json({ success: true, job });
});

// GET /api/jobs/token/:tokenId - search print job by tokenId (shop admin only)
app.get('/api/jobs/token/:tokenId', requireAdmin, (req, res) => {
  const db = readDb();
  const searchToken = req.params.tokenId.toUpperCase();
  const job = db.jobs.find(j => j.tokenId && j.tokenId.toUpperCase() === searchToken);

  if (!job) {
    return res.status(404).json({ error: 'Job not found with this token' });
  }

  const tokenShopId = (req as any).tokenShopId;
  if (tokenShopId && job.shopId !== tokenShopId) {
    return res.status(403).json({ error: 'Forbidden: This job belongs to another shop.' });
  }

  res.json(job);
});

// POST /api/jobs/:id/status - update job status (used by print client)
app.post('/api/jobs/:id/status', requireAdmin, (req, res) => {
  const db = readDb();
  const idx = db.jobs.findIndex(j => j.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Job not found' });

  const { status, progressPercent, reason } = req.body;
  if (status) db.jobs[idx].status = status;
  if (progressPercent !== undefined) db.jobs[idx].progressPercent = progressPercent;
  if (reason !== undefined) db.jobs[idx].reason = reason;
  
  if (status === 'printing') {
    if (!db.jobs[idx].timeline) db.jobs[idx].timeline = [];
    const hasClaimed = db.jobs[idx].timeline!.some(e => e.stage === 'claimed');
    if (!hasClaimed) {
      const resolvedPrinter = db.printerSettings?.selectedPrinter || 'UNKNOWN';
      db.jobs[idx].timeline!.push({
        stage: 'claimed',
        at: new Date().toISOString(),
        printerId: formatPrinterId(resolvedPrinter),
        printerName: resolvedPrinter
      });
    }
  }
  
  if (status === 'completed') {
    if (!db.jobs[idx].timeline) db.jobs[idx].timeline = [];
    
    // Ensure 'claimed' stage exists so metrics (totalProcessingMs) can be computed
    const hasClaimed = db.jobs[idx].timeline!.some(e => e.stage === 'claimed');
    if (!hasClaimed) {
      const resolvedPrinter = db.printerSettings?.selectedPrinter || 'UNKNOWN';
      const approvedEntry = db.jobs[idx].timeline!.find(e => e.stage === 'approved');
      const claimedTime = approvedEntry ? approvedEntry.at : new Date(Date.now() - 1000).toISOString();
      db.jobs[idx].timeline!.push({
        stage: 'claimed',
        at: claimedTime,
        printerId: formatPrinterId(resolvedPrinter),
        printerName: resolvedPrinter
      });
    }

    const hasCompleted = db.jobs[idx].timeline!.some(e => e.stage === 'completed');
    if (!hasCompleted) {
      const resolvedPrinter = db.printerSettings?.selectedPrinter || 'UNKNOWN';
      db.jobs[idx].timeline!.push({
        stage: 'completed',
        at: new Date().toISOString(),
        printerId: formatPrinterId(resolvedPrinter),
        printerName: resolvedPrinter
      });
    }
    updateJobMetrics(db.jobs[idx]);
  }

  writeDb(db);
  
  // If the job is completed, delete the server file to save disk space
  if (status === 'completed') {
    const job = db.jobs[idx];
    if (job.serverFilePath) {
      // Resolve path: serverFilePath starts with /uploads/
      const fileName = path.basename(job.serverFilePath);
      const fullUploadPath = path.join(UPLOADS_DIR, fileName);
      try {
        if (fs.existsSync(fullUploadPath)) {
          fs.unlinkSync(fullUploadPath);
          console.log(`[CLEANUP] Deleted completed job file from server disk: ${fileName}`);
        }
      } catch (err) {
        console.error(`[CLEANUP] Failed to delete file ${fileName}:`, err);
      }
    }
  }

  // Broadcast status update via SSE
  broadcastSse({ type: 'job_updated', job: db.jobs[idx] });

  res.json(db.jobs[idx]);
});

// POST /api/jobs/:id/timeline - append timeline entry (used by print client)
app.post('/api/jobs/:id/timeline', requireAdmin, (req, res) => {
  const db = readDb();
  const idx = db.jobs.findIndex(j => j.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Job not found' });

  const { stage, printerId, printerName, daemonInstance, printType, selectedPrinter } = req.body;
  
  const allowedStages = [
    'uploaded',
    'claimed',
    'downloaded',
    'spool_command_sent',
    'spooler_job_detected',
    'spooler_job_removed',
    'completed'
  ];

  if (!stage || !allowedStages.includes(stage)) {
    return res.status(400).json({ error: `Invalid stage: "${stage}"` });
  }

  if (!db.jobs[idx].timeline) {
    db.jobs[idx].timeline = [];
  }

  // Prevent duplicate stage entries to maintain clean metrics, but allow updating details
  const existsIdx = db.jobs[idx].timeline!.findIndex(entry => entry.stage === stage);
  if (existsIdx === -1) {
    db.jobs[idx].timeline!.push({
      stage,
      at: new Date().toISOString(),
      printerId: formatPrinterId(printerId),
      printerName: printerName || 'UNKNOWN',
      daemonInstance,
      printType,
      selectedPrinter
    });
    
    // Automatically recompute metrics
    updateJobMetrics(db.jobs[idx]);
    
    writeDb(db);
    broadcastSse({ type: 'job_updated', job: db.jobs[idx] });
  } else {
    // If it exists, update printer info and other fields if sent by client
    const entry = db.jobs[idx].timeline![existsIdx];
    console.log(`[TIMELINE-DEBUG] stage=${stage} bodyPrinterName=${printerName} entryPrinterName=${entry.printerName}`);
    let changed = false;
    if (printerId !== undefined && entry.printerId !== formatPrinterId(printerId)) {
      entry.printerId = formatPrinterId(printerId);
      changed = true;
    }
    if (printerName !== undefined && entry.printerName !== printerName) {
      entry.printerName = printerName;
      changed = true;
    }
    if (daemonInstance !== undefined && entry.daemonInstance !== daemonInstance) {
      entry.daemonInstance = daemonInstance;
      changed = true;
    }
    if (printType !== undefined && entry.printType !== printType) {
      entry.printType = printType;
      changed = true;
    }
    if (selectedPrinter !== undefined && entry.selectedPrinter !== selectedPrinter) {
      entry.selectedPrinter = selectedPrinter;
      changed = true;
    }
    if (changed) {
      writeDb(db);
      broadcastSse({ type: 'job_updated', job: db.jobs[idx] });
    }
  }

  res.json(db.jobs[idx]);
});

// POST /api/jobs/:id/failure-snapshot - store physical failure snapshot
app.post('/api/jobs/:id/failure-snapshot', requireAdmin, (req, res) => {
  const db = readDb();
  const idx = db.jobs.findIndex(j => j.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Job not found' });

  const { printerReported, physicalObservation, paperOutput, operatorNotes } = req.body;

  db.jobs[idx].failureSnapshot = {
    printerReported,
    physicalObservation,
    paperOutput: paperOutput !== undefined ? !!paperOutput : undefined,
    operatorNotes,
    recordedAt: new Date().toISOString()
  };

  writeDb(db);
  broadcastSse({ type: 'job_updated', job: db.jobs[idx] });
  res.json(db.jobs[idx]);
});

// GET /api/admin/jobs - list all jobs with full telemetry (admin only)
app.get('/api/admin/jobs', requireAdmin, (req, res) => {
  const db = readDb();
  const { shopId } = req.query;
  let jobsList = db.jobs;
  if (shopId) {
    jobsList = jobsList.filter(j => j.shopId === shopId);
  }
  res.json(jobsList.slice().reverse());
});

// GET /api/admin/jobs/:id - get single job details with full telemetry (admin only)
app.get('/api/admin/jobs/:id', requireAdmin, (req, res) => {
  const db = readDb();
  const job = db.jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// GET /api/admin/stats - get administrative dashboard statistics
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const { shopId } = req.query;
  const db = readDb();
  let revenue = 0;
  let completedJobs = 0;
  let failedJobs = 0;
  let pendingJobs = 0;

  const targetJobs = shopId ? db.jobs.filter(j => j.shopId === shopId) : db.jobs;

  targetJobs.forEach(job => {
    if (job.status === 'completed') {
      completedJobs++;
      revenue += job.chargedAmount || 0;
    } else if (
      job.status === 'failed' ||
      job.status === 'printer_offline' ||
      job.status === 'paper_empty'
    ) {
      failedJobs++;
    } else if (job.status === 'queued' || job.status === 'printing') {
      pendingJobs++;
    }
  });

  res.json({
    revenue,
    jobs: completedJobs,
    failed: failedJobs,
    pending: pendingJobs
  });
});

// GET /api/central/stats - aggregate stats for all shops
app.get('/api/central/stats', requireAdmin, (req, res) => {
  const db = readDb();
  
  const totalRevenue = db.jobs
    .filter(j => j.status === 'completed')
    .reduce((sum, j) => {
      return sum + (j.chargedAmount || 0);
    }, 0);
    
  const totalJobs = db.jobs.filter(j => j.status === 'completed').length;
  const totalFailed = db.jobs.filter(j => ['failed', 'printer_offline', 'paper_empty'].includes(j.status)).length;
  const totalPending = db.jobs.filter(j => ['queued', 'printing'].includes(j.status)).length;
  
  const shopsBreakdown = db.shops.map(shop => {
    const shopJobs = db.jobs.filter(j => j.shopId === shop.id);
    const revenue = shopJobs
      .filter(j => j.status === 'completed')
      .reduce((sum, j) => {
        return sum + (j.chargedAmount || 0);
      }, 0);
    const completed = shopJobs.filter(j => j.status === 'completed').length;
    return {
      id: shop.id,
      name: shop.name,
      phone: shop.phone,
      address: shop.address,
      isOpen: shop.isOpen,
      openingTime: shop.openingTime,
      closingTime: shop.closingTime,
      revenue,
      jobs: completed
    };
  });
  
  res.json({
    revenue: totalRevenue,
    jobs: totalJobs,
    failed: totalFailed,
    pending: totalPending,
    shops: shopsBreakdown
  });
});

// POST /api/reset - clear all jobs
app.post('/api/reset', requireAdmin, (req, res) => {
  const db = readDb();
  writeDb({
    jobs: [],
    shops: db.shops,
    agents: db.agents || [],
    printers: db.printers || [],
    printerSettings: db.printerSettings
  });
  // Clean uploads
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    for (const f of files) fs.unlinkSync(path.join(UPLOADS_DIR, f));
  } catch {}
  res.json({ message: 'Reset complete' });
});

const distPath = path.resolve(__dirname, '../dist');

// Serve static frontend files from Vite build output
app.use(express.static(distPath));

// Fallback for single-page app (SPA) client-side routes (e.g. /admin, /download)
app.get('*', (req: any, res: any, next: any) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// Error handling middleware for catching body-parser JSON parsing errors
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
    console.error('[JSON Parse Error]', err.message);
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
});

// Migrate duplicate agent records on startup, keeping only the most recent one based on lastSeen
function migrateDuplicateAgents() {
  console.log('[MIGRATION] Running duplicate agent records migration...');
  const db = readDb();
  if (db.agents && db.agents.length > 0) {
    const uniqueAgentsMap = new Map<string, any>();
    
    db.agents.forEach((agent: any) => {
      const existing = uniqueAgentsMap.get(agent.shopId);
      if (!existing) {
        uniqueAgentsMap.set(agent.shopId, agent);
      } else {
        const existingTime = new Date(existing.lastSeen).getTime();
        const currentTime = new Date(agent.lastSeen).getTime();
        if (currentTime > existingTime) {
          uniqueAgentsMap.set(agent.shopId, agent);
        }
      }
    });

    const dedupedAgents = Array.from(uniqueAgentsMap.values());
    if (db.agents.length !== dedupedAgents.length) {
      console.log(`[MIGRATION] Deduped agents from ${db.agents.length} to ${dedupedAgents.length}`);
      db.agents = dedupedAgents;
      writeDb(db);
    } else {
      console.log('[MIGRATION] No duplicate agent records found.');
    }
  }
}

migrateDuplicateAgents();

if (!process.env.VITEST) {
  app.listen(PORT, () => {
    console.log(`\n  Campus Print Server running on http://localhost:${PORT}`);
    console.log(`  API: http://localhost:${PORT}/api/jobs\n`);
  });
}

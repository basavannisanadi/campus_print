import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';
import { readDb, writeDb, DbJob } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'campusprint_admin_123';
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${ADMIN_API_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.use(cors());
app.use(express.json());

// Real-time SSE Clients
let sseClients: any[] = [];

function broadcastSse(data: any) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(payload);
    } catch {}
  });
}

// GET /api/jobs/stream - SSE connection for real-time updates
app.get('/api/jobs/stream', (req, res) => {
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
const UPLOADS_DIR = path.resolve(__dirname, './uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

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

// Helper to get resolved printer settings
function getResolvedPrinterSettings(db: any) {
  const settings = db.printerSettings || {
    status: 'offline',
    expectedReturnTime: '2:00 PM',
    averagePrintSpeed: 5,
    adminOverrideStatus: 'none',
    lastHeartbeat: ''
  };

  const now = Date.now();
  const lastTime = settings.lastHeartbeat ? new Date(settings.lastHeartbeat).getTime() : 0;
  const isClientActive = (now - lastTime) < 18000;
  
  const computedStatus = settings.adminOverrideStatus !== 'none'
    ? settings.adminOverrideStatus
    : (isClientActive ? settings.status : 'offline');

  return {
    ...settings,
    status: computedStatus
  };
}

// GET /api/printer/settings - fetch current printer settings and status
app.get('/api/printer/settings', (req, res) => {
  const db = readDb();
  const resolved = getResolvedPrinterSettings(db);
  res.json(resolved);
});

// POST /api/printer/status - receive heartbeat from print client
app.post('/api/printer/status', requireAdmin, (req, res) => {
  const db = readDb();
  if (!db.printerSettings) {
    db.printerSettings = {
      status: 'offline',
      expectedReturnTime: '2:00 PM',
      averagePrintSpeed: 5,
      adminOverrideStatus: 'none'
    };
  }

  const { status } = req.body;
  db.printerSettings.lastHeartbeat = new Date().toISOString();
  
  if (db.printerSettings.adminOverrideStatus === 'none' && status !== undefined) {
    db.printerSettings.status = status;
  }

  writeDb(db);
  const resolved = getResolvedPrinterSettings(db);
  broadcastSse({ type: 'printer_updated', settings: resolved });
  
  // For compatibility with any legacy code looking at shop status
  const shop = db.shops.find(s => s.id === 'alliance_print');
  if (shop) {
    shop.printerStatus = resolved.status;
    shop.lastHeartbeat = db.printerSettings.lastHeartbeat;
    writeDb(db);
    broadcastSse({ type: 'shop_updated', shop });
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
      adminOverrideStatus: 'none'
    };
  }

  const { adminOverrideStatus, expectedReturnTime, averagePrintSpeed } = req.body;

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

  writeDb(db);
  const resolved = getResolvedPrinterSettings(db);
  broadcastSse({ type: 'printer_updated', settings: resolved });

  // Sync shop status for compatibility
  const shop = db.shops.find(s => s.id === 'alliance_print');
  if (shop) {
    shop.printerStatus = resolved.status;
    writeDb(db);
    broadcastSse({ type: 'shop_updated', shop });
  }

  res.json({ success: true, settings: resolved });
});

// GET /api/shops - list all print shops with dynamic heartbeat status checks (legacy compatibility)
app.get('/api/shops', (req, res) => {
  const db = readDb();
  const resolved = getResolvedPrinterSettings(db);
  
  let updated = false;
  db.shops.forEach(shop => {
    if (shop.id === 'alliance_print') {
      if (shop.printerStatus !== resolved.status) {
        shop.printerStatus = resolved.status;
        shop.lastHeartbeat = db.printerSettings?.lastHeartbeat;
        updated = true;
      }
    }
  });

  if (updated) {
    writeDb(db);
  }
  res.json(db.shops);
});

// POST /api/shops/:id/heartbeat - legacy heartbeat support redirecting to printer status
app.post('/api/shops/:id/heartbeat', requireAdmin, (req, res) => {
  const db = readDb();
  const { printerStatus } = req.body;
  
  if (req.params.id === 'alliance_print') {
    if (!db.printerSettings) {
      db.printerSettings = {
        status: 'offline',
        expectedReturnTime: '2:00 PM',
        averagePrintSpeed: 5,
        adminOverrideStatus: 'none'
      };
    }
    db.printerSettings.lastHeartbeat = new Date().toISOString();
    if (db.printerSettings.adminOverrideStatus === 'none' && printerStatus !== undefined) {
      db.printerSettings.status = printerStatus;
    }
    writeDb(db);
  }

  const shop = db.shops.find(s => s.id === req.params.id);
  if (shop) {
    shop.printerStatus = printerStatus;
    shop.lastHeartbeat = new Date().toISOString();
    writeDb(db);
    broadcastSse({ type: 'shop_updated', shop });
  }
  
  res.json({ success: true, shop });
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
  res.json(shop);
});

// GET /api/jobs - list all jobs (most recent first)
app.get('/api/jobs', (req, res) => {
  const { shopId } = req.query;
  const db = readDb();
  let jobsList = db.jobs;
  if (shopId) {
    jobsList = jobsList.filter(j => j.shopId === shopId);
  }
  res.json(jobsList.slice().reverse());
});

// POST /api/jobs - upload multiple files and create print jobs
app.post('/api/jobs', upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    const { studentName, studentEmail, configs, scheduledFor, shopId } = req.body;
    let configList: any[] = [];
    try {
      if (configs) {
        configList = JSON.parse(configs);
      }
    } catch (err) {
      console.error('Failed to parse configs JSON:', err);
    }

    const db = readDb();
    const targetShopId = shopId || 'alliance_print';
    const shop = db.shops.find(s => s.id === targetShopId);
    
    // Auto schedule if the shop is closed
    let finalScheduledFor = scheduledFor || undefined;
    if (shop && !shop.isOpen) {
      finalScheduledFor = getNextOpeningTime(shop.openingTime);
    }

    const createdJobs: DbJob[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileConfig = configList[i] || {};
      
      const ext = path.extname(file.originalname).toLowerCase();
      const mime = file.mimetype.toLowerCase();

      // 1. Extension and MIME type check
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
        // Cleanup all other files uploaded in this batch
        for (let j = i + 1; j < files.length; j++) {
          try { fs.unlinkSync(files[j].path); } catch {}
        }
        return res.status(400).json({ 
          error: `Invalid file type for "${file.originalname}". Only PDF, images, Word (.doc/.docx), and PowerPoint (.ppt/.pptx) are supported.` 
        });
      }

      // 2. Magic Bytes / Header Signature Check
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
          isSignatureValid = hex.startsWith('504B0304'); // ZIP header for OpenXML Word/PPT
        } else if (ext === '.doc' || ext === '.ppt') {
          isSignatureValid = hex.startsWith('D0CF11E0'); // CFB header for binary Word/PPT
        }
      } catch (err) {
        console.error('Magic bytes read failed:', err);
      }

      if (!isSignatureValid) {
        try { fs.unlinkSync(file.path); } catch {}
        // Cleanup all remaining files in this batch
        for (let j = i + 1; j < files.length; j++) {
          try { fs.unlinkSync(files[j].path); } catch {}
        }
        return res.status(400).json({ 
          error: `Security verification failed: File contents of "${file.originalname}" do not match its extension (${ext}).` 
        });
      }

      const copiesNum = Math.max(1, Math.min(10, parseInt(fileConfig.copies, 10) || 1));
      const printMode = fileConfig.printMode === 'color' ? 'color' : 'mono';
      const sides = fileConfig.sides === 'double' ? 'double' : 'single';
      const pageRange = fileConfig.pageRange || undefined;

      // Robust page count: 1 for images, attempt pdf-lib load for PDFs
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

      const job: DbJob = {
        id: 'job-' + Date.now() + '-' + Math.round(Math.random() * 1e5),
        token: genToken(),
        fileName: file.originalname,
        fileSize: file.size,
        pageCount,
        copies: copiesNum,
        printMode,
        sides,
        pageRange,
        status: 'queued',
        studentName: studentName || 'Student',
        studentEmail: studentEmail || '',
        createdAt: new Date().toISOString(),
        progressPercent: 0,
        serverFilePath: '/uploads/' + file.filename,
        scheduledFor: finalScheduledFor,
        shopId: targetShopId
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

// GET /api/jobs/next - get next queued job for print client
app.get('/api/jobs/next', requireAdmin, (req, res) => {
  const { shopId } = req.query;
  const db = readDb();

  // Block if printer is offline
  const resolved = getResolvedPrinterSettings(db);
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
  res.json(next);
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
      const rate = job.printMode === 'color' ? 5 : 3;
      revenue += job.copies * job.pageCount * rate;
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
      const rate = j.printMode === 'color' ? 5 : 3;
      return sum + (j.pageCount * j.copies * rate);
    }, 0);
    
  const totalJobs = db.jobs.filter(j => j.status === 'completed').length;
  const totalFailed = db.jobs.filter(j => ['failed', 'printer_offline', 'paper_empty'].includes(j.status)).length;
  const totalPending = db.jobs.filter(j => ['queued', 'printing'].includes(j.status)).length;
  
  const shopsBreakdown = db.shops.map(shop => {
    const shopJobs = db.jobs.filter(j => j.shopId === shop.id);
    const revenue = shopJobs
      .filter(j => j.status === 'completed')
      .reduce((sum, j) => {
        const rate = j.printMode === 'color' ? 5 : 3;
        return sum + (j.pageCount * j.copies * rate);
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
  writeDb({ jobs: [], shops: db.shops });
  // Clean uploads
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    for (const f of files) fs.unlinkSync(path.join(UPLOADS_DIR, f));
  } catch {}
  res.json({ message: 'Reset complete' });
});

// Error handling middleware for catching body-parser JSON parsing errors
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
    console.error('[JSON Parse Error]', err.message);
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  console.error('[Unhandled Server Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n  Campus Print Server running on http://localhost:${PORT}`);
  console.log(`  API: http://localhost:${PORT}/api/jobs\n`);
});

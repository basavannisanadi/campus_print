import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.NODE_ENV === 'test'
  ? path.resolve(__dirname, './data/db.test.json')
  : path.resolve(__dirname, './data/db.json');
const DATA_DIR = path.dirname(DB_PATH);

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface TimelineEntry {
  stage: string;
  at: string;
  printerId: string;
  printerName: string;
  daemonInstance?: string;
  printType?: 'bw' | 'color';
  selectedPrinter?: string;
  reason?: string;
}

export interface FailureSnapshot {
  printerReported?: string;
  physicalObservation?: string;
  paperOutput?: boolean;
  operatorNotes?: string;
  recordedAt?: string;
}

export interface JobMetrics {
  claimToDownloadMs?: number;
  downloadToSpoolMs?: number;
  spoolToCompleteMs?: number;
  totalProcessingMs?: number;
}

export interface DbJob {
  id: string;
  token: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  copies: number;
  printMode: 'mono' | 'color' | string;
  printType?: 'bw' | 'color' | string;
  sides: 'single' | 'double' | string;
  pageRange?: string;
  status: 'pending_approval' | 'queued' | 'printing' | 'completed' | 'failed' | 'paused' | 'printer_offline' | 'paper_empty' | string;
  chargedAmount?: number;
  studentName?: string;
  studentEmail?: string;
  studentId?: string;
  createdAt: string;
  progressPercent?: number;
  serverFilePath?: string;
  originalFilePath?: string;
  reason?: string;
  scheduledFor?: string;
  shopId: string;
  tokenId?: string;
  orderId?: string;
  timeline?: TimelineEntry[];
  failureSnapshot?: FailureSnapshot;
  metrics?: JobMetrics;
  retryCount?: number;
}

export interface DbPrintOrder {
  id: string;
  token: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  shopId: string;
  status: 'pending_approval' | 'printing' | 'completed' | 'failed' | string;
  totalChargedAmount: number;
  jobIds: string[];
  createdAt: string;
}

export interface Shop {
  id: string;
  name: string;
  ownerName: string;
  phoneNumber: string;
  address: string;
  maintenanceMode: boolean;
  bwPrice: number;
  colorPrice: number;
  duplexPrice: number;
  activePrinterId?: string;
  bwPrinterId?: string;
  bwPrinterName?: string;
  colorPrinterId?: string;
  colorPrinterName?: string;
  bwMaintenanceMode?: boolean;
  colorMaintenanceMode?: boolean;
  bwStatusMode?: 'auto' | 'online' | 'offline';
  colorStatusMode?: 'auto' | 'online' | 'offline';
  bwExpectedReturnTime?: string;
  colorExpectedReturnTime?: string;
  adminUsername?: string;
  adminPasswordHash?: string;
  operationalState?: 'online' | 'offline' | 'connecting';
  agentInstalled?: boolean;
  // Legacy fields
  phone?: string;
  isOpen?: boolean;
  openingTime?: string;
  closingTime?: string;
  printerStatus?: 'online' | 'offline';
  lastHeartbeat?: string;
}

export interface PrinterSettings {
  status: 'online' | 'offline';
  expectedReturnTime: string;
  averagePrintSpeed: number; // in seconds per page
  lastHeartbeat?: string;
  adminOverrideStatus: 'none' | 'online' | 'offline';
  availablePrinters?: string[];
  selectedPrinter?: string;
  underMaintenance?: boolean;
  scanRequested?: boolean;
}

export interface Agent {
  agentId: string;
  shopId: string;
  machineName: string;
  printerName: string;
  daemonVersion: string;
  onlineStatus: 'online' | 'offline';
  lastSeen: string;
  scanRequested?: boolean;
  scanStatus?: 'idle' | 'scanning' | 'completed' | 'timeout' | 'error';
  scanStartedAt?: string;
  printerStatus?: 'online' | 'offline' | 'unknown';
  startupProgress?: {
    stepId: string;
    label: string;
    status: 'waiting' | 'running' | 'completed' | 'failed';
    errorCode?: string;
    message?: string;
    timestamp?: string;
  }[];
  connectionError?: {
    errorCode: string;
    message: string;
    timestamp: string;
  } | null;
  printerIntelligence?: any;
}

export interface Student {
  id: string;
  googleId: string;
  name: string;
  email: string;
  picture: string;
  role: 'student';
  createdAt: string;
  lastLogin: string;
  isActive: boolean;
  lastSeen: string;
}

export interface Printer {
  printerId: string;
  shopId: string;
  printerName: string;
  status: 'online' | 'offline';
  discoveredAt: string;
}

interface Db {
  orders?: DbPrintOrder[];
  jobs: DbJob[];
  shops: Shop[];
  students?: Student[];
  printerSettings?: PrinterSettings;
  agents?: Agent[];
  printers?: Printer[];
}

const DEFAULT_SHOPS: Shop[] = [
  {
    id: 'tjohn_print',
    name: 'TJohn Print Center',
    ownerName: 'TJohn Staff',
    phoneNumber: '9876543210',
    phone: '9876543210',
    address: 'TJohn Block, Ground Floor',
    maintenanceMode: false,
    bwPrice: 2,
    colorPrice: 5,
    duplexPrice: 3,
    isOpen: true,
    openingTime: '08:00 AM',
    closingTime: '08:00 PM',
    printerStatus: 'offline',
    lastHeartbeat: '',
    adminUsername: 'tjohn_admin',
    adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00' // SHA-256 hash of 'tjohn_password123'
  },
  {
    id: 'alliance_print',
    name: 'Alliance Print Center',
    ownerName: 'Alliance Staff',
    phoneNumber: '9876543211',
    phone: '9876543211',
    address: 'Alliance Main Block',
    maintenanceMode: false,
    bwPrice: 2,
    colorPrice: 5,
    duplexPrice: 3,
    isOpen: true,
    openingTime: '08:00 AM',
    closingTime: '08:00 PM',
    printerStatus: 'offline',
    lastHeartbeat: '',
    adminUsername: 'alliance_admin',
    adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00'
  },
  {
    id: 'science_print',
    name: 'Science Print Center',
    ownerName: 'Science Staff',
    phoneNumber: '9876543212',
    phone: '9876543212',
    address: 'Science Department',
    maintenanceMode: false,
    bwPrice: 3,
    colorPrice: 5,
    duplexPrice: 3,
    isOpen: true,
    openingTime: '08:00 AM',
    closingTime: '08:00 PM',
    printerStatus: 'offline',
    lastHeartbeat: '',
    adminUsername: 'science_admin',
    adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00'
  }
];

const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  status: 'offline',
  expectedReturnTime: '2:00 PM',
  averagePrintSpeed: 5,
  adminOverrideStatus: 'none'
};

export function readDb(): Db {
  if (!fs.existsSync(DB_PATH)) return { jobs: [], shops: DEFAULT_SHOPS, students: [], printerSettings: DEFAULT_PRINTER_SETTINGS, agents: [], printers: [] };
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    if (!data.shops) {
      data.shops = [];
    }
    

    
    // Ensure default shops are present in the array
    DEFAULT_SHOPS.forEach(defaultShop => {
      const exists = data.shops.some((s: any) => s.id === defaultShop.id);
      if (!exists) {
        data.shops.push(defaultShop);
      }
    });

    // Ensure all shops have password hashes and settings initialized
    data.shops.forEach((s: any) => {
      const ds = DEFAULT_SHOPS.find(d => d.id === s.id);
      if (ds) {
        if (s.adminUsername === undefined) s.adminUsername = ds.adminUsername;
        if (s.adminPasswordHash === undefined) s.adminPasswordHash = ds.adminPasswordHash;
      }
      if (s.ownerName === undefined) s.ownerName = 'TJohn Staff';
      if (s.phoneNumber === undefined) s.phoneNumber = s.phone || '9876543210';
      if (s.maintenanceMode === undefined) s.maintenanceMode = false;
      if (s.bwPrice === undefined) s.bwPrice = 2;
      if (s.colorPrice === undefined) s.colorPrice = 5;
      if (s.duplexPrice === undefined) s.duplexPrice = 3;
    });

    if (!data.jobs) {
      data.jobs = [];
    }
    data.jobs.forEach((job: any) => {
      if (!job.printType) {
        job.printType = 'bw';
      }
      if (job.chargedAmount === undefined) {
        const shop = data.shops.find((s: any) => s.id === job.shopId) || data.shops[0];
        const printedPages = job.pageCount || 1;
        if (job.sides === 'double') {
          job.chargedAmount = (job.copies || 1) * Math.ceil(printedPages / 2) * (shop.duplexPrice || 3);
        } else {
          const isColor = job.printType === 'color' || job.printMode === 'color';
          const rate = isColor ? (shop.colorPrice || 5) : (shop.bwPrice || 2);
          job.chargedAmount = (job.copies || 1) * printedPages * rate;
        }
      }
    });
    if (!data.students) {
      data.students = [];
    }
    data.students.forEach((student: any) => {
      if (student.isActive === undefined) {
        student.isActive = true;
      }
    });
    if (!data.printerSettings) {
      data.printerSettings = DEFAULT_PRINTER_SETTINGS;
    }
    if (!data.agents) {
      data.agents = [];
    }
    if (!data.printers) {
      data.printers = [];
    }
    if (!data.orders) {
      data.orders = [];
    }
    return data;
  } catch {
    return { orders: [], jobs: [], shops: DEFAULT_SHOPS, students: [], printerSettings: DEFAULT_PRINTER_SETTINGS, agents: [], printers: [] };
  }
}

export function writeDb(db: Db): void {
  const tempPath = DB_PATH + '.tmp';
  try {
    fs.writeFileSync(tempPath, JSON.stringify(db, null, 2));
    fs.renameSync(tempPath, DB_PATH);
  } catch (err: any) {
    console.error('[DB WRITE ERROR] Atomic write failed, retrying with fallback:', err.message);
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    } catch (fallbackErr: any) {
      console.error('[DB FATAL ERROR] Fallback write also failed:', fallbackErr.message);
      throw fallbackErr;
    }
  }
}

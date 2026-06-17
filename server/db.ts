import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, './data/db.json');
const DATA_DIR = path.dirname(DB_PATH);

export interface DbJob {
  id: string;
  token: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  copies: number;
  printMode: 'mono' | 'color';
  sides: 'single' | 'double';
  pageRange?: string;
  status: 'queued' | 'printing' | 'completed' | 'failed' | 'paused' | 'printer_offline' | 'paper_empty';
  studentName: string;
  studentEmail: string;
  createdAt: string;
  progressPercent: number;
  serverFilePath: string;
  reason?: string;
  scheduledFor?: string;
  shopId: string;
}

export interface Shop {
  id: string;
  name: string;
  phone: string;
  address: string;
  isOpen: boolean;
  openingTime: string;
  closingTime: string;
  printerStatus?: 'online' | 'offline';
  lastHeartbeat?: string;
}

export interface PrinterSettings {
  status: 'online' | 'offline';
  expectedReturnTime: string;
  averagePrintSpeed: number; // in seconds per page
  lastHeartbeat?: string;
  adminOverrideStatus: 'none' | 'online' | 'offline';
}

interface Db {
  jobs: DbJob[];
  shops: Shop[];
  printerSettings?: PrinterSettings;
}

const DEFAULT_SHOPS: Shop[] = [
  {
    id: 'alliance_print',
    name: 'Alliance University Print Center',
    phone: '9876543210',
    address: 'Alliance University Main Block, Ground Floor',
    isOpen: true,
    openingTime: '08:00 AM',
    closingTime: '08:00 PM',
    printerStatus: 'offline',
    lastHeartbeat: ''
  }
];

const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  status: 'offline',
  expectedReturnTime: '2:00 PM',
  averagePrintSpeed: 5,
  adminOverrideStatus: 'none'
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readDb(): Db {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) return { jobs: [], shops: DEFAULT_SHOPS, printerSettings: DEFAULT_PRINTER_SETTINGS };
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    if (!data.shops || data.shops.length === 0) {
      data.shops = DEFAULT_SHOPS;
    }
    // Force cleanup: keep only default shops
    data.shops = data.shops.filter((s: any) => DEFAULT_SHOPS.some(ds => ds.id === s.id));
    if (data.shops.length === 0) {
      data.shops = DEFAULT_SHOPS;
    }
    if (!data.jobs) {
      data.jobs = [];
    }
    if (!data.printerSettings) {
      data.printerSettings = DEFAULT_PRINTER_SETTINGS;
    }
    return data;
  } catch {
    return { jobs: [], shops: DEFAULT_SHOPS, printerSettings: DEFAULT_PRINTER_SETTINGS };
  }
}

export function writeDb(db: Db): void {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

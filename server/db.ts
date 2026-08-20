import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  jobFromDb, jobToDb,
  orderFromDb, orderToDb,
  shopFromDb, shopToDb,
  agentFromDb, agentToDb,
  studentFromDb, studentToDb,
  printerSettingsFromDb, printerSettingsToDb,
  printerFromDb, printerToDb,
  studentHistoryFromDb, studentHistoryToDb
} from './repository/mapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.NODE_ENV === 'test'
  ? path.resolve(__dirname, './data/db.test.json')
  : path.resolve(__dirname, './data/db.json');
const DATA_DIR = path.dirname(DB_PATH);

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export class DatabaseError extends Error {
  constructor(message: string, public cause?: any) {
    super(message);
    this.name = 'DatabaseError';
  }
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
  averagePrintSpeed: number;
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

export interface DbStudentPrintHistory {
  id: string;
  orderId: string;
  jobId?: string;
  orderToken: string;
  jobToken?: string;
  studentId: string;
  shopId: string;
  shopName: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  copies: number;
  printMode: 'mono' | 'color' | string;
  printType?: 'bw' | 'color' | string;
  sides: 'single' | 'double' | string;
  paperSize?: string;
  pageRange?: string;
  chargedAmount: number;
  status: 'pending_approval' | 'queued' | 'printing' | 'completed' | 'failed' | 'cancelled' | string;
  createdAt: string;
  completedAt?: string;
}

export interface Db {
  orders?: DbPrintOrder[];
  jobs: DbJob[];
  shops: Shop[];
  students?: Student[];
  printerSettings?: PrinterSettings;
  agents?: Agent[];
  printers?: Printer[];
  studentPrintHistory?: DbStudentPrintHistory[];
}

export const DEFAULT_SHOPS: Shop[] = [
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
    adminPasswordHash: 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00'
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

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  status: 'offline',
  expectedReturnTime: '2:00 PM',
  averagePrintSpeed: 5,
  adminOverrideStatus: 'none'
};

// ========================================================
// SUPABASE CLIENT INITIALIZATION & DUAL-MODE REPOSITORY
// ========================================================

const supabaseUrl = process.env.SUPABASE_URL;

// Specifically resolve the service-role key for server-side trusted DB & private storage operations
export const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
                                      process.env.SUPABASE_SERVICE_KEY;

export const isServiceRoleConfigured = Boolean(supabaseUrl && supabaseServiceRoleKey);

// Public / anon key fallback for read-only / public operations if service role not provided
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && (supabaseServiceRoleKey || supabaseAnonKey));

if (process.env.NODE_ENV === 'production') {
  if (!supabaseUrl) {
    console.error('[SUPABASE CONFIG ERROR] SUPABASE_URL is missing in environment variables.');
  }
  if (!isServiceRoleConfigured) {
    console.error('[SUPABASE SECURITY ERROR] No service-role key found (SUPABASE_SERVICE_ROLE_KEY). Private storage operations on bucket "print-documents" will fail closed.');
  }
}

const activeKey = supabaseServiceRoleKey || supabaseAnonKey;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, activeKey!, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

// ========================================================
// ASYNCHRONOUS SUPABASE REPOSITORY METHODS
// ========================================================

export const dbRepository = {
  isSupabase(): boolean {
    if (process.env.NODE_ENV === 'production' && (!isSupabaseConfigured || !supabase)) {
      throw new DatabaseError('FATAL: Supabase configuration is required in production environment.');
    }
    return isSupabaseConfigured && supabase !== null;
  },

  async ping(): Promise<boolean> {
    if (!this.isSupabase()) return true;
    try {
      const { data, error } = await supabase!.from('shops').select('id').limit(1);
      return !error && Array.isArray(data);
    } catch {
      return false;
    }
  },

  async claimNextJob(shopId: string, defaultPrinter = 'UNKNOWN'): Promise<DbJob | null> {
    if (!this.isSupabase()) {
      // Local JSON fallback claim for test/dev
      const db = readDb();
      const hasPrinting = db.jobs.some(j => j.shopId === shopId && j.status === 'printing');
      if (hasPrinting) return null;

      const now = new Date();
      const next = db.jobs.find(j => {
        if (j.status !== 'queued' || j.shopId !== shopId) return false;
        if (j.scheduledFor) return now >= new Date(j.scheduledFor);
        return true;
      });
      if (!next) return false as any;

      next.status = 'printing';
      next.progressPercent = 0;
      if (!next.timeline) next.timeline = [];
      next.timeline.push({
        stage: 'claimed',
        at: new Date().toISOString(),
        printerName: defaultPrinter,
        printerId: defaultPrinter.toLowerCase().replace(/[^a-z0-9]/g, '_')
      });
      writeDb(db);
      return next;
    }

    const { data, error } = await supabase!.rpc('claim_next_job', {
      p_shop_id: shopId,
      p_default_printer: defaultPrinter
    });

    if (error) {
      console.error(`[DB REPO ERROR] claim_next_job RPC failed for ${shopId}:`, error.message);
      throw new DatabaseError(`claim_next_job failed: ${error.message}`, error);
    }

    if (!data || data.length === 0) return null;
    return jobFromDb(data[0]);
  },

  async getJob(id: string): Promise<DbJob | null> {
    if (!this.isSupabase()) {
      return readDb().jobs.find(j => j.id === id) || null;
    }
    const { data, error } = await supabase!.from('jobs').select('*').eq('id', id).single();
    if (error) {
      if (error.code === 'PGRST116') return null; // Row not found
      throw new DatabaseError(`getJob(${id}) failed: ${error.message}`, error);
    }
    if (!data) return null;
    return jobFromDb(data);
  },

  async getJobByToken(token: string): Promise<DbJob | null> {
    if (!this.isSupabase()) {
      return readDb().jobs.find(j => j.token === token) || null;
    }
    const { data, error } = await supabase!.from('jobs').select('*').eq('token', token).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new DatabaseError(`getJobByToken(${token}) failed: ${error.message}`, error);
    }
    if (!data) return null;
    return jobFromDb(data);
  },

  async getJobs(filter?: { shopId?: string; status?: string; studentId?: string }): Promise<DbJob[]> {
    if (!this.isSupabase()) {
      let jobs = readDb().jobs;
      if (filter?.shopId) jobs = jobs.filter(j => j.shopId === filter.shopId);
      if (filter?.status) jobs = jobs.filter(j => j.status === filter.status);
      if (filter?.studentId) jobs = jobs.filter(j => j.studentId === filter.studentId);
      return jobs;
    }
    let query = supabase!.from('jobs').select('*');
    if (filter?.shopId) query = query.eq('shop_id', filter.shopId);
    if (filter?.status) query = query.eq('status', filter.status);
    if (filter?.studentId) query = query.eq('student_id', filter.studentId);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new DatabaseError(`getJobs failed: ${error.message}`, error);
    if (!data) return [];
    return data.map(jobFromDb);
  },

  async getJobsByShop(shopId: string, status?: string): Promise<DbJob[]> {
    return this.getJobs({ shopId, status });
  },

  async getNextQueuedJobInOrder(orderId: string, currentJobId: string): Promise<DbJob | null> {
    if (!this.isSupabase()) {
      return readDb().jobs.find(j => j.orderId === orderId && j.status === 'queued' && j.id !== currentJobId) || null;
    }
    const { data, error } = await supabase!
      .from('jobs')
      .select('*')
      .eq('order_id', orderId)
      .eq('status', 'queued')
      .neq('id', currentJobId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) throw new DatabaseError(`getNextQueuedJobInOrder failed: ${error.message}`, error);
    if (!data || data.length === 0) return null;
    return jobFromDb(data[0]);
  },

  async insertJob(job: DbJob): Promise<DbJob> {
    if (!this.isSupabase()) {
      const db = readDb();
      db.jobs.push(job);
      writeDb(db);
      return job;
    }
    const row = jobToDb(job);
    const { data, error } = await supabase!.from('jobs').insert(row).select().single();
    if (error) throw new DatabaseError(`insertJob failed: ${error.message}`, error);
    return jobFromDb(data);
  },

  async insertJobsBatch(jobs: DbJob[]): Promise<DbJob[]> {
    if (!this.isSupabase()) {
      const db = readDb();
      jobs.forEach(j => db.jobs.push(j));
      writeDb(db);
      return jobs;
    }
    if (jobs.length === 0) return [];
    const rows = jobs.map(jobToDb);
    const { data, error } = await supabase!.from('jobs').insert(rows).select();
    if (error) throw new DatabaseError(`insertJobsBatch failed: ${error.message}`, error);
    if (!data) return [];
    return data.map(jobFromDb);
  },

  async updateJob(id: string, updates: Partial<DbJob>): Promise<DbJob | null> {
    if (!this.isSupabase()) {
      const db = readDb();
      const j = db.jobs.find(x => x.id === id);
      if (!j) return null;
      Object.assign(j, updates);
      writeDb(db);
      return j;
    }
    const partialRow: any = {};
    if (updates.status !== undefined) partialRow.status = updates.status;
    if (updates.progressPercent !== undefined) partialRow.progress_percent = updates.progressPercent;
    if (updates.timeline !== undefined) partialRow.timeline = updates.timeline;
    if (updates.failureSnapshot !== undefined) partialRow.failure_snapshot = updates.failureSnapshot;
    if (updates.metrics !== undefined) partialRow.metrics = updates.metrics;
    if (updates.retryCount !== undefined) partialRow.retry_count = updates.retryCount;
    if (updates.reason !== undefined) partialRow.reason = updates.reason;

    const { data, error } = await supabase!.from('jobs').update(partialRow).eq('id', id).select().single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new DatabaseError(`updateJob(${id}) failed: ${error.message}`, error);
    }
    if (!data) return null;
    return jobFromDb(data);
  },

  async getOrder(id: string): Promise<DbPrintOrder | null> {
    if (!this.isSupabase()) {
      return (readDb().orders || []).find(o => o.id === id) || null;
    }
    const { data, error } = await supabase!.from('orders').select('*').eq('id', id).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new DatabaseError(`getOrder(${id}) failed: ${error.message}`, error);
    }
    if (!data) return null;
    return orderFromDb(data);
  },

  async getOrderByToken(token: string): Promise<DbPrintOrder | null> {
    if (!this.isSupabase()) {
      return (readDb().orders || []).find(o => o.token === token) || null;
    }
    const { data, error } = await supabase!.from('orders').select('*').eq('token', token).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new DatabaseError(`getOrderByToken(${token}) failed: ${error.message}`, error);
    }
    if (!data) return null;
    return orderFromDb(data);
  },

  async getOrders(filter?: { shopId?: string; status?: string; studentId?: string }): Promise<DbPrintOrder[]> {
    if (!this.isSupabase()) {
      let orders = readDb().orders || [];
      if (filter?.shopId) orders = orders.filter(o => o.shopId === filter.shopId);
      if (filter?.status) orders = orders.filter(o => o.status === filter.status);
      if (filter?.studentId) orders = orders.filter(o => o.studentId === filter.studentId);
      return orders;
    }
    let query = supabase!.from('orders').select('*');
    if (filter?.shopId) query = query.eq('shop_id', filter.shopId);
    if (filter?.status) query = query.eq('status', filter.status);
    if (filter?.studentId) query = query.eq('student_id', filter.studentId);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new DatabaseError(`getOrders failed: ${error.message}`, error);
    if (!data) return [];
    return data.map(orderFromDb);
  },

  async getOrdersByShop(shopId: string): Promise<DbPrintOrder[]> {
    return this.getOrders({ shopId });
  },

  async insertOrder(order: DbPrintOrder): Promise<DbPrintOrder> {
    if (!this.isSupabase()) {
      const db = readDb();
      if (!db.orders) db.orders = [];
      db.orders.push(order);
      writeDb(db);
      return order;
    }
    const row = orderToDb(order);
    const { data, error } = await supabase!.from('orders').insert(row).select().single();
    if (error) throw new DatabaseError(`insertOrder failed: ${error.message}`, error);
    return orderFromDb(data);
  },

  async updateOrder(id: string, updates: Partial<DbPrintOrder>): Promise<DbPrintOrder | null> {
    if (!this.isSupabase()) {
      const db = readDb();
      if (!db.orders) db.orders = [];
      const o = db.orders.find(x => x.id === id);
      if (!o) return null;
      Object.assign(o, updates);
      writeDb(db);
      return o;
    }
    const partialRow: any = {};
    if (updates.status !== undefined) partialRow.status = updates.status;
    if (updates.totalChargedAmount !== undefined) partialRow.total_charged_amount = updates.totalChargedAmount;
    if (updates.jobIds !== undefined) partialRow.job_ids = updates.jobIds;

    const { data, error } = await supabase!.from('orders').update(partialRow).eq('id', id).select().single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new DatabaseError(`updateOrder(${id}) failed: ${error.message}`, error);
    }
    if (!data) return null;
    return orderFromDb(data);
  },

  async deleteOrder(id: string): Promise<boolean> {
    if (!this.isSupabase()) {
      const db = readDb();
      if (db.orders) {
        db.orders = db.orders.filter(o => o.id !== id);
        if (db.jobs) {
          db.jobs = db.jobs.filter(j => j.orderId !== id);
        }
        writeDb(db);
      }
      return true;
    }
    await supabase!.from('jobs').delete().eq('order_id', id).catch(() => {});
    const { error } = await supabase!.from('orders').delete().eq('id', id);
    if (error) throw new DatabaseError(`deleteOrder(${id}) failed: ${error.message}`, error);
    return true;
  },

  async getShop(id: string): Promise<Shop | null> {
    if (!this.isSupabase()) {
      return readDb().shops.find(s => s.id === id) || null;
    }
    const { data, error } = await supabase!.from('shops').select('*').eq('id', id).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new DatabaseError(`getShop(${id}) failed: ${error.message}`, error);
    }
    if (!data) return null;
    return shopFromDb(data);
  },

  async getShops(): Promise<Shop[]> {
    if (!this.isSupabase()) {
      return readDb().shops;
    }
    const { data, error } = await supabase!.from('shops').select('*');
    if (error) throw new DatabaseError(`getShops failed: ${error.message}`, error);
    if (!data) return [];
    return data.map(shopFromDb);
  },

  async updateShop(id: string, updates: Partial<Shop>): Promise<Shop | null> {
    if (!this.isSupabase()) {
      const db = readDb();
      const s = db.shops.find(x => x.id === id);
      if (!s) return null;
      Object.assign(s, updates);
      writeDb(db);
      return s;
    }
    const partialRow: any = {};
    if (updates.name !== undefined) partialRow.name = updates.name;
    if (updates.maintenanceMode !== undefined) partialRow.maintenance_mode = updates.maintenanceMode;
    if (updates.bwPrice !== undefined) partialRow.bw_price = updates.bwPrice;
    if (updates.colorPrice !== undefined) partialRow.color_price = updates.colorPrice;
    if (updates.duplexPrice !== undefined) partialRow.duplex_price = updates.duplexPrice;
    if (updates.printerStatus !== undefined) partialRow.printer_status = updates.printerStatus;
    if (updates.lastHeartbeat !== undefined) partialRow.last_heartbeat = updates.lastHeartbeat;
    if (updates.activePrinterId !== undefined) partialRow.active_printer_id = updates.activePrinterId;
    if (updates.bwPrinterName !== undefined) partialRow.bw_printer_name = updates.bwPrinterName;
    if (updates.colorPrinterName !== undefined) partialRow.color_printer_name = updates.colorPrinterName;

    const { data, error } = await supabase!.from('shops').update(partialRow).eq('id', id).select().single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new DatabaseError(`updateShop(${id}) failed: ${error.message}`, error);
    }
    if (!data) return null;
    return shopFromDb(data);
  },

  async getAgent(agentId: string): Promise<Agent | null> {
    if (!this.isSupabase()) {
      return (readDb().agents || []).find(a => a.agentId === agentId) || null;
    }
    const { data, error } = await supabase!.from('agents').select('*').eq('agent_id', agentId).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new DatabaseError(`getAgent(${agentId}) failed: ${error.message}`, error);
    }
    if (!data) return null;
    return agentFromDb(data);
  },

  async upsertAgent(agent: Agent): Promise<Agent> {
    if (!this.isSupabase()) {
      const db = readDb();
      if (!db.agents) db.agents = [];
      const idx = db.agents.findIndex(a => a.agentId === agent.agentId);
      if (idx >= 0) db.agents[idx] = agent;
      else db.agents.push(agent);
      writeDb(db);
      return agent;
    }
    const row = agentToDb(agent);
    const { data, error } = await supabase!.from('agents').upsert(row).select().single();
    if (error) throw new DatabaseError(`upsertAgent failed: ${error.message}`, error);
    return agentFromDb(data);
  },

  async getStudent(id: string): Promise<Student | null> {
    if (!this.isSupabase()) {
      return (readDb().students || []).find(s => s.id === id) || null;
    }
    const { data, error } = await supabase!.from('students').select('*').eq('id', id).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new DatabaseError(`getStudent(${id}) failed: ${error.message}`, error);
    }
    if (!data) return null;
    return studentFromDb(data);
  },

  async upsertStudent(student: Student): Promise<Student> {
    if (!this.isSupabase()) {
      const db = readDb();
      if (!db.students) db.students = [];
      const idx = db.students.findIndex(s => s.id === student.id);
      if (idx >= 0) db.students[idx] = student;
      else db.students.push(student);
      writeDb(db);
      return student;
    }
    const row = studentToDb(student);
    const { data, error } = await supabase!.from('students').upsert(row).select().single();
    if (error) throw new DatabaseError(`upsertStudent failed: ${error.message}`, error);
    return studentFromDb(data);
  },

  async insertStudentHistory(record: DbStudentPrintHistory): Promise<DbStudentPrintHistory> {
    if (!this.isSupabase()) {
      const db = readDb();
      if (!db.studentPrintHistory) db.studentPrintHistory = [];
      const idx = db.studentPrintHistory.findIndex(h => (record.jobId && h.jobId === record.jobId) || h.id === record.id);
      if (idx >= 0) {
        db.studentPrintHistory[idx] = record;
      } else {
        db.studentPrintHistory.push(record);
      }
      writeDb(db);
      return record;
    }
    const row = studentHistoryToDb(record);
    const { data, error } = await supabase!.from('student_print_history').upsert(row, { onConflict: 'job_id' }).select().single();
    if (error) throw new DatabaseError(`insertStudentHistory failed: ${error.message}`, error);
    return studentHistoryFromDb(data);
  },

  async insertStudentHistoryBatch(records: DbStudentPrintHistory[]): Promise<DbStudentPrintHistory[]> {
    if (!this.isSupabase()) {
      const db = readDb();
      if (!db.studentPrintHistory) db.studentPrintHistory = [];
      for (const record of records) {
        const idx = db.studentPrintHistory.findIndex(h => (record.jobId && h.jobId === record.jobId) || h.id === record.id);
        if (idx >= 0) {
          db.studentPrintHistory[idx] = record;
        } else {
          db.studentPrintHistory.push(record);
        }
      }
      writeDb(db);
      return records;
    }
    if (records.length === 0) return [];
    const rows = records.map(studentHistoryToDb);
    const { data, error } = await supabase!.from('student_print_history').upsert(rows, { onConflict: 'job_id' }).select();
    if (error) throw new DatabaseError(`insertStudentHistoryBatch failed: ${error.message}`, error);
    if (!data) return [];
    return data.map(studentHistoryFromDb);
  },

  async updateStudentHistoryStatus(jobId: string, status: string, completedAt?: string): Promise<DbStudentPrintHistory | null> {
    if (!this.isSupabase()) {
      const db = readDb();
      if (!db.studentPrintHistory) db.studentPrintHistory = [];
      const h = db.studentPrintHistory.find(x => x.jobId === jobId);
      if (!h) return null;
      h.status = status;
      if (completedAt) h.completedAt = completedAt;
      writeDb(db);
      return h;
    }
    const updates: any = { status };
    if (completedAt) updates.completed_at = completedAt;
    const { data, error } = await supabase!.from('student_print_history').update(updates).eq('job_id', jobId).select().single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new DatabaseError(`updateStudentHistoryStatus(${jobId}) failed: ${error.message}`, error);
    }
    if (!data) return null;
    return studentHistoryFromDb(data);
  },

  async getStudentHistory(studentId: string, limit = 50, offset = 0): Promise<DbStudentPrintHistory[]> {
    if (!this.isSupabase()) {
      const db = readDb();
      return (db.studentPrintHistory || [])
        .filter(h => h.studentId === studentId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(offset, offset + limit);
    }
    const { data, error } = await supabase!
      .from('student_print_history')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new DatabaseError(`getStudentHistory failed: ${error.message}`, error);
    if (!data) return [];
    return data.map(studentHistoryFromDb);
  }
};

// ========================================================
// SYNCHRONOUS BACKWARD-COMPATIBLE JSON FUNCTIONS
// ========================================================

export function readDb(): Db {
  if (!fs.existsSync(DB_PATH)) return { jobs: [], shops: DEFAULT_SHOPS, students: [], printerSettings: DEFAULT_PRINTER_SETTINGS, agents: [], printers: [], studentPrintHistory: [] };
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    if (!data.shops) {
      data.shops = [];
    }

    DEFAULT_SHOPS.forEach(defaultShop => {
      const exists = data.shops.some((s: any) => s.id === defaultShop.id);
      if (!exists) {
        data.shops.push(defaultShop);
      }
    });

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
    if (!data.studentPrintHistory) {
      data.studentPrintHistory = [];
    }
    return data;
  } catch {
    return { orders: [], jobs: [], shops: DEFAULT_SHOPS, students: [], printerSettings: DEFAULT_PRINTER_SETTINGS, agents: [], printers: [], studentPrintHistory: [] };
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

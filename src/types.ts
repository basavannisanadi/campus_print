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

export interface PrintJob {
  id: string;
  token: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  copies: number;
  printMode: 'mono' | 'color';
  printType?: 'bw' | 'color';
  sides: 'single' | 'double';
  pageRange?: string;
  status: 'uploading' | 'pending_approval' | 'queued' | 'printing' | 'completed' | 'failed' | 'paused' | 'printer_offline' | 'paper_empty';
  createdAt: string;
  progressPercent: number;
  reason?: string;
  scheduledFor?: string;
  chargedAmount: number;
  studentName: string;
  studentEmail: string;
  shopId: string;
  tokenId?: string;
  timeline?: TimelineEntry[];
  failureSnapshot?: FailureSnapshot;
  metrics?: JobMetrics;
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
  operationalState?: 'online' | 'offline';
  agentInstalled?: boolean;
  // Legacy fields
  phone?: string;
  isOpen?: boolean;
  openingTime?: string;
  closingTime?: string;
  printerStatus?: 'online' | 'offline';
  lastHeartbeat?: string;
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
}

export interface Printer {
  printerId: string;
  shopId: string;
  printerName: string;
  status: 'online' | 'offline';
  discoveredAt: string;
}

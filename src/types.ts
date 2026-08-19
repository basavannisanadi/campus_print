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
  orderId?: string;
  token: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  copies: number;
  printMode: 'mono' | 'color' | string;
  printType?: 'bw' | 'color' | string;
  sides: 'single' | 'double' | string;
  pageRange?: string;
  status: 'uploading' | 'pending_approval' | 'queued' | 'printing' | 'completed' | 'failed' | 'paused' | 'printer_offline' | 'paper_empty' | string;
  createdAt: string;
  progressPercent?: number;
  reason?: string;
  scheduledFor?: string;
  chargedAmount?: number;
  studentName?: string;
  studentEmail?: string;
  studentId?: string;
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

export interface StudentPrintHistoryItem {
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

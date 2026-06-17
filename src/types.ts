export interface PrintJob {
  id: string;
  token: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  copies: number;
  printMode: 'mono' | 'color';
  sides: 'single' | 'double';
  pageRange?: string;
  status: 'uploading' | 'queued' | 'printing' | 'completed' | 'failed' | 'paused' | 'printer_offline' | 'paper_empty';
  createdAt: string;
  progressPercent: number;
  reason?: string;
  scheduledFor?: string;
  studentName: string;
  studentEmail: string;
  shopId: string;
}

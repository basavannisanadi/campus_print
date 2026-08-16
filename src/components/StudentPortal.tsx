import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  FileText,
  Printer,
  CheckCircle,
  Clock,
  X,
  Loader2,
  AlertTriangle,
  User,
  Lock,
  ArrowRight,
  LogOut,
  MapPin,
  Phone,
  ChevronDown,
  Check,
  LayoutDashboard,
  Settings,
  HelpCircle,
  Bell,
  CreditCard,
  Sun,
  Moon,
  Zap,
  FileUp,
  Sparkles,
  Menu,
  Calculator,
  Compass,
  BookOpen,
  Info,
  Cloud,
  ShieldCheck,
  Layers,
  Activity,
  Heart
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { PdfFirstPageCanvas } from './PdfFirstPageCanvas';
import { PrintJob } from '../types';
import { getApiUrl } from '../config';
import { useAuth } from '../context/AuthContext';

interface Props {
  orders: any[];
  printerStatus: 'online' | 'offline';
  expectedReturnTime: string;
  averagePrintSpeed: number;
  underMaintenance: boolean;
  shopInfo: any;
  shops: any[];
  selectedShopId: string;
  onSelectShop: (shopId: string) => void;
  agentOnlineStatus?: 'online' | 'offline';
  systemHealth?: any;
  health?: any;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg'
];

const ACCEPTED_EXT = 'application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
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

interface FileConfig {
  copies: number;
  printMode: 'mono' | 'color';
  printType: 'bw' | 'color';
  sides: 'single' | 'double';
  pageCount: number;
  choosePagesType: 'all' | 'custom';
  customPages: string;
  isConverting?: boolean;
  preConvertedPdfFilename?: string;
  preConvertedOriginalFilename?: string;
}

export default function StudentPortal({
  orders,
  printerStatus,
  expectedReturnTime,
  averagePrintSpeed,
  underMaintenance,
  shopInfo,
  shops,
  selectedShopId,
  onSelectShop,
  agentOnlineStatus = 'offline',
  systemHealth,
  health
}: Props) {
  // Authentication states
  const isGlobalMaintenance = (!!shopInfo?.bwMaintenanceMode && !!shopInfo?.colorMaintenanceMode) || underMaintenance;
  const isUploadDisabled = isGlobalMaintenance || (systemHealth && !systemHealth.systemReady);
  const { profile, logout, studentSessionToken } = useAuth();
  const studentName = profile?.name || 'Student';
  const studentEmail = profile?.email || '';
  const studentPicture = profile?.picture || '';
  const isRemembered = true;

  // Login variables kept as dummy values to prevent compile issues (unused now)
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [customGoogleName, setCustomGoogleName] = useState('');
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');
  const [showCustomGoogleInput, setShowCustomGoogleInput] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Form states
  const [files, setFiles] = useState<File[]>([]);
  const [fileConfigs, setFileConfigs] = useState<{ [fileName: string]: FileConfig }>({});
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<{ [fileName: string]: string }>({});
  const isPreConverting = (Object.values(fileConfigs) as FileConfig[]).some(c => c.isConverting);

  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [success, setSuccess] = useState<{ order?: any, jobs: any[] } | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'jobs' | 'history' | 'settings' | 'help'>('dashboard');

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showShopDropdown, setShowShopDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  
  // Custom navigation modal states
  const [activeModal, setActiveModal] = useState<'price_calc' | 'find_center' | 'guidelines' | null>(null);
  const [calcPages, setCalcPages] = useState<number>(1);
  const [calcCopies, setCalcCopies] = useState<number>(1);
  const [calcType, setCalcType] = useState<'bw' | 'color' | 'duplex'>('bw');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsDrawerOpen(false);
        setActiveModal(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowShopDropdown(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowShopDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getFileCost = (fileName: string): number => {
    const conf = fileConfigs[fileName];
    if (!conf) return 0;
    const printedPages = countPagesFromRange(conf.choosePagesType === 'custom' ? conf.customPages : '', conf.pageCount);
    if (conf.sides === 'double') {
      return conf.copies * Math.ceil(printedPages / 2) * (shopInfo?.duplexPrice || 3);
    } else {
      const rate = conf.printType === 'color' ? (shopInfo?.colorPrice || 5) : (shopInfo?.bwPrice || 2);
      return conf.copies * printedPages * rate;
    }
  };

  const getBatchTotal = (): number => {
    return files.reduce((sum, file) => sum + getFileCost(file.name), 0);
  };

  // Clean up object URLs on unmount
  const previewUrlsRef = useRef(previewUrls);
  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  // Clear any staged uploaded files / preview URLs when changing shop to prevent submitting stale file configs under different shop pricing
  useEffect(() => {
    if (files.length > 0) {
      setFiles([]);
      setFileConfigs({});
      Object.values(previewUrls).forEach((url: string) => URL.revokeObjectURL(url));
      setPreviewUrls({});
      setError('');
    }
  }, [selectedShopId]);

  const handleSignOut = () => {
    logout();
    resetForm();
  };

  // Parse PDF page count
  const getPdfPageCount = async (file: File): Promise<number> => {
    if (file.type !== 'application/pdf') return 1;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      return pdfDoc.getPageCount();
    } catch (err) {
      console.error('Failed to parse PDF pages:', err);
      return 1;
    }
  };

  const triggerPreConversion = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = studentSessionToken || sessionStorage.getItem('studentSessionToken');
      
      const res = await fetch(getApiUrl('/api/jobs/pre-convert'), {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Conversion failed');
      }
      
      const result = await res.json();
      
      setFileConfigs(prev => {
        const conf = prev[file.name];
        if (!conf) return prev;
        return {
          ...prev,
          [file.name]: {
            ...conf,
            pageCount: result.pageCount,
            preConvertedPdfFilename: result.pdfFilename,
            preConvertedOriginalFilename: result.originalFilename,
            isConverting: false
          }
        };
      });

      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
      const previewUrl = getApiUrl(`/api/jobs/pre-convert/preview/${result.pdfFilename}${tokenParam}`);
      setPreviewUrls(prev => ({
        ...prev,
        [file.name]: previewUrl
      }));
    } catch (err: any) {
      console.error('Pre-conversion failed for:', file.name, err);
      setError(`Document conversion failed for "${file.name}": ${err.message}`);
      setFiles(prev => prev.filter(f => f.name !== file.name));
      setFileConfigs(prev => {
        const copy = { ...prev };
        delete copy[file.name];
        return copy;
      });
    }
  };

  const isSupportedFile = (file: File): boolean => {
    if (!file || !file.name) return false;
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg'];
    return allowedExts.includes(ext);
  };

  const addFiles = async (newFiles: File[]) => {
    const updatedFiles = [...files];
    const updatedConfigs = { ...fileConfigs };
    const updatedUrls = { ...previewUrls };
    const validAddedFiles: File[] = [];

    for (const file of newFiles) {
      if (!isSupportedFile(file)) {
        setError(`File "${file.name}" is not a supported format. Only PDF (.pdf) and images (.png, .jpg, .jpeg) are supported.`);
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds the 50MB limit.`);
        continue;
      }

      if (updatedFiles.some(f => f.name === file.name)) continue;
      
      let pageCount = 1;
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const isPdf = ext === '.pdf' || file.type === 'application/pdf';
      const isConverting = !isPdf;

      if (isPdf) {
        pageCount = await getPdfPageCount(file);
      }

      updatedFiles.push(file);
      validAddedFiles.push(file);
      updatedConfigs[file.name] = {
        copies: 1,
        printMode: (!!shopInfo?.bwMaintenanceMode && !shopInfo?.colorMaintenanceMode) ? 'color' : 'mono',
        printType: (!!shopInfo?.bwMaintenanceMode && !shopInfo?.colorMaintenanceMode) ? 'color' : 'bw',
        sides: 'single',
        pageCount,
        choosePagesType: 'all',
        customPages: '',
        isConverting,
      };

      updatedUrls[file.name] = URL.createObjectURL(file);
    }
    
    setFiles(updatedFiles);
    setFileConfigs(updatedConfigs);
    setPreviewUrls(updatedUrls);
    
    if (updatedFiles.length > 0 && !activeFileName) {
      setActiveFileName(updatedFiles[0].name);
    }

    for (const file of validAddedFiles) {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const isPdf = ext === '.pdf' || file.type === 'application/pdf';
      if (!isPdf) {
        triggerPreConversion(file);
      }
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files) as File[];
    if (droppedFiles.length > 0) {
      addFiles(droppedFiles);
    }
  }, [files, fileConfigs, activeFileName, previewUrls]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []) as File[];
    if (selected.length > 0) {
      addFiles(selected);
    }
    e.target.value = '';
  };

  const removeFile = (name: string) => {
    setFiles(prev => prev.filter(f => f.name !== name));
    setFileConfigs(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });

    setPreviewUrls(prev => {
      const next = { ...prev };
      if (next[name]) {
        URL.revokeObjectURL(next[name]);
        delete next[name];
      }
      return next;
    });

    if (activeFileName === name) {
      const remaining = files.filter(f => f.name !== name);
      setActiveFileName(remaining.length > 0 ? remaining[0].name : null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!studentName.trim()) return setError('Please enter your name.');
    if (!studentEmail.trim()) return setError('Please enter your email.');
    if (files.length === 0) return setError('Please upload at least one file to print.');

    if (isUploadDisabled) {
      if (systemHealth && !systemHealth.systemReady) {
        return setError(`Printing service is currently unavailable. Blockers: ${systemHealth.blockers.join(', ')}`);
      }
      return setError('This print shop is currently under maintenance.');
    }

    let hasBw = false;
    let hasColor = false;
    files.forEach(file => {
      const conf = fileConfigs[file.name] || {};
      const printType = conf.printType === 'color' ? 'color' : 'bw';
      if (printType === 'color') hasColor = true;
      else hasBw = true;
    });

    if (hasBw && shopInfo.bwMaintenanceMode) {
      return setError('Black & White printing is temporarily unavailable.');
    }

    if (hasColor && shopInfo.colorMaintenanceMode) {
      return setError('Color printing is temporarily unavailable.');
    }

    setSubmitting(true);
    setUploadProgress(0);

    const formData = new FormData();
    files.forEach(file => {
      const conf = fileConfigs[file.name] || {};
      if (!conf.preConvertedPdfFilename) {
        formData.append('files', file);
      }
    });
    
    formData.append('studentName', studentName.trim());
    formData.append('studentEmail', studentEmail.trim());
    formData.append('shopId', selectedShopId);
    
    const configsArray = files.map(file => {
      const conf = fileConfigs[file.name];
      return {
        copies: conf.copies,
        printType: conf.printType || 'bw',
        printMode: conf.printType === 'color' ? 'color' : 'mono',
        sides: conf.sides,
        pageRange: conf.choosePagesType === 'custom' ? conf.customPages : '',
        preConvertedPdfFilename: conf.preConvertedPdfFilename,
        preConvertedOriginalFilename: conf.preConvertedOriginalFilename,
        name: file.name,
        size: file.size
      };
    });
    formData.append('configs', JSON.stringify(configsArray));

    try {
      const result = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(pct);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error('Failed to parse response'));
            }
          } else {
            let errMsg = 'Upload failed';
            try {
              const res = JSON.parse(xhr.responseText);
              if (res.error) errMsg = res.error;
            } catch {}
            reject(new Error(errMsg));
          }
        });

        xhr.open('POST', getApiUrl('/api/jobs'));
        const token = studentSessionToken || sessionStorage.getItem('studentSessionToken');
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        xhr.send(formData);
      });

      if (result && !Array.isArray(result) && result.order) {
        setSuccess({ order: result.order, jobs: Array.isArray(result.jobs) ? result.jobs : [] });
      } else if (Array.isArray(result)) {
        const firstJob = result[0];
        const synthOrder = firstJob ? {
          id: firstJob.orderId || 'UNKNOWN',
          token: firstJob.tokenId || firstJob.token || 'UNKNOWN'
        } : null;
        setSuccess({ order: synthOrder, jobs: result });
      } else {
        setSuccess(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    Object.values(previewUrls).forEach((url: string) => URL.revokeObjectURL(url));
    setPreviewUrls({});
    setFiles([]);
    setFileConfigs({});
    setActiveFileName(null);
    setSuccess(null);
    setError('');
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Helper: Get queue properties for a specific job
  const getQueueDetails = (jobId: string) => {
    // Active jobs: queued or printing, sorted chronologically (oldest first)
    // Calculate active jobs by extracting from active orders
    const activeJobs = orders
      .flatMap(o => o.jobs || [])
      .filter((j: any) => j.status === 'queued' || j.status === 'printing')
      .slice()
      .reverse();
    
    const index = activeJobs.findIndex(j => j.id === jobId);
    if (index === -1) return null;

    const currentJob = activeJobs[index];
    const printingJob = activeJobs.find(j => j.status === 'printing');
    const currentlyPrintingName = printingJob ? printingJob.fileName : 'None (Idle)';

    // Accumulate duration ahead
    let secondsAhead = 0;
    let pagesAhead = 0;

    for (let i = 0; i < index; i++) {
      const aj = activeJobs[i];
      pagesAhead += aj.pageCount * aj.copies;
      if (aj.status === 'printing') {
        const remainingPct = 1 - (aj.progressPercent / 100);
        secondsAhead += Math.max(2, remainingPct * aj.pageCount * aj.copies * averagePrintSpeed);
      } else {
        secondsAhead += aj.pageCount * aj.copies * averagePrintSpeed;
      }
    }

    const jobDuration = currentJob.pageCount * currentJob.copies * averagePrintSpeed;
    const startTime = new Date(Date.now() + secondsAhead * 1000);
    const completionTime = new Date(startTime.getTime() + jobDuration * 1000);

    const formatTime = (d: Date) => {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return {
      currentlyPrinting: currentlyPrintingName,
      position: index + 1,
      jobsAhead: index,
      pagesAhead,
      estimatedStart: formatTime(startTime),
      estimatedCompletion: formatTime(completionTime),
      waitingMinutes: Math.max(1, Math.round(secondsAhead / 60))
    };
  };

  // Calculate active shop queue summary
  const activeQueueJobs = orders.flatMap(o => o.jobs || []).filter((j: any) => j.status === 'queued' || j.status === 'printing');
  const waitingJobsCount = activeQueueJobs.length;
  const estimatedSeconds = activeQueueJobs.reduce((sum, j) => {
    if (j.status === 'printing') {
      const remaining = 1 - (j.progressPercent / 100);
      return sum + (j.pageCount * j.copies * remaining * averagePrintSpeed);
    }
    return sum + (j.pageCount * j.copies * averagePrintSpeed);
  }, 0);
  const estimatedMinutes = Math.max(1, Math.round(estimatedSeconds / 60));

  // Student's recent orders
  const studentRecentOrders = orders.filter(o => 
    (studentEmail && o.studentEmail === studentEmail) || 
    (profile?.id && o.studentId === profile.id) ||
    sessionStorage.getItem('adminRole') === 'owner'
  );

  const studentActiveOrders = studentRecentOrders.filter(o => o.status === 'pending_approval' || o.status === 'queued' || o.status === 'printing');
  const studentRecentJobs = studentRecentOrders.flatMap(o => o.jobs || []);
  const studentActiveJobs = studentRecentJobs.filter((j: any) => j.status === 'pending_approval' || j.status === 'queued' || j.status === 'printing');

  // Currently printing document name
  const globalPrintingJob = activeQueueJobs.find(j => j.status === 'printing');
  const currentlyPrintingDocName = globalPrintingJob ? globalPrintingJob.fileName : 'None (Idle)';

  const activeConf = activeFileName ? fileConfigs[activeFileName] : null;
  const activeFile = files.find(f => f.name === activeFileName);

  // ─── MAIN APPLICATION SHELL RENDER ─────────────────────────────
  return (
    <div className="flex h-screen w-full overflow-hidden font-sans text-left bg-[var(--bg-app)]  transition-colors relative">
      {/* ─── ATMOSPHERIC CANVAS BACKGROUND ─── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-orange-200/25  blur-[150px]" />
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] rounded-full bg-amber-100/25  blur-[140px]" />
        <div className="absolute -bottom-40 right-10 w-[650px] h-[650px] rounded-full bg-orange-100/20  blur-[150px]" />
        <div className="absolute inset-0 bg-noise opacity-60 pointer-events-none" />
      </div>
      {/* Backdrop Overlay (Lighter transculent backdrop with blur) */}
      <div
        className={`fixed inset-0 bg-slate-950/15  backdrop-blur-[2px] z-50 transition-opacity duration-300 ${
          isDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsDrawerOpen(false)}
      />

      {/* Slide-Out Drawer Panel (Fixed Viewport, No scrollbar) */}
      <aside
        className={`fixed inset-y-0 left-0 w-[280px] z-50 bg-white/95  backdrop-blur-xl border-r border-[var(--border-subtle)] shadow-2xl flex flex-col justify-between p-6 transform transition-all duration-300 ease-out overflow-hidden ${
          isDrawerOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
        }`}
      >
        {/* 1. FIXED HEADER SECTION */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)] flex-shrink-0 text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-500 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
              <Printer className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h2 className="text-sm font-extrabold text-[var(--text-primary)] tracking-tight">Campus Print Hub</h2>
              <p className="text-[11px] text-[var(--text-muted)] font-medium">Student Portal</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsDrawerOpen(false)}
            className="w-8 h-8 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border-none bg-transparent cursor-pointer flex items-center justify-center transition-colors"
            title="Close Menu"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* 2. FLEXIBLE MIDDLE MENU SECTION (no-scrollbar overflow-y-auto) */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4.5 text-left no-scrollbar">
          
          {/* ─── MAIN GROUP ─── */}
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-[var(--text-muted)]/50  tracking-widest font-mono select-none block px-3 mb-1">
              MAIN
            </span>
            
            {/* Dashboard */}
            <button
              type="button"
              onClick={() => { setActiveTab('dashboard'); setIsDrawerOpen(false); }}
              style={{ transitionDelay: isDrawerOpen ? '50ms' : '0ms' }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold border-none transition-all duration-300 ease-out cursor-pointer ${
                isDrawerOpen ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0'
              } ${
                activeTab === 'dashboard'
                  ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 text-white shadow-xs border border-purple-500/20'
                  : 'text-[var(--text-secondary)] hover:bg-purple-500/10 hover:text-purple-600  bg-transparent'
              }`}
            >
              <LayoutDashboard className={`w-4 h-4 ${activeTab === 'dashboard' ? 'text-white' : 'text-[var(--text-muted)]'}`} />
              <span>Dashboard</span>
            </button>

            {/* My Jobs */}
            <button
              type="button"
              onClick={() => { setActiveTab('jobs'); setIsDrawerOpen(false); }}
              style={{ transitionDelay: isDrawerOpen ? '80ms' : '0ms' }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold border-none transition-all duration-300 ease-out cursor-pointer ${
                isDrawerOpen ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0'
              } ${
                activeTab === 'jobs'
                  ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 text-white shadow-xs border border-purple-500/20'
                  : 'text-[var(--text-secondary)] hover:bg-purple-500/10 hover:text-purple-600  bg-transparent'
              }`}
            >
              <FileText className={`w-4 h-4 ${activeTab === 'jobs' ? 'text-white' : 'text-[var(--text-muted)]'}`} />
              <span>My Jobs</span>
            </button>

            {/* Queue Status */}
            <button
              type="button"
              onClick={() => { setActiveTab('queue'); setIsDrawerOpen(false); }}
              style={{ transitionDelay: isDrawerOpen ? '110ms' : '0ms' }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold border-none transition-all duration-300 ease-out cursor-pointer ${
                isDrawerOpen ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0'
              } ${
                activeTab === 'queue'
                  ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 text-white shadow-xs border border-purple-500/20'
                  : 'text-[var(--text-secondary)] hover:bg-purple-500/10 hover:text-purple-600  bg-transparent'
              }`}
            >
              <Clock className={`w-4 h-4 ${activeTab === 'queue' ? 'text-white' : 'text-[var(--text-muted)]'}`} />
              <span>Queue Status</span>
            </button>
          </div>

          {/* Subtle Divider */}
          <div className="h-px bg-slate-200/50  mx-3 my-1" />

          {/* ─── TOOLS GROUP ─── */}
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-[var(--text-muted)]/50  tracking-widest font-mono select-none block px-3 mb-1">
              TOOLS
            </span>

            {/* Price Calculator */}
            <button
              type="button"
              onClick={() => {
                setIsDrawerOpen(false);
                setActiveModal('price_calc');
              }}
              style={{ transitionDelay: isDrawerOpen ? '170ms' : '0ms' }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold border-none transition-all duration-300 ease-out cursor-pointer bg-transparent text-[var(--text-secondary)] hover:bg-purple-500/10 hover:text-purple-600  ${
                isDrawerOpen ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0'
              }`}
            >
              <Calculator className="w-4 h-4 text-[var(--text-muted)]" />
              <span>Price Calculator</span>
            </button>

            {/* Find Print Center */}
            <button
              type="button"
              onClick={() => {
                setIsDrawerOpen(false);
                setActiveModal('find_center');
              }}
              style={{ transitionDelay: isDrawerOpen ? '200ms' : '0ms' }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold border-none transition-all duration-300 ease-out cursor-pointer bg-transparent text-[var(--text-secondary)] hover:bg-purple-500/10 hover:text-purple-600  ${
                isDrawerOpen ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0'
              }`}
            >
              <Compass className="w-4 h-4 text-[var(--text-muted)]" />
              <span>Find Print Center</span>
            </button>

            {/* Print Guidelines */}
            <button
              type="button"
              onClick={() => {
                setIsDrawerOpen(false);
                setActiveModal('guidelines');
              }}
              style={{ transitionDelay: isDrawerOpen ? '230ms' : '0ms' }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold border-none transition-all duration-300 ease-out cursor-pointer bg-transparent text-[var(--text-secondary)] hover:bg-purple-500/10 hover:text-purple-600  ${
                isDrawerOpen ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0'
              }`}
            >
              <BookOpen className="w-4 h-4 text-[var(--text-muted)]" />
              <span>Print Guidelines</span>
            </button>

            {/* Help & Support */}
            <button
              type="button"
              onClick={() => { setActiveTab('help'); setIsDrawerOpen(false); }}
              style={{ transitionDelay: isDrawerOpen ? '260ms' : '0ms' }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold border-none transition-all duration-300 ease-out cursor-pointer ${
                isDrawerOpen ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0'
              } ${
                activeTab === 'help'
                  ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 text-white shadow-xs border border-purple-500/20'
                  : 'text-[var(--text-secondary)] hover:bg-purple-500/10 hover:text-purple-600  bg-transparent'
              }`}
            >
              <HelpCircle className={`w-4 h-4 ${activeTab === 'help' ? 'text-white' : 'text-[var(--text-muted)]'}`} />
              <span>Help & Support</span>
            </button>
          </div>

        </div>

        {/* 3. FIXED FOOTER SECTION */}
        <div className="pt-4 border-t border-[var(--border-subtle)] space-y-1 text-left flex-shrink-0">
          <span className="text-[10px] font-extrabold text-[var(--text-muted)]/50  tracking-widest font-mono select-none block px-3 mb-1">
            ACCOUNT
          </span>

          {/* About */}
          <button
            type="button"
            onClick={() => { setActiveTab('about' as any); setIsDrawerOpen(false); }}
            style={{ transitionDelay: isDrawerOpen ? '290ms' : '0ms' }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold border-none transition-all duration-300 ease-out cursor-pointer ${
              isDrawerOpen ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0'
            } ${
              activeTab === 'about'
                ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 text-white shadow-xs border border-purple-500/20'
                : 'text-[var(--text-secondary)] hover:bg-purple-500/10 hover:text-purple-600  bg-transparent'
            }`}
          >
            <Info className={`w-4 h-4 ${activeTab === 'about' ? 'text-white' : 'text-[var(--text-muted)]'}`} />
            <span>About</span>
          </button>

          {/* Sign Out */}
          <button
            type="button"
            onClick={() => { handleSignOut(); setIsDrawerOpen(false); }}
            style={{ transitionDelay: isDrawerOpen ? '350ms' : '0ms' }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-rose-600  hover:bg-rose-50  transition-all duration-300 ease-out cursor-pointer border-none bg-transparent ${
              isDrawerOpen ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0'
            }`}
          >
            <LogOut className="w-4.5 h-4.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ─── MAIN WORKSPACE COLUMN (FULL HORIZONTAL WIDTH) ─── */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative z-10 overflow-hidden">
        {/* ─── SINGLE TOP HEADER (88px EXACT HEIGHT) ─── */}
        <header className="h-[88px] min-h-[88px] max-h-[88px] border-b border-[var(--border-subtle)] bg-white/50  backdrop-blur-md px-6 sm:px-8 flex items-center justify-between z-30">
          {/* LEFT: Hamburger Button, Logo Branding & Print Centre Selector */}
          <div className="flex items-center gap-4">
            {/* Hamburger (☰) Menu Button */}
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="w-10 h-10 rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)]/80 text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all cursor-pointer flex items-center justify-center shadow-2xs"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Campus Print Hub Top-Left Branding */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-500 flex items-center justify-center text-white shadow-md shadow-purple-500/20 flex-shrink-0">
                <Printer className="w-4.5 h-4.5" />
              </div>
              <div className="hidden md:block text-left">
                <h2 className="text-sm font-extrabold text-[var(--text-primary)] tracking-tight truncate leading-tight">Campus Print Hub</h2>
                <p className="text-[10px] text-[var(--text-muted)] font-medium truncate">Student Portal</p>
              </div>
            </div>

            {/* Print Centre Selector Pill */}
            <div className="relative hidden sm:block" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setShowShopDropdown(!showShopDropdown)}
                className="px-4 py-2.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-card)]/80 hover:border-purple-300  text-xs font-bold text-[var(--text-primary)] flex items-center gap-2.5 shadow-2xs transition-all cursor-pointer"
              >
                <MapPin className="w-4 h-4 text-purple-500" />
                <span>{shops.find(s => s.id === selectedShopId)?.name || shopInfo?.name || 'TJohn Print Center'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </button>

              {showShopDropdown && (
                <div className="portal-card-elevated absolute left-0 mt-2 w-64 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-xl py-2 z-50 animate-modal-pop">
                  {shops.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        onSelectShop(s.id);
                        setShowShopDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-xs font-semibold transition-colors border-none cursor-pointer flex items-center justify-between ${
                        s.id === selectedShopId 
                          ? 'bg-purple-50  text-purple-600  font-bold' 
                          : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <span>{s.name}</span>
                      {s.id === selectedShopId && <Check className="w-4 h-4 text-purple-600 " />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT CONTROLS: Notification, Theme, Profile */}
          <div className="flex items-center gap-3.5">
            {/* Notification Button */}
            <button
              type="button"
              onClick={() => setShowNotifications(!showNotifications)}
              className="w-10 h-10 rounded-full border border-[var(--border-default)] bg-[var(--bg-card)]/80 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-all cursor-pointer flex items-center justify-center relative shadow-2xs"
              title="Notifications"
            >
              <Bell className="w-4.5 h-4.5" />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white " />
            </button>

            {/* Student Profile Pill */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => isRemembered && setShowProfileDropdown(!showProfileDropdown)}
                className="flex items-center gap-3 px-3 py-1.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-card)]/80 hover:bg-[var(--bg-hover)] transition-all cursor-pointer shadow-2xs"
              >
                {studentPicture ? (
                  <img
                    src={studentPicture}
                    alt={studentName}
                    className="w-8 h-8 rounded-lg object-cover border border-purple-200/50 "
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-purple-100  text-purple-600  font-extrabold text-xs flex items-center justify-center border border-purple-200/50 ">
                    {studentName ? studentName.charAt(0).toUpperCase() : 'S'}
                  </div>
                )}
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">{studentName || 'Student Test'}</p>
                  <p className="text-[10px] text-[var(--text-muted)] font-medium leading-tight mt-0.5">{studentEmail || 'student@university.edu'}</p>
                </div>
                {isRemembered && <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] ml-0.5" />}
              </button>
              {isRemembered && showProfileDropdown && (
                <div className="portal-card-elevated absolute right-0 mt-2 w-56 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-xl py-2 z-50 animate-modal-pop">
                  <div className="px-4 py-2 border-b border-[var(--border-subtle)]">
                    <p className="text-xs font-bold text-[var(--text-primary)]">{studentName || 'Student Test'}</p>
                    <p className="text-[10px] text-[var(--text-muted)] truncate">{studentEmail || 'student@university.edu'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600  hover:bg-rose-50  transition-colors flex items-center gap-2 border-none cursor-pointer mt-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ─── MAIN CONTENT SCROLLABLE CANVAS ─── */}
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 max-w-[1400px] w-full mx-auto">
          {success ? (
            /* STAGE 2: Success View inside App Shell */
            <div className="space-y-6 animate-fadeIn font-sans text-left">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
                <div className="lg:col-span-2">
                  <div className="portal-card p-8 text-center rounded-2xl">
                    <div className="flex justify-center mb-5">
                      <div className="w-16 h-16 rounded-full bg-emerald-100  border border-emerald-250  flex items-center justify-center">
                        <CheckCircle className="w-8 h-8 text-emerald-600 " />
                      </div>
                    </div>
                    <h2 className="text-xl font-black text-[var(--text-primary)] mb-2">
                      Upload Successful
                    </h2>
                    <p className="text-[var(--text-muted)] mb-5 text-xs leading-relaxed">
                      Please show your Approval Token to the shop operator after payment.
                    </p>

                    {/* Prominent Single Token Display */}
                    <div className="bg-orange-50  border border-orange-100  p-4 rounded-xl text-center mb-5">
                      <p className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest mb-1 font-mono">
                        Your Approval Token
                      </p>
                      <span className="text-3xl font-black text-orange-600  font-mono block">
                        {success.order?.token || 'N/A'}
                      </span>
                    </div>

                    <div className="bg-[var(--bg-surface-secondary)] rounded-xl p-5 mb-5 border border-[var(--border-subtle)] text-left max-h-56 overflow-y-auto font-sans">
                      <p className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest mb-2 font-mono">
                        Uploaded Documents ({success.jobs.length})
                      </p>
                      <div className="space-y-1.5">
                        {success.jobs.map((j, idx) => (
                          <div key={idx} className="flex justify-between items-center bg-[var(--bg-card)] p-2.5 rounded-lg border border-[var(--border-default)] text-xs">
                            <span className="text-[var(--text-primary)] font-bold truncate max-w-[200px]">
                              📄 {j.fileName}
                            </span>
                            <div className="bg-orange-50  text-orange-600  px-2 py-0.5 rounded font-extrabold font-mono text-[9px] uppercase border border-orange-100 ">
                              PENDING
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={resetForm}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-extrabold text-xs uppercase tracking-wider transition-colors cursor-pointer border-none shadow-md shadow-purple-500/20"
                    >
                      Print More Documents
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-3">
                  <QueueSummaryView 
                    waitingCount={waitingJobsCount} 
                    waitMinutes={estimatedMinutes} 
                    currentlyPrinting={currentlyPrintingDocName}
                    recentJobs={studentRecentJobs} 
                    studentActiveJobs={studentActiveJobs}
                    getQueueDetails={getQueueDetails}
                  />
                </div>
              </div>
            </div>
          ) : activeTab === 'dashboard' ? (
            /* STAGE 3: Main Dashboard View inside App Shell */
            <>
              {/* System Health Blocker Warning Card */}
              {systemHealth && !systemHealth.systemReady && (
                <div className="p-5 bg-rose-50  border border-rose-250  text-rose-800  rounded-xl flex items-start gap-3" role="alert">
                  <AlertTriangle className="w-5 h-5 text-rose-600  flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold">Printing service is currently unavailable.</h4>
                    <p className="text-xs text-rose-700  mt-1 leading-normal font-semibold">
                      Please try again later or contact the print administrator.
                    </p>
                  </div>
                </div>
              )}

              {/* Maintenance Mode Warning Card */}
              {isGlobalMaintenance && (
                <div className="p-4 bg-amber-50  border border-amber-200  text-amber-800  rounded-xl flex items-start gap-3" role="alert">
                  <AlertTriangle className="w-5 h-5 text-amber-600  flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold">⚠️ Shop Offline</h4>
                    <p className="text-xs text-amber-700  mt-1 leading-normal font-bold">
                      This print shop is currently under maintenance. Expected availability: <strong>{shopInfo?.bwExpectedReturnTime || shopInfo?.colorExpectedReturnTime || '06:02 PM'}</strong>.
                    </p>
                  </div>
                </div>
              )}

              {/* B&W Maintenance Mode Warning Card */}
              {agentOnlineStatus === 'online' && !isGlobalMaintenance && shopInfo?.bwMaintenanceMode && (
                <div className="p-4 bg-amber-50  border border-amber-250  text-amber-850  rounded-xl flex items-start gap-3" role="alert">
                  <AlertTriangle className="w-5 h-5 text-amber-600  flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold">⚠️ B&W Printing Offline</h4>
                    <p className="text-xs text-amber-700  mt-1 leading-normal font-semibold">
                      Black & White printing is temporarily unavailable. Expected availability: <strong>{shopInfo?.bwExpectedReturnTime || '06:02 PM'}</strong>.
                    </p>
                  </div>
                </div>
              )}

              {/* Color Maintenance Mode Warning Card */}
              {agentOnlineStatus === 'online' && !isGlobalMaintenance && shopInfo?.colorMaintenanceMode && (
                <div className="p-4 bg-amber-50  border border-amber-250  text-amber-850  rounded-xl flex items-start gap-3" role="alert">
                  <AlertTriangle className="w-5 h-5 text-amber-600  flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold">⚠️ Color Printing Offline</h4>
                    <p className="text-xs text-amber-700  mt-1 leading-normal font-semibold">
                      Color printing is temporarily unavailable. Expected availability: <strong>{shopInfo?.colorExpectedReturnTime || '06:02 PM'}</strong>.
                    </p>
                  </div>
                </div>
              )}

              {/* ─── SPRINT 7: PREMIUM HERO SECTION (LANDING HERO + 4 INFO PILLS) ─── */}
              <div className="space-y-3 text-left font-sans">
                
                {/* Premium Landing Hero Banner */}
                <div className="px-5 py-3 sm:py-4 rounded-2xl border border-purple-200/70  bg-gradient-to-r from-purple-600/10 via-indigo-600/5 to-purple-600/10    backdrop-blur-xl relative overflow-hidden shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  
                  {/* Decorative Background Glows */}
                  <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-purple-500/15  blur-3xl pointer-events-none" />
                  <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-indigo-500/15  blur-3xl pointer-events-none" />

                  {/* LEFT SIDE: Greeting, Subtitle & 4 Compact Information Pills */}
                  <div className="space-y-2 max-w-2xl relative z-10 w-full">
                    <div className="space-y-0.5">
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-100  text-purple-600  text-[9px] font-extrabold uppercase tracking-widest font-mono border border-purple-200/50  mb-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Campus High-Speed Spooler</span>
                      </div>
                      <h1 className="text-lg sm:text-xl lg:text-2xl font-black tracking-tight text-[var(--text-primary)] leading-none flex flex-wrap items-center gap-1.5">
                        <span>Good Morning, {studentName || 'Student Test'}</span>
                        <span className="text-xl">👋</span>
                      </h1>
                      <p className="text-[11px] sm:text-xs text-[var(--text-muted)] font-medium leading-tight pt-0.5">
                        Let's get your documents printed and spooled for campus pickup.
                      </p>
                    </div>

                    {/* 4 Compact Information Pills Grid */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {/* Pill 1: Current Print Center */}
                      <div className="px-2 py-1 rounded-lg bg-white/70  border border-[var(--border-subtle)] backdrop-blur-md flex items-center gap-1.5 font-mono text-[9px] font-bold text-[var(--text-primary)] shadow-2xs">
                        <MapPin className="w-3 h-3 text-purple-500 flex-shrink-0" />
                        <span className="truncate max-w-[100px]">{shops.find(s => s.id === selectedShopId)?.name || shopInfo?.name || 'TJohn Print'}</span>
                      </div>

                      {/* Pill 2: Printer Status */}
                      <div className="px-2 py-1 rounded-lg bg-white/70  border border-[var(--border-subtle)] backdrop-blur-md flex items-center gap-1.5 font-mono text-[9px] font-bold text-[var(--text-primary)] shadow-2xs">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          (() => {
                            if (health) {
                              const isBlocked = ['OFFLINE', 'UNREACHABLE', 'PAPER_EMPTY', 'PAPER_JAM', 'COVER_OPEN', 'UNKNOWN'].includes(health.printerHealth);
                              if (isBlocked) return 'bg-rose-500';
                              if (health.shopHealth === 'Busy') return 'bg-amber-500';
                              return 'bg-emerald-500';
                            }
                            return agentOnlineStatus === 'online' ? 'bg-emerald-500' : 'bg-rose-500';
                          })()
                        }`} />
                        <span>{
                          (() => {
                            if (health) {
                              const isBlocked = ['OFFLINE', 'UNREACHABLE', 'PAPER_EMPTY', 'PAPER_JAM', 'COVER_OPEN', 'UNKNOWN'].includes(health.printerHealth);
                              if (isBlocked) return 'Printing temporarily unavailable.';
                              if (health.shopHealth === 'Busy') return 'Busy';
                              return 'Ready';
                            }
                            return agentOnlineStatus === 'online' ? 'Ready' : 'Printing temporarily unavailable.';
                          })()
                        }</span>
                      </div>

                      {/* Pill 3: Average Queue Time */}
                      <div className="px-2 py-1 rounded-lg bg-white/70  border border-[var(--border-subtle)] backdrop-blur-md flex items-center gap-1.5 font-mono text-[9px] font-bold text-[var(--text-primary)] shadow-2xs">
                        <Clock className="w-3 h-3 text-amber-500 flex-shrink-0" />
                        <span>{waitingJobsCount === 0 ? '0 Mins' : `~${estimatedMinutes} Mins`}</span>
                      </div>

                      {/* Pill 4: Opening Hours */}
                      <div className="px-2 py-1 rounded-lg bg-white/70  border border-[var(--border-subtle)] backdrop-blur-md flex items-center gap-1.5 font-mono text-[9px] font-bold text-[var(--text-primary)] shadow-2xs">
                        <Zap className="w-3 h-3 text-sky-500 flex-shrink-0" />
                        <span>24/7 Service</span>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT SIDE: Minimal Printer/Document Illustration */}
                  <div className="relative z-10 hidden md:flex items-center justify-center flex-shrink-0 pr-1">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600/20 via-indigo-600/15 to-purple-500/20 border border-purple-200/50  backdrop-blur-xl flex items-center justify-center relative shadow-lg shadow-purple-500/10 group transition-transform duration-300 hover:scale-105">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-500/30">
                        <Printer className="w-4 h-4" />
                      </div>
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-md bg-white  border border-purple-200  text-purple-600  flex items-center justify-center shadow-2xs">
                        <FileText className="w-2 h-2" />
                      </div>
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 rounded-md bg-white  border border-emerald-200  text-emerald-500 flex items-center justify-center shadow-2xs">
                        <Check className="w-2 h-2 stroke-[3]" />
                      </div>
                    </div>
                  </div>

                </div>

                {/* Compact Linear/Stripe-style Progress Stepper Bar (DIRECTLY BELOW HERO) */}
                <div className="portal-card py-3 px-4 sm:py-3.5 sm:px-6 rounded-xl border border-[var(--border-subtle)]/70 bg-white/60  backdrop-blur-md shadow-2xs">
                  <div className="flex items-center justify-between gap-2 sm:gap-4">
                    {[
                      { num: 1, label: 'Upload', sub: 'Choose file' },
                      { num: 2, label: 'Configure', sub: 'Print settings' },
                      { num: 3, label: 'Review', sub: 'Check details' },
                      { num: 4, label: 'Print', sub: 'We handle rest' }
                    ].map((step, idx, arr) => {
                      const currentStep = submitting ? 4 : activeFileName ? 3 : files.length > 0 ? 2 : 1;
                      const state: 'completed' | 'active' | 'pending' = 
                        step.num < currentStep ? 'completed' : step.num === currentStep ? 'active' : 'pending';

                      const isLast = idx === arr.length - 1;
                      const isLineActive = step.num < currentStep;

                      return (
                        <React.Fragment key={step.num}>
                          {/* Compact Step Item */}
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Circle Indicator (32px) */}
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-xs transition-all flex-shrink-0 relative z-10 ${
                                state === 'completed'
                                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-2xs'
                                  : state === 'active'
                                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-2xs ring-3 ring-purple-100 '
                                  : 'bg-[var(--bg-card)]  text-[var(--text-muted)] border border-[var(--border-subtle)]'
                              }`}
                            >
                              {state === 'completed' ? (
                                <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                              ) : (
                                step.num
                              )}
                            </div>

                            {/* Step Title & Subtitle */}
                            <div className="text-left min-w-0">
                              <p
                                className={`text-[13px] font-bold tracking-tight leading-tight ${
                                  state === 'active'
                                    ? 'text-purple-600  font-extrabold'
                                    : state === 'completed'
                                    ? 'text-[var(--text-primary)]'
                                    : 'text-[var(--text-secondary)]'
                                }`}
                              >
                                {step.label}
                              </p>
                              <p className="text-[11px] text-[var(--text-muted)] font-medium truncate leading-tight mt-0.5 hidden sm:block">
                                {step.sub}
                              </p>
                            </div>
                          </div>

                          {/* Shortened Connecting Line Segment spanning ONLY between adjacent circles */}
                          {!isLast && (
                            <div className="flex-1 h-0.5 mx-1.5 sm:mx-3 rounded-full overflow-hidden bg-slate-200/70  min-w-[12px]">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  isLineActive ? 'bg-gradient-to-r from-purple-600 to-indigo-600' : 'w-0'
                                }`}
                                style={{ width: isLineActive ? '100%' : '0%' }}
                              />
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Main 2-Column Grid Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
                {/* Left Column (Hero Upload Card - 3 Columns) */}
                <div className="lg:col-span-3 space-y-6">
                  {/* Hero Upload Card Shell */}
                  <div className="portal-card-lavender p-6 sm:p-8 rounded-2xl shadow-xl shadow-purple-500/5 space-y-6 text-left border border-[var(--border-default)] relative overflow-hidden">
                    {/* Ambient Glow Accent */}
                    <div className="absolute -top-24 -right-24 w-72 h-72 bg-purple-500/5  rounded-full blur-3xl pointer-events-none" />

                    {/* SECTION 1: Upload Header */}
                    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4.5 relative z-10">
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-purple-600/10  border border-purple-200/80  flex items-center justify-center text-purple-600  shadow-xs">
                          <FileUp className="w-5 h-5 stroke-[2.2]" />
                        </div>
                        <div>
                          <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] tracking-tight">Upload Your Document</h2>
                          <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">Drag & drop your files or browse from your device</p>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-purple-50  text-purple-600  border border-purple-200/60  flex items-center gap-1.5 shadow-2xs font-mono">
                        <Zap className="w-3.5 h-3.5 fill-purple-600 " />
                        Institutional Spooler
                      </span>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                      {/* SECTION 2: Student Information (Compact Horizontal Card) */}
                      <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-[var(--bg-surface-secondary)]/50 border border-[var(--border-subtle)] backdrop-blur-xs">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-8.5 h-8.5 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 text-white font-extrabold flex items-center justify-center text-xs flex-shrink-0 shadow-xs">
                            {studentName ? studentName.charAt(0).toUpperCase() : 'S'}
                          </div>
                          <div className="min-w-0 flex-1 text-left">
                            <p className="text-xs font-bold text-[var(--text-primary)] truncate leading-tight">{studentName || 'Student Test'}</p>
                            <p className="text-[11px] text-[var(--text-muted)] font-medium truncate mt-0.5">{studentEmail || 'student@university.edu'}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600  bg-emerald-50  px-2.5 py-1 rounded-full border border-emerald-200/60  font-mono">
                          Verified Student
                        </span>
                      </div>

                      {/* SECTION 3: Drag & Drop Area (Height reduced by ~20%) */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-[11px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider font-mono">
                            Document Dropzone
                          </label>
                          <span className="text-[11px] font-semibold text-[var(--text-muted)]">Max 50MB per file</span>
                        </div>

                        <div
                          onDragOver={(submitting || isUploadDisabled) ? undefined : handleDragOver}
                          onDragLeave={(submitting || isUploadDisabled) ? undefined : handleDragLeave}
                          onDrop={(submitting || isUploadDisabled) ? undefined : handleDrop}
                          onClick={() => !(submitting || isUploadDisabled) && fileInputRef.current?.click()}
                          className={`relative rounded-2xl border-2 border-dashed p-7 sm:p-9 text-center cursor-pointer transition-all duration-300 group overflow-hidden ${
                            (submitting || isUploadDisabled)
                              ? 'border-[var(--border-subtle)] bg-[var(--bg-surface-secondary)]/40 cursor-not-allowed opacity-60'
                              : dragOver
                              ? 'border-purple-600 bg-purple-100/60  shadow-2xl shadow-purple-500/20 scale-[1.01]'
                              : 'border-purple-300/80  bg-gradient-to-b from-purple-50/50 via-slate-50/20 to-transparent    hover:border-purple-500 hover:bg-purple-50/80  hover:shadow-lg hover:shadow-purple-500/10'
                          }`}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept={ACCEPTED_EXT}
                            onChange={handleFileChange}
                            className="hidden"
                            disabled={submitting || isUploadDisabled}
                          />

                          <div className="flex flex-col items-center justify-center">
                            {/* Upload Icon */}
                            <div className="w-13 h-13 rounded-2xl bg-white  border border-purple-200/80  shadow-md shadow-purple-500/10 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:border-purple-500 transition-all duration-300">
                              <FileUp className="w-6.5 h-6.5 text-purple-600  stroke-[2]" />
                            </div>

                            {/* Headline */}
                            <p className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                              Drop your files here, or <span className="text-purple-600  underline underline-offset-4 decoration-purple-400/50 hover:decoration-purple-600 transition-all">browse files</span>
                            </p>
                            
                            {/* Supported formats */}
                            <p className="text-[11px] text-[var(--text-muted)] font-medium mt-1">
                              PDF & Images (PNG, JPG) up to 50MB
                            </p>

                            {/* Choose Files button */}
                            <button
                              type="button"
                              disabled={submitting || isUploadDisabled}
                              className="mt-4 py-2.5 px-6 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 text-white font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 border-none shadow-md shadow-purple-500/20 group-hover:shadow-purple-500/35 group-hover:scale-[1.02] transition-all cursor-pointer"
                            >
                              <FileUp className="w-3.5 h-3.5 stroke-[2.5]" />
                              Choose Files
                            </button>

                            {/* File format chips */}
                            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4.5">
                              {['📄 PDF', '🖼️ PNG / JPG'].map((type) => (
                                <span
                                  key={type}
                                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white/80 text-[var(--text-secondary)] border border-[var(--border-subtle)] shadow-2xs"
                                >
                                  {type}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Student-facing Format Notice */}
                        <div className="mt-2.5 px-3.5 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-center">
                          <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">
                            ✦ PDF & Images only — DOC, DOCX, PPT & PPTX files are not supported.
                          </span>
                        </div>
                      </div>

                      {error && (
                        <div className="p-3.5 bg-rose-50 bg-red-50  border border-rose-150  text-rose-600  text-xs font-semibold rounded-xl leading-relaxed">
                          {error}
                        </div>
                      )}

                      {submitting && (
                        <div className="space-y-2 p-4 bg-[var(--bg-surface-secondary)] rounded-xl border border-[var(--border-default)]">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[var(--text-muted)] font-medium flex items-center gap-1.5">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600 " />
                              Uploading & processing spool...
                            </span>
                            <span className="font-bold text-purple-600  font-mono">{uploadProgress}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--bg-input)] overflow-hidden">
                            <div 
                              className="h-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 transition-all duration-300" 
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* ─── JOURNEY 2: DOCUMENT-FIRST PREMIUM PDF PREVIEW EXPERIENCE ─── */}

                      {/* 1. SELECTED FILE HEADER CARD */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="block text-[11px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider font-mono">
                            Document Selection ({files.length})
                          </label>
                          {files.length > 0 && (
                            <span className="text-[10px] text-purple-600  font-extrabold">
                              Click to switch active preview
                            </span>
                          )}
                        </div>

                        {/* Empty State when no files exist */}
                        {files.length === 0 ? (
                          <div className="p-8 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-secondary)]/30 text-center space-y-2.5">
                            <FileText className="w-8 h-8 text-[var(--text-muted)] mx-auto opacity-40" />
                            <p className="text-xs font-bold text-[var(--text-secondary)]">No documents loaded</p>
                            <p className="text-[11px] text-[var(--text-muted)] font-medium max-w-sm mx-auto">
                              Upload PDF or Image files in the dropzone above to view the first-page document preview & print setup.
                            </p>
                          </div>
                        ) : (
                          /* Selected Files Header Listing */
                          <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                            {files.map((file) => {
                              const isActive = activeFileName === file.name;
                              const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';

                              return (
                                <div
                                  key={file.name}
                                  onClick={() => setActiveFileName(file.name)}
                                  className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                                    isActive
                                      ? 'border-purple-500 bg-purple-50/50  shadow-sm ring-1 ring-purple-500/30 scale-[1.005]'
                                      : 'border-[var(--border-default)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]'
                                  }`}
                                >
                                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                      isActive ? 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-xs' : 'bg-[var(--bg-surface-secondary)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                                    }`}>
                                      <FileText className="w-4.5 h-4.5" />
                                    </div>
                                    <div className="min-w-0 flex-1 text-left">
                                      <div className="flex items-center gap-2">
                                        <span title={file.name} className="text-xs font-bold text-[var(--text-primary)] truncate">{file.name}</span>
                                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-purple-100  text-purple-600  font-mono">
                                          {ext}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] font-mono mt-1 animate-fade-in">
                                        {fileConfigs[file.name]?.isConverting ? (
                                          <div className="flex items-center gap-1.5 text-purple-600 font-extrabold">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            <span>Converting to PDF...</span>
                                          </div>
                                        ) : (
                                          <>
                                            <span>{formatFileSize(file.size)}</span>
                                            <span>•</span>
                                            <span>{`${fileConfigs[file.name]?.pageCount || 1} pgs`}</span>
                                            <span>•</span>
                                            <span className="text-purple-600 font-extrabold uppercase">
                                              ₹{getFileCost(file.name)}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 flex-shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); removeFile(file.name); }}
                                      className="p-1.5 rounded-lg hover:bg-rose-100  text-[var(--text-muted)] hover:text-rose-600 border-none bg-transparent cursor-pointer transition-colors"
                                      title="Remove document"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* 2. STATIC FIRST PAGE PREVIEW (PRINTED SHEET ON TABLE CONFIRMATION) */}
                      {activeFileName && previewUrls[activeFileName] && (
                        <div className="space-y-3 pt-2 transition-all duration-300">
                          <div className="flex items-center justify-between">
                            <label className="block text-[11px] font-extrabold text-purple-600  uppercase tracking-wider font-mono">
                              Visual Print Confirmation
                            </label>
                            <span className="text-[10px] text-[var(--text-muted)] font-mono font-bold bg-[var(--bg-surface-secondary)] px-2.5 py-1 rounded-md border border-[var(--border-subtle)]">
                              A4 Portrait • Static Preview
                            </span>
                          </div>

                          {/* Neutral Table Surface Container */}
                          <div className="p-6 sm:p-8 bg-slate-100/90  rounded-2xl border border-slate-200/80  flex flex-col items-center justify-center shadow-inner relative overflow-hidden">
                            
                            {/* White Paper Sheet Placed on Table */}
                            <div className="w-full max-w-[350px] sm:max-w-[390px] aspect-[1/1.414] bg-white rounded-xl shadow-2xl shadow-slate-900/25 border border-slate-200/90 flex items-center justify-center relative overflow-hidden pointer-events-none select-none transition-transform duration-300">
                              {fileConfigs[activeFileName]?.isConverting ? (
                                <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-slate-50 text-center select-none">
                                  <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-4" />
                                  <h3 className="text-sm font-extrabold text-slate-800">Converting to PDF...</h3>
                                  <p className="text-[11px] text-slate-500 mt-2">Generating exact page count and preview.</p>
                                </div>
                              ) : (activeFileName.toLowerCase().endsWith('.pdf') || fileConfigs[activeFileName]?.preConvertedPdfFilename) ? (
                                <PdfFirstPageCanvas url={previewUrls[activeFileName]} />
                              ) : activeFileName.toLowerCase().match(/\.(png|jpg|jpeg)$/) ? (
                                <img
                                  src={previewUrls[activeFileName]}
                                  alt={activeFileName}
                                  className="w-full h-full object-contain p-2 bg-white select-none pointer-events-none"
                                />
                              ) : (
                                /* Static Printed Sheet Representation for DOCX / PPTX */
                                <div className="w-full h-full flex flex-col justify-between p-8 text-left bg-gradient-to-b from-white via-slate-50/50 to-white select-none">
                                  <div className="space-y-4">
                                    <div className="w-11 h-11 rounded-xl bg-purple-600/10 text-purple-600 flex items-center justify-center">
                                      <FileText className="w-5 h-5" />
                                    </div>
                                    <div>
                                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-mono">
                                        {activeFileName.split('.').pop()?.toUpperCase()}
                                      </span>
                                      <h3 className="text-sm font-black text-slate-900 mt-2 leading-snug truncate">
                                        {activeFileName}
                                      </h3>
                                      <p className="text-[11px] text-slate-500 mt-1 font-mono">
                                        {formatFileSize(files.find(f => f.name === activeFileName)?.size || 0)} • {(fileConfigs[activeFileName]?.pageCount || 1)} Total Pages
                                      </p>
                                    </div>
                                  </div>

                                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[10px] text-slate-500 font-mono font-medium">
                                    📄 First-page spool output verified for print queue.
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Page 1 of X Label */}
                            <p className="text-[11px] font-extrabold font-mono text-[var(--text-muted)] text-center tracking-wider uppercase mt-4">
                              Page 1 of {(fileConfigs[activeFileName]?.pageCount || 1)}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* 3. PRINT CONFIGURATION CARD (SLIDES UP) */}
                      {activeConf && activeFileName && (
                        <div className="p-5 sm:p-6 rounded-2xl border border-purple-200/80  bg-gradient-to-b from-purple-50/40 via-slate-50/20 to-transparent    space-y-5 text-left shadow-xs transition-all duration-300">
                          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3.5">
                            <div className="flex items-center gap-2">
                              <Settings className="w-4 h-4 text-purple-600 " />
                              <h3 className="text-xs font-extrabold text-purple-600  tracking-wider font-mono uppercase">
                                Print Configuration
                              </h3>
                            </div>
                            <span className="text-[11px] font-bold text-[var(--text-primary)] bg-[var(--bg-card)] px-3 py-1 rounded-lg border border-[var(--border-subtle)] font-mono truncate max-w-[200px]">
                              📄 {activeFileName}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-sans">
                            {/* Copies adjustment */}
                            <div className="p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-2">
                              <span className="block text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider font-mono">Copies</span>
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFileConfigs(prev => ({
                                      ...prev,
                                      [activeFileName]: { ...prev[activeFileName], copies: Math.max(1, prev[activeFileName].copies - 1) }
                                    }));
                                  }}
                                  className="w-8 h-8 rounded-lg bg-[var(--bg-surface-secondary)] font-bold flex items-center justify-center cursor-pointer border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  value={activeConf.copies}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value) || 1);
                                    setFileConfigs(prev => ({
                                      ...prev,
                                      [activeFileName]: { ...prev[activeFileName], copies: val }
                                    }));
                                  }}
                                  className="w-12 text-center bg-transparent border-none font-mono font-black text-sm text-[var(--text-primary)] focus:outline-none focus:ring-0"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFileConfigs(prev => ({
                                      ...prev,
                                      [activeFileName]: { ...prev[activeFileName], copies: prev[activeFileName].copies + 1 }
                                    }));
                                  }}
                                  className="w-8 h-8 rounded-lg bg-[var(--bg-surface-secondary)] font-bold flex items-center justify-center cursor-pointer border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Single / Double Sided */}
                            <div className="p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-2">
                              <span className="block text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider font-mono">Sides</span>
                              <div className="grid grid-cols-2 gap-1 p-0.5 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)]">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFileConfigs(prev => ({
                                      ...prev,
                                      [activeFileName]: { ...prev[activeFileName], sides: 'single' }
                                    }));
                                  }}
                                  className={`py-1 rounded-md font-bold text-[10px] sm:text-[11px] transition-all text-center cursor-pointer border-none ${
                                    activeConf.sides === 'single'
                                      ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xs font-extrabold'
                                      : 'bg-transparent text-[var(--text-muted)]'
                                  }`}
                                >
                                  Simplex (1-Sided)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFileConfigs(prev => ({
                                      ...prev,
                                      [activeFileName]: { ...prev[activeFileName], sides: 'double' }
                                    }));
                                  }}
                                  className={`py-1 rounded-md font-bold text-[10px] sm:text-[11px] transition-all text-center cursor-pointer border-none ${
                                    activeConf.sides === 'double'
                                      ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xs font-extrabold'
                                      : 'bg-transparent text-[var(--text-muted)]'
                                  }`}
                                >
                                  Duplex (2-Sided)
                                </button>
                              </div>
                            </div>

                            {/* Print Mode B&W / Color */}
                            <div className="p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-2">
                              <span className="block text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider font-mono">Print Mode</span>
                              <div className="grid grid-cols-2 gap-1 p-0.5 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)]">
                                <button
                                  type="button"
                                  disabled={shopInfo?.bwMaintenanceMode}
                                  onClick={() => {
                                    setFileConfigs(prev => ({
                                      ...prev,
                                      [activeFileName]: { ...prev[activeFileName], printType: 'bw', printMode: 'mono' }
                                    }));
                                  }}
                                  className={`py-1 rounded-md font-bold text-[11px] transition-all text-center cursor-pointer border-none ${
                                    activeConf.printType === 'bw'
                                      ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xs font-extrabold'
                                      : 'bg-transparent text-[var(--text-muted)]'
                                  } ${shopInfo?.bwMaintenanceMode ? 'opacity-40 cursor-not-allowed' : ''}`}
                                >
                                  B&W
                                </button>
                                <button
                                  type="button"
                                  disabled={shopInfo?.colorMaintenanceMode}
                                  onClick={() => {
                                    setFileConfigs(prev => ({
                                      ...prev,
                                      [activeFileName]: { ...prev[activeFileName], printType: 'color', printMode: 'color' }
                                    }));
                                  }}
                                  className={`py-1 rounded-md font-bold text-[11px] transition-all text-center cursor-pointer border-none ${
                                    activeConf.printType === 'color'
                                      ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xs font-extrabold'
                                      : 'bg-transparent text-[var(--text-muted)]'
                                  } ${shopInfo?.colorMaintenanceMode ? 'opacity-40 cursor-not-allowed' : ''}`}
                                >
                                  Color
                                </button>
                              </div>
                            </div>

                            {/* Paper Format */}
                            <div className="p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-2">
                              <span className="block text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider font-mono">Paper Size</span>
                              <div className="py-1 px-3 rounded-lg bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] font-mono text-[11px] font-extrabold text-[var(--text-primary)] text-center">
                                A4 Standard
                              </div>
                            </div>
                          </div>

                          {/* Page Range Config */}
                          <div className="mt-4 p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              <span className="block text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider font-mono text-left">Page Range</span>
                              <div className="grid grid-cols-2 gap-1 p-0.5 bg-[var(--bg-surface-secondary)] rounded-lg border border-[var(--border-subtle)] w-full sm:w-72">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFileConfigs(prev => ({
                                      ...prev,
                                      [activeFileName]: { ...prev[activeFileName], choosePagesType: 'all' }
                                    }));
                                  }}
                                  className={`py-1 rounded-md font-bold text-[11px] transition-all text-center cursor-pointer border-none ${
                                    activeConf.choosePagesType === 'all'
                                      ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xs font-extrabold'
                                      : 'bg-transparent text-[var(--text-muted)]'
                                  }`}
                                >
                                  All Pages ({activeConf.pageCount})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFileConfigs(prev => ({
                                      ...prev,
                                      [activeFileName]: { ...prev[activeFileName], choosePagesType: 'custom' }
                                    }));
                                  }}
                                  className={`py-1 rounded-md font-bold text-[11px] transition-all text-center cursor-pointer border-none ${
                                    activeConf.choosePagesType === 'custom'
                                      ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xs font-extrabold'
                                      : 'bg-transparent text-[var(--text-muted)]'
                                  }`}
                                >
                                  Custom Range
                                </button>
                              </div>
                            </div>
                            {activeConf.choosePagesType === 'custom' && (
                              <div className="space-y-1.5 pt-1 text-left animate-fadeIn">
                                <input
                                  type="text"
                                  placeholder="e.g. 1-3, 5, 7-9"
                                  value={activeConf.customPages || ''}
                                  onChange={(e) => {
                                    setFileConfigs(prev => ({
                                      ...prev,
                                      [activeFileName]: { ...prev[activeFileName], customPages: e.target.value }
                                    }));
                                  }}
                                  className="w-full px-3 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-input)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-purple-500 font-bold"
                                />
                                <p className="text-[10px] text-[var(--text-muted)] font-semibold leading-normal pl-0.5">
                                  Specify page numbers and/or ranges separated by commas (e.g. 1, 3-5, 8). Total document pages: {activeConf.pageCount}.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 4. LIVE PRINT SUMMARY CARD (FADES IN) */}
                      {files.length > 0 && (
                        <div className="p-5 sm:p-6 rounded-2xl bg-purple-50/70  border border-purple-200/80  flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 font-sans shadow-2xs transition-all duration-300">
                          <div className="space-y-1 text-left">
                            <span className="text-[11px] font-extrabold text-purple-600  uppercase tracking-widest font-mono block">
                              Live Order Summary
                            </span>
                            <div className="flex items-baseline gap-2">
                              <p className="text-2xl sm:text-3xl font-black text-[var(--text-primary)] font-mono tracking-tight">
                                ₹{getBatchTotal()}
                              </p>
                              <span className="text-xs text-[var(--text-muted)] font-medium">Estimated Price</span>
                            </div>
                          </div>

                          <div className="text-left sm:text-right font-mono space-y-1">
                            <div className="flex flex-wrap sm:justify-end items-center gap-1.5">
                              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold bg-purple-100  text-purple-600 ">
                                {files.length} {files.length === 1 ? 'File' : 'Files'}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold bg-purple-100  text-purple-600 ">
                                {files.reduce((sum, f) => sum + ((fileConfigs[f.name]?.pageCount || 1) * (fileConfigs[f.name]?.copies || 1)), 0)} Total Pages
                              </span>
                              {activeConf && (
                                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold bg-purple-100  text-purple-600 ">
                                  {activeConf.printType === 'color' ? 'Color' : 'B&W'} · {activeConf.sides === 'double' ? 'Duplex' : 'Simplex'}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[var(--text-muted)] font-medium">
                              Estimated Queue Time: ~2 Mins
                            </p>
                          </div>
                        </div>
                      )}

                      {/* 5. SUBMIT BUTTON (LARGE FULL-WIDTH CTA) */}
                      <button
                        type="submit"
                        disabled={files.length === 0 || submitting || isUploadDisabled || (Object.values(fileConfigs) as FileConfig[]).some(c => c.isConverting)}
                        className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 disabled:opacity-50 text-white font-extrabold text-sm uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2.5 border-none shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:scale-[1.01]"
                      >
                        {submitting ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Processing Print Job...
                          </div>
                        ) : (Object.values(fileConfigs) as FileConfig[]).some(c => c.isConverting) ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Converting Files to PDF...
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <Printer className="w-5 h-5" />
                            Submit & Send ({files.length} {files.length === 1 ? 'file' : 'files'})
                          </div>
                        )}
                      </button>
                    </form>
                  </div>
                </div>

                {/* ─── SPRINT 6: PREMIUM RIGHT SIDEBAR COLUMN ─── */}
                <div className="lg:col-span-2 space-y-5 text-left font-sans">

                  {/* 1. REDESIGNED PREMIUM PRINT HUB STATUS PANEL */}
                  <div className="p-6 rounded-2xl border border-purple-200/80  bg-white/80  backdrop-blur-xl shadow-sm space-y-5 hover:scale-[1.002] transition-all duration-200">
                    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-purple-600/10 text-purple-600  flex items-center justify-center">
                          <Printer className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <h3 className="text-xs font-extrabold text-[var(--text-primary)] tracking-tight uppercase font-mono">
                            Print Hub Status
                          </h3>
                          <p className="text-[10px] text-[var(--text-muted)] font-medium">Real-time Telemetry</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider font-mono ${
                        (() => {
                          if (health) {
                            const sh = health.shopHealth;
                            if (sh === 'Unavailable') return 'bg-rose-100 text-rose-700';
                            if (sh === 'Busy') return 'bg-amber-100 text-amber-700';
                            return 'bg-emerald-100 text-emerald-700';
                          }
                          return agentOnlineStatus === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
                        })()
                      }`}>
                        {(() => {
                          if (health) {
                            const sh = health.shopHealth;
                            if (sh === 'Unavailable') return '🔴 Unavailable';
                            if (sh === 'Busy') return '🟡 Busy';
                            return '🟢 Ready';
                          }
                          return agentOnlineStatus === 'online' ? '🟢 Ready' : '🔴 Unavailable';
                        })()}
                      </span>
                    </div>

                    {/* 2. VERTICAL TELEMETRY STACK (APPLE SETTINGS + LINEAR STYLE) */}
                    <div className="space-y-2.5">
                      {/* Row 1: Printer Status */}
                      <div className="p-3.5 rounded-xl bg-[var(--bg-surface-secondary)]/60 border border-[var(--border-subtle)] flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <Zap className="w-4 h-4 text-purple-600 " />
                          <span className="text-xs font-bold text-[var(--text-primary)]">Printer Status</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-xs font-extrabold">
                          <span className={`w-2 h-2 rounded-full ${
                            (() => {
                              if (health) {
                                const isBlocked = ['OFFLINE', 'UNREACHABLE', 'PAPER_EMPTY', 'PAPER_JAM', 'COVER_OPEN', 'UNKNOWN'].includes(health.printerHealth);
                                if (isBlocked) return 'bg-rose-500';
                                if (health.shopHealth === 'Busy') return 'bg-amber-500 animate-pulse';
                                return 'bg-emerald-500';
                              }
                              return agentOnlineStatus === 'online' ? (currentlyPrintingDocName ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500') : 'bg-rose-500';
                            })()
                          }`} />
                          <span className="text-[var(--text-primary)]">
                            {(() => {
                              if (health) {
                                const isBlocked = ['OFFLINE', 'UNREACHABLE', 'PAPER_EMPTY', 'PAPER_JAM', 'COVER_OPEN', 'UNKNOWN'].includes(health.printerHealth);
                                if (isBlocked) return 'Printing temporarily unavailable.';
                                if (health.shopHealth === 'Busy') return 'Busy';
                                return 'Ready';
                              }
                              return agentOnlineStatus === 'online' ? (currentlyPrintingDocName ? 'Busy' : 'Ready') : 'Printing temporarily unavailable.';
                            })()}
                          </span>
                        </div>
                      </div>


                      {/* Row 2: Queue */}
                      <div className="p-3.5 rounded-xl bg-[var(--bg-surface-secondary)]/60 border border-[var(--border-subtle)] flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <User className="w-4 h-4 text-indigo-500" />
                          <span className="text-xs font-bold text-[var(--text-primary)]">Jobs in Queue</span>
                        </div>
                        <span className="font-mono text-xs font-extrabold text-[var(--text-primary)]">
                          {waitingJobsCount} {waitingJobsCount === 1 ? 'Job' : 'Jobs'} Waiting
                        </span>
                      </div>

                      {/* Row 3: Estimated Wait */}
                      <div className="p-3.5 rounded-xl bg-[var(--bg-surface-secondary)]/60 border border-[var(--border-subtle)] flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <Clock className="w-4 h-4 text-amber-500" />
                          <span className="text-xs font-bold text-[var(--text-primary)]">Estimated Wait</span>
                        </div>
                        <span className="font-mono text-xs font-extrabold text-[var(--text-primary)]">
                          {waitingJobsCount === 0 ? '0 Mins' : `~${estimatedMinutes} Mins`}
                        </span>
                      </div>

                      {/* Row 4: Completed Jobs */}
                      <div className="p-3.5 rounded-xl bg-[var(--bg-surface-secondary)]/60 border border-[var(--border-subtle)] flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                          <span className="text-xs font-bold text-[var(--text-primary)]">Completed Jobs</span>
                        </div>
                        <span className="font-mono text-xs font-extrabold text-[var(--text-primary)]">
                          {studentRecentJobs.filter(j => j.status === 'completed').length} Total
                        </span>
                      </div>

                      {/* Row 5: Service Availability */}
                      <div className="p-3.5 rounded-xl bg-[var(--bg-surface-secondary)]/60 border border-[var(--border-subtle)] flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <Printer className="w-4 h-4 text-sky-500" />
                          <span className="text-xs font-bold text-[var(--text-primary)]">Service Availability</span>
                        </div>
                        <span className="font-mono text-xs font-extrabold text-[var(--text-primary)]">
                          {shopInfo?.bwMaintenanceMode && shopInfo?.colorMaintenanceMode
                            ? 'Maintenance'
                            : shopInfo?.bwMaintenanceMode
                            ? 'Color Only'
                            : shopInfo?.colorMaintenanceMode
                            ? 'B&W Only'
                            : '24/7 Operational'}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

            </>
          ) : (activeTab === 'jobs' || activeTab === 'queue') ? (
            <div className="max-w-4xl mx-auto w-full h-[calc(100vh-140px)] min-h-[600px] pb-8 animate-fadeIn">
              <QueueSummaryView 
                waitingCount={waitingJobsCount} 
                waitMinutes={estimatedMinutes} 
                currentlyPrinting={currentlyPrintingDocName}
                recentJobs={studentRecentJobs} 
                studentActiveJobs={studentActiveJobs}
                getQueueDetails={getQueueDetails}
              />
            </div>
          ) : activeTab === 'about' ? (
            <div className="max-w-5xl mx-auto w-full pb-8 animate-fadeIn space-y-10 text-left font-sans">
              
              {/* 1. Hero Section */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-8 sm:p-10 rounded-3xl bg-gradient-to-br from-purple-600/10 via-indigo-600/5 to-purple-600/10    border border-purple-200/50  relative overflow-hidden">
                <div className="absolute -top-24 -right-24 w-72 h-72 bg-purple-500/5  rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 space-y-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100  text-purple-700  text-[10px] font-extrabold uppercase tracking-widest font-mono border border-purple-200 ">
                    <Sparkles className="w-3 h-3" />
                    <span>Campus Print</span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-black text-[var(--text-primary)] tracking-tight">The Future of <br className="hidden sm:block" />Campus Printing.</h1>
                  <p className="text-sm sm:text-base text-[var(--text-secondary)] font-medium max-w-xl leading-relaxed">
                    A premium, cloud-based print management system designed specifically for modern educational institutions. Upload anywhere, print everywhere.
                  </p>
                </div>
                <div className="relative z-10 shrink-0 hidden md:block">
                  <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-xl shadow-purple-500/20 rotate-3 transition-transform hover:rotate-6">
                    <Printer className="w-16 h-16" />
                  </div>
                </div>
              </div>

              {/* 2. Why Campus Print */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] pb-3">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <h3 className="text-lg font-extrabold text-[var(--text-primary)] tracking-tight">Why Campus Print</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { icon: Zap, color: 'text-amber-500', title: 'Fast Printing', desc: 'Process documents in milliseconds with our optimized spooler.' },
                    { icon: ShieldCheck, color: 'text-emerald-500', title: 'Secure Documents', desc: 'End-to-end encryption ensures your private files stay private.' },
                    { icon: Cloud, color: 'text-sky-500', title: 'Cloud-Based Printing', desc: 'Send jobs from your dorm, pick them up at the library.' },
                    { icon: Layers, color: 'text-indigo-500', title: 'Multiple File Support', desc: 'Native support for PDFs, PNG, and JPG images.' },
                    { icon: Activity, color: 'text-purple-500', title: 'Live Queue Tracking', desc: 'Watch your document move through the print queue in real-time.' },
                    { icon: CheckCircle, color: 'text-teal-500', title: 'Reliable Printing', desc: 'Robust architecture with automatic failover and load balancing.' }
                  ].map((feature, idx) => (
                    <div key={idx} className="p-5 rounded-2xl bg-[var(--bg-surface-secondary)]/50 border border-[var(--border-subtle)] hover:border-purple-300  transition-colors">
                      <feature.icon className={`w-6 h-6 ${feature.color} mb-3`} />
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">{feature.title}</h4>
                      <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">{feature.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. How It Works */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] pb-3">
                  <Settings className="w-5 h-5 text-slate-500" />
                  <h3 className="text-lg font-extrabold text-[var(--text-primary)] tracking-tight">How It Works</h3>
                </div>
                <div className="portal-card p-6 rounded-3xl border border-[var(--border-default)] shadow-xs relative overflow-hidden">
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 text-center relative z-10">
                    {[
                      { step: '1', title: 'Upload', icon: FileUp },
                      { step: '2', title: 'Configure', icon: Settings },
                      { step: '3', title: 'Approval', icon: ShieldCheck },
                      { step: '4', title: 'Printing', icon: Printer },
                      { step: '5', title: 'Collection', icon: MapPin }
                    ].map((item, idx) => (
                      <div key={idx} className="flex flex-col items-center gap-3 relative">
                        <div className="w-12 h-12 rounded-full bg-slate-100  border-2 border-white  shadow-md flex items-center justify-center text-purple-600  z-10">
                          <item.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest font-mono">Step {item.step}</p>
                          <p className="text-xs font-bold text-[var(--text-primary)] mt-0.5">{item.title}</p>
                        </div>
                        {idx !== 4 && (
                          <div className="hidden sm:block absolute top-6 left-[50%] w-full h-[2px] bg-slate-200  -z-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 4. Our Mission */}
              <div className="p-8 sm:p-10 rounded-3xl bg-purple-600 text-white text-center shadow-lg relative overflow-hidden">
                <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 space-y-4">
                  <Heart className="w-8 h-8 mx-auto text-purple-200" />
                  <h3 className="text-2xl font-black tracking-tight">Our Mission</h3>
                  <p className="text-sm sm:text-base text-purple-100 font-medium max-w-2xl mx-auto leading-relaxed">
                    To eliminate the friction of campus printing by providing a seamless, transparent, and highly reliable digital bridge between students and print centers.
                  </p>
                </div>
              </div>

              {/* 5. Help & Support */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl border border-[var(--border-default)] shadow-xs bg-[var(--bg-card)] flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-100  text-purple-600  flex items-center justify-center shrink-0">
                    <HelpCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">Need Assistance?</h4>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 mb-3">Our support team is here to help with any technical issues.</p>
                    <a href="mailto:support@campusprint.edu" className="text-xs font-bold text-purple-600  hover:underline">support@campusprint.edu</a>
                  </div>
                </div>
                <div className="p-6 rounded-2xl border border-[var(--border-default)] shadow-xs bg-[var(--bg-card)] flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100  text-emerald-600  flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">Print Center Hours</h4>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 mb-1">Mon - Fri: 8:00 AM - 6:00 PM</p>
                    <p className="text-xs text-[var(--text-secondary)]">Location: Main Block, Ground Floor</p>
                  </div>
                </div>
              </div>

              {/* 6. Footer */}
              <div className="pt-8 pb-4 border-t border-[var(--border-subtle)] text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-[var(--text-muted)]">
                  <Printer className="w-4 h-4" />
                  <span className="text-xs font-bold">Campus Print</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] font-mono">v1.2.0</span>
                </div>
                <p className="text-[10px] font-medium text-[var(--text-muted)]">Built for modern educational institutions.</p>
              </div>

            </div>
          ) : activeTab === 'help' ? (
            <div className="max-w-5xl mx-auto w-full pb-8 animate-fadeIn space-y-8 text-left font-sans">
              
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-purple-600/10 via-indigo-600/5 to-purple-600/10    border border-purple-200/50 ">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white  border border-purple-200/80  shadow-md shadow-purple-500/10 flex items-center justify-center text-purple-600 ">
                    <HelpCircle className="w-6 h-6 stroke-[2.2]" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight">Help & Support</h2>
                    <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium mt-1">Get assistance, read guides, and contact support.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                {/* Main Content Area */}
                <div className="lg:col-span-2 space-y-6">
                  
                  {/* Quick Start Guide */}
                  <div className="portal-card p-6 sm:p-8 rounded-2xl border border-[var(--border-default)] shadow-xs">
                    <div className="flex items-center gap-3 mb-5 pb-4 border-b border-[var(--border-subtle)]">
                      <Zap className="w-5 h-5 text-amber-500" />
                      <h3 className="text-base font-extrabold text-[var(--text-primary)] uppercase tracking-wider font-mono">Quick Start Guide</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="w-7 h-7 rounded-full bg-purple-100  text-purple-600  flex items-center justify-center font-black text-xs shrink-0 font-mono">1</div>
                        <div>
                          <h4 className="text-sm font-bold text-[var(--text-primary)]">Upload Your Document</h4>
                          <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">Drag and drop your PDF or Image file into the dropzone on the Dashboard. Configure your print settings (copies, color, duplex) right there.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4">
                        <div className="w-7 h-7 rounded-full bg-purple-100  text-purple-600  flex items-center justify-center font-black text-xs shrink-0 font-mono">2</div>
                        <div>
                          <h4 className="text-sm font-bold text-[var(--text-primary)]">Get Your Token</h4>
                          <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">After submission, you will receive a unique 4-character Approval Token. You can track its queue position in the 'Queue Status' tab.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4">
                        <div className="w-7 h-7 rounded-full bg-purple-100  text-purple-600  flex items-center justify-center font-black text-xs shrink-0 font-mono">3</div>
                        <div>
                          <h4 className="text-sm font-bold text-[var(--text-primary)]">Release at Print Center</h4>
                          <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">Visit the Print Center and show your Approval Token to the operator after payment to physically release your print job.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* FAQ */}
                  <div className="portal-card p-6 sm:p-8 rounded-2xl border border-[var(--border-default)] shadow-xs">
                    <div className="flex items-center gap-3 mb-5 pb-4 border-b border-[var(--border-subtle)]">
                      <BookOpen className="w-5 h-5 text-indigo-500" />
                      <h3 className="text-base font-extrabold text-[var(--text-primary)] uppercase tracking-wider font-mono">Frequently Asked Questions</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-[var(--bg-surface-secondary)]/50 border border-[var(--border-subtle)]">
                        <h4 className="text-sm font-bold text-[var(--text-primary)]">Why is my document 'Pending Approval'?</h4>
                        <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">Jobs wait in a secure holding queue until you arrive at the print center to pay and authenticate the release with your token.</p>
                      </div>
                      <div className="p-4 rounded-xl bg-[var(--bg-surface-secondary)]/50 border border-[var(--border-subtle)]">
                        <h4 className="text-sm font-bold text-[var(--text-primary)]">What is the maximum file size?</h4>
                        <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">Currently, you can upload files up to 50MB. If your document is larger, please try compressing the PDF before uploading.</p>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Sidebar Cards Area */}
                <div className="space-y-6">
                  
                  {/* Contact Information */}
                  <div className="portal-card p-6 rounded-2xl border border-[var(--border-default)] shadow-xs space-y-5">
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-emerald-500" />
                      <h3 className="text-sm font-extrabold text-[var(--text-primary)] uppercase tracking-wider font-mono">Contact Info</h3>
                    </div>
                    <div className="space-y-3 text-xs">
                      <div className="flex items-start gap-3">
                        <MapPin className="w-4 h-4 text-[var(--text-muted)] mt-0.5" />
                        <div>
                          <p className="font-bold text-[var(--text-primary)]">TJohn Print Center</p>
                          <p className="text-[var(--text-secondary)] mt-0.5 leading-relaxed">Ground Floor, Main Block<br/>Next to Campus Library</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Clock className="w-4 h-4 text-[var(--text-muted)] mt-0.5" />
                        <div>
                          <p className="font-bold text-[var(--text-primary)]">Hours of Operation</p>
                          <p className="text-[var(--text-secondary)] mt-0.5 leading-relaxed">Mon - Fri: 8:00 AM - 6:00 PM</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {/* ─── CUSTOM DIALOG MODALS OVERLAYS ─── */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Translucent Backdrop Overlay */}
          <div 
            className="absolute inset-0 bg-slate-950/65 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setActiveModal(null)}
          />

          {/* Dialog Container */}
          <div className="portal-card-elevated w-full max-w-md p-6 sm:p-7 relative z-10 bg-white  rounded-3xl border border-purple-200/80  shadow-2xl text-left font-sans animate-modal-pop">
            {/* Close Icon Button */}
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full border-none bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer flex items-center justify-center transition-colors"
              title="Close Dialog"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Content Switch */}
            {activeModal === 'price_calc' && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-600/10 text-purple-600  flex items-center justify-center">
                    <Calculator className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--text-primary)] tracking-tight">Price Calculator</h3>
                    <p className="text-[10px] text-[var(--text-muted)] font-medium">Estimate print order costs dynamically</p>
                  </div>
                </div>

                {/* Pricing Reference Grid */}
                <div className="p-3.5 rounded-2xl bg-[var(--bg-surface-secondary)]/50 border border-[var(--border-subtle)] space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[var(--text-secondary)] font-medium">Single-sided B&W</span>
                    <span className="font-mono font-extrabold text-purple-600 ">₹{(shopInfo?.bwPrice ?? 2).toFixed(2)} / page</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[var(--text-secondary)] font-medium">Single-sided Color</span>
                    <span className="font-mono font-extrabold text-purple-600 ">₹{(shopInfo?.colorPrice ?? 5).toFixed(2)} / page</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[var(--text-secondary)] font-medium">Duplex (Double-sided)</span>
                    <span className="font-mono font-extrabold text-purple-600 ">₹{(shopInfo?.duplexPrice ?? 3).toFixed(2)} / sheet</span>
                  </div>
                </div>

                {/* Inputs Grid */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 font-mono">
                        Page Count
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={calcPages}
                        onChange={(e) => setCalcPages(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-3.5 py-2 rounded-xl portal-input text-xs font-bold text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 font-mono">
                        Copies
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={calcCopies}
                        onChange={(e) => setCalcCopies(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-3.5 py-2 rounded-xl portal-input text-xs font-bold text-[var(--text-primary)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest mb-2 font-mono">
                      Print Specifications
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'bw', label: 'B&W' },
                        { id: 'color', label: 'Color' },
                        { id: 'duplex', label: 'Duplex' }
                      ].map((spec) => (
                        <button
                          key={spec.id}
                          type="button"
                          onClick={() => setCalcType(spec.id as any)}
                          className={`py-2 px-3 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                            calcType === spec.id
                              ? 'bg-purple-600 border-purple-600 text-white shadow-xs'
                              : 'bg-[var(--bg-card)] border-[var(--border-default)] text-[var(--text-secondary)] hover:border-purple-300 '
                          }`}
                        >
                          {spec.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Dynamic Price Display */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-600/10 via-indigo-600/5 to-purple-600/10    border border-purple-200/50  flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text-primary)]">Estimated Total</span>
                  <span className="text-2xl font-black text-purple-600  font-mono">
                    ₹{(() => {
                      const bwRate = shopInfo?.bwPrice ?? 2;
                      const colorRate = shopInfo?.colorPrice ?? 5;
                      const duplexRate = shopInfo?.duplexPrice ?? 3;
                      const rate = calcType === 'color' ? colorRate : calcType === 'duplex' ? duplexRate : bwRate;
                      const activePages = calcType === 'duplex' ? Math.ceil(calcPages / 2) : calcPages;
                      return (rate * activePages * calcCopies).toFixed(2);
                    })()}
                  </span>
                </div>
              </div>
            )}

            {activeModal === 'find_center' && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-600/10 text-purple-600  flex items-center justify-center">
                    <Compass className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--text-primary)] tracking-tight">Print Center Location</h3>
                    <p className="text-[10px] text-[var(--text-muted)] font-medium">Physical coordinates & status</p>
                  </div>
                </div>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <p className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest font-mono">Center Name</p>
                    <p className="text-sm font-extrabold text-[var(--text-primary)] mt-0.5">{shopInfo?.name || 'TJohn Print Center'}</p>
                  </div>

                  <div>
                    <p className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest font-mono">Physical Address</p>
                    <p className="text-xs text-[var(--text-secondary)] font-semibold mt-0.5 leading-relaxed">
                      📍 {shopInfo?.address || 'Ground Floor, Main Block'}
                    </p>
                  </div>

                  {/* Telemetry metrics rows */}
                  <div className="grid grid-cols-3 gap-2.5 pt-1.5">
                    <div className="p-3 rounded-xl bg-[var(--bg-surface-secondary)]/50 border border-[var(--border-subtle)] text-center">
                      <p className="text-[9px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest font-mono">Status</p>
                      <p className={`text-xs font-black mt-1 ${shopInfo?.isOpen ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {shopInfo?.isOpen ? 'Operational' : 'Closed'}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--bg-surface-secondary)]/50 border border-[var(--border-subtle)] text-center">
                      <p className="text-[9px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest font-mono">Jobs in Queue</p>
                      <p className="text-xs font-black text-[var(--text-primary)] mt-1 font-mono">{waitingJobsCount}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--bg-surface-secondary)]/50 border border-[var(--border-subtle)] text-center">
                      <p className="text-[9px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest font-mono">Est. Wait</p>
                      <p className="text-xs font-black text-[var(--text-primary)] mt-1 font-mono">
                        {waitingJobsCount === 0 ? '0 Min' : `~${estimatedMinutes} Min`}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsDrawerOpen(false);
                    alert("Campus Map coordinates: Main Block, Ground Floor. Opening Google Maps is simulated.");
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 border-none shadow-xs"
                >
                  <span>Open in Maps</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {activeModal === 'guidelines' && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-600/10 text-purple-600  flex items-center justify-center">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--text-primary)] tracking-tight">Print Guidelines</h3>
                    <p className="text-[10px] text-[var(--text-muted)] font-medium">Standard parameters & recommendations</p>
                  </div>
                </div>

                <div className="space-y-3.5 text-xs text-[var(--text-secondary)]">
                  <div className="p-3.5 rounded-2xl bg-[var(--bg-surface-secondary)]/50 border border-[var(--border-subtle)] space-y-2 font-semibold">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[var(--text-muted)]">Supported Formats</span>
                      <span className="font-bold text-[var(--text-primary)]">Adobe PDF (.pdf)</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[var(--text-muted)]">File Size Limit</span>
                      <span className="font-bold text-[var(--text-primary)]">50 MB max per upload</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[var(--text-muted)]">Standard Size</span>
                      <span className="font-bold text-[var(--text-primary)]">A4 Paper size default</span>
                    </div>
                  </div>

                  <div className="space-y-2 leading-relaxed font-medium">
                    <p className="flex items-start gap-2">
                      <span className="text-purple-500">✔</span>
                      <span>LaTeX & Word exports: Ensure all font vectors are embedded to avoid print scaling issues.</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-purple-500">✔</span>
                      <span>Scale options: Always print official campus forms at <strong>100% scale</strong> (do not use shrink or fit-to-page).</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-purple-500">✔</span>
                      <span>Avoid screenshots: Upload vector documents directly to maintain razor-sharp text clarity.</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── simplified Queue Summary view component ─────────────────────
interface QueueSummaryProps {
  waitingCount: number;
  waitMinutes: number;
  currentlyPrinting: string;
  recentJobs: PrintJob[];
  studentActiveJobs: PrintJob[];
  getQueueDetails: (jobId: string) => any;
}

function QueueSummaryView({ waitingCount, waitMinutes, currentlyPrinting, recentJobs, studentActiveJobs, getQueueDetails }: QueueSummaryProps) {
  const [activeTabJobId, setActiveTabJobId] = useState<string | null>(null);

  // Auto select first active job to show queue details
  useEffect(() => {
    if (studentActiveJobs.length > 0) {
      // Find the oldest active job
      const oldestActive = studentActiveJobs[studentActiveJobs.length - 1];
      setActiveTabJobId(oldestActive.id);
    } else {
      setActiveTabJobId(null);
    }
  }, [studentActiveJobs.length]);

  const selectedDetails = activeTabJobId ? getQueueDetails(activeTabJobId) : null;
  const selectedJob = activeTabJobId ? studentActiveJobs.find(j => j.id === activeTabJobId) : null;

  return (
    <div className="portal-card-sage rounded-xl overflow-hidden flex flex-col h-full text-left font-sans shadow-sm">
      <div className="px-6 py-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-secondary)]/50">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 font-mono uppercase tracking-wider">
          <Clock className="w-4 h-4 text-[var(--color-primary)]" />
          <span>Print Hub Activity</span>
        </h3>
      </div>

      <div className="p-6 space-y-6">
        {/* Waiting widgets */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-slate-50/50  border border-slate-150 ">
            <span className="block text-[10px] font-extrabold text-slate-455  uppercase tracking-wider font-mono">Current Waiting Jobs</span>
            <p className="text-2xl font-black text-slate-800  mt-1">{waitingCount}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50/50  border border-slate-150 ">
            <span className="block text-[10px] font-extrabold text-slate-455  uppercase tracking-wider font-mono">Estimated Wait</span>
            <p className="text-2xl font-black text-slate-800  mt-1 font-mono">
              {waitingCount === 0 ? '0 Min' : `${waitMinutes} Min`}
            </p>
          </div>
        </div>

        {/* Real Queue Visibility details */}
        {selectedJob && (selectedDetails || selectedJob.status === 'pending_approval') && (
          <div className="p-5 rounded-xl border border-indigo-200/50  bg-indigo-50/15  space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-indigo-100/50 ">
              <span className="text-[10px] font-extrabold text-indigo-600  uppercase tracking-widest font-mono">
                {selectedJob.status === 'pending_approval' ? '⏳ APPROVAL TRACKER' : '🔍 LIVE QUEUE TRACKER'}
              </span>
              <span className="text-xs font-mono font-bold bg-indigo-100/60  text-indigo-700  px-2 py-0.5 rounded border border-indigo-200/40 ">
                Token: {selectedJob.token}
              </span>
            </div>

            {selectedJob.status === 'pending_approval' ? (
              <div className="p-4 bg-amber-50/10  border border-amber-250  text-slate-700  rounded-xl space-y-2.5 text-xs font-medium">
                <p className="font-bold text-amber-800 ">⏳ Awaiting Operator Release</p>
                <p className="leading-relaxed text-[11px] text-slate-500 ">
                  Your document is currently pending shop approval. Please show the following Approval Token to the shop operator to release your print job:
                </p>
                <div className="p-2.5 bg-white  border border-amber-200  rounded-lg text-center font-mono font-bold text-amber-700  text-sm animate-pulse">
                  {selectedJob.tokenId || 'N/A'}
                </div>
              </div>
            ) : selectedDetails && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs font-sans">
                  <div className="space-y-1">
                    <span className="block text-[10px] font-extrabold text-slate-455  uppercase tracking-wider font-mono">Currently Printing</span>
                    <p className="font-bold text-slate-800  truncate" title={selectedDetails.currentlyPrinting}>
                      {selectedDetails.currentlyPrinting}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="block text-[10px] font-extrabold text-slate-455  uppercase tracking-wider font-mono">Queue Position</span>
                    <p className="font-bold text-slate-800 ">
                      #{selectedDetails.position} <span className="text-[10px] text-slate-450  font-normal">({selectedDetails.jobsAhead} ahead)</span>
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="block text-[10px] font-extrabold text-slate-455  uppercase tracking-wider font-mono">Estimated Start</span>
                    <p className="font-bold text-indigo-600  font-mono">
                      {selectedJob.status === 'printing' ? 'Now Printing' : selectedDetails.estimatedStart}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="block text-[10px] font-extrabold text-slate-455  uppercase tracking-wider font-mono">Estimated Completion</span>
                    <p className="font-bold text-indigo-600  font-mono">
                      {selectedDetails.estimatedCompletion}
                    </p>
                  </div>
                </div>
                
                <div className="bg-indigo-50/30  border border-indigo-100/40  p-3 rounded-lg flex items-center justify-between text-xs text-indigo-700  font-semibold font-mono">
                  <span>ESTIMATED WAITING TIME:</span>
                  <span className="text-sm font-black">{selectedDetails.waitingMinutes} MINUTES</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Student's recent jobs */}
        <div className="space-y-3 text-left">
          <h4 className="text-[10px] font-extrabold text-slate-455  uppercase tracking-wider font-mono">Your Recent Print Jobs</h4>
          {recentJobs.length === 0 ? (
            <div className="p-8 text-center text-slate-400  border border-dashed border-slate-200  rounded-xl bg-slate-50/20  text-xs font-mono">
              No print jobs submitted from your account yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {recentJobs.map(job => {
                const isActive = job.status === 'pending_approval' || job.status === 'queued' || job.status === 'printing';
                const statusLabels: { [key: string]: string } = {
                  pending_approval: 'Pending Approval',
                  queued: 'In Queue',
                  printing: 'Printing',
                  completed: 'Completed',
                  failed: 'Failed',
                  printer_offline: 'Printer Offline',
                  paper_empty: 'Paper Empty'
                };
                
                return (
                  <div 
                    key={job.id} 
                    onClick={() => isActive && setActiveTabJobId(job.id)}
                    className={`p-3 border rounded-xl flex items-center justify-between text-xs transition-all ${
                      isActive ? 'cursor-pointer' : ''
                    } ${
                      activeTabJobId === job.id
                        ? 'border-indigo-500  bg-indigo-50/10  shadow-2xs'
                        : 'bg-white  border-slate-200  hover:bg-slate-50 '
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono font-black text-indigo-600 ">{job.token}</span>
                        {activeTabJobId === job.id && (
                          <span className="text-[9px] bg-indigo-100  text-indigo-700  px-1.5 py-0.5 rounded font-bold font-mono border border-indigo-200/30 ">TRACKING</span>
                        )}
                      </div>
                      <p className="font-bold text-slate-800  truncate" title={job.fileName}>{job.fileName}</p>
                      <p className="text-[10px] text-slate-455  font-mono mt-0.5">{job.pageCount} pgs · {timeAgo(job.createdAt)}</p>
                    </div>
                    
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider font-mono ${
                      job.status === 'completed' ? 'bg-emerald-50/20  text-emerald-700  border-emerald-200/50 ' :
                      job.status === 'printing' ? 'bg-indigo-50/20  text-indigo-700  border-indigo-200/50  animate-pulse' :
                      job.status === 'queued' ? 'bg-amber-50/20  text-amber-700  border-amber-200/50 ' :
                      job.status === 'pending_approval' ? 'bg-orange-50/20  text-orange-700  border-orange-200/50 ' :
                      'bg-rose-50/20  text-rose-700  border-rose-200/50 '
                    }`}>
                      {statusLabels[job.status] || job.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

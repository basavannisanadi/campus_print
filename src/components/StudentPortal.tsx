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
  Check
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { PrintJob } from '../types';
import { getApiUrl } from '../config';

interface Props {
  jobs: PrintJob[];
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
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const ACCEPTED_EXT = '.pdf,.png,.jpg,.jpeg,.doc,.docx,.ppt,.pptx';

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
}

export default function StudentPortal({
  jobs,
  printerStatus,
  expectedReturnTime,
  averagePrintSpeed,
  underMaintenance,
  shopInfo,
  shops,
  selectedShopId,
  onSelectShop,
  agentOnlineStatus = 'offline',
  systemHealth
}: Props) {
  // Authentication states
  const isGlobalMaintenance = (!!shopInfo?.bwMaintenanceMode && !!shopInfo?.colorMaintenanceMode) || underMaintenance;
  const isUploadDisabled = isGlobalMaintenance || (systemHealth && !systemHealth.systemReady);
  const [studentName, setStudentName] = useState(() => localStorage.getItem('studentName') || '');
  const [studentEmail, setStudentEmail] = useState(() => localStorage.getItem('studentEmail') || '');
  const [isRemembered, setIsRemembered] = useState(() => !!(localStorage.getItem('studentName') && localStorage.getItem('studentEmail')));
  
  // Login modal / username forms
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

  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [success, setSuccess] = useState<{ jobs: { token: string; fileName: string; tokenId?: string }[] } | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showShopDropdown, setShowShopDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    return () => {
      Object.values(previewUrlsRef.current).forEach((url: string) => URL.revokeObjectURL(url));
    };
  }, []);

  const handleGoogleLogin = (name: string, email: string) => {
    setStudentName(name);
    setStudentEmail(email);
    localStorage.setItem('studentName', name);
    localStorage.setItem('studentEmail', email);
    setIsRemembered(true);
    setShowGoogleModal(false);
    setShowCustomGoogleInput(false);
    setCustomGoogleName('');
    setCustomGoogleEmail('');
  };

  const handleUsernamePasswordLogin = () => {
    setLoginError('');
    if (!loginUsername.trim()) {
      setLoginError('Please enter a username or email.');
      return;
    }
    if (!loginPassword.trim()) {
      setLoginError('Please enter a password.');
      return;
    }

    const name = loginUsername.trim();
    let email = loginUsername.trim();
    if (!email.includes('@')) {
      email = `${loginUsername.trim().toLowerCase()}@university.edu`;
    }

    setStudentName(name);
    setStudentEmail(email);
    localStorage.setItem('studentName', name);
    localStorage.setItem('studentEmail', email);
    setIsRemembered(true);
    setLoginUsername('');
    setLoginPassword('');
  };

  const handleSignOut = () => {
    localStorage.removeItem('studentName');
    localStorage.removeItem('studentEmail');
    setStudentName('');
    setStudentEmail('');
    setIsRemembered(false);
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

  const addFiles = async (newFiles: File[]) => {
    const updatedFiles = [...files];
    const updatedConfigs = { ...fileConfigs };
    const updatedUrls = { ...previewUrls };

    for (const file of newFiles) {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const allowedExts = ['.pdf','.png','.jpg','.jpeg','.doc','.docx','.ppt','.pptx'];
      
      if (!ACCEPTED_TYPES.includes(file.type) && !allowedExts.includes(ext)) {
        setError(`File "${file.name}" is not a supported format (audio/video blocked).`);
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds the 50MB limit.`);
        continue;
      }

      if (updatedFiles.some(f => f.name === file.name)) continue;
      
      let pageCount = 1;
      if (file.type === 'application/pdf') {
        pageCount = await getPdfPageCount(file);
      }

      updatedFiles.push(file);
      updatedConfigs[file.name] = {
        copies: 1,
        printMode: (!!shopInfo?.bwMaintenanceMode && !shopInfo?.colorMaintenanceMode) ? 'color' : 'mono',
        printType: (!!shopInfo?.bwMaintenanceMode && !shopInfo?.colorMaintenanceMode) ? 'color' : 'bw',
        sides: 'single',
        pageCount,
        choosePagesType: 'all',
        customPages: '',
      };

      updatedUrls[file.name] = URL.createObjectURL(file);
    }
    
    setFiles(updatedFiles);
    setFileConfigs(updatedConfigs);
    setPreviewUrls(updatedUrls);
    
    if (newFiles.length > 0 && !activeFileName) {
      setActiveFileName(newFiles[0].name);
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
    const validFiles = droppedFiles.filter(f => ACCEPTED_TYPES.includes(f.type));
    
    if (validFiles.length > 0) {
      addFiles(validFiles);
      setError('');
    } else {
      setError('Please upload valid PDF, Word, PowerPoint, or image files.');
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
      formData.append('files', file);
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
        pageRange: conf.choosePagesType === 'custom' ? conf.customPages : ''
      };
    });
    formData.append('configs', JSON.stringify(configsArray));

    try {
      const result = await new Promise<{ token: string; fileName: string; tokenId?: string }[]>((resolve, reject) => {
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
        xhr.send(formData);
      });

      setSuccess({ jobs: result });
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
    const activeJobs = jobs
      .filter(j => j.status === 'queued' || j.status === 'printing')
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
  const activeQueueJobs = jobs.filter(j => j.status === 'queued' || j.status === 'printing');
  const waitingJobsCount = activeQueueJobs.length;
  const estimatedSeconds = activeQueueJobs.reduce((sum, j) => {
    if (j.status === 'printing') {
      const remaining = 1 - (j.progressPercent / 100);
      return sum + (j.pageCount * j.copies * remaining * averagePrintSpeed);
    }
    return sum + (j.pageCount * j.copies * averagePrintSpeed);
  }, 0);
  const estimatedMinutes = Math.max(1, Math.round(estimatedSeconds / 60));

  // Student's recent jobs
  const studentRecentJobs = jobs.filter(j => j.studentEmail === studentEmail);
  const studentActiveJobs = studentRecentJobs.filter(j => j.status === 'pending_approval' || j.status === 'queued' || j.status === 'printing');

  // Currently printing document name
  const globalPrintingJob = activeQueueJobs.find(j => j.status === 'printing');
  const currentlyPrintingDocName = globalPrintingJob ? globalPrintingJob.fileName : 'None (Idle)';

  // ─── STAGE 1: SIGN IN VIEW ─────────────────────────────────
  if (!isRemembered) {
    return (
      <div className="max-w-md mx-auto my-12 text-left font-sans">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
          <div className="p-8 pb-6 text-center border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
            <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center mx-auto mb-4">
              <Printer className="w-5.5 h-5.5 text-slate-700 dark:text-slate-350" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Sign In to Print</h2>
            <p className="text-xs text-slate-500 dark:text-slate-450 mt-1">Access institutional high-speed print hubs</p>
          </div>

          <div className="p-8 space-y-5">
            {loginError && (
              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-xs text-rose-600 dark:text-rose-450 font-semibold" role="alert">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {loginError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 font-mono">
                  Username or Email
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="e.g. basav"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/40 focus:border-indigo-500 transition-all font-semibold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 font-mono">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400 dark:text-slate-500" />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/40 focus:border-indigo-500 transition-all font-semibold"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleUsernamePasswordLogin}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors cursor-pointer flex items-center justify-center gap-2 border-none shadow-2xs"
            >
              Sign In & Connect
            </button>

            <div className="relative flex items-center justify-center my-4">
              <div className="absolute inset-x-0 h-[1px] bg-slate-100 dark:bg-slate-800" />
              <span className="relative px-3 bg-white dark:bg-slate-900 text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest font-mono">
                OR
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setLoginError('');
                setShowGoogleModal(true);
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-750 dark:text-slate-200 font-bold text-xs transition-colors shadow-2xs flex items-center justify-center gap-3 cursor-pointer select-none"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.06-.2-.09-.41-.09-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>

        {showGoogleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-[420px] rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg p-8 relative flex flex-col text-left">
              <button
                onClick={() => {
                  setShowGoogleModal(false);
                  setShowCustomGoogleInput(false);
                }}
                className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-105 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-650 dark:hover:text-slate-350 transition-colors cursor-pointer border-none bg-transparent"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center text-center mb-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Choose Google account</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">to continue to Campus Print Hub</p>
              </div>

              {!showCustomGoogleInput ? (
                <div className="space-y-2 mb-4">
                  {[
                    { name: 'Basav', email: 'basav@university.edu', avatarColor: 'bg-indigo-650 text-white' },
                    { name: 'Student Test', email: 'student@university.edu', avatarColor: 'bg-emerald-650 text-white' }
                  ].map((acc) => (
                    <button
                      key={acc.email}
                      onClick={() => handleGoogleLogin(acc.name, acc.email)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-150 dark:border-slate-800 hover:border-slate-250 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors text-left cursor-pointer bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-200"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${acc.avatarColor}`}>
                        {acc.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">{acc.name}</p>
                        <p className="text-[10px] text-slate-450 dark:text-slate-400 leading-none mt-1">{acc.email}</p>
                      </div>
                    </button>
                  ))}

                  <button
                    onClick={() => setShowCustomGoogleInput(true)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/10 dark:hover:bg-indigo-950/10 transition-colors text-left cursor-pointer bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 flex items-center justify-center font-bold text-xs text-slate-400 dark:text-slate-500">
                      +
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-tight">Use another account</p>
                    </div>
                  </button>
                </div>
              ) : (
                <div className="space-y-4 mb-4">
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-450 dark:text-slate-500 uppercase tracking-widest mb-1.5 font-mono">
                      Google Profile Name
                    </label>
                    <input
                      type="text"
                      value={customGoogleName}
                      onChange={(e) => setCustomGoogleName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-450 dark:text-slate-500 uppercase tracking-widest mb-1.5 font-mono">
                      Google Email Address
                    </label>
                    <input
                      type="email"
                      value={customGoogleEmail}
                      onChange={(e) => setCustomGoogleEmail(e.target.value)}
                      placeholder="e.g. ramesh@gmail.com"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCustomGoogleInput(false)}
                      className="flex-1 py-2 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors border-none cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!customGoogleName.trim() || !customGoogleEmail.trim()) return;
                        handleGoogleLogin(customGoogleName.trim(), customGoogleEmail.trim());
                      }}
                      className="flex-1 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors border-none cursor-pointer"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn font-sans text-left">
        <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 text-indigo-700 dark:text-indigo-400">
            📍 {shopInfo?.name || 'Campus Print Hub'}
          </span>
          <button
            onClick={handleSignOut}
            className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-350 text-xs font-bold transition-all cursor-pointer bg-white dark:bg-slate-900"
          >
            Sign Out
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-slate-200 dark:border-slate-800 p-8 text-center">
              <div className="flex justify-center mb-5">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-250 dark:border-emerald-900/50 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <h2 className="text-xl font-black text-slate-800 dark:text-white mb-2">
                Upload Successful
              </h2>
              <p className="text-slate-500 dark:text-slate-400 mb-6 text-xs leading-relaxed">
                Please show your Approval Token to the shop operator after payment.
              </p>

              <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-5 mb-6 border border-slate-100 dark:border-slate-850 text-left max-h-56 overflow-y-auto font-sans">
                <p className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 font-mono">
                  Your Approval Tokens
                </p>
                <div className="space-y-2">
                  {success.jobs.map((j, idx) => {
                    return (
                      <div key={idx} className="flex flex-col bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-700 dark:text-slate-300 font-bold truncate max-w-[170px]">
                            {j.fileName}
                          </span>
                          <span className="text-sm font-extrabold text-orange-600 dark:text-orange-400 font-mono">
                            {j.tokenId || 'N/A'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-450 dark:text-slate-550 font-mono">
                          Status: Pending Approval
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={resetForm}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 dark:bg-indigo-650 text-white font-semibold text-xs hover:bg-indigo-750 dark:hover:bg-indigo-700 transition-colors cursor-pointer border-none shadow-xs"
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
    );
  }

  const activeConf = activeFileName ? fileConfigs[activeFileName] : null;
  const activeFile = files.find(f => f.name === activeFileName);

  // ─── STAGE 3: MAIN DASHBOARD VIEW ───────────────────────────
  return (
    <div className="max-w-7xl mx-auto space-y-6 font-sans text-left">
      {/* Top Info Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {shops.length > 1 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono">Shop:</span>
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowShopDropdown(!showShopDropdown)}
                  className="flex items-center justify-between gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-350 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                >
                  <span>{shops.find(s => s.id === selectedShopId)?.name || 'Select Shop'}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                </button>
                {showShopDropdown && (
                  <div className="absolute left-0 mt-1.5 w-56 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-md py-1 z-50 animate-fadeIn">
                    {shops.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          onSelectShop(s.id);
                          setShowShopDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs font-semibold transition-colors border-none cursor-pointer flex items-center justify-between ${
                          s.id === selectedShopId 
                            ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400' 
                            : 'text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-900'
                        }`}
                      >
                        <span>{s.name}</span>
                        {s.id === selectedShopId && <Check className="w-3.5 h-3.5 text-indigo-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-55/40 dark:bg-indigo-950/30 border border-indigo-150 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 w-fit">
              📍 {shopInfo?.name || 'Campus Print Hub'}
            </span>
          )}
          <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500 font-semibold font-mono">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> {shopInfo.address || 'N/A'}
            </span>
            <span className="flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" /> {shopInfo.phoneNumber || shopInfo.phone || 'N/A'}
            </span>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-350 text-xs font-bold transition-all cursor-pointer bg-white dark:bg-slate-900"
        >
          Sign Out
        </button>
      </div>

      {/* System Health Blocker Warning Card */}
      {systemHealth && !systemHealth.systemReady && (
        <div className="p-5 bg-rose-50 dark:bg-rose-955/20 border border-rose-250 dark:border-rose-900/30 text-rose-800 dark:text-rose-300 rounded-xl flex items-start gap-3" role="alert">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold">Printing service is currently unavailable.</h4>
            <p className="text-xs text-rose-700 dark:text-rose-400 mt-1 leading-normal font-semibold">
              Please try again later or contact the print administrator.
            </p>
          </div>
        </div>
      )}

      {/* Maintenance Mode Warning Card */}
      {isGlobalMaintenance && (
        <div className="p-4 bg-amber-50 dark:bg-amber-955/10 border border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300 rounded-xl flex items-start gap-3" role="alert">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold">⚠️ Shop Offline</h4>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 leading-normal font-bold">
              This print shop is currently under maintenance. Expected availability: <strong>{shopInfo?.bwExpectedReturnTime || shopInfo?.colorExpectedReturnTime || '06:02 PM'}</strong>.
            </p>
          </div>
        </div>
      )}

      {/* B&W Maintenance Mode Warning Card */}
      {agentOnlineStatus === 'online' && !isGlobalMaintenance && shopInfo?.bwMaintenanceMode && (
        <div className="p-4 bg-amber-50 dark:bg-amber-955/10 border border-amber-250 dark:border-amber-900/30 text-amber-850 dark:text-amber-300 rounded-xl flex items-start gap-3" role="alert">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold">⚠️ B&W Printing Offline</h4>
            <p className="text-xs text-amber-700 dark:text-amber-450 mt-1 leading-normal font-semibold">
              Black & White printing is temporarily unavailable. Expected availability: <strong>{shopInfo?.bwExpectedReturnTime || '06:02 PM'}</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Color Maintenance Mode Warning Card */}
      {agentOnlineStatus === 'online' && !isGlobalMaintenance && shopInfo?.colorMaintenanceMode && (
        <div className="p-4 bg-amber-50 dark:bg-amber-955/10 border border-amber-250 dark:border-amber-900/30 text-amber-850 dark:text-amber-300 rounded-xl flex items-start gap-3" role="alert">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold">⚠️ Color Printing Offline</h4>
            <p className="text-xs text-amber-700 dark:text-amber-450 mt-1 leading-normal font-semibold">
              Color printing is temporarily unavailable. Expected availability: <strong>{shopInfo?.colorExpectedReturnTime || '06:02 PM'}</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
        {/* Left column: Print Upload Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-805 bg-slate-50/50 dark:bg-slate-950/20">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/40">
                  <Upload className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Upload to Print</h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Configure settings and send queues</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* User badge */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950/30 border border-slate-150 dark:border-slate-800">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-150 dark:border-indigo-900 flex items-center justify-center font-black text-indigo-650 dark:text-indigo-400 text-xs shadow-2xs flex-shrink-0">
                    {studentName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate leading-tight">{studentName}</p>
                    <p className="text-[10px] text-slate-450 dark:text-slate-400 truncate leading-none mt-1">{studentEmail}</p>
                  </div>
                </div>
              </div>

              {/* Drag and Drop File box */}
              <div>
                <label className="block text-[10px] font-extrabold text-slate-455 dark:text-slate-550 uppercase tracking-widest mb-1.5 font-mono">
                  Ingestion File
                </label>
                <div
                  onDragOver={(submitting || isUploadDisabled) ? undefined : handleDragOver}
                  onDragLeave={(submitting || isUploadDisabled) ? undefined : handleDragLeave}
                  onDrop={(submitting || isUploadDisabled) ? undefined : handleDrop}
                  onClick={() => !(submitting || isUploadDisabled) && fileInputRef.current?.click()}
                  className={`relative rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-150 ${
                    (submitting || isUploadDisabled)
                      ? 'border-slate-100 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950/20 cursor-not-allowed opacity-60'
                      : dragOver
                      ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-955/10 hover:border-slate-350 dark:hover:border-slate-700'
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
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Upload className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Drag files here or click to browse</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-550 mt-1 font-mono">PDF, DOCX, PPTX, PNG, JPG (Max 50MB)</p>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-rose-50 dark:bg-rose-955/20 border border-rose-150 dark:border-rose-900/30 text-rose-600 dark:text-rose-455 text-xs font-semibold rounded-xl leading-relaxed">
                  {error}
                </div>
              )}

              {submitting && (
                <div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-955/40 rounded-xl border border-slate-150 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-550 dark:text-slate-400 font-medium flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-555 dark:text-indigo-400" />
                      Uploading files...
                    </span>
                    <span className="font-bold text-indigo-605 dark:text-indigo-400">{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-300" 
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Uploaded Files queue listing */}
              {files.length > 0 && (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {files.map((file) => (
                    <div
                      key={file.name}
                      onClick={() => setActiveFileName(file.name)}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                        activeFileName === file.name
                          ? 'border-indigo-500 dark:border-indigo-550 bg-indigo-50/15 dark:bg-indigo-950/20 shadow-2xs'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-850/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <FileText className={`w-4 h-4 flex-shrink-0 ${activeFileName === file.name ? 'text-indigo-500' : 'text-slate-400 dark:text-slate-500'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{file.name}</p>
                          <p className="text-[10px] text-slate-455 dark:text-slate-550 font-mono mt-0.5">
                            {formatFileSize(file.size)} · {fileConfigs[file.name]?.pageCount || 1} pgs
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-black text-slate-700 dark:text-slate-300 bg-slate-105/80 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200/40 dark:border-slate-700 font-mono font-bold">
                          ₹{getFileCost(file.name)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeFile(file.name); }}
                          className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-650 dark:hover:text-slate-350 border-none bg-transparent cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {files.length > 0 && (
                <div className="p-4 bg-indigo-50/30 dark:bg-indigo-950/10 border border-indigo-100 dark:border-indigo-900/50 rounded-xl text-left flex justify-between items-center font-sans">
                  <div>
                    <span className="text-[10px] font-extrabold text-indigo-555 dark:text-indigo-400 uppercase tracking-widest font-mono">Batch Total Estimate</span>
                    <p className="text-lg font-black text-slate-800 dark:text-white mt-1">₹{getBatchTotal()}</p>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-550 font-mono">
                    {files.length} {files.length === 1 ? 'File' : 'Files'}
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={files.length === 0 || submitting || isUploadDisabled}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-650 dark:hover:bg-indigo-750 disabled:opacity-50 text-white font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 border-none shadow-xs"
              >
                {submitting ? (
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending to Printer...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Printer className="w-4 h-4" />
                    {systemHealth && !systemHealth.systemReady ? 'System Not Ready' : (printerStatus === 'offline' ? 'Queue for Later' : 'Send Queue to Print')} ({files.length} {files.length === 1 ? 'file' : 'files'})
                  </div>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right column: Previews & Simplified Queue metrics */}
        <div className="lg:col-span-3 space-y-6">
          {files.length === 0 ? (
            <QueueSummaryView 
              waitingCount={waitingJobsCount} 
              waitMinutes={estimatedMinutes} 
              currentlyPrinting={currentlyPrintingDocName}
              recentJobs={studentRecentJobs} 
              studentActiveJobs={studentActiveJobs}
              getQueueDetails={getQueueDetails}
            />
          ) : (
            <>
              {/* Document Metadata Grid Card */}
              {activeFileName && activeFile && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-2xs">
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-805 pb-3 mb-4">
                    <span className="text-[10px] font-extrabold uppercase text-slate-450 dark:text-slate-400 tracking-wider font-mono">
                      📄 File Specifications
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 truncate max-w-[200px]" title={activeFileName}>
                      {activeFileName}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-sans">
                    <div className="p-3 bg-slate-50 dark:bg-slate-950/20 border border-slate-150 dark:border-slate-850 rounded-lg">
                      <span className="block text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono mb-1">Format</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                        {activeFile.name.substring(activeFile.name.lastIndexOf('.')).toUpperCase()}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950/20 border border-slate-150 dark:border-slate-850 rounded-lg">
                      <span className="block text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono mb-1">Size</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                        {formatFileSize(activeFile.size)}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950/20 border border-slate-150 dark:border-slate-850 rounded-lg">
                      <span className="block text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono mb-1">Pages</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                        {activeConf?.pageCount || 1}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-955/20 border border-slate-150 dark:border-slate-850 rounded-lg">
                      <span className="block text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono mb-1">Validation</span>
                      <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-250 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 font-mono">
                        ✓ Ready
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Print Configurations Console */}
              {activeConf && activeFileName && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-2xs space-y-5">
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 tracking-widest font-mono">
                      🎛️ PRINT SETUP CONSOLE
                    </h3>
                  </div>

                  <div className="space-y-4 font-sans text-xs">
                    {/* Copies adjustment */}
                    <div className="flex items-center justify-between">
                      <span className="block text-[10px] font-extrabold text-slate-455 dark:text-slate-500 uppercase tracking-wider font-mono">Copies</span>
                      <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
                        <button
                          type="button"
                          disabled={activeConf.copies <= 1}
                          onClick={() => {
                            setFileConfigs(prev => ({
                              ...prev,
                              [activeFileName]: { ...prev[activeFileName], copies: Math.max(1, activeConf.copies - 1) }
                            }));
                          }}
                          className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-850 flex items-center justify-center cursor-pointer select-none disabled:opacity-50 shadow-2xs"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={activeConf.copies}
                          onChange={(e) => {
                            const val = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1));
                            setFileConfigs(prev => ({
                              ...prev,
                              [activeFileName]: { ...prev[activeFileName], copies: val }
                            }));
                          }}
                          className="w-10 text-center font-bold text-sm bg-transparent border-none outline-none focus:ring-0 p-0 text-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          disabled={activeConf.copies >= 10}
                          onClick={() => {
                            setFileConfigs(prev => ({
                              ...prev,
                              [activeFileName]: { ...prev[activeFileName], copies: Math.min(10, activeConf.copies + 1) }
                            }));
                          }}
                          className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-850 flex items-center justify-center cursor-pointer select-none disabled:opacity-50 shadow-2xs"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Simplex / Duplex Sides & Page Range (Only for PDF files) */}
                    {(activeFile.type === 'application/pdf' || activeFile.name.toLowerCase().endsWith('.pdf')) && (
                      <>
                        {/* Simplex / Duplex Sides */}
                        <div className="space-y-1.5">
                          <span className="block text-[10px] font-extrabold text-slate-455 dark:text-slate-500 uppercase tracking-wider font-mono">Printing Sides</span>
                          <div className="grid grid-cols-2 gap-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl p-1">
                            <button
                              type="button"
                              onClick={() => {
                                setFileConfigs(prev => ({
                                  ...prev,
                                  [activeFileName]: { ...prev[activeFileName], sides: 'single' }
                                }));
                              }}
                              className={`py-1.5 rounded-lg font-bold text-xs transition-all text-center cursor-pointer border-none ${
                                activeConf.sides === 'single'
                                  ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-2xs border border-slate-200/50 dark:border-slate-700/50'
                                  : 'bg-transparent text-slate-400 dark:text-slate-500 hover:text-slate-655 dark:hover:text-slate-350'
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
                              className={`py-1.5 rounded-lg font-bold text-xs transition-all text-center cursor-pointer border-none ${
                                activeConf.sides === 'double'
                                  ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-2xs border border-slate-200/50 dark:border-slate-700/50'
                                  : 'bg-transparent text-slate-400 dark:text-slate-500 hover:text-slate-655 dark:hover:text-slate-350'
                              }`}
                            >
                              Duplex (2-Sided)
                            </button>
                          </div>
                        </div>

                        {/* Pages Range Selector */}
                        <div className="space-y-1.5">
                          <span className="block text-[10px] font-extrabold text-slate-455 dark:text-slate-550 uppercase tracking-wider font-mono">Page Range</span>
                          <div className="grid grid-cols-2 gap-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl p-1">
                            <button
                              type="button"
                              onClick={() => {
                                setFileConfigs(prev => ({
                                  ...prev,
                                  [activeFileName]: { ...prev[activeFileName], choosePagesType: 'all', customPages: '' }
                                }));
                              }}
                              className={`py-1.5 rounded-lg font-bold text-xs transition-all text-center cursor-pointer border-none ${
                                activeConf.choosePagesType === 'all'
                                  ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-2xs border border-slate-200/50 dark:border-slate-700/50'
                                  : 'bg-transparent text-slate-400 dark:text-slate-500 hover:text-slate-655 dark:hover:text-slate-350'
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
                              className={`py-1.5 rounded-lg font-bold text-xs transition-all text-center cursor-pointer border-none ${
                                activeConf.choosePagesType === 'custom'
                                  ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-2xs border border-slate-200/50 dark:border-slate-700/50'
                                  : 'bg-transparent text-slate-400 dark:text-slate-500 hover:text-slate-655 dark:hover:text-slate-350'
                              }`}
                            >
                              Custom Range
                            </button>
                          </div>
                          {activeConf.choosePagesType === 'custom' && (
                            <div className="mt-2 space-y-1">
                              <input
                                type="text"
                                placeholder="e.g. 1-3, 5, 7-9"
                                value={activeConf.customPages}
                                onChange={(e) => {
                                  setFileConfigs(prev => ({
                                    ...prev,
                                    [activeFileName]: { ...prev[activeFileName], customPages: e.target.value }
                                  }));
                                }}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950/50 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/40 text-slate-900 dark:text-white font-bold"
                              />
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold leading-normal pl-1">
                                Specify page numbers/ranges separated by commas. Total document pages: {activeConf.pageCount}.
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* Print Type Selector */}
                    <div className="space-y-1.5">
                      <span className="block text-[10px] font-extrabold text-slate-455 dark:text-slate-550 uppercase tracking-wider font-mono">Print Type</span>
                      <div className="grid grid-cols-2 gap-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl p-1">
                        <button
                          type="button"
                          disabled={!!shopInfo.bwMaintenanceMode}
                          onClick={() => {
                            if (shopInfo.bwMaintenanceMode) return;
                            setFileConfigs(prev => ({
                              ...prev,
                              [activeFileName]: { ...prev[activeFileName], printType: 'bw' }
                            }));
                          }}
                          className={`py-1.5 rounded-lg font-bold text-xs transition-all text-center cursor-pointer border-none ${
                            activeConf.printType === 'bw'
                              ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-2xs border border-slate-200/50 dark:border-slate-700/50'
                              : 'bg-transparent text-slate-400 dark:text-slate-500 hover:text-slate-655 dark:hover:text-slate-350'
                          } ${shopInfo.bwMaintenanceMode ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          Black & White
                        </button>
                        <button
                          type="button"
                          disabled={!!shopInfo.colorMaintenanceMode}
                          onClick={() => {
                            if (shopInfo.colorMaintenanceMode) return;
                            setFileConfigs(prev => ({
                              ...prev,
                              [activeFileName]: { ...prev[activeFileName], printType: 'color' }
                            }));
                          }}
                          className={`py-1.5 rounded-lg font-bold text-xs transition-all text-center cursor-pointer border-none ${
                            activeConf.printType === 'color'
                              ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-2xs border border-slate-200/50 dark:border-slate-700/50'
                              : 'bg-transparent text-slate-400 dark:text-slate-500 hover:text-slate-655 dark:hover:text-slate-350'
                          } ${shopInfo.colorMaintenanceMode ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          Color
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Costing summary */}
                  <div className="p-4 bg-indigo-50/30 dark:bg-indigo-950/10 rounded-xl border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between text-left font-sans">
                    <div>
                      <span className="text-[10px] font-extrabold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest font-mono">Fare Estimate</span>
                      <p className="text-lg font-black text-slate-800 dark:text-white mt-1 font-mono">
                        ₹{activeConf.copies * (
                          activeConf.sides === 'double'
                            ? Math.ceil(countPagesFromRange(activeConf.choosePagesType === 'custom' ? activeConf.customPages : '', activeConf.pageCount) / 2) * (shopInfo.duplexPrice || 3)
                            : countPagesFromRange(activeConf.choosePagesType === 'custom' ? activeConf.customPages : '', activeConf.pageCount) * (activeConf.printType === 'color' ? (shopInfo.colorPrice || 5) : (shopInfo.bwPrice || 2))
                        )}
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 font-mono">
                      {activeConf.sides === 'double'
                        ? `₹${shopInfo.duplexPrice || 3}/sheet`
                        : activeConf.printType === 'color'
                        ? `₹${shopInfo.colorPrice || 5}/page`
                        : `₹${shopInfo.bwPrice || 2}/page`
                      }
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
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
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-full text-left font-sans shadow-2xs">
      <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 font-mono uppercase tracking-wider">
          <Clock className="w-4 h-4 text-indigo-500" />
          <span>Print Hub Activity</span>
        </h3>
      </div>

      <div className="p-6 space-y-6">
        {/* Waiting widgets */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-955/20 border border-slate-150 dark:border-slate-800">
            <span className="block text-[10px] font-extrabold text-slate-455 dark:text-slate-500 uppercase tracking-wider font-mono">Current Waiting Jobs</span>
            <p className="text-2xl font-black text-slate-800 dark:text-white mt-1">{waitingCount}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-955/20 border border-slate-150 dark:border-slate-800">
            <span className="block text-[10px] font-extrabold text-slate-455 dark:text-slate-550 uppercase tracking-wider font-mono">Estimated Wait</span>
            <p className="text-2xl font-black text-slate-800 dark:text-white mt-1 font-mono">
              {waitingCount === 0 ? '0 Min' : `${waitMinutes} Min`}
            </p>
          </div>
        </div>

        {/* Real Queue Visibility details */}
        {selectedJob && (selectedDetails || selectedJob.status === 'pending_approval') && (
          <div className="p-5 rounded-xl border border-indigo-200/50 dark:border-indigo-900 bg-indigo-50/15 dark:bg-indigo-950/10 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-indigo-100/50 dark:border-indigo-900/30">
              <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest font-mono">
                {selectedJob.status === 'pending_approval' ? '⏳ APPROVAL TRACKER' : '🔍 LIVE QUEUE TRACKER'}
              </span>
              <span className="text-xs font-mono font-bold bg-indigo-100/60 dark:bg-indigo-955/40 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded border border-indigo-200/40 dark:border-indigo-900/40">
                Token: {selectedJob.token}
              </span>
            </div>

            {selectedJob.status === 'pending_approval' ? (
              <div className="p-4 bg-amber-50/10 dark:bg-amber-950/10 border border-amber-250 dark:border-amber-900/60 text-slate-700 dark:text-slate-350 rounded-xl space-y-2.5 text-xs font-medium">
                <p className="font-bold text-amber-800 dark:text-amber-400">⏳ Awaiting Operator Release</p>
                <p className="leading-relaxed text-[11px] text-slate-500 dark:text-slate-400">
                  Your document is currently pending shop approval. Please show the following Approval Token to the shop operator to release your print job:
                </p>
                <div className="p-2.5 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-lg text-center font-mono font-bold text-amber-700 dark:text-amber-400 text-sm animate-pulse">
                  {selectedJob.tokenId || 'N/A'}
                </div>
              </div>
            ) : selectedDetails && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs font-sans">
                  <div className="space-y-1">
                    <span className="block text-[10px] font-extrabold text-slate-455 dark:text-slate-550 uppercase tracking-wider font-mono">Currently Printing</span>
                    <p className="font-bold text-slate-800 dark:text-slate-200 truncate" title={selectedDetails.currentlyPrinting}>
                      {selectedDetails.currentlyPrinting}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="block text-[10px] font-extrabold text-slate-455 dark:text-slate-550 uppercase tracking-wider font-mono">Queue Position</span>
                    <p className="font-bold text-slate-800 dark:text-slate-200">
                      #{selectedDetails.position} <span className="text-[10px] text-slate-450 dark:text-slate-555 font-normal">({selectedDetails.jobsAhead} ahead)</span>
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="block text-[10px] font-extrabold text-slate-455 dark:text-slate-550 uppercase tracking-wider font-mono">Estimated Start</span>
                    <p className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                      {selectedJob.status === 'printing' ? 'Now Printing' : selectedDetails.estimatedStart}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="block text-[10px] font-extrabold text-slate-455 dark:text-slate-550 uppercase tracking-wider font-mono">Estimated Completion</span>
                    <p className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                      {selectedDetails.estimatedCompletion}
                    </p>
                  </div>
                </div>
                
                <div className="bg-indigo-50/30 dark:bg-indigo-950/20 border border-indigo-100/40 dark:border-indigo-900/30 p-3 rounded-lg flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-400 font-semibold font-mono">
                  <span>ESTIMATED WAITING TIME:</span>
                  <span className="text-sm font-black">{selectedDetails.waitingMinutes} MINUTES</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Student's recent jobs */}
        <div className="space-y-3 text-left">
          <h4 className="text-[10px] font-extrabold text-slate-455 dark:text-slate-550 uppercase tracking-wider font-mono">Your Recent Print Jobs</h4>
          {recentJobs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/20 dark:bg-slate-950/10 text-xs font-mono">
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
                        ? 'border-indigo-500 dark:border-indigo-550 bg-indigo-50/10 dark:bg-indigo-950/20 shadow-2xs'
                        : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono font-black text-indigo-600 dark:text-indigo-400">{job.token}</span>
                        {activeTabJobId === job.id && (
                          <span className="text-[9px] bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded font-bold font-mono border border-indigo-200/30 dark:border-indigo-800/40">TRACKING</span>
                        )}
                      </div>
                      <p className="font-bold text-slate-800 dark:text-slate-200 truncate" title={job.fileName}>{job.fileName}</p>
                      <p className="text-[10px] text-slate-455 dark:text-slate-500 font-mono mt-0.5">{job.pageCount} pgs · {timeAgo(job.createdAt)}</p>
                    </div>
                    
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider font-mono ${
                      job.status === 'completed' ? 'bg-emerald-50/20 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-900/40' :
                      job.status === 'printing' ? 'bg-indigo-50/20 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border-indigo-200/50 dark:border-indigo-900/40 animate-pulse' :
                      job.status === 'queued' ? 'bg-amber-50/20 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200/50 dark:border-amber-900/40' :
                      job.status === 'pending_approval' ? 'bg-orange-50/20 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-200/50 dark:border-orange-900/40' :
                      'bg-rose-50/20 dark:bg-rose-955/30 text-rose-700 dark:text-rose-455 border-rose-200/50 dark:border-rose-900/40'
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

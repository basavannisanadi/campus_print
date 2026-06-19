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
  Phone
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { PrintJob } from '../types';

interface Props {
  jobs: PrintJob[];
  printerStatus: 'online' | 'offline';
  expectedReturnTime: string;
  averagePrintSpeed: number;
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
  printMode: 'mono';
  sides: 'single' | 'double';
  pageCount: number;
  choosePagesType: 'all' | 'custom';
  customPages: string;
}

export default function StudentPortal({ jobs, printerStatus, expectedReturnTime, averagePrintSpeed }: Props) {
  // Authentication states
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
  const [success, setSuccess] = useState<{ jobs: { token: string; fileName: string }[] } | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        printMode: 'mono',
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

    setSubmitting(true);
    setUploadProgress(0);

    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    
    formData.append('studentName', studentName.trim());
    formData.append('studentEmail', studentEmail.trim());
    formData.append('shopId', 'alliance_print');
    
    const configsArray = files.map(file => {
      const conf = fileConfigs[file.name];
      return {
        copies: conf.copies,
        printMode: 'mono',
        sides: conf.sides,
        pageRange: conf.choosePagesType === 'custom' ? conf.customPages : ''
      };
    });
    formData.append('configs', JSON.stringify(configsArray));

    try {
      const result = await new Promise<{ token: string; fileName: string }[]>((resolve, reject) => {
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

        xhr.open('POST', '/api/jobs');
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
  const studentActiveJobs = studentRecentJobs.filter(j => j.status === 'queued' || j.status === 'printing');

  // Currently printing document name
  const globalPrintingJob = activeQueueJobs.find(j => j.status === 'printing');
  const currentlyPrintingDocName = globalPrintingJob ? globalPrintingJob.fileName : 'None (Idle)';

  // ─── STAGE 1: SIGN IN VIEW ─────────────────────────────────
  if (!isRemembered) {
    return (
      <div className="max-w-md mx-auto my-12 animate-fadeIn font-sans text-left">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="px-8 py-6 bg-gradient-to-r from-indigo-600 to-violet-700 text-white text-center">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-3 border border-white/15">
              <Printer className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold">Sign In to Print</h2>
            <p className="text-xs text-indigo-100/70 mt-1">Access institutional high-speed print hubs</p>
          </div>

          <div className="p-8 space-y-5">
            {loginError && (
              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 animate-fadeIn font-semibold">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {loginError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                  Username or Email
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="e.g. basav"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all font-semibold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all font-semibold"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleUsernamePasswordLogin}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-700 text-white font-semibold text-sm hover:from-indigo-700 hover:to-violet-800 transition-all duration-200 shadow-lg shadow-indigo-500/20 cursor-pointer flex items-center justify-center gap-2 border-none"
            >
              Sign In & Connect
            </button>

            <div className="relative flex items-center justify-center my-5">
              <div className="absolute inset-x-0 h-[1px] bg-slate-100" />
              <span className="relative px-3 bg-white text-[9px] font-extrabold text-slate-400 uppercase tracking-widest font-mono">
                OR
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setLoginError('');
                setShowGoogleModal(true);
              }}
              className="w-full py-3 px-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs transition-all duration-200 shadow-sm flex items-center justify-center gap-3 cursor-pointer select-none"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white w-full max-w-[420px] rounded-2xl border border-slate-200/80 shadow-2xl p-8 relative flex flex-col text-left">
              <button
                onClick={() => {
                  setShowGoogleModal(false);
                  setShowCustomGoogleInput(false);
                }}
                className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer border-none bg-transparent"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center text-center mb-6">
                <h3 className="text-lg font-bold text-slate-900 mt-2">Choose Google account</h3>
                <p className="text-xs text-slate-500 mt-1">to continue to Campus Print Hub</p>
              </div>

              {!showCustomGoogleInput ? (
                <div className="space-y-2 mb-4">
                  {[
                    { name: 'Basav', email: 'basav@university.edu', avatarColor: 'bg-indigo-600 text-white' },
                    { name: 'Student Test', email: 'student@university.edu', avatarColor: 'bg-emerald-600 text-white' }
                  ].map((acc) => (
                    <button
                      key={acc.email}
                      onClick={() => handleGoogleLogin(acc.name, acc.email)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-all text-left cursor-pointer bg-white"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${acc.avatarColor}`}>
                        {acc.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 leading-tight">{acc.name}</p>
                        <p className="text-[10px] text-slate-400 leading-none mt-0.5">{acc.email}</p>
                      </div>
                    </button>
                  ))}

                  <button
                    onClick={() => setShowCustomGoogleInput(true)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/10 transition-all text-left cursor-pointer bg-white"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center font-bold text-xs text-slate-500">
                      +
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-700 leading-tight">Use another account</p>
                    </div>
                  </button>
                </div>
              ) : (
                <div className="space-y-4 mb-4">
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                      Google Profile Name
                    </label>
                    <input
                      type="text"
                      value={customGoogleName}
                      onChange={(e) => setCustomGoogleName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                      Google Email Address
                    </label>
                    <input
                      type="email"
                      value={customGoogleEmail}
                      onChange={(e) => setCustomGoogleEmail(e.target.value)}
                      placeholder="e.g. ramesh@gmail.com"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCustomGoogleInput(false)}
                      className="flex-1 py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all border-none"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!customGoogleName.trim() || !customGoogleEmail.trim()) return;
                        handleGoogleLogin(customGoogleName.trim(), customGoogleEmail.trim());
                      }}
                      className="flex-1 py-2 px-4 rounded-xl bg-indigo-600 text-white text-xs font-bold transition-all border-none"
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

  // ─── STAGE 2: SUCCESS VIEW ─────────────────────────────────
  if (success) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn font-sans text-left">
        <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 border border-indigo-100 text-indigo-700">
            📍 Alliance Print Center
          </span>
          <button
            onClick={handleSignOut}
            className="py-1.5 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all cursor-pointer bg-white"
          >
            Sign Out
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center animate-fadeIn">
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle className="w-10 h-10 text-emerald-600" />
                  </div>
                  <div className="absolute inset-0 w-20 h-20 rounded-full bg-emerald-400/30 animate-pulse-ring" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                Sent to Print!
              </h2>
              <p className="text-slate-500 mb-6 text-sm">
                Your files have been queued successfully.
              </p>

              <div className="bg-slate-50 rounded-xl p-5 mb-6 border border-slate-100 text-left max-h-56 overflow-y-auto font-sans">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 font-mono">
                  Your Print Tokens
                </p>
                <div className="space-y-2">
                  {success.jobs.map((j, idx) => {
                    const details = getQueueDetails(jobs.find(x => x.token === j.token)?.id || '');
                    return (
                      <div key={idx} className="flex flex-col bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-500 font-semibold truncate max-w-[170px]">
                            {j.fileName}
                          </span>
                          <span className="text-sm font-extrabold text-indigo-600 font-mono">
                            {j.token}
                          </span>
                        </div>
                        {details && (
                          <div className="text-[10px] text-slate-400 font-mono flex flex-wrap gap-x-2">
                            <span>Pos: #{details.position}</span>
                            <span>·</span>
                            <span>ETA: {details.estimatedCompletion}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={resetForm}
                className="w-full py-3.5 px-6 rounded-xl bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 transition-all duration-200 shadow-lg shadow-indigo-500/25 cursor-pointer border-none"
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
    <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn font-sans text-left">
      {/* Top Info Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 border border-indigo-100 text-indigo-700 w-fit">
            📍 Alliance Print Center
          </span>
          <div className="flex items-center gap-4 text-xs text-slate-400 font-semibold font-mono">
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" /> Ground Floor, Main Block</span>
            <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-slate-400" /> 9876543210</span>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="py-1.5 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all cursor-pointer bg-white"
        >
          Sign Out
        </button>
      </div>

      {/* Offline Precaution Warning Card */}
      {printerStatus === 'offline' && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-start gap-3 shadow-inner animate-fadeIn font-sans">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold">⚠️ Printer is currently unavailable.</h4>
            <p className="text-xs text-rose-700 mt-1 leading-normal">
              Expected availability: <strong>{expectedReturnTime}</strong>. Documents can still be uploaded and queued. Printing will automatically begin when the printer becomes available.
            </p>
          </div>
        </div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
        {/* Left column: Print Upload Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-50">
                  <Upload className="w-4.5 h-4.5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Upload to Print</h2>
                  <p className="text-xs text-slate-400">Configure settings and send queues</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* User badge */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8.5 h-8.5 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center font-black text-indigo-600 text-xs shadow-sm flex-shrink-0">
                    {studentName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-xs font-bold text-slate-800 truncate leading-tight">{studentName}</p>
                    <p className="text-[10px] text-slate-400 truncate leading-none mt-1">{studentEmail}</p>
                  </div>
                </div>
              </div>

              {/* Drag and Drop File box */}
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                  Ingestion File
                </label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !submitting && fileInputRef.current?.click()}
                  className={`relative rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200 ${
                    dragOver
                      ? 'border-indigo-400 bg-indigo-50/50 scale-[1.01]'
                      : 'border-slate-200 bg-slate-50/30 hover:border-indigo-300 hover:bg-indigo-50/20'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_EXT}
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={submitting}
                  />
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Upload className="w-8 h-8 text-slate-300" />
                    <div>
                      <p className="text-xs font-semibold text-slate-700">Drag files here or click to browse</p>
                      <p className="text-[10px] text-slate-400 mt-1">PDF, DOC, DOCX, PPT, PPTX, PNG, JPG (Max 50MB)</p>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs font-semibold rounded-xl leading-relaxed">
                  ❌ {error}
                </div>
              )}

              {submitting && (
                <div className="space-y-2 animate-fadeIn p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                      Uploading files...
                    </span>
                    <span className="font-bold text-indigo-600">{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-indigo-600 transition-all duration-300" 
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
                          ? 'border-indigo-200 bg-indigo-50/20'
                          : 'border-slate-150 bg-white hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <FileText className={`w-4 h-4 flex-shrink-0 ${activeFileName === file.name ? 'text-indigo-500' : 'text-slate-400'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800 truncate">{file.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {formatFileSize(file.size)} · {fileConfigs[file.name]?.pageCount || 1} pgs
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(file.name); }}
                        className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="submit"
                disabled={files.length === 0 || submitting}
                className="w-full py-3.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-lg shadow-indigo-500/25 cursor-pointer flex items-center justify-center gap-2 border-none"
              >
                {submitting ? (
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending to Printer...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Printer className="w-4 h-4" />
                    {printerStatus === 'offline' ? 'Queue for Later' : 'Send Queue to Print'} ({files.length} {files.length === 1 ? 'file' : 'files'})
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
              {/* Document Previews Card */}
              {activeFileName && activeFile && previewUrls[activeFileName] && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 animate-fadeIn">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-extrabold uppercase bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full tracking-wider font-mono">
                      📄 PREVIEW CANVAS
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 truncate max-w-[240px]" title={activeFileName}>
                      {activeFileName}
                    </span>
                  </div>
                  
                  <div className="relative rounded-xl border border-slate-100 bg-slate-50 overflow-hidden flex items-center justify-center p-2 min-h-[220px]">
                    {activeFile.type === 'application/pdf' ? (
                      <div className="w-full relative">
                        {/* Mobile Fallback - Iframe PDFs don't render natively on iOS/mobile browsers */}
                        <div className="md:hidden w-full h-[280px] rounded-lg border border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
                          <div className="w-16 h-16 rounded-2xl bg-red-50/80 flex items-center justify-center text-3xl mb-3 shadow-inner animate-pulse">
                            📄
                          </div>
                          <h4 className="text-sm font-bold text-slate-800 truncate max-w-[200px]">{activeFile.name}</h4>
                          <p className="text-xs text-slate-500 mt-1 font-mono mb-4">PDF Document</p>
                          <a 
                            href={previewUrls[activeFileName]} 
                            target="_blank" 
                            rel="noreferrer"
                            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-sm active:scale-95 transition-all flex items-center gap-2"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            Open PDF
                          </a>
                        </div>
                        
                        {/* Desktop Iframe */}
                        <iframe
                          src={`${previewUrls[activeFileName]}#toolbar=0&navpanes=0&scrollbar=0`}
                          className="hidden md:block w-full h-[280px] rounded-lg border border-slate-200 bg-white"
                          title={`PDF Preview of ${activeFileName}`}
                        />
                      </div>
                    ) : activeFile.type.includes('word') || activeFile.type.includes('msword') || activeFile.name.endsWith('.doc') || activeFile.name.endsWith('.docx') || activeFile.type.includes('presentation') || activeFile.type.includes('powerpoint') || activeFile.name.endsWith('.ppt') || activeFile.name.endsWith('.pptx') ? (
                      <div className="w-full h-[280px] rounded-lg border border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-indigo-50/80 flex items-center justify-center text-3xl mb-3 shadow-inner animate-pulse">
                          {activeFile.name.endsWith('.ppt') || activeFile.name.endsWith('.pptx') ? '📊' : '📝'}
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 truncate max-w-xs">{activeFile.name}</h4>
                        <p className="text-xs text-slate-500 mt-1 font-mono">
                          {activeFile.name.endsWith('.ppt') || activeFile.name.endsWith('.pptx') ? 'PowerPoint Presentation' : 'Word Document'}
                        </p>
                      </div>
                    ) : (
                      <img
                        src={previewUrls[activeFileName]}
                        alt={`Preview of ${activeFileName}`}
                        className="max-h-[280px] w-auto object-contain rounded-lg shadow-sm"
                      />
                    )}
                  </div>
                  
                  <div className="mt-3 flex justify-between items-center bg-slate-50/50 px-3 py-2 rounded-xl border border-slate-100 font-mono text-[10px] text-slate-500">
                    <span>
                      FORMAT: {
                        activeFile.name.endsWith('.docx') ? 'DOCX' :
                        activeFile.name.endsWith('.doc') ? 'DOC' :
                        activeFile.name.endsWith('.pptx') ? 'PPTX' :
                        activeFile.name.endsWith('.ppt') ? 'PPT' :
                        activeFile.name.endsWith('.pdf') ? 'PDF' : 'IMAGE'
                      }
                    </span>
                    <span>SIZE: {formatFileSize(activeFile.size)}</span>
                    <span>PAGES: {activeConf?.pageCount}</span>
                  </div>
                </div>
              )}

              {/* Slider Config Console */}
              {activeConf && activeFileName && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 animate-fadeIn space-y-6">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-black text-slate-800 tracking-wider font-mono">
                      🎛️ PRINTER CHANNELS CONSOLE
                    </h3>
                  </div>

                  <div className="space-y-4">
                    {/* Copies adjustment */}
                    <div className="flex items-center justify-between">
                      <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest font-mono">Copies</span>
                      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1">
                        <button
                          type="button"
                          disabled={activeConf.copies <= 1}
                          onClick={() => {
                            setFileConfigs(prev => ({
                              ...prev,
                              [activeFileName]: { ...prev[activeFileName], copies: Math.max(1, activeConf.copies - 1) }
                            }));
                          }}
                          className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-100 flex items-center justify-center cursor-pointer select-none disabled:opacity-50 border-none shadow-sm"
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
                          className="w-10 text-center font-bold text-sm bg-transparent border-none outline-none focus:ring-0 p-0"
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
                          className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-100 flex items-center justify-center cursor-pointer select-none disabled:opacity-50 border-none shadow-sm"
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
                          <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest font-mono">Printing Sides</span>
                          <div className="grid grid-cols-2 gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
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
                                  ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50'
                                  : 'bg-transparent text-slate-400 hover:text-slate-600'
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
                                  ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50'
                                  : 'bg-transparent text-slate-400 hover:text-slate-600'
                              }`}
                            >
                              Duplex (2-Sided)
                            </button>
                          </div>
                        </div>

                        {/* Pages Range Selector */}
                        <div className="space-y-1.5">
                          <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest font-mono">Page Range</span>
                          <div className="grid grid-cols-2 gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
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
                                  ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50'
                                  : 'bg-transparent text-slate-400 hover:text-slate-600'
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
                                  ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50'
                                  : 'bg-transparent text-slate-400 hover:text-slate-600'
                              }`}
                            >
                              Custom Range
                            </button>
                          </div>
                          {activeConf.choosePagesType === 'custom' && (
                            <div className="animate-fadeIn mt-2 space-y-1">
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
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold"
                              />
                              <p className="text-[10px] text-slate-400 font-semibold leading-normal pl-1">
                                Specify page numbers and/or ranges separated by commas (e.g. 1, 3-5, 8). Total document pages: {activeConf.pageCount}.
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* Ink Mode locked channel */}
                    <div className="space-y-1.5">
                      <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest font-mono">Ink Mode Channel</span>
                      <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl text-xs text-slate-650 font-bold flex items-center justify-between">
                        <span className="flex items-center gap-1.5">🖤 Monochrome (Black & White)</span>
                        <span className="text-[9px] bg-slate-200 border border-slate-300 text-slate-600 px-2 py-0.5 rounded font-extrabold font-mono uppercase tracking-wider">LOCKED</span>
                      </div>
                      <p className="text-[9px] text-slate-400 font-semibold leading-normal pl-1">
                        Color printing is locked down. Only monochrome prints are accepted at this hub.
                      </p>
                    </div>
                  </div>

                  {/* Costing summary */}
                  <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-center justify-between text-left">
                    <div>
                      <span className="text-[10px] font-extrabold text-indigo-500 uppercase tracking-widest font-mono">Fare Estimate</span>
                      <p className="text-lg font-black text-slate-800 mt-1">
                        ₹{activeConf.copies * countPagesFromRange(activeConf.choosePagesType === 'custom' ? activeConf.customPages : '', activeConf.pageCount) * 3}
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400 font-mono">₹3/page</span>
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full text-left font-sans">
      <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <Clock className="w-4.5 h-4.5 text-indigo-500" />
          <span>Print Hub Activity</span>
        </h3>
      </div>

      <div className="p-6 space-y-6">
        {/* Waiting widgets */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-150">
            <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest font-mono">Current Waiting Jobs</span>
            <p className="text-2xl font-black text-slate-800 mt-1.5">{waitingCount}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-150">
            <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest font-mono">Estimated Wait</span>
            <p className="text-2xl font-black text-slate-800 mt-1.5">
              {waitingCount === 0 ? '0 Min' : `${waitMinutes} Min`}
            </p>
          </div>
        </div>

        {/* Real Queue Visibility details */}
        {selectedDetails && selectedJob && (
          <div className="p-5 rounded-xl border border-indigo-150 bg-indigo-50/20 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-indigo-100/50">
              <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest font-mono">
                🔍 LIVE QUEUE TRACKER
              </span>
              <span className="text-xs font-mono font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                Token: {selectedJob.token}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
              <div className="space-y-1">
                <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest font-mono">Currently Printing</span>
                <p className="font-bold text-slate-800 truncate" title={selectedDetails.currentlyPrinting}>
                  {selectedDetails.currentlyPrinting}
                </p>
              </div>

              <div className="space-y-1">
                <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest font-mono">Queue Position</span>
                <p className="font-bold text-slate-800">
                  #{selectedDetails.position} <span className="text-[10px] text-slate-450 font-normal">({selectedDetails.jobsAhead} ahead)</span>
                </p>
              </div>

              <div className="space-y-1">
                <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest font-mono">Estimated Start</span>
                <p className="font-bold text-indigo-650 font-mono">
                  {selectedJob.status === 'printing' ? 'Now Printing' : selectedDetails.estimatedStart}
                </p>
              </div>

              <div className="space-y-1">
                <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest font-mono">Estimated Completion</span>
                <p className="font-bold text-indigo-650 font-mono">
                  {selectedDetails.estimatedCompletion}
                </p>
              </div>
            </div>
            
            <div className="bg-indigo-50 border border-indigo-100/70 p-3 rounded-lg flex items-center justify-between text-xs text-indigo-750 font-semibold font-mono">
              <span>ESTIMATED WAITING TIME:</span>
              <span className="text-sm font-black">{selectedDetails.waitingMinutes} MINUTES</span>
            </div>
          </div>
        )}

        {/* Student's recent jobs */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Your Recent Print Jobs</h4>
          {recentJobs.length === 0 ? (
            <div className="p-8 text-center text-slate-350 border border-dashed border-slate-200 rounded-xl bg-slate-50/30 text-xs">
              No print jobs submitted from your account yet.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {recentJobs.map(job => {
                const isActive = job.status === 'queued' || job.status === 'printing';
                const statusLabels: { [key: string]: string } = {
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
                      isActive ? 'cursor-pointer hover:border-indigo-300' : ''
                    } ${
                      activeTabJobId === job.id
                        ? 'border-indigo-400 bg-indigo-50/10 shadow-sm'
                        : 'bg-slate-50/50 border-slate-150 hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono font-bold text-indigo-600">{job.token}</span>
                        {activeTabJobId === job.id && (
                          <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1 rounded font-bold font-mono">TRACKING</span>
                        )}
                      </div>
                      <p className="font-semibold text-slate-800 truncate" title={job.fileName}>{job.fileName}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{job.pageCount} pgs · {timeAgo(job.createdAt)}</p>
                    </div>
                    
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                      job.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      job.status === 'printing' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse' :
                      job.status === 'queued' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-red-50 text-red-700 border-red-200'
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

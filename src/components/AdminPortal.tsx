import React, { useState, useEffect } from 'react';
import { 
  Printer, 
  Trash2, 
  ArrowLeft, 
  TrendingUp, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  LogIn, 
  RefreshCw, 
  Play, 
  Pause,
  Lock,
  User,
  Save,
  QrCode
} from 'lucide-react';
import { PrintJob } from '../types';

interface Props {
  jobs: PrintJob[];
  onRefreshJobs: () => void;
  navigate: (path: string) => void;
  printerStatus: 'online' | 'offline';
  expectedReturnTime: string;
  averagePrintSpeed: number;
  onRefreshPrinterSettings: () => void;
}

interface AdminStats {
  revenue: number;
  jobs: number;
  failed: number;
  pending: number;
}

export default function AdminPortal({ 
  jobs, 
  onRefreshJobs, 
  navigate, 
  printerStatus, 
  expectedReturnTime: propsExpectedReturnTime, 
  averagePrintSpeed: propsAveragePrintSpeed,
  onRefreshPrinterSettings 
}: Props) {
  const activeShopId = 'alliance_print';
  const qrUrl = `${window.location.origin}/`;

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => {
    return !!sessionStorage.getItem('adminToken');
  });
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Simplified Settings States
  const [adminOverrideStatus, setAdminOverrideStatus] = useState<'none' | 'online' | 'offline'>('none');
  const [expectedReturnTime, setExpectedReturnTime] = useState(propsExpectedReturnTime);
  const [averagePrintSpeed, setAveragePrintSpeed] = useState(propsAveragePrintSpeed);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  const [stats, setStats] = useState<AdminStats>({
    revenue: 0,
    jobs: 0,
    failed: 0,
    pending: 0
  });
  const [loadingStats, setLoadingStats] = useState(true);

  // Fetch Stats for the single hub
  const fetchStats = async () => {
    try {
      const token = sessionStorage.getItem('adminToken');
      const res = await fetch(`/api/admin/stats?shopId=${activeShopId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchPrinterSettings = async () => {
    try {
      const token = sessionStorage.getItem('adminToken');
      const res = await fetch('/api/printer/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const settings = await res.json();
        setAdminOverrideStatus(settings.adminOverrideStatus);
        setExpectedReturnTime(settings.expectedReturnTime);
        setAveragePrintSpeed(settings.averagePrintSpeed);
      }
    } catch (err) {
      console.error('Failed to fetch printer settings:', err);
    }
  };

  useEffect(() => {
    if (!isAdminLoggedIn) return;

    fetchStats();
    fetchPrinterSettings();

    const interval = setInterval(() => {
      fetchStats();
    }, 3000);

    return () => clearInterval(interval);
  }, [isAdminLoggedIn]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (adminUsername === 'admin' && adminPassword.length > 5) {
      sessionStorage.setItem('adminToken', adminPassword);
      setIsAdminLoggedIn(true);
    } else {
      setLoginError('Invalid administrator credentials.');
    }
  };

  const handleSignOut = () => {
    sessionStorage.removeItem('adminToken');
    setIsAdminLoggedIn(false);
    setAdminUsername('');
    setAdminPassword('');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess(false);
    try {
      const token = sessionStorage.getItem('adminToken');
      const res = await fetch('/api/printer/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          adminOverrideStatus,
          expectedReturnTime,
          averagePrintSpeed
        })
      });
      if (res.ok) {
        setSettingsSuccess(true);
        onRefreshPrinterSettings();
        setTimeout(() => setSettingsSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save printer settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const updateJobStatus = async (jobId: string, newStatus: string, extraBody = {}) => {
    try {
      const token = sessionStorage.getItem('adminToken');
      const res = await fetch(`/api/jobs/${jobId}/status`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus, ...extraBody })
      });
      if (res.ok) {
        onRefreshJobs();
        fetchStats();
      }
    } catch (err) {
      console.error('Failed to update job status:', err);
    }
  };

  const handleResetSystem = async () => {
    if (!window.confirm('WARNING: This will clear all print history and delete upload files. Proceed?')) {
      return;
    }
    try {
      const token = sessionStorage.getItem('adminToken');
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        onRefreshJobs();
        fetchStats();
        alert('Print Hub cleared successfully.');
      }
    } catch (err) {
      console.error('Failed to reset system:', err);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const printQrPoster = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
      <head>
        <title>Print QR Code Poster</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            text-align: center;
            padding: 40px;
            color: #1e293b;
          }
          .card {
            border: 2px solid #e2e8f0;
            border-radius: 24px;
            padding: 40px;
            max-width: 420px;
            margin: 40px auto;
            box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
          }
          .title {
            font-size: 28px;
            font-weight: 900;
            margin-bottom: 8px;
            color: #4f46e5;
          }
          .subtitle {
            font-size: 15px;
            color: #64748b;
            margin-bottom: 30px;
          }
          .qr-container {
            width: 240px;
            height: 240px;
            margin: 0 auto 30px auto;
            border: 4px solid #4f46e5;
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #ffffff;
          }
          .instructions {
            font-size: 20px;
            font-weight: 800;
            margin-top: 16px;
          }
          .footer {
            font-size: 12px;
            color: #94a3b8;
            margin-top: 40px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="title">Campus Print Hub</div>
          <div class="subtitle">📍 Alliance Print Center</div>
          
          <div class="qr-container">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=4f46e5&data=${encodeURIComponent(qrUrl)}" width="200" height="200" alt="QR Code" />
          </div>
          
          <div class="instructions">Scan to Print Instantly</div>
          <div style="font-size:13px; color:#64748b; margin-top:6px; word-break:break-all;">${qrUrl}</div>
          
          <div class="footer font-mono">Real-Printer Testing Terminal Ready</div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 800);
          }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (!isAdminLoggedIn) {
    return (
      <div className="max-w-md mx-auto my-12 animate-fadeIn font-sans">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="px-8 py-6 bg-gradient-to-r from-slate-900 to-indigo-950 text-white text-center">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-3 border border-white/15">
              <Printer className="w-6 h-6 text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold">Admin Control Center</h2>
            <p className="text-xs text-indigo-200/70 mt-1">Authenticate to manage print testing queue</p>
          </div>

          <form onSubmit={handleLogin} className="p-8 space-y-5 text-left">
            {loginError && (
              <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                Admin Username
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                Admin Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all font-semibold"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 cursor-pointer border-none"
            >
              <LogIn className="w-4 h-4" />
              Sign In to Console
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer bg-white"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Student Portal
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn font-sans text-slate-700 text-left">
      {/* Admin Toolbar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-left">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span>Administrator Console</span>
            <span className="text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-0.5 rounded-full">
              📍 Alliance Print Center
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Real-printer testing controls & spooler queue</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => navigate('/')}
            className="py-2 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer bg-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Portal
          </button>
          <button
            onClick={handleResetSystem}
            className="py-2 px-4 rounded-xl bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            Reset Hub
          </button>
          <button
            onClick={handleSignOut}
            className="py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer border-none"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Dashboard Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4 text-left font-sans">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 flex-shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Today's Revenue</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">
              ₹{loadingStats ? '...' : stats.revenue.toLocaleString('en-IN')}
            </h3>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4 text-left font-sans">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-500 flex-shrink-0">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed Jobs</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">
              {loadingStats ? '...' : stats.jobs}
            </h3>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4 text-left font-sans">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 flex-shrink-0">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">
              {loadingStats ? '...' : stats.pending}
            </h3>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4 text-left font-sans">
          <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-500 flex-shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Failed Jobs</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">
              {loadingStats ? '...' : stats.failed}
            </h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Spooler Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-left font-sans">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="text-base font-bold text-slate-800">Operational Log & Control</h3>
            <button 
              onClick={() => { fetchStats(); onRefreshJobs(); }} 
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-all cursor-pointer bg-transparent border-none"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto font-sans">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider font-mono">
                  <th className="px-6 py-4 text-left">Student Token</th>
                  <th className="px-6 py-4 text-left">Document Details</th>
                  <th className="px-6 py-4 text-left">Copies</th>
                  <th className="px-6 py-4 text-left">Charges</th>
                  <th className="px-6 py-4 text-left">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      No active print queue jobs.
                    </td>
                  </tr>
                ) : (
                  jobs.map(job => {
                    const estimatedCost = job.copies * job.pageCount * 3;
                    
                    let statusBg = 'bg-slate-50 text-slate-600 border-slate-200';
                    if (job.status === 'completed') statusBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    else if (job.status === 'printing') statusBg = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                    else if (job.status === 'queued') statusBg = 'bg-amber-50 text-amber-700 border-amber-200';
                    else if (['failed', 'printer_offline', 'paper_empty'].includes(job.status)) {
                      statusBg = 'bg-red-50 text-red-700 border-red-200';
                    }

                    const isFailedState = ['failed', 'printer_offline', 'paper_empty'].includes(job.status);

                    return (
                      <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-indigo-600">
                          {job.token}
                          <div className="text-[10px] text-slate-400 font-sans font-medium mt-0.5">
                            {job.studentName}
                          </div>
                        </td>

                        <td className="px-6 py-4 max-w-[180px]">
                          <p className="font-semibold text-slate-800 truncate" title={job.fileName}>
                            {job.fileName}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {formatBytes(job.fileSize)} · {job.pageCount} pgs
                          </p>
                        </td>

                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded text-[10px] font-bold border bg-slate-100 text-slate-600 border-slate-200 font-mono">
                            {job.copies} Copies
                          </span>
                        </td>

                        <td className="px-6 py-4 font-bold text-slate-800">
                          ₹{estimatedCost}
                        </td>

                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${statusBg}`}>
                              {job.status.replace('_', ' ')}
                            </span>
                            {job.reason && (
                              <p className="text-[10px] text-red-500 max-w-[150px] leading-tight" title={job.reason}>
                                Reason: {job.reason}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {(isFailedState || job.status === 'paused') && (
                              <button
                                onClick={() => updateJobStatus(job.id, 'queued', { progressPercent: 0, reason: '' })}
                                className="p-1.5 rounded bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-600 transition-all cursor-pointer font-bold flex items-center gap-1 text-[10px]"
                              >
                                <Play className="w-3.5 h-3.5" />
                                Retry
                              </button>
                            )}

                            {(job.status === 'queued' || job.status === 'printing') && (
                              <button
                                onClick={() => updateJobStatus(job.id, 'paused')}
                                className="p-1.5 rounded bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-600 transition-all cursor-pointer font-bold flex items-center gap-1 text-[10px]"
                              >
                                <Pause className="w-3.5 h-3.5" />
                                Pause
                              </button>
                            )}

                            {job.status === 'printing' && (
                              <button
                                onClick={() => updateJobStatus(job.id, 'completed', { progressPercent: 100 })}
                                className="p-1.5 rounded bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-600 transition-all cursor-pointer font-bold flex items-center gap-1 text-[10px]"
                              >
                                Force Complete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Settings Form */}
        <div className="space-y-6 text-left font-sans">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
              <Save className="w-4.5 h-4.5 text-indigo-500" />
              <span>Printer Operations Console</span>
            </h3>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              {settingsSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl animate-fadeIn">
                  ✓ Printer settings saved and updated!
                </div>
              )}

              {/* Status Select Fader */}
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                  Printer Status Mode
                </label>
                <select
                  value={adminOverrideStatus}
                  onChange={(e: any) => setAdminOverrideStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-semibold"
                >
                  <option value="none">Auto Detect (Client Heartbeat)</option>
                  <option value="online">Force Live (Override Online)</option>
                  <option value="offline">Force Offline (Override Offline)</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Active Status: <span className="font-bold">{printerStatus === 'online' ? '🟢 LIVE' : '🔴 OFFLINE'}</span>
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                  Expected Return Time
                </label>
                <input
                  type="text"
                  required
                  value={expectedReturnTime}
                  onChange={(e) => setExpectedReturnTime(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-semibold"
                  placeholder="e.g. 2:00 PM"
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                  Average Print Speed (Sec/Page)
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={averagePrintSpeed}
                  onChange={(e) => setAveragePrintSpeed(parseInt(e.target.value, 10) || 5)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-mono font-semibold"
                />
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border-none"
              >
                <Save className="w-4 h-4" />
                {savingSettings ? 'Saving Settings...' : 'Save Settings'}
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
            <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4 text-left flex items-center gap-2">
              <QrCode className="w-4.5 h-4.5 text-indigo-500" />
              <span>Poster QR Code</span>
            </h3>

            <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200/80 mb-4 flex flex-col items-center justify-center min-h-[198px]">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=4f46e5&data=${encodeURIComponent(qrUrl)}`} 
                alt="Print Hub QR Code" 
                className="w-[150px] h-[150px] rounded-xl shadow-sm bg-white p-1 border border-slate-100"
              />
              <p className="text-[10px] text-slate-400 font-mono mt-3 truncate w-full text-center">
                {qrUrl}
              </p>
            </div>

            <button
              onClick={printQrPoster}
              className="w-full py-2 px-4 rounded-xl border border-indigo-200 hover:bg-indigo-50/50 text-indigo-600 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer bg-white"
            >
              <Printer className="w-3.5 h-3.5" />
              Print QR Poster
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

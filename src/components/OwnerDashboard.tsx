import React, { useState, useEffect } from 'react';
import { 
  Printer, 
  TrendingUp, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  LogIn, 
  RefreshCw, 
  Lock, 
  User, 
  LogOut, 
  Activity,
  Database,
  ShieldAlert
} from 'lucide-react';
import { getApiUrl } from '../config';

interface Props {
  navigate: (path: string) => void;
}

export default function OwnerDashboard({ navigate }: Props) {
  const [isOwnerLoggedIn, setIsOwnerLoggedIn] = useState(() => {
    return sessionStorage.getItem('adminRole') === 'owner' && !!sessionStorage.getItem('adminToken');
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    try {
      const res = await fetch(getApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        const result = await res.json();
        if (result.role === 'owner') {
          sessionStorage.setItem('adminToken', result.token);
          sessionStorage.setItem('adminRole', result.role);
          sessionStorage.setItem('username', result.username);
          sessionStorage.setItem('shopId', result.shopId || '');
          setIsOwnerLoggedIn(true);
        } else {
          setLoginError('Authorized to Owner accounts only.');
        }
      } else {
        setLoginError('Invalid owner credentials.');
      }
    } catch {
      setLoginError('Connection failure. Try again.');
    }
  };

  const handleSignOut = () => {
    const token = sessionStorage.getItem('adminToken');
    if (token) {
      fetch(getApiUrl('/api/auth/logout'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }).catch(err => console.error('Failed to logout on server:', err));
    }
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminRole');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('shopId');
    setIsOwnerLoggedIn(false);
    setUsername('');
    setPassword('');
  };

  const fetchDashboardData = async () => {
    try {
      const token = sessionStorage.getItem('adminToken');
      const res = await fetch(getApiUrl('/api/owner/dashboard'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOwnerLoggedIn) return;
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, [isOwnerLoggedIn]);

  // Login View
  if (!isOwnerLoggedIn) {
    return (
      <div className="max-w-md mx-auto my-12 animate-fadeIn font-sans text-left">
        <div className="portal-card overflow-hidden">
          <div className="px-8 py-6 bg-[var(--bg-surface-secondary)] text-[var(--text-primary)] text-center border-b border-[var(--border-default)]">
            <div className="w-12 h-12 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] flex items-center justify-center mx-auto mb-3">
              <ShieldAlert className="w-6 h-6 text-[var(--icon-primary)]" />
            </div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Platform Owner Console</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">Provide administrative owner credentials</p>
          </div>

          <form onSubmit={handleLogin} className="p-8 space-y-5">
            {loginError && (
              <div className="flex items-center gap-2 p-3.5 rounded-xl badge-offline text-xs font-semibold">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {loginError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 font-mono">
                  Owner Username
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="owner"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl portal-input text-sm font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 font-mono">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-[var(--text-muted)]" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl portal-input text-sm font-semibold"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-6 rounded-xl btn-primary-action font-semibold text-sm cursor-pointer border-none flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Sign In as Owner
            </button>
            
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full py-2.5 rounded-xl btn-secondary-action text-xs font-bold transition-all cursor-pointer"
            >
              Back to Student Portal
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Loading View
  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <RefreshCw className="w-10 h-10 animate-spin text-[var(--color-primary)]" />
        <p className="text-sm font-semibold text-[var(--text-muted)] font-mono">Loading telemetry aggregates...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn font-sans text-[var(--text-primary)] text-left">
      {/* Owner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 portal-card-cream p-5 text-left">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <span>Platform Owner Dashboard</span>
            <span className="text-xs font-bold badge-neutral px-2.5 py-0.5 rounded-full flex items-center gap-1 font-mono">
              🛡️ Observation Mode
            </span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Real-time status overview of all shop print lines</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchDashboardData}
            className="p-2 rounded-xl btn-secondary-action transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleSignOut}
            className="py-2 px-4 rounded-xl btn-secondary-action text-xs font-bold transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 inline mr-1" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Aggregate Print Statistics Widget */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="portal-card-lavender p-6 flex items-center gap-4 text-left font-sans">
          <div className="w-12 h-12 rounded-xl bg-[var(--color-primary-light)] border border-[var(--color-primary-border)] flex items-center justify-center text-[var(--color-primary)] flex-shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Jobs Today</p>
            <h3 className="text-2xl font-black text-[var(--text-primary)] mt-1 font-mono">{data.stats.jobsToday}</h3>
          </div>
        </div>

        <div className="portal-card-sage p-6 flex items-center gap-4 text-left font-sans">
          <div className="w-12 h-12 rounded-xl badge-live flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Jobs This Week</p>
            <h3 className="text-2xl font-black text-[var(--text-primary)] mt-1 font-mono">{data.stats.jobsThisWeek}</h3>
          </div>
        </div>

        <div className="portal-card-mist p-6 flex items-center gap-4 text-left font-sans">
          <div className="w-12 h-12 rounded-xl badge-standby flex items-center justify-center flex-shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Jobs This Month</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1 font-mono">{data.stats.jobsThisMonth}</h3>
          </div>
        </div>
      </div>

      {/* Shop Status List Grid */}
      <div className="space-y-4">
        <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-wider font-mono">Registered Print Shops</h3>
        {data.shopsStatus.map((shop: any) => (
          <div key={shop.shopId} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
            
            {/* Shop Identification */}
            <div>
              <h4 className="text-base font-bold text-slate-900">{shop.shopName}</h4>
              <p className="text-[10px] text-slate-400 mt-1 font-mono">ID: {shop.shopId}</p>
            </div>

            {/* Operational Guidance & Warnings */}
            <div className="space-y-2 text-xs font-semibold text-slate-600">
              <div className="flex justify-between items-center">
                <span>Operational State:</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                  (() => {
                    const os = shop.health?.shopHealth || (shop.onlineStatus === 'offline' ? 'Offline' : 'Ready');
                    if (os === 'Ready' || os === 'Operational') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    if (os === 'Printing' || os === 'Busy') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
                    if (os === 'Attention Required') return 'bg-amber-50 text-amber-700 border-amber-200';
                    return 'bg-rose-50 text-rose-700 border-rose-200';
                  })()
                }`}>
                  {(() => {
                    const os = shop.health?.shopHealth || (shop.onlineStatus === 'offline' ? 'Offline' : 'Ready');
                    if (os === 'Operational') return 'Ready';
                    if (os === 'Busy') return 'Printing';
                    return os;
                  })()}
                </span>
              </div>

              <div className="text-[11px] font-bold text-slate-800 bg-slate-50 border border-slate-100 rounded-lg p-2 leading-tight text-left">
                {(() => {
                  if (shop.health) {
                    const { printerHealth, shopHealth } = shop.health;
                    if (printerHealth === 'PAPER_EMPTY') return 'Printer is out of paper. Printing resumes automatically after the issue is fixed.';
                    if (printerHealth === 'PAPER_JAM') return 'Printer has a paper jam. Printing resumes automatically after the issue is fixed.';
                    if (printerHealth === 'COVER_OPEN') return 'Printer cover is open. Printing resumes automatically after the issue is fixed.';
                    if (printerHealth === 'OFFLINE' || printerHealth === 'UNREACHABLE' || shopHealth === 'Unavailable') {
                      return 'Printer is offline. Printing resumes automatically after the issue is fixed.';
                    }
                    if (printerHealth === 'LOW_TONER') return 'Toner is low. Please replace soon.';
                    if (printerHealth === 'PRINTING') return 'Printer is printing.';
                    return 'Printer is ready.';
                  }
                  return shop.onlineStatus === 'offline'
                    ? 'Printer is offline. Printing resumes automatically after the issue is fixed.'
                    : 'Printer is ready.';
                })()}
              </div>
              {shop.health?.warnings && shop.health.warnings.length > 0 && (
                <div className="space-y-1 mt-1 max-h-24 overflow-y-auto pr-1 text-left">
                  {shop.health.warnings.map((w: any, idx: number) => (
                    <div key={idx} className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-md p-1 flex items-start gap-1">
                      <span>⚠️</span>
                      <span>{w.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Connected Details */}
            <div className="space-y-1.5 text-xs text-slate-500 font-semibold leading-relaxed">
              <div>
                Connected Printer: <span className="text-slate-800 font-bold">
                  {shop.agentOnlineStatus === 'online' ? (shop.connectedPrinterName || 'UNKNOWN') : 'Unknown (Agent Offline)'}
                </span>
              </div>
              <div>
                Configured B&W: <span className="text-slate-800 font-bold">{shop.bwPrinterName || 'Not configured'}</span>
              </div>
              <div>
                Configured Color: <span className="text-slate-800 font-bold">{shop.colorPrinterName || 'Not configured'}</span>
              </div>
              <div>
                Last Heartbeat: <span className="text-slate-800 font-mono text-[11px]">
                  {shop.lastHeartbeat ? new Date(shop.lastHeartbeat).toLocaleString() : 'Never'}
                </span>
              </div>
            </div>

            {/* Queue & Job Diagnostics */}
            <div className="space-y-1 text-xs text-slate-500 font-semibold font-mono">
              <div className="flex justify-between">
                <span>Queue Size:</span>
                <span className="text-slate-800 font-extrabold">{shop.currentQueueLength} jobs</span>
              </div>
              <div className="flex justify-between">
                <span>Jobs Waiting:</span>
                <span className="text-slate-800 font-extrabold">{shop.jobsWaiting}</span>
              </div>
              <div className="flex justify-between">
                <span>Agent Connected:</span>
                <span className={`font-bold ${shop.agentConnected === 'YES' ? 'text-emerald-600' : 'text-rose-600'}`}>{shop.agentConnected}</span>
              </div>
              <div className="flex justify-between">
                <span>Printer Connected:</span>
                <span className={`font-bold ${shop.printerConnected === 'YES' ? 'text-emerald-600' : 'text-rose-600'}`}>{shop.printerConnected}</span>
              </div>
            </div>

            {/* Success and Failure Details */}
            <div className="md:col-span-4 border-t border-slate-100 pt-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-[10px] text-emerald-700 uppercase font-bold tracking-wider mb-1 font-mono">🎉 Last Successful Print</p>
                <p className="text-slate-800 truncate" title={shop.lastSuccessfulPrint}>{shop.lastSuccessfulPrint}</p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">Time: {shop.lastSuccessfulPrintTimestamp !== 'N/A' ? new Date(shop.lastSuccessfulPrintTimestamp).toLocaleString() : 'N/A'}</p>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-[10px] text-rose-700 uppercase font-bold tracking-wider mb-1 font-mono">⚠️ Last Failed Print</p>
                <p className="text-slate-800 truncate" title={shop.lastFailedPrint}>{shop.lastFailedPrint}</p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">Time: {shop.lastFailedPrintTimestamp !== 'N/A' ? new Date(shop.lastFailedPrintTimestamp).toLocaleString() : 'N/A'}</p>
              </div>
            </div>

          </div>
        ))}
      </div>

      {/* Recent Activity Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Recent Jobs */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-left">
          <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
            <Activity className="w-4.5 h-4.5 text-indigo-500" />
            <span>Recent Jobs</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider font-mono">
                  <th className="py-2 text-left">Token</th>
                  <th className="py-2 text-left">File</th>
                  <th className="py-2 text-left">Shop</th>
                  <th className="py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.recentJobs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400 font-semibold font-mono">No recent jobs</td>
                  </tr>
                ) : (
                  data.recentJobs.map((j: any) => (
                    <tr key={j.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 font-bold font-mono text-indigo-600">{j.token}</td>
                      <td className="py-2.5 truncate max-w-[120px]" title={j.fileName}>{j.fileName}</td>
                      <td className="py-2.5">{j.shopName}</td>
                      <td className="py-2.5 text-right font-extrabold uppercase">{j.status.replace('_', ' ')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Failures & Errors */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-left">
          <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4.5 h-4.5 text-rose-500" />
            <span>Recent Failures & Errors</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider font-mono">
                  <th className="py-2 text-left">Token</th>
                  <th className="py-2 text-left">Shop</th>
                  <th className="py-2 text-left">Error Reason</th>
                  <th className="py-2 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.failures.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400 font-semibold font-mono">No recent failures</td>
                  </tr>
                ) : (
                  data.failures.map((f: any) => (
                    <tr key={f.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 font-bold font-mono text-rose-600">{f.token}</td>
                      <td className="py-2.5">{f.shopName}</td>
                      <td className="py-2.5 text-rose-500 truncate max-w-[140px]" title={f.reason}>{f.reason}</td>
                      <td className="py-2.5 text-right text-slate-400 font-mono text-[10px]">{new Date(f.createdAt).toLocaleTimeString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Warnings & Alerts */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-left lg:col-span-2">
          <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
            <ShieldAlert className="w-4.5 h-4.5 text-amber-500" />
            <span>Telemetry Alerts & Warnings</span>
          </h3>
          <div className="space-y-3">
            {data.warnings.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4 font-semibold font-mono">No alerts triggered.</p>
            ) : (
              data.warnings.map((w: any, idx: number) => (
                <div key={w.id || idx} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertTriangle className="w-4.5 h-4.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs font-semibold">
                    <p className="text-slate-800">
                      Shop: <span className="font-bold">{w.shopName}</span> · Alert: {w.message}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono mt-1">Time: {new Date(w.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

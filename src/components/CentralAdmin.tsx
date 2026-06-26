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
  Lock, 
  User,
  Phone,
  MapPin,
  Building
} from 'lucide-react';
import { getApiUrl } from '../config';

interface ShopBreakdown {
  id: string;
  name: string;
  phone: string;
  address: string;
  isOpen: boolean;
  openingTime: string;
  closingTime: string;
  revenue: number;
  jobs: number;
}

interface CentralStats {
  revenue: number;
  jobs: number;
  failed: number;
  pending: number;
  shops: ShopBreakdown[];
}

interface Props {
  navigate: (path: string) => void;
}

export default function CentralAdmin({ navigate }: Props) {
  const [isOwnerLoggedIn, setIsOwnerLoggedIn] = useState(() => {
    return !!sessionStorage.getItem('ownerToken');
  });
  const [ownerUsername, setOwnerUsername] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [stats, setStats] = useState<CentralStats>({
    revenue: 0,
    jobs: 0,
    failed: 0,
    pending: 0,
    shops: []
  });
  const [loading, setLoading] = useState(true);

  const fetchCentralStats = async () => {
    try {
      const res = await fetch(getApiUrl('/api/central/stats'));
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch central stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOwnerLoggedIn) return;

    fetchCentralStats();
    const interval = setInterval(fetchCentralStats, 3000);
    return () => clearInterval(interval);
  }, [isOwnerLoggedIn]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (ownerUsername === 'owner' && ownerPassword === 'owner') {
      sessionStorage.setItem('ownerToken', 'active_owner_session');
      setIsOwnerLoggedIn(true);
    } else {
      setLoginError('Invalid owner credentials.');
    }
  };

  const handleSignOut = () => {
    sessionStorage.removeItem('ownerToken');
    setIsOwnerLoggedIn(false);
    setOwnerUsername('');
    setOwnerPassword('');
  };

  const handleResetSystem = async () => {
    if (!window.confirm('WARNING: This will clear ALL print jobs and history across ALL shops. Proceed?')) {
      return;
    }
    try {
      const res = await fetch(getApiUrl('/api/reset'), { method: 'POST' });
      if (res.ok) {
        fetchCentralStats();
        alert('All shop queues cleared successfully.');
      }
    } catch (err) {
      console.error('Failed to reset system:', err);
    }
  };

  if (!isOwnerLoggedIn) {
    return (
      <div className="max-w-md mx-auto my-12 animate-fadeIn font-sans">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="px-8 py-6 bg-gradient-to-r from-indigo-950 to-slate-900 text-white text-center">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-3 border border-white/15">
              <Building className="w-6 h-6 text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold">Central Owner Portal</h2>
            <p className="text-xs text-indigo-200/70 mt-1">Global sales aggregation & network manager</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="p-8 space-y-5 text-left">
            {loginError && (
              <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                Owner Username
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={ownerUsername}
                  onChange={(e) => setOwnerUsername(e.target.value)}
                  placeholder="owner"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                Owner Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all font-semibold"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-indigo-950 to-slate-900 hover:from-indigo-900 hover:to-slate-800 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-indigo-950/25 flex items-center justify-center gap-2 cursor-pointer border-none"
            >
              <LogIn className="w-4 h-4" />
              Sign In to Central Panel
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
    <div className="space-y-8 animate-fadeIn font-sans text-slate-700">
      {/* Central Toolbar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-left">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Central Owner Dashboard</h2>
          <p className="text-xs text-slate-400 mt-0.5">Aggregate SaaS sales & print shop locations network</p>
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
            Reset All Shops
          </button>
          <button
            onClick={handleSignOut}
            className="py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer border-none"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Aggregated Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Network Revenue */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4 text-left">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 flex-shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Network Revenue</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">₹{loading ? '...' : stats.revenue.toLocaleString('en-IN')}</h3>
          </div>
        </div>

        {/* Total Completed Prints */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4 text-left">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 flex-shrink-0">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed Prints</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{loading ? '...' : stats.jobs}</h3>
          </div>
        </div>

        {/* Global Pending Print Queue */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4 text-left">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 flex-shrink-0">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Global Pending</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{loading ? '...' : stats.pending}</h3>
          </div>
        </div>

        {/* Global Failures */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4 text-left">
          <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-500 flex-shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Global Failures</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{loading ? '...' : stats.failed}</h3>
          </div>
        </div>
      </div>

      {/* Shop Breakdown Listing */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-left">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="text-base font-bold text-slate-800">Shop Operations & Billing Breakdown</h3>
          <button 
            onClick={fetchCentralStats} 
            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-all cursor-pointer bg-transparent border-none"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider font-mono">
                <th className="px-6 py-4 text-left">Shop Name</th>
                <th className="px-6 py-4 text-left">Contact Info</th>
                <th className="px-6 py-4 text-left">Timings</th>
                <th className="px-6 py-4 text-left">Operational Status</th>
                <th className="px-6 py-4 text-left">Completed Jobs</th>
                <th className="px-6 py-4 text-right">Shop Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium">
                    Loading shop metrics...
                  </td>
                </tr>
              ) : stats.shops.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No shops configured in database.
                  </td>
                </tr>
              ) : (
                stats.shops.map(shop => (
                  <tr key={shop.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Shop Name */}
                    <td className="px-6 py-4 font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded bg-indigo-50 flex items-center justify-center text-indigo-600">
                          <Building className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 leading-snug">{shop.name}</p>
                          <p className="text-[10px] font-mono text-slate-400 mt-0.5">{shop.id}</p>
                        </div>
                      </div>
                    </td>

                    {/* Contact Info */}
                    <td className="px-6 py-4 text-slate-600">
                      <div className="space-y-1">
                        <p className="flex items-center gap-1.5 leading-none">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{shop.address}</span>
                        </p>
                        <p className="flex items-center gap-1.5 leading-none">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-mono text-[10px]">{shop.phone}</span>
                        </p>
                      </div>
                    </td>

                    {/* Timings */}
                    <td className="px-6 py-4 font-semibold text-slate-600 font-mono">
                      🕒 {shop.openingTime} - {shop.closingTime}
                    </td>

                    {/* Operational Status */}
                    <td className="px-6 py-4">
                      {shop.isOpen ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-200 bg-emerald-50 text-emerald-700 uppercase tracking-wide">
                          Open
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-red-200 bg-red-50 text-red-700 uppercase tracking-wide">
                          Closed
                        </span>
                      )}
                    </td>

                    {/* Completed Jobs */}
                    <td className="px-6 py-4 font-bold text-slate-800">
                      {shop.jobs} jobs
                    </td>

                    {/* Shop Revenue */}
                    <td className="px-6 py-4 text-right font-black text-slate-800 text-sm">
                      ₹{shop.revenue.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

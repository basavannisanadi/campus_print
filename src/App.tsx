import { useState, useEffect } from 'react';
import { Printer } from 'lucide-react';
import { PrintJob } from './types';
import StudentPortal from './components/StudentPortal';
import AdminPortal from './components/AdminPortal';
import OwnerDashboard from './components/OwnerDashboard';
import { getApiUrl } from './config';

export default function App() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [connected, setConnected] = useState(true);
  const [currentRoute, setCurrentRoute] = useState(() => window.location.pathname);
  
  // Printer settings states
  const [printerStatus, setPrinterStatus] = useState<'online' | 'offline'>('offline');
  const [expectedReturnTime, setExpectedReturnTime] = useState('2:00 PM');
  const [averagePrintSpeed, setAveragePrintSpeed] = useState(5);
  const [underMaintenance, setUnderMaintenance] = useState(false);

  // Agent Telemetry States
  const [agentOnlineStatus, setAgentOnlineStatus] = useState<'online' | 'offline'>('offline');
  const [agentId, setAgentId] = useState('');
  const [agentMachineName, setAgentMachineName] = useState('');
  const [agentPrinterName, setAgentPrinterName] = useState('');
  const [agentDaemonVersion, setAgentDaemonVersion] = useState('');
  const [agentLastHeartbeat, setAgentLastHeartbeat] = useState('');

  // Discovery States
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'completed' | 'timeout' | 'error'>('idle');
  const [scanStartedAt, setScanStartedAt] = useState('');

  // Multi-shop States
  const [shops, setShops] = useState<any[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>(() => localStorage.getItem('selectedShopId') || 'tjohn_print');

  const navigate = (path: string) => {
    // Disable central admin routing for testing mode
    if (path === '/central-admin') {
      path = '/';
    }
    window.history.pushState({}, '', path);
    setCurrentRoute(path);
  };

  useEffect(() => {
    const handleLocationChange = () => {
      let path = window.location.pathname;
      if (path === '/central-admin') {
        window.history.replaceState({}, '', '/');
        path = '/';
      }
      setCurrentRoute(path);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const fetchJobs = async () => {
    try {
      const res = await fetch(getApiUrl(`/api/jobs?shopId=${selectedShopId}`));
      if (res.ok) {
        setJobs(await res.json());
        setConnected(true);
      }
    } catch {
      setConnected(false);
    }
  };

  const fetchShops = async () => {
    try {
      const res = await fetch(getApiUrl('/api/shops'));
      if (res.ok) {
        setShops(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch shops:', err);
    }
  };

  const fetchPrinterSettings = async () => {
    try {
      const res = await fetch(getApiUrl(`/api/printer/settings?shopId=${selectedShopId}`));
      if (res.ok) {
        const settings = await res.json();
        setPrinterStatus(settings.status);
        setExpectedReturnTime(settings.expectedReturnTime);
        setAveragePrintSpeed(settings.averagePrintSpeed);
        setUnderMaintenance(settings.underMaintenance || false);
        setAgentOnlineStatus(settings.agentOnlineStatus || 'offline');
        setAgentId(settings.agentId || '');
        setAgentMachineName(settings.agentMachineName || '');
        setAgentPrinterName(settings.agentPrinterName || '');
        setAgentDaemonVersion(settings.agentDaemonVersion || '');
        setAgentLastHeartbeat(settings.agentLastHeartbeat || '');
        setScanStatus(settings.scanStatus || 'idle');
        setScanStartedAt(settings.scanStartedAt || '');
      }
      await fetchShops();
    } catch (err) {
      console.error('Failed to fetch printer settings:', err);
    }
  };

  const handleSelectShop = (shopId: string) => {
    setSelectedShopId(shopId);
    localStorage.setItem('selectedShopId', shopId);
  };

  useEffect(() => {
    fetchJobs();
    fetchPrinterSettings();
  }, [selectedShopId]);

  useEffect(() => {
    const role = sessionStorage.getItem('role');
    const shopId = sessionStorage.getItem('shopId');
    if (role === 'shop_admin' && shopId && selectedShopId !== shopId) {
      setSelectedShopId(shopId);
    }
  }, [selectedShopId, currentRoute]);

  useEffect(() => {
    // Setup SSE connection
    let sse: EventSource | null = null;
    let pollInterval: any = null;

    const connectSSE = () => {
      if (sse) sse.close();
      
      sse = new EventSource(getApiUrl('/api/jobs/stream'));

      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connected') {
            setConnected(true);
          } else if (data.type === 'new_job' || data.type === 'job_updated') {
            fetchJobs();
          } else if (
            data.type === 'printer_updated' ||
            data.type === 'shop_updated' ||
            data.type === 'agent_online' ||
            data.type === 'agent_offline' ||
            data.type === 'heartbeat_received'
          ) {
            fetchPrinterSettings();
          }
        } catch (err) {
          console.error('SSE parse error:', err);
        }
      };

      sse.onerror = () => {
        setConnected(false);
        // Fallback polling
        if (!pollInterval) {
          pollInterval = setInterval(() => {
            fetchJobs();
            fetchPrinterSettings();
          }, 5000);
        }
      };

      sse.onopen = () => {
        setConnected(true);
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      };
    };

    connectSSE();

    const sseReconnectChecker = setInterval(() => {
      if (!sse || sse.readyState === EventSource.CLOSED) {
        connectSSE();
      }
    }, 10000);

    return () => {
      if (sse) sse.close();
      if (pollInterval) clearInterval(pollInterval);
      clearInterval(sseReconnectChecker);
    };
  }, [selectedShopId]);

  const selectedShop = shops.find(s => s.id === selectedShopId) || {
    id: 'tjohn_print',
    name: 'TJohn Print Center',
    ownerName: 'TJohn Staff',
    phoneNumber: '9876543210',
    address: 'TJohn Block, Ground Floor',
    maintenanceMode: false,
    bwMaintenanceMode: false,
    colorMaintenanceMode: false,
    bwPrice: 2,
    colorPrice: 5,
    duplexPrice: 3,
    printerStatus: 'offline'
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="relative overflow-hidden bg-white border-b border-slate-200">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-violet-500/5 to-purple-500/5" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Logo & Title */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
                <Printer className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    Campus Print Hub
                  </h1>
                  {currentRoute === '/admin' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shadow-sm w-fit">
                      ⚙️ Shop Admin
                    </span>
                  ) : currentRoute === '/owner' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 shadow-sm w-fit">
                      👑 Platform Owner
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm w-fit">
                      📍 {selectedShop.name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 hidden sm:block mt-0.5">
                  Fast, reliable campus printing
                </p>
              </div>
            </div>

            {/* Printer Status */}
            <div className="flex items-center gap-3">
              {/* Printer Hardware Status Badge */}
              {printerStatus === 'online' ? (
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <div className="text-left leading-none">
                    <p className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">🟢 LIVE</p>
                    <p className="text-[9px] text-emerald-600 font-medium mt-0.5">Printer Connected</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-rose-50 border border-rose-200 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <div className="text-left leading-none">
                    <p className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider">🔴 OFFLINE</p>
                    <p className="text-[9px] text-rose-600 font-medium mt-0.5">Printer Unavailable</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Bottom gradient accent line */}
        <div className="h-0.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {currentRoute === '/admin' ? (
          <AdminPortal 
            jobs={jobs} 
            onRefreshJobs={fetchJobs} 
            navigate={navigate} 
            printerStatus={printerStatus}
            expectedReturnTime={expectedReturnTime}
            averagePrintSpeed={averagePrintSpeed}
            onRefreshPrinterSettings={fetchPrinterSettings}
            agentOnlineStatus={agentOnlineStatus}
            agentId={agentId}
            agentMachineName={agentMachineName}
            agentPrinterName={agentPrinterName}
            agentDaemonVersion={agentDaemonVersion}
            agentLastHeartbeat={agentLastHeartbeat}
            scanStatus={scanStatus}
            scanStartedAt={scanStartedAt}
            shops={shops}
            selectedShopId={selectedShopId}
            onSelectShop={handleSelectShop}
          />
        ) : currentRoute === '/owner' ? (
          <OwnerDashboard 
            navigate={navigate}
          />
        ) : (
          <StudentPortal 
            jobs={jobs} 
            printerStatus={printerStatus}
            expectedReturnTime={expectedReturnTime}
            averagePrintSpeed={averagePrintSpeed}
            underMaintenance={underMaintenance}
            shopInfo={selectedShop}
            shops={shops}
            selectedShopId={selectedShopId}
            onSelectShop={handleSelectShop}
            agentOnlineStatus={agentOnlineStatus}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-slate-400">
        © {new Date().getFullYear()} Campus Print Hub · All rights reserved
      </footer>
    </div>
  );
}

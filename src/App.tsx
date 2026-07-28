import { useState, useEffect } from 'react';
import { Printer } from 'lucide-react';
import { PrintJob } from './types';
import StudentPortal from './components/StudentPortal';
import AdminPortal from './components/AdminPortal';
import OwnerDashboard from './components/OwnerDashboard';
import DownloadPage from './components/DownloadPage';
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

  // System Health state machine
  const [systemHealth, setSystemHealth] = useState<any>({
    agentConnected: false,
    printersDiscovered: false,
    bwPrinterSelected: false,
    colorPrinterSelected: false,
    systemReady: false,
    uploadsEnabled: false,
    approvalsEnabled: false,
    currentState: 'OFFLINE',
    blockers: [],
    timestamp: ''
  });

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
      const token = sessionStorage.getItem('adminToken');
      const endpoint = token
        ? `/api/printer/settings?shopId=${selectedShopId}`
        : `/api/printer/settings/public?shopId=${selectedShopId}`;
      const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};

      const res = await fetch(getApiUrl(endpoint), { headers });
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
        setAgentLastHeartbeat(settings.lastHeartbeat || '');
        setScanStatus(settings.scanStatus || 'idle');
        setScanStartedAt(settings.scanStartedAt || '');
        if (settings.systemHealth) {
          setSystemHealth(settings.systemHealth);
        }
      }
    } catch (err) {
      console.error('Failed to fetch printer settings:', err);
    }
  };

  const handleSelectShop = (shopId: string) => {
    setSelectedShopId(shopId);
    localStorage.setItem('selectedShopId', shopId);
  };

  useEffect(() => {
    fetchShops();
  }, []);

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
  }, []);

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
  }, []);

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
      <header className="relative overflow-hidden bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40 shadow-xs">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-violet-500/5 to-purple-500/5 pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Logo Button with Micro-Tap Scale */}
            <div className="flex items-center gap-3.5">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 shadow-md shadow-indigo-500/20 border-none cursor-pointer btn-primary-action text-white"
              >
                <Printer className="w-5.5 h-5.5" />
              </button>
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <h1 
                    onClick={() => navigate('/')} 
                    className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight cursor-pointer hover:text-indigo-600 transition-colors"
                  >
                    Campus Print Hub
                  </h1>
                  {currentRoute === '/admin' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs font-mono">
                      ⚙️ Shop Admin
                    </span>
                  ) : currentRoute === '/owner' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs font-mono">
                      👑 Platform Owner
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-2xs font-mono">
                      📍 {selectedShop.name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-medium hidden sm:block mt-0.5">
                  Fast, reliable campus printing
                </p>
              </div>
            </div>

            {/* Printer Telemetry Beacon Badge */}
            <div className="flex items-center gap-3">
              {printerStatus === 'online' ? (
                <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-emerald-50 border border-emerald-200/80 shadow-xs backdrop-blur-md">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-pulse-beacon absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                  <div className="text-left leading-none">
                    <p className="text-[10px] font-black text-emerald-900 uppercase tracking-wider font-mono">🟢 LIVE</p>
                    <p className="text-[9px] text-emerald-600 font-semibold mt-0.5">Printer Connected</p>
                  </div>
                </div>
              ) : agentOnlineStatus === 'online' ? (
                <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-amber-50 border border-amber-200/80 shadow-xs backdrop-blur-md">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-pulse-beacon absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                  </span>
                  <div className="text-left leading-none">
                    <p className="text-[10px] font-black text-amber-900 uppercase tracking-wider font-mono">🟡 STANDBY</p>
                    <p className="text-[9px] text-amber-600 font-semibold mt-0.5">Agent Connected (No Printer)</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-rose-50 border border-rose-200/80 shadow-xs backdrop-blur-md">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  <div className="text-left leading-none">
                    <p className="text-[10px] font-black text-rose-900 uppercase tracking-wider font-mono">🔴 OFFLINE</p>
                    <p className="text-[9px] text-rose-600 font-semibold mt-0.5">Service Inactive</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="h-0.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {currentRoute === '/download' ? (
          <DownloadPage navigate={navigate} />
        ) : currentRoute === '/admin' ? (
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
            systemHealth={systemHealth}
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
            systemHealth={systemHealth}
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

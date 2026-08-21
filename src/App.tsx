import { useState, useEffect } from 'react';
import { Printer, Sun, Moon } from 'lucide-react';
import { PrintJob } from './types';
import StudentPortal from './components/StudentPortal';
import AdminPortal from './components/AdminPortal';
import OwnerDashboard from './components/OwnerDashboard';
import DownloadPage from './components/DownloadPage';
import Login from './components/Login';
import { getApiUrl } from './config';
import { useAuth } from './context/AuthContext';

export default function App() {
  const { isAuthenticated, loading } = useAuth();



  const [orders, setOrders] = useState<any[]>([]);
  const [connected, setConnected] = useState(true);
  const [currentRoute, setCurrentRoute] = useState(() => window.location.pathname);

  // Redirection rules for Google Auth
  useEffect(() => {
    if (!loading && !isAuthenticated && currentRoute === '/') {
      navigate('/login');
    }
  }, [loading, isAuthenticated, currentRoute]);

  useEffect(() => {
    if (!loading && isAuthenticated && currentRoute === '/login') {
      navigate('/');
    }
  }, [loading, isAuthenticated, currentRoute]);
  
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
  const [printerIntelligence, setPrinterIntelligence] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);

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

  const fetchOrders = async () => {
    try {
      const headers: HeadersInit = {};
      const token = localStorage.getItem('studentSessionToken') || sessionStorage.getItem('studentSessionToken');
      const adminToken = sessionStorage.getItem('adminToken');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (adminToken) {
        headers['X-Admin-Token'] = adminToken;
      }
      const res = await fetch(getApiUrl(`/api/orders?shopId=${selectedShopId}`), { headers });
      if (res.ok) {
        setOrders(await res.json());
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
        setPrinterIntelligence(settings.printerIntelligence || null);
        setHealth(settings.health || null);
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
    fetchOrders();
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
            fetchOrders();
          } else if (
            data.type === 'printer_updated' ||
            data.type === 'shop_updated' ||
            data.type === 'agent_online' ||
            data.type === 'agent_offline' ||
            data.type === 'heartbeat_received' ||
            data.type === 'agent_health_updated' ||
            data.type === 'printer_intelligence_updated'
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
            fetchOrders();
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

  if (loading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#F8F8FC]  transition-colors font-sans select-none">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/25 mb-4 animate-pulse">
          <Printer className="w-7 h-7 animate-spin" />
        </div>
        <p className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase font-mono animate-pulse">
          Authenticating Session...
        </p>
      </div>
    );
  }

  const isStudentRoute = currentRoute === '/' || currentRoute === '/login';
  if (!isAuthenticated && isStudentRoute) {
    return <Login />;
  }

  return (
    <div className="min-h-screen relative font-sans text-[var(--text-main)] transition-colors duration-200 overflow-hidden">
      {/* Background Composition: Multi-layered pastel ambient glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Top Left: Large Dusty Lavender Glow */}
        <div className="absolute -top-32 -left-32 w-[650px] h-[650px] rounded-full bg-purple-400/15  blur-[140px]" />
        {/* Top Right: Large Soft Peach Glow */}
        <div className="absolute -top-20 -right-32 w-[600px] h-[600px] rounded-full bg-orange-300/15  blur-[150px]" />
        {/* Center: Warm Cream Glow */}
        <div className="absolute top-1/3 left-1/3 -translate-x-1/2 w-[750px] h-[750px] rounded-full bg-amber-100/25  blur-[160px]" />
        {/* Bottom Left: Soft Mint / Sage Glow */}
        <div className="absolute -bottom-32 left-10 w-[650px] h-[650px] rounded-full bg-emerald-300/12  blur-[150px]" />
        {/* Bottom Right: Muted Sky Blue Accent */}
        <div className="absolute -bottom-20 -right-20 w-[600px] h-[600px] rounded-full bg-sky-300/12  blur-[140px]" />
        {/* Organic Noise Overlay */}
        <div className="absolute inset-0 bg-noise opacity-80" />
      </div>

      {/* Header (Only for Admin / Owner / Download views) */}
      {currentRoute !== '/' && (
        <header className="relative overflow-hidden bg-[var(--bg-card)]/80 backdrop-blur-xl border-b border-[var(--border-default)] sticky top-0 z-40 shadow-2xs">
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
                      className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight cursor-pointer hover:text-[var(--color-primary)] transition-colors"
                    >
                      Campus Print Hub
                    </h1>
                    {currentRoute === '/admin' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold badge-neutral shadow-2xs font-mono">
                        ⚙️ Shop Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold badge-standby shadow-2xs font-mono">
                        👑 Platform Owner
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] font-medium hidden sm:block mt-0.5">
                    Fast, reliable campus printing
                  </p>
                </div>
              </div>

              {/* Printer Telemetry Beacon Badge */}
              <div className="flex items-center gap-3">


                {printerStatus === 'online' ? (
                  <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl badge-live shadow-xs backdrop-blur-md">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-pulse-beacon absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </span>
                    <div className="text-left leading-none">
                      <p className="text-[10px] font-black uppercase tracking-wider font-mono">🟢 LIVE</p>
                      <p className="text-[9px] font-semibold mt-0.5 opacity-90">Printer Connected</p>
                    </div>
                  </div>
                ) : agentOnlineStatus === 'online' ? (
                  <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl badge-standby shadow-xs backdrop-blur-md">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-pulse-beacon absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                    </span>
                    <div className="text-left leading-none">
                      <p className="text-[10px] font-black uppercase tracking-wider font-mono">🟡 STANDBY</p>
                      <p className="text-[9px] font-semibold mt-0.5 opacity-90">Agent Connected (No Printer)</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl badge-offline shadow-xs backdrop-blur-md">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                    <div className="text-left leading-none">
                      <p className="text-[10px] font-black uppercase tracking-wider font-mono">🔴 OFFLINE</p>
                      <p className="text-[9px] font-semibold mt-0.5 opacity-90">Service Inactive</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="h-0.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />
        </header>
      )}

      {/* Main Content */}
      <main className={`relative z-10 ${currentRoute === '/' ? 'w-full min-h-screen' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8'}`}>
        {currentRoute === '/download' ? (
          <DownloadPage navigate={navigate} />
        ) : currentRoute === '/admin' ? (
          <AdminPortal 
            jobs={orders.flatMap(o => o.jobs || [])} 
            onRefreshJobs={fetchOrders} 
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
            health={health}
            printerIntelligence={printerIntelligence}
          />
        ) : currentRoute === '/owner' ? (
          <OwnerDashboard 
            navigate={navigate}
          />
        ) : (
          <StudentPortal 
            orders={orders} 
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
            health={health}
          />
        )}
      </main>

      {/* Footer (Only for Non-Student Portal Routes) */}
      {currentRoute !== '/' && (
        <footer className="relative z-10 text-center py-8 text-xs text-[var(--text-muted)] font-medium">
          © {new Date().getFullYear()} Campus Print Hub · All rights reserved
        </footer>
      )}
    </div>
  );
}

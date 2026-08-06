import React, { useState, useEffect, useRef } from 'react';
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
  Download,
  QrCode,
  Search,
  Check,
  Settings,
  ChevronDown,
  ChevronUp,
  Activity
} from 'lucide-react';
import { PrintJob, Shop } from '../types';
import { getApiUrl } from '../config';

// Converts "14:00" to "2:00 PM"
const convert24To12 = (time24: string): string => {
  if (!time24) return '';
  const [hourStr, minStr] = time24.split(':');
  const hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  if (isNaN(hour) || isNaN(min)) return '';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minFormatted = min < 10 ? `0${min}` : min;
  return `${hour12}:${minFormatted} ${ampm}`;
};

// Converts "2:00 PM" to "14:00"
const convert12To24 = (time12: string): string => {
  if (!time12) return '12:00';
  const match = time12.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) return '12:00'; // fallback
  let hour = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  const hourStr = hour < 10 ? `0${hour}` : hour;
  const minStr = min < 10 ? `0${min}` : min;
  return `${hourStr}:${minStr}`;
};

// Formats relative time for heartbeat
const formatHeartbeat = (timestamp: string): string => {
  if (!timestamp) return 'Never';
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 0) return 'Just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return new Date(timestamp).toLocaleString();
};

interface Props {
  jobs: PrintJob[];
  onRefreshJobs: () => void;
  navigate: (path: string) => void;
  printerStatus: 'online' | 'offline';
  expectedReturnTime: string;
  averagePrintSpeed: number;
  onRefreshPrinterSettings: () => void;
  agentOnlineStatus?: 'online' | 'offline';
  agentId?: string;
  agentMachineName?: string;
  agentPrinterName?: string;
  agentDaemonVersion?: string;
  agentLastHeartbeat?: string;
  scanStatus?: 'idle' | 'scanning' | 'completed' | 'timeout' | 'error';
  scanStartedAt?: string;
  shops: Shop[];
  selectedShopId: string;
  onSelectShop: (shopId: string) => void;
  systemHealth?: any;
  health?: any;
  printerIntelligence?: any;
}

interface DailyRevenueEntry {
  date: string;
  label: string;
  revenue: number;
}

interface AdminStats {
  revenue: number;
  jobs: number;
  failed: number;
  pending: number;
  dailyRevenue?: DailyRevenueEntry[];
}

export default function AdminPortal({ 
  jobs, 
  onRefreshJobs, 
  navigate, 
  printerStatus, 
  expectedReturnTime: propsExpectedReturnTime, 
  averagePrintSpeed: propsAveragePrintSpeed,
  onRefreshPrinterSettings,
  agentOnlineStatus = 'offline',
  agentId = '',
  agentMachineName = '',
  agentPrinterName = '',
  agentDaemonVersion = '',
  agentLastHeartbeat = '',
  scanStatus = 'idle',
  scanStartedAt = '',
  shops,
  selectedShopId,
  onSelectShop,
  systemHealth,
  health,
  printerIntelligence
}: Props) {
  const activeShopId = selectedShopId;
  const isShopAdmin = sessionStorage.getItem('role') === 'shop_admin';
  const qrUrl = `${window.location.origin}/?shopId=${activeShopId}`;

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => {
    return !!sessionStorage.getItem('adminToken');
  });
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [selectedLoginShopId, setSelectedLoginShopId] = useState(selectedShopId || 'tjohn_print');

  // On-Demand Agent Architecture States
  const [operationalState, setOperationalState] = useState<'online' | 'offline' | 'connecting'>('offline');
  const [launcherBusy, setLauncherBusy] = useState<boolean>(false);
  const [launcherError, setLauncherError] = useState<string>('');
  const [localConnectionError, setLocalConnectionError] = useState<string>('');
  const [showOnlineConfirm, setShowOnlineConfirm] = useState<boolean>(false);
  const [showOfflineConfirm, setShowOfflineConfirm] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'queues' | 'agent' | 'settings' | 'qr'>('queues');

  const executeGoOffline = async () => {
    setShowOfflineConfirm(false);
    setLauncherBusy(true);
    setLauncherError('');
    setLocalConnectionError('');
    const token = sessionStorage.getItem('adminToken') || '';

    try {
      const res = await fetch(getApiUrl('/api/shop/go-offline'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ shopId: activeShopId })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setOperationalState('offline');
        setAgentOnlineStatusState('offline');
        setBwStatus('offline');
        setColorStatus('offline');
        setConnectionError(null);
        onRefreshPrinterSettings();
        
        const protocolUrl = 'campusprint://stop';
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = protocolUrl;
        document.body.appendChild(iframe);
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1000);
      } else {
        setLauncherError(data.error || 'Failed to request transition offline.');
      }
    } catch (err) {
      console.error(err);
      setLauncherError('Connection failed while requesting transition offline.');
    } finally {
      setLauncherBusy(false);
    }
  };

  const executeGoOnline = async () => {
    setShowOnlineConfirm(false);
    setLauncherBusy(true);
    setLauncherError('');
    setLocalConnectionError('');
    const token = sessionStorage.getItem('adminToken') || '';

    try {
      const res = await fetch(getApiUrl('/api/shop/go-online'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ shopId: activeShopId })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setOperationalState('connecting');
        setConnectionError(null);

        const origin = window.location.origin;
        const protocolUrl = `campusprint://start?serverUrl=${encodeURIComponent(origin)}&shopId=${activeShopId}&token=${encodeURIComponent(token)}`;
        
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = protocolUrl;
        document.body.appendChild(iframe);
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1000);

        // Local 20-second timer to poll agent heartbeat registration
        const startTime = Date.now();
        const checkTimer = setInterval(async () => {
          try {
            const checkRes = await fetch(getApiUrl(`/api/printer/settings?shopId=${activeShopId}`), {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (checkRes.ok) {
              const settings = await checkRes.json();
              if (settings.agentOnlineStatus === 'online') {
                clearInterval(checkTimer);
                setOperationalState('online');
                setAgentOnlineStatusState('online');
              } else if (Date.now() - startTime >= 20000) {
                clearInterval(checkTimer);
                setOperationalState('offline');
                setLocalConnectionError('Desktop Agent Not Responding. Please ensure the Campus Print Agent is installed and try again.');
              }
            }
          } catch (e) {
            // Ignore network glitches inside polling loop
          }
        }, 1000);
      } else {
        setLauncherError(data.error || 'Failed to request transition online.');
      }
    } catch (err) {
      console.error(err);
      setLauncherError('Connection failed while requesting transition online.');
    } finally {
      setLauncherBusy(false);
    }
  };

  const handleToggleOnlineStatus = () => {
    const currentOnline = operationalState === 'online';
    if (currentOnline) {
      setShowOfflineConfirm(true);
    } else {
      setShowOnlineConfirm(true);
    }
  };

  const [agentInstalled, setAgentInstalled] = useState<boolean>(false);
  const [verifyingInstall, setVerifyingInstall] = useState<boolean>(false);
  const [agentVersionState, setAgentVersionState] = useState<string>('1.0.0');
  const [latestAgentVersion, setLatestAgentVersion] = useState<string>('1.0.0');
  const [startupProgress, setStartupProgress] = useState<any[]>([]);
  const [connectionError, setConnectionError] = useState<any | null>(null);
  const [agentOnlineStatusState, setAgentOnlineStatusState] = useState<string>(agentOnlineStatus);

  useEffect(() => {
    setAgentOnlineStatusState(agentOnlineStatus);
  }, [agentOnlineStatus]);

  const [waitingForCheckin, setWaitingForCheckin] = useState<boolean>(false);
  const [activeStartupId, setActiveStartupId] = useState<string>('');
  const [activePrinterName, setActivePrinterName] = useState<string>('');
  const [printersCount, setPrintersCount] = useState<number>(0);
  const [agentUptime, setAgentUptime] = useState<number>(0);
  const [agentWindowsVersion, setAgentWindowsVersion] = useState<string>('');
  const [lastHeartbeatTime, setLastHeartbeatTime] = useState<string>('');
  const [currentJobToken, setCurrentJobToken] = useState<string>('');

  const handleCancelStartup = async () => {
    setLauncherBusy(true);
    setLauncherError('');
    setLocalConnectionError('');
    const token = sessionStorage.getItem('adminToken') || '';

    try {
      const res = await fetch(getApiUrl('/api/shop/go-offline'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ shopId: activeShopId })
      });
      if (res.ok) {
        setOperationalState('offline');
        setAgentOnlineStatusState('offline');
        setConnectionError(null);
        
        const protocolUrl = 'campusprint://stop';
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = protocolUrl;
        document.body.appendChild(iframe);
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1000);
      } else {
        setLauncherError('Failed to cancel startup.');
      }
    } catch (err) {
      setLauncherError('Failed to communicate with cancel API.');
    } finally {
      setLauncherBusy(false);
    }
  };

  const handleResetAgentStatus = async () => {
    if (!window.confirm("Are you sure you want to reset the agent status? This will show the setup onboarding card again.")) {
      return;
    }
    setLauncherBusy(true);
    setLauncherError('');
    try {
      const token = sessionStorage.getItem('adminToken') || '';
      const res = await fetch(getApiUrl('/api/printer/settings'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          shopId: activeShopId,
          agentInstalled: false
        })
      });
      if (res.ok) {
        setAgentInstalled(false);
      } else {
        const data = await res.json();
        setLauncherError(data.error || 'Failed to reset agent status.');
      }
    } catch (err) {
      setLauncherError('Failed to communicate with reset API.');
    } finally {
      setLauncherBusy(false);
    }
  };


  useEffect(() => {
    if (shops.length > 0 && (!selectedLoginShopId || selectedLoginShopId === 'tjohn_print')) {
      const match = shops.find(s => s.id === selectedShopId);
      if (match) {
        setSelectedLoginShopId(match.id);
      } else {
        setSelectedLoginShopId(shops[0].id);
      }
    }
  }, [shops, selectedShopId]);

  // Simplified Settings States
  const [adminOverrideStatus, setAdminOverrideStatus] = useState<'none' | 'online' | 'offline'>('none');
  const [expectedReturnTime, setExpectedReturnTime] = useState(propsExpectedReturnTime);
  const [averagePrintSpeed, setAveragePrintSpeed] = useState(propsAveragePrintSpeed);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [underMaintenance, setUnderMaintenance] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [availablePrinters, setAvailablePrinters] = useState<any[]>([]);
  const [scanRequested, setScanRequested] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [scanSuccessMsg, setScanSuccessMsg] = useState('');

  // Split printer states
  const [bwMaintenance, setBwMaintenance] = useState(false);
  const [bwStatusMode, setBwStatusMode] = useState('none');
  const [bwExpectedReturnTime, setBwExpectedReturnTime] = useState('06:02 PM');
  const [bwSuccess, setBwSuccess] = useState(false);
  const [savingBwSettings, setSavingBwSettings] = useState(false);

  const [colorMaintenance, setColorMaintenance] = useState(false);
  const [colorStatusMode, setColorStatusMode] = useState('none');
  const [colorExpectedReturnTime, setColorExpectedReturnTime] = useState('06:02 PM');
  const [colorSuccess, setColorSuccess] = useState(false);
  const [savingColorSettings, setSavingColorSettings] = useState(false);
  const [bwError, setBwError] = useState('');
  const [colorError, setColorError] = useState('');
  
  // Baseline states for dirty-state tracking
  const [baseBwPrinterId, setBaseBwPrinterId] = useState('');
  const [baseBwMaintenance, setBaseBwMaintenance] = useState(false);
  const [baseColorPrinterId, setBaseColorPrinterId] = useState('');
  const [baseColorMaintenance, setBaseColorMaintenance] = useState(false);

  // Printer Mappings States
  const [bwPrinterId, setBwPrinterId] = useState('');
  const [bwPrinterName, setBwPrinterName] = useState('');
  const [bwStatus, setBwStatus] = useState('offline');
  const [colorPrinterId, setColorPrinterId] = useState('');
  const [colorPrinterName, setColorPrinterName] = useState('');
  const [colorStatus, setColorStatus] = useState('offline');
  const [savingMapping, setSavingMapping] = useState(false);
  const [mappingSuccess, setMappingSuccess] = useState(false);

  // Derived dirty states for B&W and Color operations forms
  const isBwDirty = bwPrinterId !== baseBwPrinterId || bwMaintenance !== baseBwMaintenance;
  const isColorDirty = colorPrinterId !== baseColorPrinterId || colorMaintenance !== baseColorMaintenance;


  // Shop Profile States
  const [shopName, setShopName] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopOwnerName, setShopOwnerName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Pricing States
  const [bwPrice, setBwPrice] = useState<number>(2);
  const [colorPrice, setColorPrice] = useState<number>(5);
  const [duplexPrice, setDuplexPrice] = useState<number>(3);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingSuccess, setPricingSuccess] = useState(false);

  useEffect(() => {
    setExpectedReturnTime(propsExpectedReturnTime);
  }, [propsExpectedReturnTime]);

  useEffect(() => {
    setAveragePrintSpeed(propsAveragePrintSpeed);
  }, [propsAveragePrintSpeed]);

  const [stats, setStats] = useState<AdminStats>({
    revenue: 0,
    jobs: 0,
    failed: 0,
    pending: 0
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [showRevenueSummary, setShowRevenueSummary] = useState(false);

  // Token Search & Approval States
  const [searchTokenQuery, setSearchTokenQuery] = useState('');
  const [searchResultOrder, setSearchResultOrder] = useState<any | null>(null);
  const [searchError, setSearchError] = useState('');
  const [isSearchingToken, setIsSearchingToken] = useState(false);
  const [approvingJobId, setApprovingJobId] = useState<string | null>(null);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const prevPendingOrdersRef = useRef<any[]>([]);

  // Derive pendingOrders list grouped by order
  const pendingJobs = jobs.filter(j => j.status === 'pending_approval' && j.shopId === activeShopId);
  const ordersMap = new Map<string, { orderId: string; token: string; jobs: any[] }>();
  pendingJobs.forEach(j => {
    const oid = j.orderId || 'unknown';
    if (!ordersMap.has(oid)) {
      ordersMap.set(oid, { orderId: oid, token: j.tokenId || 'UNKNOWN', jobs: [] });
    }
    ordersMap.get(oid)!.jobs.push(j);
  });
  const pendingOrders = Array.from(ordersMap.values()).map(order => {
    const totalPages = order.jobs.reduce((sum, j) => sum + ((j.pageCount || 0) * (j.copies || 1)), 0);
    const totalCost = order.jobs.reduce((sum, j) => {
      const shop = shops.find(s => s.id === activeShopId);
      const bw = shop ? shop.bwPrice : 2;
      const color = shop ? shop.colorPrice : 5;
      const rate = j.printMode === 'color' ? color : bw;
      const billedPgs = j.sides === 'double' ? Math.ceil(j.pageCount / 2) : j.pageCount;
      return sum + (j.chargedAmount !== undefined ? j.chargedAmount : (j.copies * billedPgs * rate));
    }, 0);

    return {
      id: order.orderId,
      token: order.token,
      studentName: order.jobs[0]?.studentName || 'Unknown Student',
      studentEmail: order.jobs[0]?.studentEmail || '',
      jobs: order.jobs,
      totalPages,
      totalCost
    };
  });

  // Auto-select next pending order when the current one is removed from the pending queue
  useEffect(() => {
    if (searchResultOrder) {
      const isStillPending = pendingOrders.some(o => o.id === searchResultOrder.id);
      if (!isStillPending) {
        // Clear search input
        setSearchTokenQuery('');
        
        // Find index of the removed order in the previous pending orders list
        const prevIndex = prevPendingOrdersRef.current.findIndex(o => o.id === searchResultOrder.id);
        if (prevIndex !== -1 && pendingOrders.length > 0) {
          const nextSelectIndex = Math.min(prevIndex, pendingOrders.length - 1);
          setSearchResultOrder(pendingOrders[nextSelectIndex]);
        } else {
          setSearchResultOrder(null);
        }
      }
    }
    prevPendingOrdersRef.current = pendingOrders;
  }, [jobs, activeShopId]);

  // Click outside suggestions container to close it
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.search-container')) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const handleSearchChange = (val: string) => {
    setSearchTokenQuery(val);
    if (val.trim().length >= 3) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (order: any) => {
    setSearchResultOrder(order);
    setSearchTokenQuery(order.token);
    setShowSuggestions(false);
  };

  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchTokenQuery.trim();
    if (!query) return;

    // First try to match locally in pendingOrders
    const matched = pendingOrders.find(o => o.token.toLowerCase() === query.toLowerCase());
    if (matched) {
      handleSelectSuggestion(matched);
      return;
    }

    // Otherwise fall back to backend database search
    setShowSuggestions(false);
    setSearchError('');
    setSearchResultOrder(null);
    setIsSearchingToken(true);
    try {
      const token = sessionStorage.getItem('adminToken');
      const res = await fetch(getApiUrl(`/api/orders/token/${query}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const order = await res.json();
        setSearchResultOrder(order);
      } else {
        const errData = await res.json();
        setSearchError(errData.error || 'Token not found or invalid.');
      }
    } catch (err) {
      setSearchError('Network error during token search.');
      console.error(err);
    } finally {
      setIsSearchingToken(false);
    }
  };

  const handleApproveOrder = async (orderId: string) => {
    if (systemHealth && !systemHealth.systemReady) {
      alert(`Cannot approve order. System is not ready: ${systemHealth.blockers.join(', ')}`);
      return;
    }
    const token = sessionStorage.getItem('adminToken');
    setApprovingJobId(orderId);
    try {
      await fetch(getApiUrl(`/api/orders/${orderId}/approve`), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchStats();
      onRefreshJobs();
    } catch (err) {
      alert('Network error approving order.');
      console.error(err);
    } finally {
      setApprovingJobId(null);
    }
  };

  const handleRejectOrder = async (orderId: string) => {
    if (!window.confirm('Are you sure you want to reject this order?')) return;
    const token = sessionStorage.getItem('adminToken');
    setApprovingJobId(orderId + '_reject');
    try {
      await fetch(getApiUrl(`/api/orders/${orderId}/reject`), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchStats();
      onRefreshJobs();
    } catch (err) {
      alert('Network error rejecting order.');
      console.error(err);
    } finally {
      setApprovingJobId(null);
    }
  };

  const handleApproveAllJobs = async () => {
    if (systemHealth && !systemHealth.systemReady) {
      alert(`Cannot approve order. System is not ready: ${systemHealth.blockers.join(', ')}`);
      return;
    }
    if (!searchResultOrder) return;

    const token = sessionStorage.getItem('adminToken');
    setIsApprovingAll(true);
    try {
      await fetch(getApiUrl(`/api/orders/${searchResultOrder.id}/approve`), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchStats();
      onRefreshJobs();
      setSearchResultOrder(null);
      setSearchTokenQuery('');
    } catch (err) {
      alert('Network error releasing batch.');
      console.error(err);
    } finally {
      setIsApprovingAll(false);
    }
  };

  // Fetch Stats for the single hub
  const fetchStats = async () => {
    try {
      const token = sessionStorage.getItem('adminToken');
      const res = await fetch(getApiUrl(`/api/admin/stats?shopId=${activeShopId}`), {
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

  const startPrinterScanPolling = (token: string) => {
    setScanning(true);
    let attempts = 0;
    const checkInterval = setInterval(async () => {
      attempts++;
      try {
        const checkRes = await fetch(getApiUrl(`/api/printer/settings?shopId=${activeShopId}`), {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (checkRes.ok) {
          const settings = await checkRes.json();
          if (!settings.scanRequested || attempts > 20) {
            clearInterval(checkInterval);
            const shopRes = await fetch(getApiUrl(`/api/shops/${activeShopId}`));
            if (shopRes.ok) {
              const shopData = await shopRes.json();
              setAvailablePrinters(shopData.printers || []);
              setSelectedPrinter(shopData.activePrinterId || '');
            }
            if (settings.bw) {
              const nextBwM = settings.bw.underMaintenance || false;
              const nextBwId = settings.bw.selectedPrinterId || '';
              setBwMaintenance(nextBwM);
              setBaseBwMaintenance(nextBwM);
              setBwPrinterId(nextBwId);
              setBaseBwPrinterId(nextBwId);
              setBwStatusMode(settings.bw.statusMode || 'auto');
              setBwExpectedReturnTime(settings.bw.expectedReturnTime || '06:02 PM');
              setBwPrinterName(settings.bw.selectedPrinterName || '');
              setBwStatus(settings.bw.status || 'offline');
            }
            if (settings.color) {
              const nextColorM = settings.color.underMaintenance || false;
              const nextColorId = settings.color.selectedPrinterId || '';
              setColorMaintenance(nextColorM);
              setBaseColorMaintenance(nextColorM);
              setColorPrinterId(nextColorId);
              setBaseColorPrinterId(nextColorId);
              setColorStatusMode(settings.color.statusMode || 'auto');
              setColorExpectedReturnTime(settings.color.expectedReturnTime || '06:02 PM');
              setColorPrinterName(settings.color.selectedPrinterName || '');
              setColorStatus(settings.color.status || 'offline');
            }
            setScanRequested(false);
            setScanning(false);
          }
        } else {
          clearInterval(checkInterval);
          setScanning(false);
        }
      } catch {
        clearInterval(checkInterval);
        setScanning(false);
      }
    }, 1500);
  };

  const fetchPrinterSettings = async () => {
    try {
      const token = sessionStorage.getItem('adminToken') || '';
      
      const shopPromise = fetch(getApiUrl(`/api/shops/${activeShopId}`)).then(async (shopRes) => {
        if (shopRes.ok) {
          const shopData = await shopRes.json();
          setAvailablePrinters(shopData.printers || []);
          setSelectedPrinter(shopData.activePrinterId || '');
        }
      });

      const mappingPromise = fetch(getApiUrl(`/api/printers/mapping?shopId=${activeShopId}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(async (mappingRes) => {
        if (mappingRes.ok) {
          const mapping = await mappingRes.json();
          const nextBwId = mapping.bwPrinterId || '';
          const nextColorId = mapping.colorPrinterId || '';
          
          setBaseBwPrinterId(prevBase => {
            if (bwPrinterId === prevBase) {
              setBwPrinterId(nextBwId);
            }
            return nextBwId;
          });
          setBwPrinterName(mapping.bwPrinterName || '');
          
          setBaseColorPrinterId(prevBase => {
            if (colorPrinterId === prevBase) {
              setColorPrinterId(nextColorId);
            }
            return nextColorId;
          });
          setColorPrinterName(mapping.colorPrinterName || '');
        }
      });

      const settingsPromise = fetch(getApiUrl(`/api/printer/settings?shopId=${activeShopId}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(async (settingsRes) => {
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings.bw) {
            const nextBwM = settings.bw.underMaintenance || false;
            setBaseBwMaintenance(prevBase => {
              if (bwMaintenance === prevBase) {
                setBwMaintenance(nextBwM);
              }
              return nextBwM;
            });
            setBwStatusMode(settings.bw.statusMode || 'auto');
            setBwExpectedReturnTime(settings.bw.expectedReturnTime || '06:02 PM');
            setBwStatus(settings.bw.status || 'offline');
          }
          if (settings.color) {
            const nextColorM = settings.color.underMaintenance || false;
            setBaseColorMaintenance(prevBase => {
              if (colorMaintenance === prevBase) {
                setColorMaintenance(nextColorM);
              }
              return nextColorM;
            });
            setColorStatusMode(settings.color.statusMode || 'auto');
            setColorExpectedReturnTime(settings.color.expectedReturnTime || '06:02 PM');
            setColorStatus(settings.color.status || 'offline');
          }
          if (settings.operationalState) {
            setOperationalState(settings.operationalState);
          }
          if (settings.agentInstalled !== undefined) {
            setAgentInstalled(settings.agentInstalled);
          }
          if (settings.agentDaemonVersion) {
            setAgentVersionState(settings.agentDaemonVersion);
          }
          if (settings.latestAgentVersion) {
            setLatestAgentVersion(settings.latestAgentVersion);
          }
          if (settings.agentOnlineStatus) {
            setAgentOnlineStatusState(settings.agentOnlineStatus);
          }
          if (settings.startupProgress) {
            setStartupProgress(settings.startupProgress);
            const hasStarted = settings.startupProgress.some((s: any) => s.status !== 'waiting');
            if (hasStarted) {
              setWaitingForCheckin(false);
              setActiveStartupId('');
            }
          }
          if (settings.connectionError !== undefined) {
            setConnectionError(settings.connectionError);
          }
          setActivePrinterName(settings.selectedPrinter || '');
          setPrintersCount(settings.printersCount || 0);
          setAgentUptime(settings.uptime || 0);
          setAgentWindowsVersion(settings.windowsVersion || '');
          setLastHeartbeatTime(settings.lastHeartbeatTime || '');
          setCurrentJobToken(settings.currentJobToken || '');
        }
      });

      await Promise.all([
        shopPromise.catch(err => console.error('Failed to fetch shop details:', err)),
        mappingPromise.catch(err => console.error('Failed to fetch printer mapping:', err)),
        settingsPromise.catch(err => console.error('Failed to fetch printer settings:', err))
      ]);
    } catch (err) {
      console.error('Failed to fetch printer configurations:', err);
    }
  };

  const fetchShopProfile = async () => {
    try {
      const res = await fetch(getApiUrl('/api/shops'));
      if (res.ok) {
        const shopsList = await res.json();
        const myShop = shopsList.find((s: any) => s.id === activeShopId);
        if (myShop) {
          setShopName(myShop.name || '');
          setShopPhone(myShop.phoneNumber || myShop.phone || '');
          setShopOwnerName(myShop.ownerName || '');
          setShopAddress(myShop.address || '');
          setBwPrice(myShop.bwPrice || 2);
          setColorPrice(myShop.colorPrice || 5);
          setDuplexPrice(myShop.duplexPrice || 3);
        }
      }
    } catch (err) {
      console.error('Failed to fetch shop profile:', err);
    }
  };

  const handleScanPrinters = async () => {
    setErrorMsg('');
    setScanSuccessMsg('');
    try {
      const token = sessionStorage.getItem('adminToken') || '';
      const res = await fetch(getApiUrl('/api/agent/scan-printers'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ shopId: activeShopId })
      });
      if (!res.ok) {
        const errData = await res.json();
        setErrorMsg(errData.error || 'Failed to trigger scan');
      } else {
        onRefreshPrinterSettings();
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to trigger scan');
    }
  };

  useEffect(() => {
    if (scanStatus === 'scanning') {
      setScanning(true);
      setErrorMsg('');
      setScanSuccessMsg('');
    } else {
      setScanning(false);
      if (scanStatus === 'completed') {
        setScanSuccessMsg('✓ Printer discovery completed.');
        const timer = setTimeout(() => setScanSuccessMsg(''), 5000);
        return () => clearTimeout(timer);
      } else if (scanStatus === 'timeout') {
        setErrorMsg('Printer discovery timed out.');
      } else if (scanStatus === 'error') {
        setErrorMsg('Printer discovery failed.');
      }
    }
  }, [scanStatus]);

  useEffect(() => {
    if (!isAdminLoggedIn) return;

    fetchStats();
    fetchPrinterSettings();
    fetchShopProfile();

    const interval = setInterval(() => {
      fetchStats();
      fetchPrinterSettings();
    }, 3000);

    return () => clearInterval(interval);
  }, [isAdminLoggedIn, selectedShopId]);

  useEffect(() => {
    if (!isAdminLoggedIn) return;

    const token = sessionStorage.getItem('adminToken');
    const role = sessionStorage.getItem('role');
    const currentShopId = sessionStorage.getItem('shopId') || selectedShopId;
    if (role !== 'shop_admin' || !currentShopId || !token) return;

    const sendAdminPing = async () => {
      try {
        const res = await fetch(getApiUrl('/api/auth/admin-ping'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ shopId: currentShopId })
        });
        if (!res.ok) {
          const data = await res.json();
          if (data.active === false) {
            handleSignOut();
            alert('Your session has expired or was terminated because another session began.');
          }
        }
      } catch (err) {
        console.error('Admin ping failed:', err);
      }
    };

    sendAdminPing();
    const pingInterval = setInterval(sendAdminPing, 10000); // 10s heartbeat ping

    return () => clearInterval(pingInterval);
  }, [isAdminLoggedIn, selectedShopId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    try {
      const res = await fetch(getApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shopId: selectedLoginShopId,
          username: adminUsername,
          password: adminPassword
        })
      });
      if (res.ok) {
        const data = await res.json();
        sessionStorage.setItem('adminToken', data.token);
        sessionStorage.setItem('role', data.role);
        sessionStorage.setItem('shopId', data.shopId);
        sessionStorage.setItem('username', data.username);
        
        if (data.role === 'shop_admin' && data.shopId) {
          onSelectShop(data.shopId);
        }
        
        setIsAdminLoggedIn(true);
      } else {
        const errData = await res.json();
        setLoginError(errData.error || 'An administrator is already logged into this shop. Please log out from the active session before signing in again.');
      }
    } catch {
      setLoginError('Cannot connect to server. Please try again.');
    }
  };

  const handleSignOut = async () => {
    try {
      await executeGoOffline();
    } catch (e) {}
    
    const token = sessionStorage.getItem('adminToken');
    const currentShopId = sessionStorage.getItem('shopId') || selectedShopId;
    try {
      if (token && currentShopId) {
        await fetch(getApiUrl('/api/auth/logout'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ shopId: currentShopId })
        });
      }
    } catch (e) {
      console.error('Logout error:', e);
    }
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('role');
    sessionStorage.removeItem('shopId');
    sessionStorage.removeItem('username');
    setIsAdminLoggedIn(false);
    setAdminUsername('');
    setAdminPassword('');
  };

  const handleSaveBwSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBwSettings(true);
    setBwSuccess(false);
    try {
      const token = sessionStorage.getItem('adminToken');
      console.log('[DIAGNOSTIC handleSaveBwSettings] availablePrinters:', availablePrinters);
      console.log('[DIAGNOSTIC handleSaveBwSettings] bwPrinterId:', bwPrinterId);
      const printerObj = availablePrinters.find(p => p.printerId === bwPrinterId);
      console.log('[DIAGNOSTIC handleSaveBwSettings] selected printer object returned by find():', printerObj);
      const printerNameVal = printerObj ? printerObj.printerName : '';
      console.log('[DIAGNOSTIC handleSaveBwSettings] printerNameVal:', printerNameVal);
      
      const payload = {
        shopId: activeShopId,
        bwPrinterId,
        bwPrinterName: printerNameVal,
        bwMaintenanceMode: bwMaintenance
      };
      console.log('[DIAGNOSTIC handleSaveBwSettings] exact payload sent to PUT /api/printers/bw:', JSON.stringify(payload, null, 2));

      const res = await fetch(getApiUrl('/api/printers/bw'), {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setBaseBwPrinterId(bwPrinterId);
        setBaseBwMaintenance(bwMaintenance);
        setBwSuccess(true);
        onRefreshPrinterSettings();
        setTimeout(() => setBwSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save B&W settings:', err);
    } finally {
      setSavingBwSettings(false);
    }
  };

  const handleSaveColorSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingColorSettings(true);
    setColorSuccess(false);
    try {
      const token = sessionStorage.getItem('adminToken');
      const printerObj = availablePrinters.find(p => p.printerId === colorPrinterId);
      const printerNameVal = printerObj ? printerObj.printerName : '';
      
      const res = await fetch(getApiUrl('/api/printers/color'), {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          shopId: activeShopId,
          colorPrinterId,
          colorPrinterName: printerNameVal,
          colorMaintenanceMode: colorMaintenance
        })
      });
      if (res.ok) {
        setBaseColorPrinterId(colorPrinterId);
        setBaseColorMaintenance(colorMaintenance);
        setColorSuccess(true);
        onRefreshPrinterSettings();
        setTimeout(() => setColorSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save Color settings:', err);
    } finally {
      setSavingColorSettings(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccess(false);
    try {
      const token = sessionStorage.getItem('adminToken');
      const res = await fetch(getApiUrl(`/api/shops/${activeShopId}/settings`), {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: shopName,
          ownerName: shopOwnerName,
          phoneNumber: shopPhone,
          address: shopAddress
        })
      });
      if (res.ok) {
        setProfileSuccess(true);
        setTimeout(() => setProfileSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPricing(true);
    setPricingSuccess(false);
    try {
      const token = sessionStorage.getItem('adminToken');
      const res = await fetch(getApiUrl(`/api/shops/${activeShopId}/pricing`), {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bwPrice,
          colorPrice,
          duplexPrice
        })
      });
      if (res.ok) {
        setPricingSuccess(true);
        onRefreshPrinterSettings();
        setTimeout(() => setPricingSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPricing(false);
    }
  };

  const updateJobStatus = async (jobId: string, newStatus: string, extraBody = {}) => {
    try {
      const token = sessionStorage.getItem('adminToken');
      const res = await fetch(getApiUrl(`/api/jobs/${jobId}/status`), {
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

  const handleRejectJob = async (jobId: string) => {
    await updateJobStatus(jobId, 'failed', { reason: 'Rejected by Administrator' });
  };

  const handleResetSystem = async () => {
    if (!window.confirm('WARNING: This will clear all print history and delete upload files. Proceed?')) {
      return;
    }
    try {
      const token = sessionStorage.getItem('adminToken');
      const res = await fetch(getApiUrl('/api/reset'), {
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
          <div class="subtitle">📍 ${shopName || 'Campus Print Hub'}</div>
          
          <div class="qr-container">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=4f46e5&data=${encodeURIComponent(qrUrl)}" width="200" height="200" alt="QR Code" />
          </div>
          
          <div class="instructions">Scan to Print Instantly</div>
          <div style="font-size:13px; color:#64748b; margin-top:6px; word-break:break-all;">${qrUrl}</div>
          
          <div class="footer font-mono">Campus Print Hub — Ready</div>
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
            <p className="text-xs text-indigo-200/70 mt-1">Authenticate to manage your print hub</p>
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
                Select Shop
              </label>
              <select
                value={selectedLoginShopId}
                onChange={(e) => setSelectedLoginShopId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all font-semibold"
              >
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

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

          </form>
        </div>
      </div>
    );
  }



  const isOnline = agentOnlineStatusState === 'online';
  const isConnecting = !isOnline && operationalState === 'connecting';
  const isOffline = !isOnline && !isConnecting;

  return (
    <div className="space-y-8 animate-fadeIn font-sans text-slate-700 text-left">
      {/* Admin Toolbar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-left">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="text-xl font-bold text-slate-900">
              Administrator Console
            </h2>
            {sessionStorage.getItem('role') !== 'shop_admin' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest font-mono">Shop:</span>
                <select
                  value={selectedShopId}
                  onChange={(e) => onSelectShop(e.target.value)}
                  className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Printer controls & spooler queue for {shopName || 'selected shop'}</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Rapido/Porter style operational toggle (only shown when agent is installed) */}
          {/* Rapido/Porter style operational toggle */}
          <button
            onClick={isConnecting ? handleCancelStartup : handleToggleOnlineStatus}
            disabled={launcherBusy}
            className={`py-2.5 px-4 rounded-xl font-bold text-xs transition-all cursor-pointer border-none flex items-center gap-2 shadow-sm ${
              isOnline
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/20'
                : isConnecting
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-950/20 animate-pulse'
                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-950/20 animate-pulse'
            }`}
          >
            <span className={`w-2 h-2 rounded-full bg-white ${isOnline || isConnecting ? 'animate-ping' : ''}`} />
            {isOnline 
              ? '🟢 SHOP ONLINE (GO OFFLINE)' 
              : isConnecting 
              ? '⚡ CONNECTING (CANCEL)' 
              : '🔴 SHOP OFFLINE (GO ONLINE)'
            }
          </button>

          <button
            onClick={handleSignOut}
            className="py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer border-none"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('queues')}
          className={`py-2.5 px-4.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer border-none btn-secondary-action ${
            activeTab === 'queues'
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20'
              : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80 shadow-2xs'
          }`}
        >
          <Printer className="w-4 h-4" />
          <span>Print Queues</span>
          <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono ${
            activeTab === 'queues' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {jobs.filter(j => j.status === 'pending_approval' && j.shopId === activeShopId).length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('agent')}
          className={`py-2.5 px-4.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer border-none btn-secondary-action ${
            activeTab === 'agent'
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20'
              : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80 shadow-2xs'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Agent & Hardware</span>
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`py-2.5 px-4.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer border-none btn-secondary-action ${
            activeTab === 'settings'
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20'
              : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80 shadow-2xs'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Shop Settings & Rates</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('qr')}
          className={`py-2.5 px-4.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer border-none btn-secondary-action ${
            activeTab === 'qr'
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20'
              : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80 shadow-2xs'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>Print QR Poster</span>
        </button>
      </div>

      {launcherError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 text-xs font-bold flex items-center gap-2">
          <span>⚠️</span>
          <span>{launcherError}</span>
        </div>
      )}

      {/* TAB 1: PRINT QUEUES */}
      {activeTab === 'queues' && (
        <div className="space-y-6 animate-fadeIn">
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

          {/* 7-Day Revenue Summary (collapsible) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm font-sans overflow-hidden">
            <button
              onClick={() => setShowRevenueSummary(!showRevenueSummary)}
              className="w-full flex items-center justify-between p-5 bg-transparent border-none cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 flex-shrink-0">
                  <TrendingUp className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 m-0">Revenue Summary</h3>
                  <p className="text-[11px] text-slate-400 font-semibold m-0 mt-0.5">Last 7 Days</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {!showRevenueSummary && stats.dailyRevenue && (
                  <span className="text-xs font-bold text-slate-400">
                    7-day total: ₹{stats.dailyRevenue.reduce((s, d) => s + d.revenue, 0).toLocaleString('en-IN')}
                  </span>
                )}
                {showRevenueSummary ? (
                  <ChevronUp className="w-4.5 h-4.5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4.5 h-4.5 text-slate-400" />
                )}
              </div>
            </button>

            {showRevenueSummary && stats.dailyRevenue && (
              <div className="px-5 pb-5 border-t border-slate-100">
                {/* SVG Bar Chart */}
                <div className="mt-4 mb-5">
                  <svg
                    viewBox="0 0 700 120"
                    className="w-full"
                    style={{ maxHeight: '120px' }}
                  >
                    {(() => {
                      const data = stats.dailyRevenue;
                      const maxRev = Math.max(...data.map(d => d.revenue), 1);
                      const barWidth = 60;
                      const gap = 40;
                      const chartHeight = 90;
                      return data.map((day, i) => {
                        const barHeight = Math.max((day.revenue / maxRev) * chartHeight, 2);
                        const x = i * (barWidth + gap) + 20;
                        const y = chartHeight - barHeight + 5;
                        return (
                          <g key={day.date}>
                            <rect
                              x={x}
                              y={y}
                              width={barWidth}
                              height={barHeight}
                              rx={6}
                              fill={i === 0 ? '#f59e0b' : '#e2e8f0'}
                              opacity={i === 0 ? 1 : 0.7}
                            />
                            {day.revenue > 0 && (
                              <text
                                x={x + barWidth / 2}
                                y={y - 4}
                                textAnchor="middle"
                                className="text-[10px] font-bold"
                                fill="#64748b"
                              >
                                ₹{day.revenue.toLocaleString('en-IN')}
                              </text>
                            )}
                            <text
                              x={x + barWidth / 2}
                              y={chartHeight + 18}
                              textAnchor="middle"
                              className="text-[9px] font-semibold"
                              fill="#94a3b8"
                            >
                              {day.label.length > 3 ? day.label.slice(0, 3) : day.label}
                            </text>
                          </g>
                        );
                      });
                    })()}
                  </svg>
                </div>

                {/* Day-by-day list */}
                <div className="space-y-1.5">
                  {stats.dailyRevenue.map((day, i) => (
                    <div
                      key={day.date}
                      className={`flex items-center justify-between py-2 px-3 rounded-lg text-sm ${
                        i === 0
                          ? 'bg-amber-50 border border-amber-100'
                          : 'bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${
                          i === 0 ? 'text-amber-700' : 'text-slate-600'
                        }`}>
                          {day.label}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">{day.date}</span>
                      </div>
                      <span className={`font-black tabular-nums ${
                        i === 0 ? 'text-amber-700' : day.revenue > 0 ? 'text-slate-700' : 'text-slate-300'
                      }`}>
                        ₹{day.revenue.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>

                {/* 7-day total */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200 px-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">7-Day Total</span>
                  <span className="text-lg font-black text-slate-800">
                    ₹{stats.dailyRevenue.reduce((s, d) => s + d.revenue, 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Pending Approvals Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-left font-sans space-y-6">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-500 animate-pulse" />
                <span>Pending Approvals & Release</span>
              </h3>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-orange-50 text-orange-700 border border-orange-200 uppercase tracking-widest font-mono">
                {jobs.filter(j => j.status === 'pending_approval' && j.shopId === activeShopId).length} Pending
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Side: Token Search & Details */}
              <div className="space-y-4 pr-0 md:pr-4 md:border-r border-slate-100 relative search-container">
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">
                    Token Search
                  </h4>
                  <form onSubmit={handleSearchSubmit} className="relative flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Type token to search (e.g. CP-7528)"
                        value={searchTokenQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        onFocus={() => {
                          if (searchTokenQuery.trim().length >= 3) {
                            setShowSuggestions(true);
                          }
                        }}
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-bold uppercase font-mono"
                      />
                    </div>
                  </form>

                  {/* Autocomplete Suggestions */}
                  {showSuggestions && searchTokenQuery.trim().length >= 3 && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto font-mono text-xs text-left">
                      {pendingOrders.filter(o => o.token.toLowerCase().includes(searchTokenQuery.toLowerCase())).length === 0 ? (
                        <div className="p-3 text-slate-400 text-center font-sans">No matching pending orders</div>
                      ) : (
                        pendingOrders
                          .filter(o => o.token.toLowerCase().includes(searchTokenQuery.toLowerCase()))
                          .map(order => (
                            <div
                              key={order.id}
                              onClick={() => handleSelectSuggestion(order)}
                              className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-105 last:border-none flex justify-between items-center transition-all"
                            >
                              <span className="font-extrabold text-indigo-600">{order.token}</span>
                              <span className="text-[10px] text-slate-400 font-sans">{order.jobs.length} Docs · ₹{order.totalCost}</span>
                            </div>
                          ))
                      )}
                    </div>
                  )}
                </div>

                {searchError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-[11px] font-semibold rounded-xl leading-relaxed animate-fadeIn">
                    ⚠️ {searchError}
                  </div>
                )}

                {/* Details Panel / Selection Panel */}
                {searchResultOrder ? (
                  <div className="p-5 bg-slate-50/50 border border-slate-200 rounded-xl space-y-4 animate-fadeIn text-xs text-left">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                      <div>
                        <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider block">Student Token</span>
                        <span className="font-extrabold text-indigo-600 text-base font-mono">
                          {searchResultOrder.token}
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-orange-50 text-orange-700 border border-orange-200 uppercase tracking-widest font-mono">
                        PENDING
                      </span>
                    </div>

                    {/* Document List */}
                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {searchResultOrder.jobs?.map((job: any) => (
                        <div key={job.id} className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1 relative text-left shadow-sm">
                          <div className="flex justify-between items-center text-[9px] text-slate-400 font-mono">
                            <span>{job.token}</span>
                            <span>{new Date(job.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <p className="truncate font-bold text-slate-800 text-xs" title={job.fileName}>
                            📄 {job.fileName}
                          </p>
                          <div className="text-[10px] text-slate-500 font-sans space-y-0.5">
                            <p className="font-medium">📄 {job.pageCount} Pages ({job.sides === 'double' ? 'Duplex' : 'Simplex'}) · 🎨 {job.printMode === 'color' ? 'Color' : 'B&W'}</p>
                            <p className="text-slate-400 text-[9px]">👤 Student: {searchResultOrder.studentName || 'Unknown Student'} ({searchResultOrder.studentEmail || 'N/A'})</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Summary Stats */}
                    {(() => {
                      const totalPages = searchResultOrder.jobs?.reduce((sum: number, j: any) => sum + ((j.pageCount || 0) * (j.copies || 1)), 0) || 0;
                      const totalCost = searchResultOrder.jobs?.reduce((sum: number, j: any) => {
                        const shop = shops.find(s => s.id === activeShopId);
                        const bw = shop ? shop.bwPrice : 2;
                        const color = shop ? shop.colorPrice : 5;
                        const rate = j.printMode === 'color' ? color : bw;
                        const billedPgs = j.sides === 'double' ? Math.ceil(j.pageCount / 2) : j.pageCount;
                        return sum + (j.chargedAmount !== undefined ? j.chargedAmount : (j.copies * billedPgs * rate));
                      }, 0) || 0;

                      return (
                        <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded-lg border border-slate-200 text-center font-sans">
                          <div className="border-r border-slate-100 last:border-none">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Pages</p>
                            <p className="font-mono font-extrabold text-slate-800 text-sm mt-0.5">{totalPages}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Cost</p>
                            <p className="font-mono font-extrabold text-slate-800 text-sm mt-0.5">₹{totalCost}</p>
                          </div>
                        </div>
                      );
                    })()}

                    {isShopAdmin ? (
                      <div className="flex gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => handleApproveOrder(searchResultOrder.id)}
                          disabled={approvingJobId === searchResultOrder.id}
                          className="flex-1 py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-1.5 border-none cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          {approvingJobId === searchResultOrder.id ? 'Approving...' : 'Approve Order'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectOrder(searchResultOrder.id)}
                          disabled={approvingJobId === searchResultOrder.id + '_reject'}
                          className="flex-1 py-2.5 px-4 bg-rose-100 hover:bg-rose-200 disabled:opacity-50 text-rose-700 font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-1.5 border-none cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {approvingJobId === searchResultOrder.id + '_reject' ? 'Rejecting...' : 'Reject Order'}
                        </button>
                      </div>
                    ) : (
                      <div className="text-[10px] text-rose-500 font-semibold text-center mt-2 p-2 bg-rose-50 border border-rose-100 rounded-xl">
                        🔒 Only Shop Admin may approve or reject.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-xs">
                    Select a pending order from the queue or search by token to view details.
                  </div>
                )}
              </div>

              {/* Right Side: Pending Approval Queue */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">
                  Pending Approval Queue
                </h4>
                {(() => {
                  if (pendingOrders.length === 0) {
                    return (
                      <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-xs">
                        No orders currently pending approval.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {pendingOrders.map(order => {
                        const isSelected = searchResultOrder && searchResultOrder.id === order.id;
                        return (
                          <div
                            key={order.id}
                            onClick={() => handleSelectSuggestion(order)}
                            className={`px-4 py-2.5 rounded-xl border cursor-pointer transition-all flex items-center gap-4 ${
                              isSelected
                                ? 'bg-indigo-50/60 border-indigo-200 shadow-sm'
                                : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100/40'
                            }`}
                          >
                            {/* Token */}
                            <span className="font-mono font-extrabold text-slate-800 text-xs min-w-[80px]">
                              {order.token}
                            </span>

                            {/* Total price — pushes to right */}
                            <span className="ml-auto font-mono font-semibold text-slate-600 text-xs">
                              ₹{order.totalCost}
                            </span>

                            {/* Approve button — always visible, rightmost */}
                            {isShopAdmin && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleApproveOrder(order.id);
                                }}
                                disabled={approvingJobId === order.id}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-[11px] rounded-lg border-none cursor-pointer flex items-center gap-1 transition-colors shrink-0"
                              >
                                <Check className="w-3 h-3" />
                                Approve
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Operational Log & Spooler Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-left font-sans">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-base font-bold text-slate-800">Operational Log & Spooler Control</h3>
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
                      const shop = shops.find(s => s.id === selectedShopId);
                      const bw = shop ? shop.bwPrice : 2;
                      const color = shop ? shop.colorPrice : 5;
                      const rate = job.printMode === 'color' ? color : bw;
                      const billedPgs = job.sides === 'double' ? Math.ceil(job.pageCount / 2) : job.pageCount;
                      const estimatedCost = job.chargedAmount !== undefined ? job.chargedAmount : (job.copies * billedPgs * rate);
                      
                      let statusBg = 'bg-slate-50 text-slate-600 border-slate-200';
                      if (job.status === 'completed') statusBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                      else if (job.status === 'printing') statusBg = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                      else if (job.status === 'queued') statusBg = 'bg-amber-50 text-amber-700 border-amber-200';
                      else if (job.status === 'pending_approval') statusBg = 'bg-orange-50 text-orange-700 border-orange-200';
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
                              {job.reason && job.reason !== 'Rejected by Administrator' && (
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
                                  disabled={job.printMode === 'color' ? colorStatus !== 'online' : bwStatus !== 'online'}
                                  className="p-1.5 rounded bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-600 transition-all cursor-pointer font-bold flex items-center gap-1 text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
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
        </div>
      )}

      {/* TAB 2: AGENT & HARDWARE CONTROL */}
      {activeTab === 'agent' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Main Connection Status Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm font-sans">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 text-left">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    isOnline
                      ? 'bg-emerald-500 animate-pulse'
                      : isConnecting
                      ? 'bg-amber-500 animate-pulse'
                      : 'bg-slate-400'
                  }`} />
                  <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 font-mono">
                    System Status: {
                      isOnline
                        ? 'ONLINE'
                        : isConnecting
                        ? 'CONNECTING'
                        : 'OFFLINE'
                    }
                  </h4>
                </div>
                <h3 className="text-base font-bold text-slate-800">
                  Campus Print Agent Control
                </h3>
                <p className="text-slate-500 text-xs font-medium">
                  {isOffline && '🔴 Shop is offline. Start the desktop agent to connect the hardware queue.'}
                  {isConnecting && '⚡ Launching desktop agent... Awaiting secure heartbeat registration.'}
                  {isOnline && '🟢 Shop is online. Telemetry link active. Ready to accept cloud print requests.'}
                </p>
                <div className="mt-4 flex items-center">
                  <a
                    href={getApiUrl('/download/agent')}
                    download="CampusPrintInstaller.exe"
                    className="py-1.5 px-3 rounded-lg border border-blue-200 bg-transparent hover:bg-blue-50 hover:border-blue-300 text-blue-600 text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer no-underline active:bg-blue-100"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Campus Print Agent
                  </a>
                </div>
              </div>
              
              <div className="flex items-center gap-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={isConnecting ? handleCancelStartup : handleToggleOnlineStatus}
                  disabled={launcherBusy}
                  className={`py-2.5 px-4.5 rounded-2xl font-bold text-xs cursor-pointer border-none flex items-center gap-2 shadow-sm btn-primary-action ${
                    isOnline
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-500/20'
                      : isConnecting
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/20 animate-pulse'
                      : 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-rose-500/20'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full bg-white ${isOnline || isConnecting ? 'animate-ping' : ''}`} />
                  {isOnline 
                    ? '🟢 SHOP ONLINE (GO OFFLINE)' 
                    : isConnecting 
                    ? '⚡ CONNECTING (CANCEL)' 
                    : '🔴 SHOP OFFLINE (GO ONLINE)'
                  }
                </button>
              </div>
            </div>

            {localConnectionError && (
              <div className="mt-4 bg-rose-50 border border-rose-200 rounded-xl p-4 text-left space-y-2">
                <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                  <span>⚠️ Connection Timeout</span>
                </div>
                <p className="text-xs text-rose-700/90 leading-relaxed font-medium">
                  {localConnectionError}
                </p>
              </div>
            )}

            {isOnline && (
              <div className="mt-6 border-t border-slate-100 pt-6 text-left space-y-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Active Device Configuration</h4>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 text-xs text-left">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Printer Status</p>
                    <p className="font-extrabold text-slate-800 mt-0.5 truncate">
                      {bwStatus === 'online' ? (activePrinterName || 'System Default') : (bwStatus === 'unknown' ? 'Printer Status Unknown' : 'Printer Offline')}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Total Printers</p>
                    <p className="font-extrabold text-slate-800 mt-0.5">
                      {printersCount || 0} discovered
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Uptime</p>
                    <p className="font-extrabold text-slate-800 mt-0.5">
                      {agentUptime ? `${Math.floor(agentUptime / 60)}m ${agentUptime % 60}s` : '0s'}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Telemetry link</p>
                    <p className="font-extrabold text-slate-800 mt-0.5 truncate">
                      {formatHeartbeat(lastHeartbeatTime)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Agent & Health Monitoring Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Agent Status Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between font-sans">
              <div>
                <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
                  <Printer className="w-5 h-5 text-indigo-500" />
                  <span>Agent Status Card</span>
                </h3>
                <div className="space-y-3.5 text-sm font-semibold text-slate-600">
                  <div className="flex justify-between items-center">
                    <span>Agent Status:</span>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${
                      isOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}
                    </span>
                  </div>

                  {!agentLastHeartbeat ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span>Machine:</span>
                        <span className="text-slate-900 font-bold">Unknown</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Connected Printer:</span>
                        <span className="text-slate-900 font-bold text-slate-450">No printers discovered</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Configured Printer:</span>
                        <span className="text-slate-900 font-bold text-slate-450">Not configured</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Heartbeat:</span>
                        <span className="text-slate-900 font-bold text-slate-450">Never</span>
                      </div>
                    </>
                  ) : !isOnline ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span>Configured Printer:</span>
                        <span className="text-slate-900 font-bold">
                          {[bwPrinterName, colorPrinterName].filter(Boolean).join(' / ') || 'Not configured'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Connected Printer:</span>
                        <span className="text-slate-900 font-bold text-rose-600">Unknown (Agent Offline)</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Heartbeat:</span>
                        <span className="text-slate-900 font-bold">
                          Last seen {formatHeartbeat(agentLastHeartbeat)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between items-center">
                        <span>Configured Printer:</span>
                        <span className="text-slate-900 font-bold">
                          {[bwPrinterName, colorPrinterName].filter(Boolean).join(' / ') || 'Not configured'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Connected Printer:</span>
                        <span className="text-slate-900 font-bold">
                          {agentPrinterName || 'System Default'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Heartbeat:</span>
                        <span className="text-emerald-600 font-bold">Live</span>
                      </div>
                    </>
                  )}

                  <div className="flex justify-between items-center">
                    <span>Daemon Version:</span>
                    <span className="text-slate-500 font-mono text-xs">{agentDaemonVersion || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Jobs Waiting:</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-bold font-mono">
                      {jobs.filter(j => j.status === 'queued').length}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100">
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 font-mono">
                  Printer Discovery
                </h4>
                <button
                  type="button"
                  onClick={handleScanPrinters}
                  disabled={scanning || agentOnlineStatusState !== 'online'}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border-none shadow-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                  {scanning ? 'Scanning installed printers...' : 'Refresh Installed Printers'}
                </button>
                
                {agentOnlineStatusState !== 'online' ? (
                  <p className="text-[10px] text-rose-500 font-bold text-center mt-1.5 leading-tight">
                    ⚠️ Start the Campus Print Agent to discover printers.
                  </p>
                ) : scanning ? (
                  <p className="text-[10px] text-indigo-600 font-semibold text-center mt-1.5 leading-tight">
                    Scanning installed printers...
                  </p>
                ) : scanSuccessMsg ? (
                  <p className="text-[10px] text-emerald-600 font-bold text-center mt-1.5 leading-tight">
                    {scanSuccessMsg}
                  </p>
                ) : errorMsg ? (
                  <p className="text-[10px] text-rose-500 font-bold text-center mt-1.5 leading-tight">
                    ⚠️ {errorMsg}
                  </p>
                ) : null}
              </div>
            </div>

            {/* System Health Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between font-sans">
              <div>
                <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-indigo-500" />
                  <span>System Health Card</span>
                </h3>
                <div className="space-y-3.5 text-xs font-semibold text-slate-600">
                  <div className="flex justify-between items-center">
                    <span>1. Agent Connected:</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                      systemHealth?.agentConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {systemHealth?.agentConnected ? '🟢 CONNECTED' : '🔴 OFFLINE'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>2. Printers Discovered:</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                      systemHealth?.printersDiscovered ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {systemHealth?.printersDiscovered ? '🟢 DISCOVERED' : '🔴 NO DEVICES'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>3. B&W Printer Selected:</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                      systemHealth?.bwPrinterSelected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {systemHealth?.bwPrinterSelected ? '🟢 SELECTED' : '🔴 MISSING'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>4. Color Printer Selected:</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                      systemHealth?.colorPrinterSelected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {systemHealth?.colorPrinterSelected ? '🟢 SELECTED' : '🔴 MISSING'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>5. System Ready:</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                      systemHealth?.systemReady ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {systemHealth?.systemReady ? '🟢 READY' : '🔴 NOT READY'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>6. Uploads Enabled:</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                      systemHealth?.uploadsEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {systemHealth?.uploadsEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>7. Approvals Enabled:</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                      systemHealth?.approvalsEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {systemHealth?.approvalsEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Printer Intelligence & Diagnostics Card */}
          {health && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 font-sans">
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Left: Overall Health & Diagnostics */}
                <div className="flex-1 space-y-4 text-left">
                  <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-500" />
                    <span>Printer Intelligence & Diagnostics</span>
                  </h3>
                  
                  {health.blockedReason && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-rose-800 text-xs">
                      <span className="text-lg">🚫</span>
                      <div>
                        <p className="font-extrabold uppercase tracking-wide text-rose-900">Printing blocked</p>
                        <p className="font-semibold mt-0.5">Reason: {health.blockedReason}</p>
                        <p className="mt-1 text-rose-600 font-medium">
                          Current health: <span className="font-mono font-bold bg-rose-100 px-1 py-0.5 rounded text-rose-850">{health.printerHealth}</span>
                        </p>
                        <p className="mt-0.5 text-rose-600 font-medium">
                          Time detected: <span className="font-mono">{health.blockedSince ? new Date(health.blockedSince).toLocaleTimeString() : 'N/A'}</span>
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Printer Status</p>
                      <p className="font-extrabold text-slate-850 mt-1 flex items-center gap-1.5 text-slate-800">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                          health.printerHealth === 'READY' || health.printerHealth === 'PRINTING' ? 'bg-emerald-500' :
                          health.printerHealth === 'PAPER_LOW' || health.printerHealth === 'LOW_TONER' ? 'bg-amber-500' : 'bg-rose-500'
                        }`} />
                        {health.printerHealth}
                      </p>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Agent Status</p>
                      <p className="font-extrabold text-slate-850 mt-1 flex items-center gap-1.5 text-slate-800">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                          health.agentHealth === 'Healthy' ? 'bg-emerald-500' :
                          health.agentHealth === 'Degraded' ? 'bg-amber-500' : 'bg-rose-500'
                        }`} />
                        {health.agentHealth}
                      </p>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Shop Status</p>
                      <p className="font-extrabold text-slate-850 mt-1 flex items-center gap-1.5 text-slate-800">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                          health.shopHealth === 'Operational' || health.shopHealth === 'Busy' ? 'bg-emerald-500' :
                          health.shopHealth === 'Attention Required' ? 'bg-amber-500' : 'bg-rose-500'
                        }`} />
                        {health.shopHealth}
                      </p>
                    </div>
                  </div>

                  {/* SNMP Telemetry Details if available */}
                  {printerIntelligence && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 text-xs font-semibold text-slate-650">
                      <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest font-mono mb-2">SNMP Telemetry Details</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        <div className="flex justify-between">
                          <span>Vendor / Model:</span>
                          <span className="text-slate-900 font-bold">{printerIntelligence.vendor || 'N/A'} {printerIntelligence.model || ''}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Serial Number:</span>
                          <span className="text-slate-900 font-mono font-bold">{printerIntelligence.serialNumber || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Page Count:</span>
                          <span className="text-slate-900 font-mono font-bold">{printerIntelligence.pageCount !== undefined ? printerIntelligence.pageCount.toLocaleString() : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Toner Status:</span>
                          <span className="text-slate-900 font-bold">
                            {printerIntelligence.consumables && printerIntelligence.consumables[0] 
                              ? `${printerIntelligence.consumables[0].levelPct}%` 
                              : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Health Score & Warnings Panel */}
                <div className="w-full lg:w-80 space-y-4 text-left">
                  {/* Health Score */}
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Health Score</p>
                      <p className="text-3xl font-extrabold text-slate-850 mt-1 text-slate-800">{health.healthScore}%</p>
                    </div>
                    <div className="relative w-16 h-16">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="32" cy="32" r="28" className="stroke-slate-200 fill-none" strokeWidth="6" />
                        <circle cx="32" cy="32" r="28" className={`fill-none ${
                          health.healthScore >= 80 ? 'stroke-emerald-500' :
                          health.healthScore >= 50 ? 'stroke-amber-500' : 'stroke-rose-500'
                        }`} strokeWidth="6" strokeDasharray={`${2 * Math.PI * 28}`} strokeDashoffset={`${2 * Math.PI * 28 * (1 - health.healthScore / 100)}`} strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>

                  {/* Warnings Panel */}
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono mb-3">Active Warnings Panel</p>
                    {health.warnings && health.warnings.length > 0 ? (
                      <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                        {health.warnings.map((w: any, idx: number) => (
                          <div key={idx} className={`p-3 rounded-xl text-xs font-bold border flex items-start gap-2.5 ${
                            w.severity === 'error' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                            w.severity === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            <span className="text-base select-none">
                              {w.type === 'Paper Jam' ? '🔴' :
                               w.type === 'Paper Empty' ? '🔴' :
                               w.type === 'Cover Open' ? '🔴' :
                               w.type === 'Offline' ? '⚫' :
                               w.type === 'Low Toner' ? '🟠' : '🟡'}
                            </span>
                            <div>
                              <p className="font-extrabold uppercase text-[10px] tracking-wide">{w.type}</p>
                              <p className="font-medium mt-0.5 leading-relaxed text-slate-500">{w.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                        <span>🟢</span> No active warnings. System healthy.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* B&W and Color Printer Selection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Black & White Operations */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
                <Printer className="w-4.5 h-4.5 text-indigo-500" />
                <span>BLACK & WHITE OPERATIONS</span>
              </h3>
              <form onSubmit={handleSaveBwSettings} className="space-y-4">
                {bwSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl animate-fadeIn">
                    ✓ Black & White settings saved!
                  </div>
                )}
                {bwError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl animate-fadeIn">
                    ⚠️ {bwError}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                    Current Printer
                  </label>
                  <select
                    value={bwPrinterId}
                    onChange={(e: any) => setBwPrinterId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={availablePrinters.filter(p => p.status === 'online').length === 0}
                    required
                  >
                    {availablePrinters.filter(p => p.status === 'online').length === 0 ? (
                      <option value="">Start the Campus Print Agent to discover printers.</option>
                    ) : (
                      <>
                        <option value="" disabled>Select B&W Printer</option>
                        {availablePrinters.filter(p => p.status === 'online').map(printer => (
                          <option key={printer.printerId} value={printer.printerId}>{printer.printerName}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div className="text-left">
                    <label className="block text-xs font-bold text-slate-800">
                      Maintenance
                    </label>
                    <span className="text-[10px] text-slate-400 block leading-tight mt-0.5 max-w-[160px]">
                      Disables Black & White print submissions immediately.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBwMaintenance(!bwMaintenance)}
                    className={`w-12 h-6.5 rounded-full p-1 transition-all duration-200 focus:outline-none cursor-pointer border-none flex items-center ${
                      bwMaintenance ? 'bg-rose-500 justify-end' : 'bg-slate-300 justify-start'
                    }`}
                  >
                    <span className="w-4.5 h-4.5 rounded-full bg-white shadow-sm block" />
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={savingBwSettings}
                  className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border-none shadow-sm btn-primary-action"
                >
                  <Save className="w-4 h-4" />
                  {savingBwSettings ? 'Saving B&W Settings...' : 'Save Settings'}
                </button>

                {isBwDirty && (
                  <button
                    type="button"
                    onClick={() => {
                      setBwPrinterId(baseBwPrinterId);
                      setBwMaintenance(baseBwMaintenance);
                    }}
                    className="w-full py-2 px-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-semibold text-xs transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                  >
                    Discard Changes
                  </button>
                )}
              </form>
            </div>

            {/* Color Operations */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
                <Printer className="w-4.5 h-4.5 text-violet-500" />
                <span>COLOR OPERATIONS</span>
              </h3>
              <form onSubmit={handleSaveColorSettings} className="space-y-4">
                {colorSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl animate-fadeIn">
                    ✓ Color settings saved!
                  </div>
                )}
                {colorError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl animate-fadeIn">
                    ⚠️ {colorError}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                    Current Printer
                  </label>
                  <select
                    value={colorPrinterId}
                    onChange={(e: any) => setColorPrinterId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={availablePrinters.filter(p => p.status === 'online').length === 0}
                    required
                  >
                    {availablePrinters.filter(p => p.status === 'online').length === 0 ? (
                      <option value="">Start the Campus Print Agent to discover printers.</option>
                    ) : (
                      <>
                        <option value="" disabled>Select Color Printer</option>
                        {availablePrinters.filter(p => p.status === 'online').map(printer => (
                          <option key={printer.printerId} value={printer.printerId}>{printer.printerName}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div className="text-left">
                    <label className="block text-xs font-bold text-slate-800">
                      Maintenance
                    </label>
                    <span className="text-[10px] text-slate-400 block leading-tight mt-0.5 max-w-[160px]">
                      Disables Color print submissions immediately.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setColorMaintenance(!colorMaintenance)}
                    className={`w-12 h-6.5 rounded-full p-1 transition-all duration-200 focus:outline-none cursor-pointer border-none flex items-center ${
                      colorMaintenance ? 'bg-rose-500 justify-end' : 'bg-slate-300 justify-start'
                    }`}
                  >
                    <span className="w-4.5 h-4.5 rounded-full bg-white shadow-sm block" />
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={savingColorSettings}
                  className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border-none shadow-sm btn-primary-action"
                >
                  <Save className="w-4 h-4" />
                  {savingColorSettings ? 'Saving Color Settings...' : 'Save Settings'}
                </button>

                {isColorDirty && (
                  <button
                    type="button"
                    onClick={() => {
                      setColorPrinterId(baseColorPrinterId);
                      setColorMaintenance(baseColorMaintenance);
                    }}
                    className="w-full py-2 px-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-semibold text-xs transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                  >
                    Discard Changes
                  </button>
                )}
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SHOP SETTINGS & PRICING */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
          {/* Shop Profile Settings */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
              <User className="w-4.5 h-4.5 text-indigo-500" />
              <span>Shop Profile Settings</span>
            </h3>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              {profileSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl animate-fadeIn">
                  ✓ Shop profile updated successfully!
                </div>
              )}
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">Shop Name</label>
                <input
                  type="text" required value={shopName} onChange={(e) => setShopName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-semibold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">Owner Name</label>
                <input
                  type="text" required value={shopOwnerName} onChange={(e) => setShopOwnerName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-semibold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">Mobile Number</label>
                <input
                  type="text" required value={shopPhone} onChange={(e) => setShopPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-semibold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">Shop Address</label>
                <input
                  type="text" required value={shopAddress} onChange={(e) => setShopAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-semibold"
                />
              </div>
              <button
                type="submit" disabled={savingProfile}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border-none"
              >
                <Save className="w-4 h-4" />
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
          </div>

          {/* Shop Pricing Settings */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4.5 h-4.5 text-indigo-500" />
              <span>Shop Pricing Settings</span>
            </h3>
            <form onSubmit={handleSavePricing} className="space-y-4">
              {pricingSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl animate-fadeIn">
                  ✓ Pricing updated successfully!
                </div>
              )}
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">B&W Price (₹ / page)</label>
                <input
                  type="number" required min={0} value={bwPrice} onChange={(e) => setBwPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-semibold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">Color Price (₹ / page)</label>
                <input
                  type="number" required min={0} value={colorPrice} onChange={(e) => setColorPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-semibold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">Duplex Price (₹ / sheet)</label>
                <input
                  type="number" required min={0} value={duplexPrice} onChange={(e) => setDuplexPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-semibold"
                />
              </div>
              <button
                type="submit" disabled={savingPricing}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border-none"
              >
                <Save className="w-4 h-4" />
                {savingPricing ? 'Saving...' : 'Save Pricing'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: PRINT QR CODE POSTER */}
      {activeTab === 'qr' && (
        <div className="max-w-xl mx-auto animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-indigo-500" />
                <span>Shop Kiosk QR Poster</span>
              </h3>
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                Ready to Print
              </span>
            </div>

            <div className="p-6 bg-slate-50/70 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center justify-center space-y-4">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&color=4f46e5&data=${encodeURIComponent(qrUrl)}`} 
                alt="Print Hub QR Code" 
                className="w-[200px] h-[200px] rounded-2xl shadow-md bg-white p-2 border border-slate-100"
              />
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-700">Scan to upload print files</p>
                <p className="text-[11px] text-slate-400 font-mono truncate max-w-sm">
                  {qrUrl}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={printQrPoster}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-extrabold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer border-none shadow-md shadow-indigo-500/20 btn-primary-action"
            >
              <Printer className="w-4.5 h-4.5" />
              Print QR Poster
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal with Spring Pop Entrance Animation */}
      {showOnlineConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-100 p-6 max-w-md w-full text-center space-y-5 shadow-2xl animate-modal-pop">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto text-xl shadow-inner">
              🟢
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-extrabold text-slate-800">Confirm Going Online</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                This will automatically launch the print agent service, verify hardware connectivity, and open student submissions.
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-1">
              <button
                type="button"
                onClick={() => setShowOnlineConfirm(false)}
                className="py-2.5 px-5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold cursor-pointer btn-secondary-action"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeGoOnline}
                className="py-2.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-black cursor-pointer border-none shadow-md shadow-emerald-500/20 btn-success-action"
              >
                Yes, Go Online
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-Step Confirmation Modal: Go Offline */}
      {showOfflineConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-100 p-6 max-w-md w-full text-center space-y-5 shadow-2xl animate-modal-pop">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto text-xl shadow-inner">
              ⚠️
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-extrabold text-slate-800">Confirm Going Offline</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                This will terminate the active Print Agent daemon process and disconnect the shop. Students will be immediately prevented from submitting new print jobs.
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-1">
              <button
                type="button"
                onClick={() => setShowOfflineConfirm(false)}
                className="py-2.5 px-5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold cursor-pointer btn-secondary-action"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeGoOffline}
                className="py-2.5 px-6 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 text-white text-xs font-black cursor-pointer border-none shadow-md shadow-rose-500/20 btn-danger-action"
              >
                Yes, Disconnect Shop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

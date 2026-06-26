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
  QrCode,
  Search,
  Check,
  Settings
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
  onSelectShop
}: Props) {
  const activeShopId = selectedShopId;
  const qrUrl = `${window.location.origin}/?shopId=${activeShopId}`;

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => {
    return !!sessionStorage.getItem('adminToken');
  });
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [selectedLoginShopId, setSelectedLoginShopId] = useState(selectedShopId || 'tjohn_print');


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

  // Printer Mappings States
  const [bwPrinterId, setBwPrinterId] = useState('');
  const [bwPrinterName, setBwPrinterName] = useState('');
  const [bwStatus, setBwStatus] = useState('offline');
  const [colorPrinterId, setColorPrinterId] = useState('');
  const [colorPrinterName, setColorPrinterName] = useState('');
  const [colorStatus, setColorStatus] = useState('offline');
  const [savingMapping, setSavingMapping] = useState(false);
  const [mappingSuccess, setMappingSuccess] = useState(false);


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

  // Token Search & Approval States
  const [searchTokenQuery, setSearchTokenQuery] = useState('');
  const [searchResultJob, setSearchResultJob] = useState<PrintJob | null>(null);
  const [searchError, setSearchError] = useState('');
  const [isSearchingToken, setIsSearchingToken] = useState(false);
  const [approvingJobId, setApprovingJobId] = useState<string | null>(null);

  const isShopAdmin = sessionStorage.getItem('role') === 'shop_admin';

  const handleSearchToken = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchTokenQuery.trim()) return;
    setSearchError('');
    setSearchResultJob(null);
    setIsSearchingToken(true);
    try {
      const token = sessionStorage.getItem('adminToken');
      const res = await fetch(getApiUrl(`/api/jobs/token/${searchTokenQuery.trim()}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const job = await res.json();
        setSearchResultJob(job);
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

  const handleApproveJob = async (jobId: string) => {
    setApprovingJobId(jobId);
    try {
      const token = sessionStorage.getItem('adminToken');
      const res = await fetch(getApiUrl(`/api/jobs/${jobId}/approve`), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchStats();
        onRefreshJobs();
        if (searchResultJob && searchResultJob.id === jobId) {
          setSearchResultJob(null);
          setSearchTokenQuery('');
        }
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to approve job.');
      }
    } catch (err) {
      alert('Network error approving job.');
      console.error(err);
    } finally {
      setApprovingJobId(null);
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
              setBwMaintenance(settings.bw.underMaintenance || false);
              setBwStatusMode(settings.bw.statusMode || 'auto');
              setBwExpectedReturnTime(settings.bw.expectedReturnTime || '06:02 PM');
              setBwPrinterId(settings.bw.selectedPrinterId || '');
              setBwPrinterName(settings.bw.selectedPrinterName || '');
              setBwStatus(settings.bw.status || 'offline');
            }
            if (settings.color) {
              setColorMaintenance(settings.color.underMaintenance || false);
              setColorStatusMode(settings.color.statusMode || 'auto');
              setColorExpectedReturnTime(settings.color.expectedReturnTime || '06:02 PM');
              setColorPrinterId(settings.color.selectedPrinterId || '');
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
      const res = await fetch(getApiUrl(`/api/printer/settings?shopId=${activeShopId}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const settings = await res.json();
        setAdminOverrideStatus(settings.adminOverrideStatus);
        setExpectedReturnTime(settings.expectedReturnTime);
        setAveragePrintSpeed(settings.averagePrintSpeed);
        setUnderMaintenance(settings.underMaintenance || false);
        setScanRequested(settings.scanRequested || false);

        if (settings.bw) {
          setBwMaintenance(settings.bw.underMaintenance || false);
          setBwStatusMode(settings.bw.statusMode || 'auto');
          setBwExpectedReturnTime(settings.bw.expectedReturnTime || '06:02 PM');
          setBwPrinterId(settings.bw.selectedPrinterId || '');
          setBwPrinterName(settings.bw.selectedPrinterName || '');
          setBwStatus(settings.bw.status || 'offline');
        }

        if (settings.color) {
          setColorMaintenance(settings.color.underMaintenance || false);
          setColorStatusMode(settings.color.statusMode || 'auto');
          setColorExpectedReturnTime(settings.color.expectedReturnTime || '06:02 PM');
          setColorPrinterId(settings.color.selectedPrinterId || '');
          setColorPrinterName(settings.color.selectedPrinterName || '');
          setColorStatus(settings.color.status || 'offline');
        }
        
        const shopRes = await fetch(getApiUrl(`/api/shops/${activeShopId}`));
        if (shopRes.ok) {
          const shopData = await shopRes.json();
          setAvailablePrinters(shopData.printers || []);
          setSelectedPrinter(shopData.activePrinterId || '');
        }

        const mappingRes = await fetch(getApiUrl(`/api/printers/mapping?shopId=${activeShopId}`), {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (mappingRes.ok) {
          const mapping = await mappingRes.json();
          setBwPrinterId(mapping.bwPrinterId || '');
          setBwPrinterName(mapping.bwPrinterName || '');
          setColorPrinterId(mapping.colorPrinterId || '');
          setColorPrinterName(mapping.colorPrinterName || '');
        }
        
        if (settings.scanRequested && !scanning) {
          startPrinterScanPolling(token);
        }
      }
    } catch (err) {
      console.error('Failed to fetch printer settings:', err);
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
    }, 3000);

    return () => clearInterval(interval);
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
        setLoginError(errData.error || 'Invalid shop, username, or password.');
      }
    } catch {
      setLoginError('Cannot connect to server. Please try again.');
    }
  };

  const handleSignOut = () => {
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
      const printerObj = availablePrinters.find(p => p.printerId === bwPrinterId);
      const printerNameVal = printerObj ? printerObj.printerName : '';
      
      const res = await fetch(getApiUrl('/api/printers/bw'), {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          shopId: activeShopId,
          bwPrinterId,
          bwPrinterName: printerNameVal,
          bwMaintenanceMode: bwMaintenance
        })
      });
      if (res.ok) {
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
          <div class="subtitle">📍 Alliance Print Center</div>
          
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
                  agentOnlineStatus === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  {agentOnlineStatus === 'online' ? '🟢 ONLINE' : '🔴 OFFLINE'}
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
              ) : agentOnlineStatus !== 'online' ? (
                <>
                  <div className="flex justify-between items-center">
                    <span>Machine Name:</span>
                    <span className="text-slate-900 font-bold">{agentMachineName || 'Unknown'}</span>
                  </div>
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
                    <span>Machine Name:</span>
                    <span className="text-slate-900 font-bold">{agentMachineName || 'Unknown'}</span>
                  </div>
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
              disabled={scanning || agentOnlineStatus !== 'online'}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border-none shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? 'Scanning installed printers...' : 'Refresh Installed Printers'}
            </button>
            
            {agentOnlineStatus !== 'online' ? (
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
            <div className="space-y-4 text-sm font-semibold text-slate-600">
              <div className="flex justify-between items-center">
                <span>Backend Status:</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border uppercase bg-emerald-50 text-emerald-700 border-emerald-200">
                  🟢 Backend Online
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Agent Status:</span>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border uppercase ${
                  agentOnlineStatus === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  {agentOnlineStatus === 'online' ? '🟢 Agent Online' : '🔴 Agent Offline'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Printer Status:</span>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border uppercase ${
                  printerStatus === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  {printerStatus === 'online' ? '🟢 Printer Online' : '🔴 Printer Offline'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Upload Service Status:</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border uppercase bg-emerald-50 text-emerald-700 border-emerald-200">
                  🟢 Upload Service Healthy
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Job Processing Status:</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border uppercase bg-emerald-50 text-emerald-700 border-emerald-200">
                  🟢 Job Processing Healthy
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Pending Approvals & Spooler Table */}
        <div className="lg:col-span-2 space-y-6">
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
              {/* Left Side: Token Search */}
              <div className="space-y-4 pr-0 md:pr-4 md:border-r border-slate-100">
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">
                    Token Search
                  </h4>
                  <form onSubmit={handleSearchToken} className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Enter Token (e.g. CP-4578)"
                        value={searchTokenQuery}
                        onChange={(e) => setSearchTokenQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-bold uppercase"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSearchingToken}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm transition-all border-none cursor-pointer flex items-center gap-1.5"
                    >
                      Search
                    </button>
                  </form>
                </div>

                {searchError && (
                  <div className="p-3 bg-red-50 border border-red-155 text-red-600 text-[11px] font-semibold rounded-xl leading-relaxed animate-fadeIn">
                    ⚠️ {searchError}
                  </div>
                )}

                {searchResultJob && (
                  <div className="p-4 bg-slate-50/55 border border-slate-205 rounded-xl space-y-3 animate-fadeIn text-xs">
                    <div className="flex justify-between items-center pb-1.5 border-b border-slate-200/60 font-mono">
                      <span className="font-extrabold text-indigo-600 text-sm">
                        {searchResultJob.tokenId || 'N/A'}
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase font-bold">
                        {searchResultJob.token}
                      </span>
                    </div>
                    <div className="space-y-1.5 font-medium text-slate-600">
                      <p className="truncate font-bold text-slate-800" title={searchResultJob.fileName}>
                        📄 {searchResultJob.fileName}
                      </p>
                      <p>📄 {searchResultJob.pageCount} Pages ({searchResultJob.sides === 'double' ? 'Duplex' : 'Simplex'})</p>
                      <p>🎨 Type: {searchResultJob.printMode === 'color' ? 'Color' : 'B&W'}</p>
                      <p>⏰ Time: {new Date(searchResultJob.createdAt).toLocaleString()}</p>
                      <p>👤 Student: {searchResultJob.studentName}</p>
                      <p className="flex items-center gap-1.5">
                        ⏳ Status: 
                        <span className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-extrabold uppercase text-[9px] tracking-wider font-mono">
                          Pending Approval
                        </span>
                      </p>
                    </div>

                    {isShopAdmin ? (
                      <button
                        onClick={() => handleApproveJob(searchResultJob.id)}
                        disabled={approvingJobId === searchResultJob.id}
                        className="w-full mt-2 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 border-none cursor-pointer transition-all"
                      >
                        <Play className="w-3.5 h-3.5" />
                        {approvingJobId === searchResultJob.id ? 'Releasing...' : 'Release To Queue'}
                      </button>
                    ) : (
                      <div className="text-[10px] text-rose-500 font-semibold text-center mt-2 p-1.5 bg-rose-50 border border-rose-100 rounded-lg">
                        🔒 Only Shop Admin may approve.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Side: Pending Approval Queue */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">
                  Pending Approval Queue
                </h4>
                {jobs.filter(j => j.status === 'pending_approval' && j.shopId === activeShopId).length === 0 ? (
                  <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-xs">
                    No jobs currently pending approval.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {jobs.filter(j => j.status === 'pending_approval' && j.shopId === activeShopId).map(job => (
                      <div key={job.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs transition-all hover:border-slate-350">
                        <div className="min-w-0 flex-1 pr-3 text-left">
                          <p className="font-mono font-extrabold text-orange-600 text-sm">
                            {job.tokenId || 'N/A'}
                          </p>
                          <p className="font-bold text-slate-800 truncate leading-tight mt-0.5" title={job.fileName}>
                            {job.fileName}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {job.pageCount} pgs · {job.printMode === 'color' ? 'Color' : 'B&W'} · {job.studentName}
                          </p>
                        </div>
                        {isShopAdmin ? (
                          <button
                            onClick={() => handleApproveJob(job.id)}
                            disabled={approvingJobId === job.id}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-[10px] rounded-lg shadow-sm border-none cursor-pointer flex items-center gap-1 transition-all"
                          >
                            <Play className="w-3 h-3" />
                            Approve
                          </button>
                        ) : (
                          <span className="text-[9px] text-slate-400 bg-slate-100 border border-slate-200 px-2 py-1 rounded">
                            Awaiting
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Left Column: Spooler Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-left font-sans">
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
                            {job.reason && (
                              <p className="text-[10px] text-red-500 max-w-[150px] leading-tight" title={job.reason}>
                                Reason: {job.reason}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {job.status === 'pending_approval' && isShopAdmin && (
                              <button
                                onClick={() => handleApproveJob(job.id)}
                                disabled={approvingJobId === job.id}
                                className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white transition-all cursor-pointer font-bold flex items-center gap-1 text-[10px] border-none"
                              >
                                <Play className="w-3.5 h-3.5" />
                                Approve Job
                              </button>
                            )}

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
      </div>

      {/* Right Column: Settings Form */}
        <div className="space-y-6 text-left font-sans">


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

              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                  Current Printer
                </label>
                <select
                  value={bwPrinterId}
                  onChange={(e: any) => setBwPrinterId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={availablePrinters.length === 0}
                  required
                >
                  {availablePrinters.length === 0 ? (
                    <option value="">Start the Campus Print Agent to discover printers.</option>
                  ) : (
                    <>
                      <option value="" disabled>Select B&W Printer</option>
                      {availablePrinters.map(printer => (
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
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border-none"
              >
                <Save className="w-4 h-4" />
                {savingBwSettings ? 'Saving B&W Settings...' : 'Save Settings'}
              </button>
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

              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                  Current Printer
                </label>
                <select
                  value={colorPrinterId}
                  onChange={(e: any) => setColorPrinterId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={availablePrinters.length === 0}
                  required
                >
                  {availablePrinters.length === 0 ? (
                    <option value="">Start the Campus Print Agent to discover printers.</option>
                  ) : (
                    <>
                      <option value="" disabled>Select Color Printer</option>
                      {availablePrinters.map(printer => (
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
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border-none"
              >
                <Save className="w-4 h-4" />
                {savingColorSettings ? 'Saving Color Settings...' : 'Save Settings'}
              </button>
            </form>
          </div>

          {/* Printer Service Health Info Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-3 mb-4 font-mono">
              Printer Service Health
            </h3>
            <div className="space-y-4 text-xs font-semibold text-slate-600">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-700 uppercase tracking-wider">B&W</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                    bwStatus === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {bwStatus === 'online' ? '🟢 Ready' : '🔴 Offline'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Printer:</span>
                  <span className="text-slate-900 font-bold">{bwPrinterName || 'Not configured'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Maintenance:</span>
                  <span className={`font-bold ${bwMaintenance ? 'text-rose-600' : 'text-slate-500'}`}>
                    {bwMaintenance ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-700 uppercase tracking-wider">Color</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                    colorStatus === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {colorStatus === 'online' ? '🟢 Ready' : '🔴 Offline'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Printer:</span>
                  <span className="text-slate-900 font-bold">{colorPrinterName || 'Not configured'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Maintenance:</span>
                  <span className={`font-bold ${colorMaintenance ? 'text-rose-600' : 'text-slate-500'}`}>
                    {colorMaintenance ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>
            </div>

            {/* Remote Agent Telemetry (Requirement 6) */}
            <div className="border-t border-slate-100 pt-5 mt-5">
              <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 font-mono">
                Remote Daemon Telemetry
              </h4>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/60 text-xs space-y-1.5 font-semibold text-slate-600">
                <div className="flex justify-between items-center">
                  <span>Agent Status:</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                    agentOnlineStatus === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {agentOnlineStatus === 'online' ? '🟢 ONLINE' : '🔴 OFFLINE'}
                  </span>
                </div>
                {agentId && (
                  <div className="flex justify-between">
                    <span>Agent ID:</span>
                    <span className="text-slate-900 font-bold">{agentId}</span>
                  </div>
                )}
                {agentMachineName && (
                  <div className="flex justify-between">
                    <span>Machine Name:</span>
                    <span className="text-slate-900 font-bold">{agentMachineName}</span>
                  </div>
                )}
                {agentPrinterName && (
                  <div className="flex justify-between">
                    <span>Printer Name:</span>
                    <span className="text-slate-900 font-bold">{agentPrinterName}</span>
                  </div>
                )}
                {agentDaemonVersion && (
                  <div className="flex justify-between">
                    <span>Daemon Version:</span>
                    <span className="text-slate-500 font-mono text-[10px]">{agentDaemonVersion}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Last Heartbeat:</span>
                  <span className="text-slate-900">
                    {agentLastHeartbeat ? new Date(agentLastHeartbeat).toLocaleTimeString() : 'Never'}
                  </span>
                </div>
              </div>
            </div>
          </div>

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

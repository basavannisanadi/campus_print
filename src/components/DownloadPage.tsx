import { Shield, CheckCircle, Download, ArrowLeft, RefreshCw } from 'lucide-react';
import { getApiUrl } from '../config';

interface DownloadPageProps {
  navigate: (path: string) => void;
}

export default function DownloadPage({ navigate }: DownloadPageProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 font-sans text-slate-700 text-left animate-fadeIn">
      {/* Back to Home Button */}
      <button
        onClick={() => navigate('/')}
        className="mb-8 py-2 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs flex items-center gap-2 cursor-pointer bg-white transition-all shadow-sm"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Hub
      </button>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Columns: Download Information */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 text-white rounded-3xl p-8 border border-slate-800 shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-transparent" />
            <div className="relative space-y-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                🚀 Platform Distribution
              </span>
              
              <div className="space-y-3">
                <h1 className="text-3xl font-black tracking-tight leading-none text-white">
                  Campus Print Agent
                </h1>
                <p className="text-slate-400 text-sm max-w-lg leading-relaxed">
                  Download the official print daemon execution service. Run the setup compiler once to register local custom url protocols, link system spoolers, and configure automatic queue routing.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <a
                  href={getApiUrl('/api/agent/download/installer')}
                  download="CampusPrintInstaller.exe"
                  className="py-3 px-6 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-extrabold uppercase tracking-wider transition-all shadow-md shadow-indigo-950/20 text-center decoration-none inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Agent Setup (.exe)
                </a>
                <span className="text-[10px] text-slate-500 font-mono">
                  Version: 1.0.0 · Size: ~1.2 MB · OS: Windows 10 / 11
                </span>
              </div>
            </div>
          </div>

          {/* Release Notes */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
              <RefreshCw className="w-4.5 h-4.5 text-indigo-500" />
              <span>Release Notes & Changelog</span>
            </h3>
            <div className="space-y-4 font-sans text-xs">
              <div>
                <h4 className="font-extrabold text-slate-800 text-sm">v1.0.0 (Latest Release)</h4>
                <p className="text-slate-400 text-[10px] mt-0.5">Released on: July 8, 2026</p>
                <ul className="list-disc list-inside text-slate-600 mt-2 space-y-1 pl-1">
                  <li>Added secure URL Protocol handler (<code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600">campusprint://</code>) for browser-triggered agent control.</li>
                  <li>Support for automatic background printing via SumatraPDF local engines.</li>
                  <li>Integrated lightweight hardware discovery status heartbeats.</li>
                  <li>Automatic state preservation & cleanup on process exit.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Installation Guide & Requirements */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Shield className="w-4.5 h-4.5 text-indigo-500" />
              <span>System Requirements</span>
            </h3>
            <div className="space-y-3.5 text-xs text-left">
              <div>
                <p className="font-extrabold text-slate-500 uppercase tracking-widest text-[9px] font-mono">Operating System</p>
                <p className="text-slate-800 font-bold mt-1">Windows 10, Windows 11 (64-bit)</p>
              </div>
              <div>
                <p className="font-extrabold text-slate-500 uppercase tracking-widest text-[9px] font-mono">Runtime Environments</p>
                <p className="text-slate-800 font-bold mt-1">Node.js (v18 or higher) & .NET Framework 4.5+</p>
              </div>
              <div>
                <p className="font-extrabold text-slate-500 uppercase tracking-widest text-[9px] font-mono">Printer Hardware</p>
                <p className="text-slate-800 font-bold mt-1">Active Windows Spooler Connection (USB/Network)</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
              <CheckCircle className="w-4.5 h-4.5 text-indigo-500" />
              <span>Installation Guide</span>
            </h3>
            <div className="space-y-4 text-xs">
              <div className="flex gap-3 text-left">
                <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold flex-shrink-0">1</span>
                <div>
                  <p className="font-bold text-slate-800">Download the Setup Installer</p>
                  <p className="text-slate-400 mt-0.5">Click the Download Agent Setup button to save <code className="bg-slate-50 px-1 py-0.5 rounded text-[10px]">CampusPrintAgentSetup.exe</code>.</p>
                </div>
              </div>
              <div className="flex gap-3 text-left">
                <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold flex-shrink-0">2</span>
                <div>
                  <p className="font-bold text-slate-800">Execute the Setup File</p>
                  <p className="text-slate-400 mt-0.5">Double-click to run the setup. It will automatically download client files and configure Windows protocols.</p>
                </div>
              </div>
              <div className="flex gap-3 text-left">
                <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold flex-shrink-0">3</span>
                <div>
                  <p className="font-bold text-slate-800">Verify & Go Online</p>
                  <p className="text-slate-400 mt-0.5">Return to your dashboard, click Verify Installation, and activate the print client queue.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

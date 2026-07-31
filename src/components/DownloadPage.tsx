import { Shield, CheckCircle, Download, ArrowLeft, RefreshCw } from 'lucide-react';
import { getApiUrl } from '../config';

interface DownloadPageProps {
  navigate: (path: string) => void;
}

export default function DownloadPage({ navigate }: DownloadPageProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 font-sans text-[var(--text-primary)] text-left animate-fadeIn">
      {/* Back to Home Button */}
      <button
        onClick={() => navigate('/')}
        className="mb-8 py-2 px-4 rounded-xl btn-secondary-action font-bold text-xs flex items-center gap-2 cursor-pointer shadow-sm"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Hub
      </button>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Columns: Download Information */}
        <div className="lg:col-span-2 space-y-6">
          <div className="portal-card-elevated rounded-3xl p-8 shadow-xl relative overflow-hidden bg-[var(--bg-card)]">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-transparent pointer-events-none" />
            <div className="relative space-y-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--color-primary-light)] border border-[var(--color-primary-border)] text-[var(--color-primary)]">
                🚀 Platform Distribution
              </span>
              
              <div className="space-y-3">
                <h1 className="text-3xl font-black tracking-tight leading-none text-[var(--text-primary)]">
                  Campus Print Agent
                </h1>
                <p className="text-[var(--text-muted)] text-sm max-w-lg leading-relaxed">
                  Download the official print daemon execution service. Run the setup compiler once to register local custom url protocols, link system spoolers, and configure automatic queue routing.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <a
                  href={getApiUrl('/api/agent/download/installer')}
                  download="CampusPrintInstaller.exe"
                  className="py-3 px-6 rounded-xl btn-primary-action text-xs font-extrabold uppercase tracking-wider shadow-md text-center decoration-none inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Agent Setup (.exe)
                </a>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">
                  Version: 1.0.0 · Size: ~1.2 MB · OS: Windows 10 / 11
                </span>
              </div>
            </div>
          </div>

          {/* Release Notes */}
          <div className="portal-card p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-3 flex items-center gap-2">
              <RefreshCw className="w-4.5 h-4.5 text-[var(--color-primary)]" />
              <span>Release Notes & Changelog</span>
            </h3>
            <div className="space-y-4 font-sans text-xs">
              <div>
                <h4 className="font-extrabold text-[var(--text-primary)] text-sm">v1.0.0 (Latest Release)</h4>
                <p className="text-[var(--text-muted)] text-[10px] mt-0.5">Released on: July 8, 2026</p>
                <ul className="list-disc list-inside text-[var(--text-secondary)] mt-2 space-y-1 pl-1">
                  <li>Added secure URL Protocol handler (<code className="bg-[var(--bg-surface-secondary)] px-1 py-0.5 rounded text-[var(--color-primary)]">campusprint://</code>) for browser-triggered agent control.</li>
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
          <div className="portal-card p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-3 flex items-center gap-2">
              <Shield className="w-4.5 h-4.5 text-[var(--color-primary)]" />
              <span>System Requirements</span>
            </h3>
            <div className="space-y-3.5 text-xs text-left">
              <div>
                <p className="font-extrabold text-[var(--text-muted)] uppercase tracking-widest text-[9px] font-mono">Operating System</p>
                <p className="text-[var(--text-primary)] font-bold mt-1">Windows 10, Windows 11 (64-bit)</p>
              </div>
              <div>
                <p className="font-extrabold text-[var(--text-muted)] uppercase tracking-widest text-[9px] font-mono">Runtime Environments</p>
                <p className="text-[var(--text-primary)] font-bold mt-1">Node.js (v18 or higher) & .NET Framework 4.5+</p>
              </div>
              <div>
                <p className="font-extrabold text-[var(--text-muted)] uppercase tracking-widest text-[9px] font-mono">Printer Hardware</p>
                <p className="text-[var(--text-primary)] font-bold mt-1">Active Windows Spooler Connection (USB/Network)</p>
              </div>
            </div>
          </div>

          <div className="portal-card p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-3 flex items-center gap-2">
              <CheckCircle className="w-4.5 h-4.5 text-[var(--color-primary)]" />
              <span>Installation Guide</span>
            </h3>
            <div className="space-y-4 text-xs">
              <div className="flex gap-3 text-left">
                <span className="w-5 h-5 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center font-bold flex-shrink-0">1</span>
                <div>
                  <p className="font-bold text-[var(--text-primary)]">Download the Setup Installer</p>
                  <p className="text-[var(--text-muted)] mt-0.5">Click the Download Agent Setup button to save <code className="bg-[var(--bg-surface-secondary)] px-1 py-0.5 rounded text-[10px]">CampusPrintAgentSetup.exe</code>.</p>
                </div>
              </div>
              <div className="flex gap-3 text-left">
                <span className="w-5 h-5 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center font-bold flex-shrink-0">2</span>
                <div>
                  <p className="font-bold text-[var(--text-primary)]">Execute the Setup File</p>
                  <p className="text-[var(--text-muted)] mt-0.5">Double-click to run the setup. It will automatically download client files and configure Windows protocols.</p>
                </div>
              </div>
              <div className="flex gap-3 text-left">
                <span className="w-5 h-5 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center font-bold flex-shrink-0">3</span>
                <div>
                  <p className="font-bold text-[var(--text-primary)]">Verify & Go Online</p>
                  <p className="text-[var(--text-muted)] mt-0.5">Return to your dashboard, click Verify Installation, and activate the print client queue.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

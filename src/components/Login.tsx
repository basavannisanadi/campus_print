import { useState, useEffect, useRef } from 'react';
import { Printer, AlertCircle, X, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { verifyGoogleToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showMockPicker, setShowMockPicker] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const googleClientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;
  const isDev = (import.meta as any).env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  useEffect(() => {
    if (!googleClientId) return;

    const initializeAndRender = () => {
      try {
        const googleObj = (window as any).google;
        if (!googleObj) return;

        googleObj.accounts.id.initialize({
          client_id: googleClientId,
          callback: (response: any) => {
            handleGoogleCredential(response.credential);
          }
        });

        if (googleButtonRef.current) {
          googleObj.accounts.id.renderButton(googleButtonRef.current, {
            theme: 'outline',
            size: 'large',
            width: 320,
            text: 'signin_with',
            shape: 'rectangular',
          });
        }
      } catch (err) {
        console.error('Failed to initialize or render Google Identity Services:', err);
      }
    };

    if ((window as any).google) {
      initializeAndRender();
    } else {
      const existingScript = document.getElementById('google-gsi-client');
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.id = 'google-gsi-client';
        script.onload = initializeAndRender;
        document.body.appendChild(script);
      } else {
        existingScript.addEventListener('load', initializeAndRender);
        return () => {
          existingScript.removeEventListener('load', initializeAndRender);
        };
      }
    }
  }, [googleClientId]);

  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    setLoading(true);
    try {
      await verifyGoogleToken(credential);
    } catch (err: any) {
      setError(err.message || 'Google authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueWithGoogle = () => {
    if (isDev) {
      setShowMockPicker(true);
    } else if (googleClientId) {
      // Trigger GIS Prompt
      try {
        (window as any).google?.accounts.id.prompt();
      } catch (err) {
        console.error('One Tap prompt error:', err);
        setError('Google login initialization failed. Using development fallback.');
      }
    } else {
      setError('Google Client ID is not configured on this server.');
    }
  };

  const handleMockLogin = async (mockToken: string) => {
    setShowMockPicker(false);
    setError(null);
    setLoading(true);
    try {
      await verifyGoogleToken(mockToken);
    } catch (err: any) {
      setError(err.message || 'Mock authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative bg-[#F8F8FC]  transition-colors select-none font-sans">
      
      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-purple-200/20  blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] rounded-full bg-indigo-200/20  blur-[130px]" />
      </div>

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-[400px] p-8 sm:p-10 bg-white/80  backdrop-blur-xl rounded-3xl border border-purple-200/60  shadow-2xl text-center space-y-8">
        
        {/* Campus Print Logo */}
        <div className="space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-500 flex items-center justify-center text-white mx-auto shadow-md shadow-purple-500/25">
            <Printer className="w-7 h-7 animate-pulse-slow" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">Campus Print</h1>
            {/* Tagline */}
            <p className="text-xs text-[var(--text-muted)] font-medium max-w-[280px] mx-auto leading-relaxed">
              Fast, reliable campus cloud printing for modern institutions.
            </p>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50  border border-rose-200/50  flex items-start gap-2.5 text-left text-xs text-rose-600  font-semibold">
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Button: Continue with Google */}
        <div className="space-y-4 flex flex-col items-center">
          {loading && (
            <div className="w-full flex justify-center py-3">
              <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {googleClientId && (
            <div className="w-full flex flex-col items-center gap-3 mt-2">
              <div ref={googleButtonRef} className="w-full max-w-[320px]" />
              <button
                type="button"
                onClick={() => setShowMockPicker(true)}
                className="w-full max-w-[320px] flex items-center justify-center gap-3 px-6 py-2.5 rounded-xl border border-dashed border-purple-300 bg-purple-50/50 hover:bg-purple-50 text-purple-700 font-bold text-sm cursor-pointer shadow-xs transition-all"
              >
                Mock Bypass Login
              </button>
            </div>
          )}

          {(!googleClientId || isDev) && (
            <button
              type="button"
              onClick={handleContinueWithGoogle}
              className="w-full max-w-[320px] flex items-center justify-center gap-3 px-6 py-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover-subtle)] text-[var(--text-primary)] font-bold text-sm cursor-pointer shadow-xs transition-all"
            >
              Continue with Google
            </button>
          )}
        </div>

        {/* Dynamic selector for local dev mode when no clientID is present */}
        {showMockPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20  backdrop-blur-[3px] p-4">
            <div className="w-full max-w-[360px] p-6 relative bg-white  rounded-3xl border border-purple-200/80  shadow-2xl text-left animate-modal-pop">
              <button
                type="button"
                onClick={() => setShowMockPicker(false)}
                className="absolute top-4 right-4 w-7 h-7 rounded-full border-none bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-pointer flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-sm font-extrabold text-[var(--text-primary)] mb-1 tracking-tight">Choose Mock Account</h3>
              <p className="text-[10px] text-[var(--text-muted)] font-medium mb-4">Simulating Google Sign-In for local development</p>

              <div className="space-y-2">
                {[
                  { name: 'Basav', email: 'basav@university.edu', token: 'mock_token_basav' },
                  { name: 'Student Test', email: 'student@university.edu', token: 'mock_token_student' }
                ].map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => handleMockLogin(account.token)}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-[var(--border-default)] hover:border-purple-300  bg-[var(--bg-card)] text-[var(--text-primary)] text-left cursor-pointer transition-colors"
                  >
                    <div>
                      <p className="text-xs font-bold">{account.name}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{account.email}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Printer, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { verifyGoogleToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const googleClientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;

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

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative bg-[#F8F8FC] transition-colors select-none font-sans">
      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-purple-200/20 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] rounded-full bg-indigo-200/20 blur-[130px]" />
      </div>

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-[400px] p-8 sm:p-10 bg-white/80 backdrop-blur-xl rounded-3xl border border-purple-200/60 shadow-2xl text-center space-y-8">
        {/* Campus Print Logo */}
        <div className="space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-500 flex items-center justify-center text-white mx-auto shadow-md shadow-purple-500/25">
            <Printer className="w-7 h-7 animate-pulse-slow" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">Campus Print</h1>
            <p className="text-xs text-[var(--text-muted)] font-medium max-w-[280px] mx-auto leading-relaxed">
              Fast, reliable campus cloud printing for modern institutions.
            </p>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200/50 flex items-start gap-2.5 text-left text-xs text-rose-600 font-semibold">
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

          {googleClientId ? (
            <div className="w-full flex flex-col items-center gap-3 mt-2">
              <div ref={googleButtonRef} className="w-full max-w-[320px] flex justify-center" />
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/50 flex items-start gap-2.5 text-left text-xs text-amber-700 font-semibold">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span>Google Client ID is not configured on this server.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

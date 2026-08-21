import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2 } from 'lucide-react';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url';

// Configure local self-hosted worker for offline and mobile browser compatibility
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

interface PdfFirstPageCanvasProps {
  url: string;
  className?: string;
}

export const PdfFirstPageCanvas: React.FC<PdfFirstPageCanvasProps> = ({ url, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    let renderTask: any = null;
    let loadingTask: any = null;

    async function renderFirstPage() {
      try {
        setLoading(true);
        setError(false);

        const token = localStorage.getItem('studentSessionToken') || sessionStorage.getItem('studentSessionToken');
        const isNetworkUrl = typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/'));

        let pdfData: Uint8Array | null = null;
        try {
          // Read document bytes directly into memory for robust, cross-platform mobile rendering
          const headers: HeadersInit = (isNetworkUrl && token) ? { 'Authorization': `Bearer ${token}` } : {};
          const response = await fetch(url, { headers });
          if (response.ok) {
            const ab = await response.arrayBuffer();
            pdfData = new Uint8Array(ab);
          }
        } catch (fetchErr) {
          console.warn('[PDF PREVIEW] Direct arrayBuffer fetch note, fallback to URL parameter:', fetchErr);
        }

        const docParams: any = pdfData
          ? { data: pdfData, useSystemFonts: true }
          : (isNetworkUrl
              ? { url, httpHeaders: token ? { 'Authorization': `Bearer ${token}` } : {} }
              : { url });

        loadingTask = pdfjsLib.getDocument(docParams);
        const pdf = await loadingTask.promise;
        
        if (!isMounted) return;

        const page = await pdf.getPage(1);
        if (!isMounted || !canvasRef.current) return;

        // Render at 2x scale for crisp non-blurred display on mobile high-DPI screens
        const scale = 2; 
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;

        if (isMounted) {
          setLoading(false);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('PdfFirstPageCanvas rendering error:', err);
          if (isMounted) {
            setError(true);
            setLoading(false);
          }
        }
      }
    }

    if (url) {
      renderFirstPage();
    }

    return () => {
      isMounted = false;
      if (renderTask) {
        try { renderTask.cancel(); } catch (_) {}
      }
      if (loadingTask) {
        try { loadingTask.destroy(); } catch (_) {}
      }
    };
  }, [url]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative flex items-center justify-center overflow-hidden bg-white pointer-events-none select-none ${className || ''}`}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
        </div>
      )}
      {error ? (
        <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400 font-mono text-xs p-4 text-center">
          📄 First Page Preview Ready
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block'
          }}
          className="w-full h-full max-w-full max-h-full object-contain pointer-events-none select-none block"
        />
      )}
    </div>
  );
};

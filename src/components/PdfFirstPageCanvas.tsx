import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2 } from 'lucide-react';

// Configure CDN worker for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

interface PdfFirstPageCanvasProps {
  url: string;
  className?: string;
}

export const PdfFirstPageCanvas: React.FC<PdfFirstPageCanvasProps> = ({ url, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

        loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        
        if (!isMounted) return;

        const page = await pdf.getPage(1);
        if (!isMounted || !canvasRef.current) return;

        // Render at 2x scale for crisp non-blurred display
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
    <div className={`w-full h-full relative flex items-center justify-center overflow-hidden bg-white pointer-events-none select-none ${className || ''}`}>
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
          className="max-w-full max-h-full object-contain pointer-events-none select-none"
        />
      )}
    </div>
  );
};

/**
 * PdfViewer — Visor PDF en cascada para AttachmentViewer.
 *
 * Estrategia:
 *  1. Embed nativo del navegador (<object> + <iframe> con #toolbar).
 *  2. Si el navegador no puede renderizarlo (CSP/headers/extensiones),
 *     se usa pdf.js a través de react-pdf (visor propio, sin servicios externos).
 *  3. Como último recurso, Google Docs Viewer + CTA para abrir/descargar.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut, ExternalLink, Download } from "lucide-react";

// Worker servido por el propio paquete (sin CDN externo).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Stage = "native" | "pdfjs" | "external";

interface PdfViewerProps {
  url: string;
  name?: string | null;
}

export function PdfViewer({ url, name }: PdfViewerProps) {
  const [stage, setStage] = useState<Stage>("native");
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.1);
  const containerRef = useRef<HTMLDivElement>(null);
  const nativeTimeoutRef = useRef<number | null>(null);

  // Si el navegador no logra mostrar el PDF nativo en ~1.5s
  // (típico cuando Storage manda Content-Disposition: attachment),
  // saltamos automáticamente al visor pdf.js.
  useEffect(() => {
    if (stage !== "native") return;
    nativeTimeoutRef.current = window.setTimeout(() => {
      const obj = containerRef.current?.querySelector("object");
      // Si el <object> quedó vacío (sin documento renderizado), fallback.
      if (!obj || !(obj as HTMLObjectElement).contentDocument) {
        setStage((s) => (s === "native" ? "pdfjs" : s));
      }
    }, 1500);
    return () => {
      if (nativeTimeoutRef.current) window.clearTimeout(nativeTimeoutRef.current);
    };
  }, [stage]);

  const onDocLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
  }, []);

  const onDocLoadError = useCallback(() => {
    setStage("external");
  }, []);

  if (stage === "native") {
    return (
      <div ref={containerRef} className="w-full h-full bg-background">
        <object
          data={`${url}#toolbar=1&navpanes=0&view=FitH`}
          type="application/pdf"
          className="w-full h-full"
          aria-label={name ?? "PDF"}
          onError={() => setStage("pdfjs")}
        >
          {/* Si <object> no resuelve, forzamos el fallback inmediato */}
          <FallbackTrigger onFallback={() => setStage("pdfjs")} />
        </object>
      </div>
    );
  }

  if (stage === "pdfjs") {
    return (
      <div className="w-full h-full flex flex-col bg-muted/30">
        {/* Toolbar pdf.js */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-card shrink-0">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              disabled={pageNumber <= 1}
              title="Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums min-w-[64px] text-center">
              {pageNumber} / {numPages || "—"}
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setPageNumber((p) => Math.min(numPages || p, p + 1))}
              disabled={!numPages || pageNumber >= numPages}
              title="Siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => setScale((s) => Math.max(0.5, s - 0.2))} title="Alejar">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button size="icon" variant="ghost" onClick={() => setScale((s) => Math.min(3, s + 0.2))} title="Acercar">
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Documento */}
        <div className="flex-1 min-h-0 overflow-auto flex justify-center py-4">
          <Document
            file={url}
            onLoadSuccess={onDocLoadSuccess}
            onLoadError={onDocLoadError}
            loading={
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-8">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando PDF…
              </div>
            }
            error={
              <div className="p-8 text-sm text-muted-foreground">
                No se pudo cargar el PDF en el visor interno.
              </div>
            }
          >
            {numPages > 0 && (
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderAnnotationLayer
                renderTextLayer
                className="shadow-md bg-white"
              />
            )}
          </Document>
        </div>
      </div>
    );
  }

  // Último recurso: Google Docs + CTAs
  return (
    <div className="w-full h-full flex flex-col bg-background">
      <div className="px-3 py-2 border-b bg-card text-xs text-muted-foreground flex items-center justify-between gap-2 shrink-0">
        <span>Vista previa limitada. Si no se ve correctamente, abrí o descargá el archivo.</span>
        <div className="flex items-center gap-1">
          <Button asChild size="sm" variant="outline">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Abrir
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={url} download={name ?? undefined} target="_blank" rel="noopener noreferrer">
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Descargar
            </a>
          </Button>
        </div>
      </div>
      <iframe
        src={`https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`}
        title={name ?? "PDF"}
        className="w-full flex-1 bg-background"
      />
    </div>
  );
}

/** Helper para disparar fallback desde dentro del <object>. */
function FallbackTrigger({ onFallback }: { onFallback: () => void }) {
  useEffect(() => {
    onFallback();
  }, [onFallback]);
  return null;
}

/**
 * AttachmentViewer — Visor funcional de adjuntos del chat LAT.
 *
 * Abre imágenes, PDFs, videos, audios y documentos genéricos en un modal
 * sin sacar al asesor del flujo de la conversación. Se controla por un
 * CustomEvent global ("lat-open-attachment") para no tener que cablear
 * handlers a través de props y respetar la estructura actual del panel.
 */

import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, X, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { PdfViewer } from "./PdfViewer";

export interface AttachmentPayload {
  url: string;
  name?: string | null;
  type?: string | null;
}

const OPEN_EVENT = "lat-open-attachment";

export function openAttachment(payload: AttachmentPayload) {
  window.dispatchEvent(new CustomEvent<AttachmentPayload>(OPEN_EVENT, { detail: payload }));
}

function detectKind(att: AttachmentPayload): "image" | "pdf" | "video" | "audio" | "office" | "text" | "other" {
  const mime = (att.type ?? "").toLowerCase();
  const name = (att.name ?? "").toLowerCase();
  if (mime.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(name)) return "image";
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (mime.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(name)) return "video";
  if (mime.startsWith("audio/") || /\.(ogg|mp3|m4a|wav|opus|aac)$/i.test(name)) return "audio";
  if (/\.(docx?|xlsx?|pptx?)$/i.test(name) ||
      mime.includes("officedocument") ||
      mime.includes("msword") ||
      mime.includes("excel") ||
      mime.includes("powerpoint")) return "office";
  if (mime.startsWith("text/") || /\.(txt|csv|md|log|json|xml)$/i.test(name)) return "text";
  return "other";
}

export function AttachmentViewer() {
  const [att, setAtt] = useState<AttachmentPayload | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AttachmentPayload>).detail;
      if (!detail?.url) return;
      setAtt(detail);
      setZoom(1);
      setRotate(0);
    };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  const close = useCallback(() => setAtt(null), []);

  if (!att) return null;

  const kind = detectKind(att);
  const displayName = att.name?.trim() || "Adjunto";

  return (
    <Dialog open={!!att} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="max-w-5xl w-[92vw] h-[88vh] p-0 gap-0 overflow-hidden flex flex-col bg-background"
        onInteractOutside={(e) => {
          // Permitir cerrar al hacer click fuera, pero no por accidente sobre la toolbar
          if ((e.target as HTMLElement)?.closest("[data-viewer-toolbar]")) e.preventDefault();
        }}
      >
        {/* Header */}
        <div
          data-viewer-toolbar
          className="flex items-center justify-between gap-2 px-4 py-2.5 border-b bg-card shrink-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <DialogTitle className="text-sm font-medium truncate">{displayName}</DialogTitle>
            {att.type && (
              <span className="text-[11px] text-muted-foreground shrink-0">· {att.type}</span>
            )}
          </div>
          <DialogDescription className="sr-only">
            Visor de adjunto: {displayName}
          </DialogDescription>
          <div className="flex items-center gap-1 shrink-0">
            {kind === "image" && (
              <>
                <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} title="Alejar">
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} title="Acercar">
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setRotate((r) => (r + 90) % 360)} title="Rotar">
                  <RotateCw className="w-4 h-4" />
                </Button>
              </>
            )}
            <Button size="icon" variant="ghost" asChild title="Abrir en pestaña nueva">
              <a href={att.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
            <Button size="icon" variant="ghost" asChild title="Descargar">
              <a href={att.url} download={att.name ?? undefined} target="_blank" rel="noopener noreferrer">
                <Download className="w-4 h-4" />
              </a>
            </Button>
            <Button size="icon" variant="ghost" onClick={close} title="Cerrar">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 bg-muted/20 overflow-auto flex items-center justify-center">
          {kind === "image" && (
            <img
              src={att.url}
              alt={displayName}
              className="max-w-full max-h-full object-contain transition-transform select-none"
              style={{ transform: `scale(${zoom}) rotate(${rotate}deg)` }}
              draggable={false}
            />
          )}

          {kind === "pdf" && (
            <PdfViewer url={att.url} name={displayName} />
          )}

          {kind === "video" && (
            <video
              src={att.url}
              controls
              autoPlay
              className="max-w-full max-h-full bg-black"
            />
          )}

          {kind === "audio" && (
            <div className="flex flex-col items-center gap-4 p-8">
              <FileText className="w-16 h-16 text-muted-foreground" />
              <p className="text-sm font-medium">{displayName}</p>
              <audio src={att.url} controls autoPlay className="w-[420px] max-w-full" />
            </div>
          )}

          {(kind === "text") && (
            <iframe
              src={att.url}
              title={displayName}
              className="w-full h-full bg-background"
            />
          )}

          {(kind === "office" || kind === "other") && (
            <div className="flex flex-col items-center gap-4 p-10 text-center max-w-md">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-10 h-10 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">{displayName}</p>
                {att.type && <p className="text-xs text-muted-foreground mt-1">{att.type}</p>}
              </div>
              <p className="text-xs text-muted-foreground">
                Este tipo de archivo no se puede previsualizar dentro del chat.
                Podés abrirlo en una nueva pestaña o descargarlo.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Button asChild variant="default">
                  <a href={att.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Abrir
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={att.url} download={att.name ?? undefined} target="_blank" rel="noopener noreferrer">
                    <Download className="w-4 h-4 mr-2" />
                    Descargar
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

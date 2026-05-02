import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Bold, Italic, Underline, List, ListOrdered, Link as LinkIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Eraser, Paperclip, X, Send, Loader2, Palette, Highlighter,
  Quote, Indent, Outdent, Undo2, Redo2, Trash2, Image as ImageIcon,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseAddress } from "@/lib/emailUtils";

export interface ComposerInitial {
  reply_type: "reply" | "reply_all" | "forward" | "new";
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body_html: string;
  in_reply_to_message_id?: string | null;
  in_reply_to_email_id?: string | null;
  references?: string | null;
  thread_id?: string | null;
  signature?: string;
}

interface Props {
  conversacionId: string;
  initial: ComposerInitial;
  autorNombre?: string;
  onSent: () => void;
  onDiscard: () => void;
  onChange?: (state: Omit<ComposerInitial, "signature">) => void;
}

const DEFAULT_SIGNATURE = `<br><br>--<br><div style="font-family:Arial,sans-serif;font-size:13px;color:#374151"><b>Equipo Latidos</b><br><span style="color:#6b7280">Tu agencia de viajes 24/7</span></div>`;

const FONTS = [
  { label: "Sans Serif",  value: "Arial, Helvetica, sans-serif" },
  { label: "Serif",       value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace",   value: "'Courier New', monospace" },
  { label: "Arial",       value: "Arial, sans-serif" },
  { label: "Georgia",     value: "Georgia, serif" },
  { label: "Verdana",     value: "Verdana, sans-serif" },
  { label: "Tahoma",      value: "Tahoma, sans-serif" },
  { label: "Trebuchet MS",value: "'Trebuchet MS', sans-serif" },
];

const SIZES = [
  { label: "Pequeño",    value: "1" },
  { label: "Normal",     value: "3" },
  { label: "Grande",     value: "5" },
  { label: "Muy grande", value: "7" },
];

// Gmail-style palette 10×7
const COLOR_PALETTE = [
  "#000000","#434343","#666666","#999999","#b7b7b7","#cccccc","#d9d9d9","#efefef","#f3f3f3","#ffffff",
  "#ff0000","#ff9900","#ffff00","#00ff00","#00ffff","#4a86e8","#0000ff","#9900ff","#ff00ff","#e6b8a2",
  "#dd7e6b","#ea9999","#f9cb9c","#ffe599","#b6d7a8","#a2c4c9","#9fc5e8","#b4a7d6","#d5a6bd","#cc4125",
  "#e06666","#f6b26b","#ffd966","#93c47d","#76a5af","#6fa8dc","#8e7cc3","#c27ba0","#a61c00","#cc0000",
  "#e69138","#f1c232","#6aa84f","#45818e","#3d85c8","#674ea7","#a64d79","#85200c","#990000","#b45f06",
  "#bf9000","#38761d","#134f5c","#1155cc","#351c75","#741b47","#5b0f00","#660000","#783f04","#7f6000",
  "#274e13","#0c343d","#1c4587","#20124d","#4c1130",
];

type SendStatus = "idle" | "sending" | "sent" | "error";

// ── Portal dropdown for font / size ──────────────────────────────────────────
function ToolbarSelect({
  label,
  options,
  width = 140,
  onSelect,
}: {
  label: string;
  options: { label: string; value: string }[];
  width?: number;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen]   = useState(false);
  const [pos, setPos]     = useState({ top: 0, left: 0 });
  const btnRef            = useRef<HTMLButtonElement>(null);
  const idRef             = useRef(`ts-${Math.random()}`);

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!open) {
      window.dispatchEvent(new CustomEvent("toolbar-dropdown-open", { detail: idRef.current }));
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        setPos({ top: r.bottom + 2, left: r.left });
      }
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    const closeOthers = (e: Event) => {
      if ((e as CustomEvent).detail !== idRef.current) setOpen(false);
    };
    window.addEventListener("toolbar-dropdown-open", closeOthers);
    return () => window.removeEventListener("toolbar-dropdown-open", closeOthers);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={handleOpen}
        className="h-7 text-xs bg-background border border-border rounded px-2 flex items-center gap-1 hover:bg-muted cursor-pointer whitespace-nowrap"
        style={{ minWidth: width / 2 }}
      >
        {label}
        <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
      </button>

      {open && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, minWidth: width }}
          className="bg-popover border border-border rounded-lg shadow-xl py-1 text-xs"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="w-full text-left px-3 py-1.5 hover:bg-muted block transition-colors"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={() => { onSelect(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Portal color picker ───────────────────────────────────────────────────────
function ColorPicker({
  icon: Icon,
  title,
  onColor,
}: {
  icon: typeof Palette;
  title: string;
  onColor: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState({ top: 0, left: 0 });
  const btnRef          = useRef<HTMLButtonElement>(null);
  const idRef           = useRef(`cp-${Math.random()}`);

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!open) {
      window.dispatchEvent(new CustomEvent("toolbar-dropdown-open", { detail: idRef.current }));
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        setPos({ top: r.bottom + 2, left: r.left });
      }
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    const closeOthers = (e: Event) => {
      if ((e as CustomEvent).detail !== idRef.current) setOpen(false);
    };
    window.addEventListener("toolbar-dropdown-open", closeOthers);
    return () => window.removeEventListener("toolbar-dropdown-open", closeOthers);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={handleOpen}
        title={title}
        className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted text-foreground/80 hover:text-foreground transition"
      >
        <Icon className="w-3.5 h-3.5" />
      </button>

      {open && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-popover border border-border rounded-lg shadow-xl p-2"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <div className="grid grid-cols-10 gap-[3px]">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                style={{ background: c }}
                className="w-[18px] h-[18px] rounded-sm border border-white/10 hover:scale-110 transition-transform shrink-0"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={() => { onColor(c); setOpen(false); }}
              />
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function EmailComposer({ conversacionId, initial, autorNombre, onSent, onDiscard, onChange }: Props) {
  const editorRef      = useRef<HTMLDivElement>(null);
  const savedRangeRef  = useRef<Range | null>(null);

  const [to, setTo]         = useState(initial.to.join(", "));
  const [cc, setCc]         = useState(initial.cc.join(", "));
  const [bcc, setBcc]       = useState(initial.bcc.join(", "));
  const [showCc, setShowCc] = useState(initial.cc.length > 0 || initial.bcc.length > 0);
  const [subject, setSubject]       = useState(initial.subject);
  const [attachments, setAttachments] = useState<{ name: string; mime: string; size: number; base64: string }[]>([]);
  const [signature]   = useState(initial.signature ?? DEFAULT_SIGNATURE);
  const [status, setStatus] = useState<SendStatus>("idle");
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    setTo(initial.to.join(", "));
    setCc(initial.cc.join(", "));
    setBcc(initial.bcc.join(", "));
    setSubject(initial.subject);
    if (editorRef.current) {
      editorRef.current.innerHTML = (initial.body_html ?? "") + signature;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.in_reply_to_message_id, initial.reply_type]);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (editorRef.current?.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const range = savedRangeRef.current;
    if (!range) { editorRef.current?.focus(); return; }
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  const cmd = useCallback((command: string, value?: string) => {
    restoreSelection();
    document.execCommand(command, false, value);
    saveSelection();
  }, [restoreSelection, saveSelection]);

  const handleInsertLink  = () => { const u = window.prompt("URL del enlace:", "https://"); if (u) cmd("createLink", u); };
  const handleInsertImage = () => { const u = window.prompt("URL de la imagen:", "https://"); if (u) cmd("insertImage", u); };

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const f of Array.from(files)) {
      if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name} excede 10MB`); continue; }
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(String(r.result));
        r.onerror = rej;
        r.readAsDataURL(f);
      });
      setAttachments((prev) => [...prev, { name: f.name, mime: f.type, size: f.size, base64 }]);
    }
    e.target.value = "";
  };

  const removeAttachment = (idx: number) => setAttachments((p) => p.filter((_, i) => i !== idx));

  const parseList = (s: string) =>
    s.split(/[,;]/).map((x) => x.trim()).filter(Boolean).map((x) => parseAddress(x).email);

  const fireChange = () => {
    onChange?.({
      reply_type: initial.reply_type,
      to: parseList(to), cc: parseList(cc), bcc: parseList(bcc),
      subject, body_html: editorRef.current?.innerHTML ?? "",
      in_reply_to_message_id: initial.in_reply_to_message_id,
      in_reply_to_email_id:   initial.in_reply_to_email_id,
      references: initial.references, thread_id: initial.thread_id,
    });
  };

  const handleSend = async () => {
    setError(null);
    const toList = parseList(to);
    if (toList.length === 0) { toast.error("Agrega al menos un destinatario"); return; }
    if (!subject.trim()) { if (!window.confirm("¿Enviar sin asunto?")) return; }
    setStatus("sending");
    try {
      const { data, error } = await (supabase as any).functions.invoke("lat-email-send", {
        body: {
          conversacion_id: conversacionId,
          to: toList, cc: parseList(cc), bcc: parseList(bcc),
          subject,
          body_html:   editorRef.current?.innerHTML ?? "",
          in_reply_to: initial.in_reply_to_email_id,
          references:  initial.references,
          thread_id:   initial.thread_id,
          autor_nombre: autorNombre,
          attachments: attachments.map((a) => ({ name: a.name, mime: a.mime, base64: a.base64 })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setStatus("sent");
      toast.success("Correo enviado");
      onSent();
    } catch (e: any) {
      setStatus("error");
      setError(e.message ?? "Error al enviar");
      toast.error(e.message ?? "Error al enviar");
    }
  };

  return (
    <div className="border-t bg-background flex flex-col overflow-hidden">

      {/* Cabecera */}
      <div className="px-4 py-2 border-b bg-muted/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {initial.reply_type === "reply"     && "Responder"}
            {initial.reply_type === "reply_all" && "Responder a todos"}
            {initial.reply_type === "forward"   && "Reenviar"}
            {initial.reply_type === "new"       && "Nuevo correo"}
          </Badge>
          {status === "sending" && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Enviando…</span>}
          {status === "sent"    && <span className="text-xs text-emerald-600">Enviado</span>}
          {status === "error"   && (
            <span className="text-xs text-destructive inline-flex items-center gap-2">
              {error ?? "Error"}
              <button onClick={handleSend} className="underline">Reintentar</button>
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onDiscard} className="h-7 px-2">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Campos */}
      <div className="px-4 py-2 space-y-1.5 border-b shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground w-12">Para</span>
          <Input value={to} onChange={(e) => { setTo(e.target.value); fireChange(); }} placeholder="correo@ejemplo.com"
            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-sm" />
          {!showCc && (
            <button type="button" onClick={() => setShowCc(true)} className="text-xs text-muted-foreground hover:text-foreground">Cc/Cco</button>
          )}
        </div>
        {showCc && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground w-12">Cc</span>
              <Input value={cc} onChange={(e) => { setCc(e.target.value); fireChange(); }}
                className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground w-12">Cco</span>
              <Input value={bcc} onChange={(e) => { setBcc(e.target.value); fireChange(); }}
                className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-sm" />
            </div>
          </>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground w-12">Asunto</span>
          <Input value={subject} onChange={(e) => { setSubject(e.target.value); fireChange(); }}
            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-sm font-medium" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-3 py-1.5 border-b flex items-center gap-0.5 flex-wrap bg-muted/20 shrink-0">
        <ToolbarBtn onClick={() => cmd("undo")} title="Deshacer"><Undo2 className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("redo")} title="Rehacer"><Redo2 className="w-3.5 h-3.5" /></ToolbarBtn>
        <Sep />

        <ToolbarSelect
          label="Fuente"
          width={160}
          options={FONTS}
          onSelect={(v) => cmd("fontName", v)}
        />
        <ToolbarSelect
          label="Tamaño"
          width={110}
          options={SIZES}
          onSelect={(v) => cmd("fontSize", v)}
        />

        <Sep />
        <ToolbarBtn onClick={() => cmd("bold")}      title="Negrita"><Bold      className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("italic")}    title="Cursiva"><Italic    className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("underline")} title="Subrayado"><Underline className="w-3.5 h-3.5" /></ToolbarBtn>

        <ColorPicker icon={Palette}     title="Color de texto" onColor={(c) => cmd("foreColor", c)} />
        <ColorPicker icon={Highlighter} title="Color de fondo" onColor={(c) => {
          restoreSelection();
          if (!document.execCommand("hiliteColor", false, c)) document.execCommand("backColor", false, c);
          saveSelection();
        }} />

        <Sep />
        <ToolbarBtn onClick={() => cmd("justifyLeft")}   title="Izquierda"><AlignLeft    className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("justifyCenter")} title="Centro"><AlignCenter  className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("justifyRight")}  title="Derecha"><AlignRight   className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("justifyFull")}   title="Justificar"><AlignJustify className="w-3.5 h-3.5" /></ToolbarBtn>

        <Sep />
        <ToolbarBtn onClick={() => cmd("insertUnorderedList")}       title="Viñetas"><List          className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("insertOrderedList")}         title="Numeración"><ListOrdered className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("indent")}                    title="Sangría"><Indent        className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("outdent")}                   title="Quitar sangría"><Outdent className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("formatBlock", "blockquote")} title="Cita"><Quote           className="w-3.5 h-3.5" /></ToolbarBtn>

        <Sep />
        <ToolbarBtn onClick={handleInsertLink}         title="Enlace"><LinkIcon  className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={handleInsertImage}        title="Imagen"><ImageIcon className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("removeFormat")} title="Quitar formato"><Eraser className="w-3.5 h-3.5" /></ToolbarBtn>

        <Sep />
        <label onMouseDown={(e) => e.preventDefault()}
          className="h-7 px-2 inline-flex items-center gap-1 text-xs cursor-pointer rounded hover:bg-muted">
          <Paperclip className="w-3.5 h-3.5" /> Adjuntar
          <input type="file" multiple onChange={handleAttach} className="hidden" />
        </label>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={fireChange}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onBlur={saveSelection}
        className="px-4 py-3 flex-1 min-h-[100px] max-h-[220px] overflow-y-auto text-sm focus:outline-none [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_img]:max-w-full [&_img]:h-auto [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5"
        data-placeholder="Escribe tu respuesta por correo..."
      />

      {/* Adjuntos */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 border-t flex flex-wrap gap-2 bg-muted/20 shrink-0">
          {attachments.map((a, i) => (
            <Badge key={i} variant="secondary" className="gap-1.5 pr-1">
              <Paperclip className="w-3 h-3" />
              <span className="text-xs">{a.name}</span>
              <span className="text-[10px] text-muted-foreground">{(a.size / 1024).toFixed(0)}KB</span>
              <button onClick={() => removeAttachment(i)} className="hover:bg-muted-foreground/20 rounded p-0.5">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t flex items-center justify-between bg-muted/30 shrink-0">
        <div className="text-[11px] text-muted-foreground">
          {status === "sending" ? "Enviando…" : "Borrador autoguardado"}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onDiscard} className="h-8">
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Descartar
          </Button>
          <Button onClick={handleSend} disabled={status === "sending"} size="sm" className="h-8">
            {status === "sending"
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Send    className="w-3.5 h-3.5 mr-1.5" />}
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted text-foreground/80 hover:text-foreground transition"
    >
      {children}
    </button>
  );
}

function Sep() { return <div className="w-px h-5 bg-border mx-1" />; }

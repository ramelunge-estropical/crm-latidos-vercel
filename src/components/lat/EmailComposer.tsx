import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Bold, Italic, Underline, List, ListOrdered, Link as LinkIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Eraser, Paperclip, X, Send, Loader2, Palette, Highlighter,
  Quote, Indent, Outdent, Undo2, Redo2, Trash2, Image as ImageIcon,
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
  { label: "Sans Serif", value: "Arial, Helvetica, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", value: "'Courier New', monospace" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Tahoma", value: "Tahoma, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
];

const SIZES = [
  { label: "Pequeño", value: "2" },
  { label: "Normal", value: "3" },
  { label: "Grande", value: "5" },
  { label: "Muy grande", value: "6" },
];

type SendStatus = "idle" | "sending" | "sent" | "error";

export function EmailComposer({ conversacionId, initial, autorNombre, onSent, onDiscard, onChange }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);

  const [to, setTo] = useState(initial.to.join(", "));
  const [cc, setCc] = useState(initial.cc.join(", "));
  const [bcc, setBcc] = useState(initial.bcc.join(", "));
  const [showCc, setShowCc] = useState(initial.cc.length > 0 || initial.bcc.length > 0);
  const [subject, setSubject] = useState(initial.subject);
  const [attachments, setAttachments] = useState<{ name: string; mime: string; size: number; base64: string }[]>([]);
  const [signature] = useState(initial.signature ?? DEFAULT_SIGNATURE);
  const [status, setStatus] = useState<SendStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Inicializar editor solo cuando cambia el hilo o el tipo de respuesta
  useEffect(() => {
    setTo(initial.to.join(", "));
    setCc(initial.cc.join(", "));
    setBcc(initial.bcc.join(", "));
    setSubject(initial.subject);
    if (editorRef.current) {
      const initBody = initial.body_html ?? "";
      editorRef.current.innerHTML = initBody + signature;
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
    if (!range) {
      editorRef.current?.focus();
      return;
    }
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

  const handleInsertLink = () => {
    const url = window.prompt("URL del enlace:", "https://");
    if (url) cmd("createLink", url);
  };

  const handleInsertImage = () => {
    const url = window.prompt("URL de la imagen:", "https://");
    if (url) cmd("insertImage", url);
  };

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const f of Array.from(files)) {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name} excede 10MB`);
        continue;
      }
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
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
      in_reply_to_email_id: initial.in_reply_to_email_id,
      references: initial.references, thread_id: initial.thread_id,
    });
  };

  const handleSend = async () => {
    setError(null);
    const toList = parseList(to);
    if (toList.length === 0) { toast.error("Agrega al menos un destinatario"); return; }
    if (!subject.trim()) {
      const ok = window.confirm("¿Enviar sin asunto?");
      if (!ok) return;
    }
    setStatus("sending");
    try {
      const { data, error } = await (supabase as any).functions.invoke("lat-email-send", {
        body: {
          conversacion_id: conversacionId,
          to: toList,
          cc: parseList(cc),
          bcc: parseList(bcc),
          subject,
          body_html: editorRef.current?.innerHTML ?? "",
          in_reply_to: initial.in_reply_to_email_id,
          references: initial.references,
          thread_id: initial.thread_id,
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
    <div className="border-t bg-background">
      {/* Cabecera */}
      <div className="px-4 py-2 border-b bg-muted/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {initial.reply_type === "reply" && "Responder"}
            {initial.reply_type === "reply_all" && "Responder a todos"}
            {initial.reply_type === "forward" && "Reenviar"}
            {initial.reply_type === "new" && "Nuevo correo"}
          </Badge>
          {status === "sending" && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Enviando…</span>}
          {status === "sent" && <span className="text-xs text-emerald-600">Enviado</span>}
          {status === "error" && (
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
      <div className="px-4 py-2 space-y-1.5 border-b">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground w-12">Para</span>
          <Input value={to} onChange={(e) => { setTo(e.target.value); fireChange(); }} placeholder="correo@ejemplo.com"
            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-sm" />
          {!showCc && (
            <button type="button" onClick={() => setShowCc(true)} className="text-xs text-muted-foreground hover:text-foreground">
              Cc/Cco
            </button>
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
      <div
        className="px-3 py-1.5 border-b flex items-center gap-0.5 flex-wrap bg-muted/20"
        onMouseDown={(e) => {
          if (e.target !== e.currentTarget) e.preventDefault();
        }}
      >
        <ToolbarBtn onClick={() => cmd("undo")} title="Deshacer"><Undo2 className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("redo")} title="Rehacer"><Redo2 className="w-3.5 h-3.5" /></ToolbarBtn>
        <Sep />

        <select
          onMouseDown={saveSelection}
          onChange={(e) => { cmd("fontName", e.target.value); e.currentTarget.selectedIndex = 0; }}
          defaultValue=""
          className="h-7 text-xs bg-transparent border rounded px-1 max-w-[110px]"
          title="Fuente"
        >
          <option value="" disabled>Fuente</option>
          {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        <select
          onMouseDown={saveSelection}
          onChange={(e) => { cmd("fontSize", e.target.value); e.currentTarget.selectedIndex = 0; }}
          defaultValue=""
          className="h-7 text-xs bg-transparent border rounded px-1"
          title="Tamaño"
        >
          <option value="" disabled>Tamaño</option>
          {SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <Sep />
        <ToolbarBtn onClick={() => cmd("bold")} title="Negrita"><Bold className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("italic")} title="Cursiva"><Italic className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("underline")} title="Subrayado"><Underline className="w-3.5 h-3.5" /></ToolbarBtn>

        <label
          onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
          className="h-7 px-1 inline-flex items-center cursor-pointer rounded hover:bg-muted"
          title="Color de texto"
        >
          <Palette className="w-3.5 h-3.5" />
          <input type="color" onChange={(e) => cmd("foreColor", e.target.value)} className="w-0 h-0 opacity-0" />
        </label>
        <label
          onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
          className="h-7 px-1 inline-flex items-center cursor-pointer rounded hover:bg-muted"
          title="Color de fondo"
        >
          <Highlighter className="w-3.5 h-3.5" />
          <input
            type="color"
            onChange={(e) => {
              if (!document.execCommand("hiliteColor", false, e.target.value)) {
                cmd("backColor", e.target.value);
              } else {
                saveSelection();
              }
            }}
            className="w-0 h-0 opacity-0"
          />
        </label>

        <Sep />
        <ToolbarBtn onClick={() => cmd("justifyLeft")} title="Izquierda"><AlignLeft className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("justifyCenter")} title="Centro"><AlignCenter className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("justifyRight")} title="Derecha"><AlignRight className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("justifyFull")} title="Justificar"><AlignJustify className="w-3.5 h-3.5" /></ToolbarBtn>

        <Sep />
        <ToolbarBtn onClick={() => cmd("insertUnorderedList")} title="Viñetas"><List className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("insertOrderedList")} title="Numeración"><ListOrdered className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("indent")} title="Sangría"><Indent className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("outdent")} title="Quitar sangría"><Outdent className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("formatBlock", "blockquote")} title="Cita"><Quote className="w-3.5 h-3.5" /></ToolbarBtn>

        <Sep />
        <ToolbarBtn onClick={handleInsertLink} title="Enlace"><LinkIcon className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={handleInsertImage} title="Insertar imagen"><ImageIcon className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => cmd("removeFormat")} title="Quitar formato"><Eraser className="w-3.5 h-3.5" /></ToolbarBtn>

        <Sep />
        <label
          onMouseDown={(e) => e.preventDefault()}
          className="h-7 px-2 inline-flex items-center gap-1 text-xs cursor-pointer rounded hover:bg-muted"
        >
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
        className="px-4 py-3 min-h-[180px] max-h-[320px] overflow-y-auto text-sm focus:outline-none [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_img]:max-w-full [&_img]:h-auto [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5"
        data-placeholder="Escribe tu respuesta por correo..."
      />

      {/* Adjuntos */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 border-t flex flex-wrap gap-2 bg-muted/20">
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
      <div className="px-4 py-2 border-t flex items-center justify-between bg-muted/30">
        <div className="text-[11px] text-muted-foreground">
          {status === "sending" ? "Enviando…" : "Borrador autoguardado"}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onDiscard} className="h-8">
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Descartar
          </Button>
          <Button onClick={handleSend} disabled={status === "sending"} size="sm" className="h-8">
            {status === "sending" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
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

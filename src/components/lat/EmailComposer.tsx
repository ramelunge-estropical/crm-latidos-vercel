import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bold, Italic, Underline, List, ListOrdered, Link as LinkIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Eraser, Paperclip, X, Send, Loader2, Palette, Highlighter,
  Quote, Indent, Outdent, Undo2, Redo2, Trash2, Image as ImageIcon,
  ChevronDown, SpellCheck2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RecipientInput, type RecipientTag } from "@/components/lat/RecipientInput";

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
  isDraft?: boolean; // true cuando se restaura desde borrador guardado (firma ya incluida)
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

interface SpellMatch {
  offset: number;
  length: number;
  message: string;
  replacements: { value: string }[];
}

interface SpellPopup {
  x: number;
  y: number;
  suggestions: string[];
  message: string;
  spanEl: HTMLElement;
}

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

// Convert "Name <email>" or plain "email" string to RecipientTag
function strToTag(s: string): RecipientTag {
  const trimmed = s.trim();
  const m = trimmed.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
  const name  = m ? m[1].trim() || undefined : undefined;
  const email = (m ? m[2] : trimmed).trim().toLowerCase();
  return { name, email, valid: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) };
}

export function EmailComposer({ conversacionId, initial, autorNombre, onSent, onDiscard, onChange }: Props) {
  const editorRef      = useRef<HTMLDivElement>(null);
  const savedRangeRef  = useRef<Range | null>(null);
  // isDirtyRef: prevents saving draft before user has actually made a change.
  // Starts true when restoring a draft (it already exists in DB, any edit should update it).
  const isDirtyRef     = useRef(initial.isDraft === true);

  const [to, setTo]         = useState<RecipientTag[]>(() => initial.to.map(strToTag));
  const [cc, setCc]         = useState<RecipientTag[]>(() => initial.cc.map(strToTag));
  const [bcc, setBcc]       = useState<RecipientTag[]>(() => initial.bcc.map(strToTag));
  const [showCc, setShowCc] = useState(initial.cc.length > 0 || initial.bcc.length > 0);
  const [subject, setSubject]       = useState(initial.subject);
  const [attachments, setAttachments] = useState<{ name: string; mime: string; size: number; base64: string }[]>([]);
  const [signature]   = useState(initial.signature ?? DEFAULT_SIGNATURE);
  const [status, setStatus] = useState<SendStatus>("idle");
  const [error, setError]   = useState<string | null>(null);

  const [spellChecking, setSpellChecking] = useState(false);
  const [spellActive, setSpellActive]     = useState(false);
  const [spellPopup, setSpellPopup]       = useState<SpellPopup | null>(null);
  const [imgToolbar, setImgToolbar]       = useState<{ el: HTMLImageElement; x: number; y: number } | null>(null);

  useEffect(() => {
    setTo(initial.to.map(strToTag));
    setCc(initial.cc.map(strToTag));
    setBcc(initial.bcc.map(strToTag));
    setSubject(initial.subject);
    isDirtyRef.current = initial.isDraft === true;
    if (editorRef.current) {
      // isDraft = el borrador ya incluye la firma; no agregar de nuevo
      editorRef.current.innerHTML = (initial.body_html ?? "") + (initial.isDraft ? "" : signature);
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

  // ── Spell check ──────────────────────────────────────────────────────────
  const clearSpellHighlights = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.querySelectorAll("[data-spell-error]").forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });
    editorRef.current.normalize();
  }, []);

  const applySpellHighlights = useCallback((matches: SpellMatch[], fullText: string) => {
    if (!editorRef.current) return;
    clearSpellHighlights();
    if (matches.length === 0) return;

    // Deduplicate by word — highlight every occurrence of each misspelled word
    const wordMap = new Map<string, SpellMatch>();
    for (const m of matches) {
      const word = fullText.slice(m.offset, m.offset + m.length);
      if (word && !wordMap.has(word)) wordMap.set(word, m);
    }

    wordMap.forEach((match, word) => {
      const suggestions = match.replacements.slice(0, 5).map((r) => r.value);
      const walker = document.createTreeWalker(editorRef.current!, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      let n: Node | null;
      while ((n = walker.nextNode())) {
        if ((n.textContent ?? "").includes(word)) textNodes.push(n as Text);
      }
      // Process in reverse DOM order so we don't shift positions
      for (const textNode of textNodes.reverse()) {
        let remaining: Text = textNode;
        let idx: number;
        while ((idx = (remaining.textContent ?? "").indexOf(word)) !== -1) {
          const span = document.createElement("span");
          span.setAttribute("data-spell-error", "1");
          span.dataset.suggestions = suggestions.join("|");
          span.dataset.message = match.message;
          span.style.textDecoration = "underline";
          span.style.textDecorationColor = "#ef4444";
          span.style.textDecorationStyle = "wavy";
          span.style.cursor = "pointer";
          const mid = remaining.splitText(idx);
          remaining = mid.splitText(word.length);
          span.textContent = mid.textContent;
          mid.parentNode?.replaceChild(span, mid);
        }
      }
    });
  }, [clearSpellHighlights]);

  const runSpellCheck = useCallback(async () => {
    if (!editorRef.current || spellChecking) return;
    if (spellActive) {
      clearSpellHighlights();
      setSpellActive(false);
      setSpellPopup(null);
      return;
    }
    const text = editorRef.current.innerText.trim();
    if (!text) return;
    setSpellChecking(true);
    try {
      const res = await fetch("https://api.languagetool.org/v2/check", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ text, language: "es", enabledOnly: "false" }),
      });
      const data = await res.json();
      const matches: SpellMatch[] = (data.matches ?? []).filter(
        (m: any) => m.rule?.issueType === "misspelling" || m.rule?.category?.id === "TYPOS",
      );
      if (matches.length === 0) {
        toast.success("Sin errores ortográficos");
      } else {
        applySpellHighlights(matches, text);
        setSpellActive(true);
        toast.info(`${matches.length} error${matches.length !== 1 ? "es" : ""} encontrado${matches.length !== 1 ? "s" : ""}`);
      }
    } catch {
      toast.error("Error al verificar ortografía");
    } finally {
      setSpellChecking(false);
    }
  }, [spellChecking, spellActive, clearSpellHighlights, applySpellHighlights]);

  const handleEditorClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Click en imagen → mostrar toolbar de tamaño
    if (target.tagName === "IMG") {
      const img = target as HTMLImageElement;
      const rect = img.getBoundingClientRect();
      setImgToolbar({ el: img, x: rect.left, y: rect.bottom + 6 });
      setSpellPopup(null);
      return;
    }
    setImgToolbar(null);

    if (target.getAttribute("data-spell-error") === "1") {
      const rect = target.getBoundingClientRect();
      setSpellPopup({
        x: rect.left,
        y: rect.bottom + 6,
        suggestions: target.dataset.suggestions?.split("|").filter(Boolean) ?? [],
        message: target.dataset.message ?? "",
        spanEl: target,
      });
    } else {
      setSpellPopup(null);
    }
    saveSelection();
  }, [saveSelection]);

  // Close spell popup on outside click
  useEffect(() => {
    if (!spellPopup) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-spell-popup]")) setSpellPopup(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [spellPopup]);

  // Close image toolbar on outside click
  useEffect(() => {
    if (!imgToolbar) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-img-toolbar]") && t !== imgToolbar.el) setImgToolbar(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [imgToolbar]);

  // Clear highlights when user starts typing
  const handleEditorInput = useCallback(() => {
    isDirtyRef.current = true;
    if (spellActive) { clearSpellHighlights(); setSpellActive(false); setSpellPopup(null); }
    fireChange();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spellActive, clearSpellHighlights]);

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

  // Convert tags to "Name <email>" strings for storage; use .email only for sending
  const tagsToStrings = (arr: RecipientTag[]) =>
    arr.map(t => t.name ? `${t.name} <${t.email}>` : t.email);
  const tagsToEmails = (arr: RecipientTag[]) =>
    arr.map(t => t.email).filter(Boolean);

  // Call onChange (→ saveDebounced in parent) only when user has made at least one change
  const fireChange = (overrides?: { to?: RecipientTag[]; cc?: RecipientTag[]; bcc?: RecipientTag[]; subject?: string }) => {
    if (!isDirtyRef.current) return;
    onChange?.({
      reply_type: initial.reply_type,
      to:  tagsToStrings(overrides?.to  ?? to),
      cc:  tagsToStrings(overrides?.cc  ?? cc),
      bcc: tagsToStrings(overrides?.bcc ?? bcc),
      subject: overrides?.subject ?? subject,
      body_html: editorRef.current?.innerHTML ?? "",
      in_reply_to_message_id: initial.in_reply_to_message_id,
      in_reply_to_email_id:   initial.in_reply_to_email_id,
      references: initial.references, thread_id: initial.thread_id,
    });
  };

  const handleSend = async () => {
    setError(null);
    const toList = tagsToEmails(to);
    if (toList.length === 0) { toast.error("Agrega al menos un destinatario"); return; }
    if (!to.every(t => t.valid)) {
      if (!window.confirm("Hay direcciones inválidas en Para. ¿Enviar de todas formas?")) return;
    }
    if (!subject.trim()) { if (!window.confirm("¿Enviar sin asunto?")) return; }
    setStatus("sending");
    try {
      const { data, error } = await (supabase as any).functions.invoke("lat-email-send", {
        body: {
          conversacion_id: conversacionId,
          to: toList, cc: tagsToEmails(cc), bcc: tagsToEmails(bcc),
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
    <div className="bg-background flex flex-col">

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
      <div className="px-4 py-2 space-y-1 border-b shrink-0">
        <div className="flex items-start gap-2 min-h-[32px]">
          <span className="text-xs font-medium text-muted-foreground w-12 pt-1.5 shrink-0">Para</span>
          <div className="flex-1">
            <RecipientInput
              tags={to}
              onChange={(newTags) => {
                isDirtyRef.current = true;
                setTo(newTags);
                fireChange({ to: newTags });
              }}
              placeholder="correo@ejemplo.com"
            />
          </div>
          {!showCc && (
            <button type="button" onClick={() => setShowCc(true)} className="text-xs text-muted-foreground hover:text-foreground pt-1.5 shrink-0">Cc/Cco</button>
          )}
        </div>
        {showCc && (
          <>
            <div className="flex items-start gap-2 min-h-[32px]">
              <span className="text-xs font-medium text-muted-foreground w-12 pt-1.5 shrink-0">Cc</span>
              <div className="flex-1">
                <RecipientInput
                  tags={cc}
                  onChange={(newTags) => {
                    isDirtyRef.current = true;
                    setCc(newTags);
                    fireChange({ cc: newTags });
                  }}
                  placeholder="correo@ejemplo.com"
                />
              </div>
            </div>
            <div className="flex items-start gap-2 min-h-[32px]">
              <span className="text-xs font-medium text-muted-foreground w-12 pt-1.5 shrink-0">Cco</span>
              <div className="flex-1">
                <RecipientInput
                  tags={bcc}
                  onChange={(newTags) => {
                    isDirtyRef.current = true;
                    setBcc(newTags);
                    fireChange({ bcc: newTags });
                  }}
                  placeholder="correo@ejemplo.com"
                />
              </div>
            </div>
          </>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground w-12 shrink-0">Asunto</span>
          <input
            value={subject}
            onChange={(e) => {
              isDirtyRef.current = true;
              setSubject(e.target.value);
              fireChange({ subject: e.target.value });
            }}
            placeholder="Asunto del correo"
            className="flex-1 text-sm font-medium bg-transparent border-0 outline-none placeholder:text-muted-foreground/60 h-8"
          />
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

        <Sep />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={runSpellCheck}
          title={spellActive ? "Desactivar corrector" : "Revisar ortografía"}
          className={`h-7 px-2 inline-flex items-center gap-1 text-xs rounded transition ${
            spellActive
              ? "bg-primary/15 text-primary hover:bg-primary/25"
              : "hover:bg-muted text-foreground/80 hover:text-foreground"
          }`}
        >
          {spellChecking
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <SpellCheck2 className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Ortografía</span>
        </button>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleEditorInput}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onBlur={saveSelection}
        onClick={handleEditorClick}
        className="px-4 py-3 min-h-[120px] max-h-[260px] overflow-y-auto text-sm focus:outline-none [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_img]:max-w-full [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5"
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

      {/* Spell popup */}
      {spellPopup && createPortal(
        <div
          data-spell-popup="1"
          style={{ position: "fixed", top: spellPopup.y, left: spellPopup.x, zIndex: 9999 }}
          className="bg-popover border border-border rounded-lg shadow-xl px-2 py-1.5 flex items-center gap-1.5 flex-wrap max-w-[300px]"
          onMouseDown={(e) => e.preventDefault()}
        >
          {spellPopup.suggestions.length > 0 ? (
            spellPopup.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  const span = spellPopup.spanEl;
                  const text = document.createTextNode(s);
                  span.parentNode?.replaceChild(text, span);
                  editorRef.current?.normalize();
                  setSpellPopup(null);
                  fireChange();
                }}
                className="px-2.5 py-0.5 bg-primary/10 text-primary text-xs rounded-full hover:bg-primary/20 transition-colors font-medium"
              >
                {s}
              </button>
            ))
          ) : (
            <span className="text-xs text-muted-foreground italic">Sin sugerencias</span>
          )}
          <button
            type="button"
            title="Ignorar"
            onClick={() => {
              const span = spellPopup.spanEl;
              const text = document.createTextNode(span.textContent ?? "");
              span.parentNode?.replaceChild(text, span);
              editorRef.current?.normalize();
              setSpellPopup(null);
            }}
            className="ml-1 p-0.5 rounded hover:bg-muted transition-colors"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>,
        document.body,
      )}

      {/* Toolbar de tamaño de imagen (aparece al hacer clic en una imagen) */}
      {imgToolbar && createPortal(
        <div
          data-img-toolbar="1"
          style={{ position: "fixed", top: imgToolbar.y, left: imgToolbar.x, zIndex: 9999 }}
          className="bg-background border rounded-lg shadow-lg flex items-center gap-1 px-2 py-1.5 text-xs"
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="text-muted-foreground pr-1 font-medium">Tamaño:</span>
          {([
            ["Pequeño",  "150px"],
            ["Mediano",  "300px"],
            ["Grande",   "500px"],
            ["Original", ""],
          ] as [string, string][]).map(([label, w]) => (
            <button
              key={label}
              className="px-2 py-0.5 rounded hover:bg-muted transition text-xs font-medium"
              onMouseDown={(e) => {
                e.preventDefault();
                if (w) {
                  imgToolbar.el.style.width = w;
                  imgToolbar.el.style.height = "auto";
                  imgToolbar.el.removeAttribute("height");
                } else {
                  imgToolbar.el.style.width = "";
                  imgToolbar.el.style.height = "";
                  imgToolbar.el.removeAttribute("width");
                  imgToolbar.el.removeAttribute("height");
                }
                fireChange();
                setImgToolbar(null);
              }}
            >
              {label}
            </button>
          ))}
          <button
            className="ml-1 p-0.5 rounded hover:bg-muted text-muted-foreground"
            onMouseDown={(e) => { e.preventDefault(); setImgToolbar(null); }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>,
        document.body,
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

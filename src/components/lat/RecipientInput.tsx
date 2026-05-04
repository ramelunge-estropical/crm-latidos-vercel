import { useState, useRef, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface RecipientTag {
  name?: string;
  email: string;
  valid: boolean;
}

interface Props {
  tags: RecipientTag[];
  onChange: (tags: RecipientTag[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function parseRaw(raw: string): RecipientTag {
  const trimmed = raw.trim();
  const m = trimmed.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
  const name = m ? m[1].trim() || undefined : undefined;
  const email = (m ? m[2] : trimmed).trim().toLowerCase();
  return { name, email, valid: EMAIL_RE.test(email) };
}

function tagLabel(t: RecipientTag): string {
  return t.name ? `${t.name}` : t.email;
}

export function RecipientInput({ tags, onChange, placeholder = "Agregar", disabled }: Props) {
  const [input, setInput]           = useState("");
  const [suggestions, setSuggestions] = useState<{ name: string; email: string }[]>([]);
  const [showSugg, setShowSugg]     = useState(false);
  const [activeSugg, setActiveSugg] = useState(-1);
  const inputRef   = useRef<HTMLInputElement>(null);
  const suggTimer  = useRef<number | null>(null);

  const commitInput = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/[,;\n\r]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const newTags: RecipientTag[] = [];
    for (const p of parts) {
      const tag = parseRaw(p);
      if (tag.email && !tags.some(t => t.email === tag.email) && !newTags.some(t => t.email === tag.email)) {
        newTags.push(tag);
      }
    }
    if (newTags.length > 0) onChange([...tags, ...newTags]);
    setInput("");
    setShowSugg(false);
  }, [tags, onChange]);

  const removeTag = useCallback((idx: number) => {
    onChange(tags.filter((_, i) => i !== idx));
    inputRef.current?.focus();
  }, [tags, onChange]);

  const addSuggestion = useCallback((s: { name: string; email: string }) => {
    if (!tags.some(t => t.email === s.email)) {
      onChange([...tags, { name: s.name || undefined, email: s.email, valid: true }]);
    }
    setInput("");
    setShowSugg(false);
    setActiveSugg(-1);
    inputRef.current?.focus();
  }, [tags, onChange]);

  // Debounced autocomplete from clientes table
  useEffect(() => {
    if (suggTimer.current) window.clearTimeout(suggTimer.current);
    if (input.length < 2) { setSuggestions([]); setShowSugg(false); return; }
    suggTimer.current = window.setTimeout(async () => {
      const { data } = await (supabase as any)
        .from("clientes")
        .select("nombre_completo, email, email_secundario")
        .or(`nombre_completo.ilike.%${input}%,email.ilike.%${input}%,email_secundario.ilike.%${input}%`)
        .limit(8);
      if (!data) return;
      const results: { name: string; email: string }[] = [];
      for (const c of data) {
        if (c.email) results.push({ name: c.nombre_completo ?? "", email: c.email });
        if (c.email_secundario) results.push({ name: c.nombre_completo ?? "", email: c.email_secundario });
      }
      const filtered = results.filter(r => r.email && !tags.some(t => t.email === r.email));
      setSuggestions(filtered);
      setShowSugg(filtered.length > 0);
      setActiveSugg(-1);
    }, 250);
    return () => { if (suggTimer.current) window.clearTimeout(suggTimer.current); };
  }, [input, tags]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSugg && suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveSugg(i => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActiveSugg(i => Math.max(i - 1, -1)); return; }
      if ((e.key === "Enter" || e.key === "Tab") && activeSugg >= 0) {
        e.preventDefault();
        addSuggestion(suggestions[activeSugg]);
        return;
      }
    }
    if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
      if (input.trim()) { e.preventDefault(); commitInput(input); }
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    } else if (e.key === "Escape") {
      setShowSugg(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (/[,;\n\r]/.test(text) || (text.includes(" ") && text.includes("@"))) {
      e.preventDefault();
      commitInput(text);
    }
  };

  const handleBlur = () => {
    // Delay to allow suggestion click to fire first
    setTimeout(() => {
      if (input.trim()) commitInput(input);
      setShowSugg(false);
    }, 150);
  };

  return (
    <div
      className="flex flex-wrap gap-1 min-h-[32px] cursor-text relative"
      onClick={() => !disabled && inputRef.current?.focus()}
    >
      {tags.map((tag, i) => (
        <span
          key={i}
          title={tag.email}
          className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium max-w-[200px] ${
            tag.valid
              ? "bg-primary/10 text-primary border border-primary/20"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}
        >
          <span className="truncate">{tagLabel(tag)}</span>
          {!disabled && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); removeTag(i); }}
              className="shrink-0 rounded-full hover:bg-black/10 p-0.5"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </span>
      ))}

      {!disabled && (
        <div className="relative flex-1 min-w-[120px]">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={handleBlur}
            onFocus={() => input.length >= 2 && suggestions.length > 0 && setShowSugg(true)}
            placeholder={tags.length === 0 ? placeholder : ""}
            className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/60 h-7 px-0"
          />

          {showSugg && suggestions.length > 0 && (
            <div className="absolute top-full left-0 z-[9999] bg-popover border border-border rounded-lg shadow-xl mt-0.5 min-w-[260px] max-h-[220px] overflow-y-auto">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className={`w-full text-left px-3 py-2 flex flex-col transition-colors ${activeSugg === i ? "bg-muted" : "hover:bg-muted/60"}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addSuggestion(s)}
                >
                  {s.name && <span className="text-sm font-medium text-foreground leading-tight">{s.name}</span>}
                  <span className="text-xs text-muted-foreground">{s.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

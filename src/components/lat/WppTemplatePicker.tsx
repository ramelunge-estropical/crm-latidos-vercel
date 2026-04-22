import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Sparkles, Send, X, Search, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/** Normaliza un nombre de plantilla para comparar (minúsculas, sin separadores). */
function normalizeName(s: string): string {
  return (s ?? '').toLowerCase().trim().replace(/[\s_\-.]+/g, '');
}

/** Busca la plantilla que mejor coincide con `suggestedName` devuelto por la IA. */
function resolveSuggestedTemplate(
  suggestedName: string,
  templates: WppTemplate[],
): WppTemplate | null {
  if (!suggestedName) return null;
  const target = normalizeName(suggestedName);
  // 1) match exacto por name
  let tpl = templates.find(t => t.name === suggestedName);
  if (tpl) return tpl;
  // 2) case-insensitive
  tpl = templates.find(t => t.name.toLowerCase() === suggestedName.toLowerCase());
  if (tpl) return tpl;
  // 3) normalizado (sin guiones/underscores/espacios)
  tpl = templates.find(t => normalizeName(t.name) === target);
  if (tpl) return tpl;
  // 4) match por id (por si la IA devuelve un UUID)
  tpl = templates.find(t => t.id === suggestedName);
  if (tpl) return tpl;
  // 5) contains
  tpl = templates.find(t => normalizeName(t.name).includes(target) || target.includes(normalizeName(t.name)));
  return tpl ?? null;
}

/** Normaliza el objeto de variables devuelto por la IA: quita `{{}}` de las claves. */
function normalizeAiVariables(raw: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).replace(/[{}\s]/g, '');
    if (!key) continue;
    out[key] = v == null ? '' : String(v);
  }
  return out;
}

export interface WppTemplate {
  id: string;
  name: string;
  category: string | null;
  language: string;
  status: string;
  body: string;
  variables: string[];
  example?: any;
  buttons?: any;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversacionId: string;
  /** Nombre del cliente para sugerencias contextuales */
  clienteNombre?: string;
  /** Callback al enviar; recibe template + valores y devuelve true si se envió OK */
  onSend: (params: {
    template: WppTemplate;
    variables: string[];
    bodyPreview: string;
  }) => Promise<boolean>;
}

function fillBody(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[n] ?? `{{${n}}}`);
}

export function WppTemplatePicker({ open, onOpenChange, conversacionId, onSend }: Props) {
  const [search, setSearch]               = useState('');
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [varsByTpl, setVarsByTpl]         = useState<Record<string, Record<string, string>>>({});
  const [sending, setSending]             = useState(false);
  const [aiLoading, setAiLoading]         = useState(false);
  const [aiReason, setAiReason]           = useState<string | null>(null);
  const [aiSuggestedId, setAiSuggestedId] = useState<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const { data, isLoading, error, refetch } = useQuery<{ templates: WppTemplate[] }>({
    queryKey: ['gupshup-templates'],
    queryFn: async () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gupshup-templates`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `Error ${res.status}`);
      }
      return res.json();
    },
    enabled: open,
    staleTime: 60_000,
  });

  const templates = data?.templates ?? [];

  const filtered = useMemo(() => {
    if (!search) return templates;
    const q = search.toLowerCase();
    return templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.body.toLowerCase().includes(q) ||
      (t.category ?? '').toLowerCase().includes(q),
    );
  }, [templates, search]);

  const selected = templates.find(t => t.id === selectedId) ?? null;
  const currentVars = selected ? (varsByTpl[selected.id] ?? {}) : {};
  const preview = selected ? fillBody(selected.body, currentVars) : '';
  const allVarsFilled = !selected || selected.variables.every(v => currentVars[v]?.trim());

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setSearch('');
      setAiReason(null);
      setAiSuggestedId(null);
    }
  }, [open]);

  // Auto-scroll a la plantilla seleccionada (especialmente útil tras "Sugerir IA")
  useEffect(() => {
    if (!selectedId) return;
    const el = itemRefs.current[selectedId];
    if (el) {
      try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch { /* */ }
    }
  }, [selectedId]);

  const handleAiSuggest = async () => {
    if (templates.length === 0) {
      toast.error('No hay plantillas disponibles para sugerir');
      return;
    }
    setAiLoading(true);
    setAiReason(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wpp-template-suggest`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          conversacion_id: conversacionId,
          templates: templates.map(t => ({
            name: t.name, body: t.body, variables: t.variables,
            category: t.category, language: t.language,
          })),
        }),
      });
      if (res.status === 429 || res.status === 402) {
        const e = await res.json();
        toast.error(e.error);
        return;
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `Error ${res.status}`);
      }
      const { suggestion } = await res.json();
      if (!suggestion?.suggested_name) {
        toast.error('La IA no pudo sugerir una plantilla');
        return;
      }
      const tpl = templates.find(t =>
        t.name.toLowerCase() === suggestion.suggested_name.toLowerCase()
      );
      if (!tpl) {
        toast.error(`Plantilla sugerida "${suggestion.suggested_name}" no encontrada`);
        return;
      }
      setSelectedId(tpl.id);
      setAiReason(suggestion.reason ?? null);
      if (suggestion.variables) {
        setVarsByTpl(prev => ({ ...prev, [tpl.id]: { ...suggestion.variables } }));
      }
      toast.success('Plantilla sugerida y variables completadas');
    } catch (e: any) {
      toast.error(e.message ?? 'Error al sugerir plantilla');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSend = async () => {
    if (!selected || !allVarsFilled) return;
    setSending(true);
    try {
      const ok = await onSend({
        template: selected,
        variables: selected.variables.map(v => currentVars[v] ?? ''),
        bodyPreview: preview,
      });
      if (ok) onOpenChange(false);
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => onOpenChange(false)}>
      <div onClick={e => e.stopPropagation()} className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Plantillas de WhatsApp</h2>
            <span className="text-[10px] text-muted-foreground">Gupshup · aprobadas</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleAiSuggest}
              disabled={aiLoading || templates.length === 0}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
              title="La IA analiza la conversación y sugiere la plantilla más adecuada"
            >
              {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Sugerir con IA
            </button>
            <button onClick={() => onOpenChange(false)} className="p-1 rounded hover:bg-accent/50">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Body: lista + detalle */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden">
          {/* Lista */}
          <div className="border-r border-border flex flex-col overflow-hidden">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar plantilla..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-muted/50 text-xs rounded-md pl-8 pr-3 py-1.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {isLoading ? (
                <div className="p-6 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="p-4 text-center">
                  <AlertCircle className="w-6 h-6 text-destructive mx-auto mb-2" />
                  <p className="text-[11px] text-destructive">{(error as Error).message}</p>
                  <button onClick={() => refetch()} className="mt-2 text-[10px] text-primary underline">Reintentar</button>
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-6 px-4">
                  {templates.length === 0
                    ? 'No hay plantillas aprobadas en Gupshup todavía.'
                    : 'Sin resultados para tu búsqueda.'}
                </p>
              ) : (
                filtered.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left px-3 py-2 border-b border-border/50 hover:bg-accent/40 transition-colors ${
                      selectedId === t.id ? 'bg-primary/10' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-medium truncate">{t.name}</p>
                      <span className="text-[9px] text-muted-foreground uppercase shrink-0">{t.language}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{t.body}</p>
                    {t.category && (
                      <span className="text-[9px] text-primary mt-1 inline-block">{t.category}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Detalle / variables */}
          <div className="flex flex-col overflow-hidden">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-center p-6">
                <p className="text-[11px] text-muted-foreground">
                  Elegí una plantilla para previsualizar y completar variables.
                </p>
              </div>
            ) : (
              <>
                <div className="p-3 border-b border-border space-y-2 overflow-y-auto scrollbar-thin flex-1">
                  {aiReason && (
                    <div className="bg-primary/5 border border-primary/20 rounded-md p-2 flex items-start gap-1.5">
                      <Sparkles className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                      <p className="text-[10px] text-primary leading-snug">{aiReason}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Vista previa</p>
                    <div className="bg-muted/40 border border-border rounded-md p-2.5 text-[12px] whitespace-pre-wrap leading-relaxed">
                      {preview}
                    </div>
                  </div>
                  {selected.variables.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Variables</p>
                      <div className="space-y-1.5">
                        {selected.variables.map(v => (
                          <div key={v} className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground w-12 shrink-0 font-mono">{`{{${v}}}`}</span>
                            <input
                              type="text"
                              value={currentVars[v] ?? ''}
                              onChange={e => setVarsByTpl(prev => ({
                                ...prev,
                                [selected.id]: { ...(prev[selected.id] ?? {}), [v]: e.target.value },
                              }))}
                              placeholder="Valor..."
                              className="flex-1 bg-muted/50 text-xs rounded px-2 py-1 border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-3 border-t border-border flex gap-2">
                  <button onClick={() => setSelectedId(null)} className="text-[11px] px-3 py-1.5 rounded-md hover:bg-accent/50 text-muted-foreground">
                    Cancelar
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={!allVarsFilled || sending}
                    className="flex-1 flex items-center justify-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 font-medium"
                  >
                    {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Enviar plantilla
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

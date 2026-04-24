/**
 * AiAsesorPopover — Copiloto IA del asesor en LAT > Bandeja.
 *
 * NO confundir con WppTemplatePicker (plantillas Gupshup).
 * El asistente IA lee la conversación y ayuda al asesor a:
 *   - sugerir respuesta para enviar al cliente
 *   - resumir conversación
 *   - detectar intención
 *   - detectar objeciones
 *   - sugerir siguiente paso
 *   - generar nota interna
 *   - extraer datos
 *   - sugerir derivación
 *
 * El usuario decide qué hacer con el resultado:
 *   - "Insertar en respuesta" → carga el texto al composer (no envía solo)
 *   - "Insertar como nota interna" → carga el texto como nota
 *   - "Copiar"
 *
 * Las plantillas de WhatsApp están en otro flujo (botón FileText), pensadas SOLO
 * para reactivar conversaciones fuera de ventana.
 */

import { useEffect, useState } from "react";
import {
  Sparkles, X, Loader2, MessageSquareReply, FileText, Lightbulb, ShieldAlert,
  ListChecks, StickyNote, Database, GitBranch, Copy, Send, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ToolKey =
  | "reply"
  | "summarize"
  | "intent"
  | "objections"
  | "next_step"
  | "internal_note"
  | "extract_data"
  | "derive";

const TOOLS: Array<{
  key: ToolKey;
  label: string;
  hint: string;
  icon: typeof Sparkles;
  primary?: boolean;
}> = [
  { key: "reply",         label: "Sugerir respuesta",     hint: "Redacta una respuesta lista para enviar al cliente", icon: MessageSquareReply, primary: true },
  { key: "summarize",     label: "Resumir conversación",  hint: "Resumen breve del caso y lo pendiente",              icon: FileText },
  { key: "intent",        label: "Detectar intención",    hint: "Qué busca el cliente ahora",                          icon: Lightbulb },
  { key: "objections",    label: "Detectar objeciones",   hint: "Frenos, dudas o riesgos de pérdida",                  icon: ShieldAlert },
  { key: "next_step",     label: "Sugerir siguiente paso",hint: "Próxima acción operativa concreta",                   icon: ListChecks },
  { key: "internal_note", label: "Generar nota interna",  hint: "Nota corta para registrar el estado del caso",        icon: StickyNote },
  { key: "extract_data",  label: "Extraer datos",         hint: "Destinos, fechas, pax, presupuesto, contactos",       icon: Database },
  { key: "derive",        label: "Sugerir derivación",    hint: "¿A qué área conviene escalar el caso?",               icon: GitBranch },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversacionId: string;
  conversacion: {
    canal?: string;
    asunto?: string | null;
    cliente_nombre?: string | null;
    ultimo_mensaje?: string | null;
    en_ventana?: boolean;
  };
  /** Inserta texto al composer principal (mensaje al cliente) */
  onInsertReply: (text: string) => void;
  /** Inserta texto como nota interna */
  onInsertNote: (text: string) => void;
}

interface ToolResult {
  tool: ToolKey;
  data: any;
  ts: number;
}

export function AiAsesorPopover({
  open, onOpenChange, conversacionId, conversacion,
  onInsertReply, onInsertNote,
}: Props) {
  const [activeTool, setActiveTool] = useState<ToolKey>("reply");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [extra, setExtra] = useState(""); // instrucciones adicionales del asesor

  useEffect(() => {
    if (!open) {
      setResult(null);
      setExtra("");
      setActiveTool("reply");
    }
  }, [open]);

  const runTool = async (tool: ToolKey) => {
    setActiveTool(tool);
    setLoading(true);
    setResult(null);
    try {
      // Cargamos los últimos mensajes desde la BD para asegurar contexto fresco.
      const { data: msgs } = await (supabase as any)
        .from("lat_mensajes")
        .select("tipo, contenido, created_at")
        .eq("conversacion_id", conversacionId)
        .order("created_at", { ascending: false })
        .limit(30);

      const mensajes = (msgs ?? []).reverse();

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gestion-link-ai`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          operation: tool,
          conversation: {
            canal: conversacion.canal,
            asunto: conversacion.asunto ?? undefined,
            cliente_nombre: conversacion.cliente_nombre ?? undefined,
            ultimo_mensaje: conversacion.ultimo_mensaje ?? undefined,
            en_ventana: conversacion.en_ventana ?? true,
            mensajes,
          },
          context: extra ? { instrucciones: extra } : undefined,
        }),
      });

      if (res.status === 429) {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error ?? "Rate limit IA. Probá en unos segundos.");
        return;
      }
      if (res.status === 402) {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error ?? "Sin créditos de IA. Agregá fondos en Workspace > Usage.");
        return;
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `Error ${res.status}`);
      }

      const json = await res.json();
      setResult({ tool, data: json.result ?? {}, ts: Date.now() });
    } catch (e: any) {
      toast.error(e.message ?? "Error consultando IA");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border sm:rounded-xl shadow-2xl w-full sm:max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate">Copiloto IA del asesor</h2>
              <p className="text-[10px] text-muted-foreground truncate">
                Lee la conversación y te ayuda a responder mejor. No envía nada por su cuenta.
              </p>
            </div>
          </div>
          <button onClick={() => onOpenChange(false)} className="p-1 rounded hover:bg-accent/50 shrink-0">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-[200px,1fr] overflow-hidden">
          {/* Lista de herramientas */}
          <div className="border-b sm:border-b-0 sm:border-r border-border bg-muted/20 overflow-y-auto scrollbar-thin">
            <div className="p-2 space-y-0.5">
              {TOOLS.map((t) => {
                const Icon = t.icon;
                const isActive = activeTool === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => runTool(t.key)}
                    disabled={loading}
                    className={`w-full text-left px-2.5 py-2 rounded-md flex items-start gap-2 transition-colors group ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-accent/50 text-foreground"
                    } disabled:opacity-50`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium leading-tight flex items-center gap-1.5">
                        {t.label}
                        {t.primary && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-primary/15 text-primary uppercase tracking-wide">
                            principal
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{t.hint}</p>
                    </div>
                    {isActive && loading && <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Resultado */}
          <div className="flex flex-col overflow-hidden">
            {/* Instrucción adicional */}
            <div className="px-3 pt-3">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Instrucción opcional para la IA
              </label>
              <input
                type="text"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder='Ej: "Pedir presupuesto", "Confirmar fechas exactas", "Más cortés"...'
                className="mt-1 w-full bg-muted/50 text-xs rounded-md px-2.5 py-1.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <p className="text-[11px]">Analizando la conversación…</p>
                </div>
              ) : !result ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
                  <Sparkles className="w-7 h-7 text-primary/40" />
                  <p className="text-[12px] font-medium text-foreground">Elegí una herramienta</p>
                  <p className="text-[11px] max-w-xs">
                    La IA leerá la conversación y te dará una salida útil. Vos decidís si la usás.
                  </p>
                </div>
              ) : (
                <ResultRenderer
                  result={result}
                  onInsertReply={(text) => { onInsertReply(text); onOpenChange(false); }}
                  onInsertNote={(text) => { onInsertNote(text); onOpenChange(false); }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer informativo */}
        <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            ¿Necesitás reabrir un chat fuera de ventana? Usá <strong className="text-foreground">Plantillas Gupshup</strong> en el composer.
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Render de resultados ────────────────────────────────────────────────────

function ResultRenderer({
  result,
  onInsertReply,
  onInsertNote,
}: {
  result: ToolResult;
  onInsertReply: (text: string) => void;
  onInsertNote: (text: string) => void;
}) {
  const d = result.data ?? {};

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copiado al portapapeles"),
      () => toast.error("No se pudo copiar"),
    );
  };

  switch (result.tool) {
    case "reply": {
      const respuesta = d.respuesta ?? d.raw ?? "";
      const alt = d.alternativa_corta;
      return (
        <div className="space-y-3">
          <Section title="Respuesta sugerida" badge={d.tono_detectado}>
            <pre className="text-[12px] whitespace-pre-wrap leading-relaxed font-sans">{respuesta}</pre>
            <Actions
              onUse={() => onInsertReply(respuesta)}
              useLabel="Usar como respuesta al cliente"
              onCopy={() => copy(respuesta)}
            />
          </Section>
          {alt && (
            <Section title="Alternativa más corta">
              <pre className="text-[12px] whitespace-pre-wrap leading-relaxed font-sans">{alt}</pre>
              <Actions onUse={() => onInsertReply(alt)} useLabel="Usar versión corta" onCopy={() => copy(alt)} />
            </Section>
          )}
        </div>
      );
    }

    case "summarize": {
      const resumen = d.resumen ?? d.raw ?? "";
      const sig = d.siguiente_paso;
      const noteText = sig ? `${resumen}\nSiguiente paso: ${sig}` : resumen;
      return (
        <div className="space-y-3">
          <Section title="Resumen del caso">
            <pre className="text-[12px] whitespace-pre-wrap leading-relaxed font-sans">{resumen}</pre>
          </Section>
          {sig && (
            <Section title="Siguiente paso">
              <p className="text-[12px]">{sig}</p>
            </Section>
          )}
          <Actions
            onUse={() => onInsertNote(noteText)}
            useLabel="Guardar como nota interna"
            onCopy={() => copy(noteText)}
            useIcon={StickyNote}
          />
        </div>
      );
    }

    case "intent": {
      const text = `Intención: ${d.intencion ?? "?"} (${d.confianza ?? "?"}). ${d.detalle ?? ""}`.trim();
      return (
        <Section title="Intención detectada" badge={d.confianza ? `confianza ${d.confianza}` : undefined}>
          <p className="text-[12px]"><strong className="text-primary">{d.intencion ?? "—"}</strong></p>
          {d.detalle && <p className="text-[11px] text-muted-foreground mt-1">{d.detalle}</p>}
          <Actions onUse={() => onInsertNote(text)} useLabel="Guardar como nota" onCopy={() => copy(text)} useIcon={StickyNote} />
        </Section>
      );
    }

    case "objections": {
      const arr: Array<any> = Array.isArray(d.objeciones) ? d.objeciones : [];
      const summary = arr.map((o, i) => `${i + 1}. [${o.tipo}] ${o.detalle}\n   → ${o.respuesta_sugerida ?? ""}`).join("\n");
      return (
        <div className="space-y-3">
          <Section title="Objeciones detectadas" badge={d.riesgo_perdida ? `riesgo ${d.riesgo_perdida}` : undefined}>
            {arr.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Sin objeciones claras.</p>
            ) : (
              <ul className="space-y-2">
                {arr.map((o, i) => (
                  <li key={i} className="border border-border rounded-md p-2">
                    <p className="text-[11px] font-medium text-foreground">
                      <span className="text-primary uppercase tracking-wide text-[9px] mr-1.5">{o.tipo}</span>
                      {o.detalle}
                    </p>
                    {o.respuesta_sugerida && (
                      <div className="mt-1.5 flex items-start gap-1.5">
                        <ChevronRight className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                        <p className="text-[11px] text-muted-foreground flex-1">{o.respuesta_sugerida}</p>
                      </div>
                    )}
                    {o.respuesta_sugerida && (
                      <button
                        onClick={() => onInsertReply(o.respuesta_sugerida)}
                        className="mt-1.5 text-[10px] text-primary hover:underline"
                      >
                        Usar esta respuesta →
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {summary && <Actions onUse={() => onInsertNote(summary)} useLabel="Guardar como nota" onCopy={() => copy(summary)} useIcon={StickyNote} />}
          </Section>
        </div>
      );
    }

    case "next_step": {
      const text = `Próximo paso: ${d.siguiente_paso ?? "—"} (responsable: ${d.responsable_sugerido ?? "asesor"}, ${d.vencimiento_dias ?? "?"} días, prioridad ${d.prioridad ?? "medium"})`;
      return (
        <Section title="Siguiente paso operativo" badge={d.prioridad}>
          <p className="text-[12px]">{d.siguiente_paso ?? "—"}</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
            <div><span className="uppercase tracking-wide">Responsable</span><p className="text-foreground text-[11px]">{d.responsable_sugerido ?? "asesor"}</p></div>
            <div><span className="uppercase tracking-wide">Vence en</span><p className="text-foreground text-[11px]">{d.vencimiento_dias ?? "?"} días</p></div>
            <div><span className="uppercase tracking-wide">Prioridad</span><p className="text-foreground text-[11px]">{d.prioridad ?? "medium"}</p></div>
          </div>
          <Actions onUse={() => onInsertNote(text)} useLabel="Guardar como nota interna" onCopy={() => copy(text)} useIcon={StickyNote} />
        </Section>
      );
    }

    case "internal_note": {
      const nota = d.nota_interna ?? d.raw ?? "";
      const tags: string[] = Array.isArray(d.etiquetas) ? d.etiquetas : [];
      return (
        <Section title="Nota interna sugerida">
          <pre className="text-[12px] whitespace-pre-wrap leading-relaxed font-sans">{nota}</pre>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.map((t) => (
                <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>
              ))}
            </div>
          )}
          <Actions onUse={() => onInsertNote(nota)} useLabel="Insertar como nota interna" onCopy={() => copy(nota)} useIcon={StickyNote} />
        </Section>
      );
    }

    case "extract_data": {
      const lines: string[] = [];
      if (d.destinos?.length) lines.push(`Destinos: ${d.destinos.join(", ")}`);
      if (d.fechas?.length)   lines.push(`Fechas: ${d.fechas.join(", ")}`);
      if (d.pax)              lines.push(`Pax: ${d.pax.adultos ?? "?"} adultos, ${d.pax.menores ?? 0} menores`);
      if (d.presupuesto?.monto) lines.push(`Presupuesto: ${d.presupuesto.monto} ${d.presupuesto.moneda ?? ""}`);
      if (d.contactos_alternativos?.length) lines.push(`Contactos: ${d.contactos_alternativos.join(", ")}`);
      if (d.preferencias?.length) lines.push(`Preferencias: ${d.preferencias.join(", ")}`);
      if (d.datos_clave?.length)  lines.push(`Otros: ${d.datos_clave.join(", ")}`);
      const text = lines.join("\n");
      return (
        <Section title="Datos extraídos">
          {lines.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No se detectaron datos relevantes en la conversación.</p>
          ) : (
            <pre className="text-[12px] whitespace-pre-wrap leading-relaxed font-sans">{text}</pre>
          )}
          {text && <Actions onUse={() => onInsertNote(text)} useLabel="Guardar como nota interna" onCopy={() => copy(text)} useIcon={StickyNote} />}
        </Section>
      );
    }

    case "derive": {
      const text = d.derivar
        ? `Derivar a ${d.area_sugerida ?? "—"} (urgencia ${d.urgencia ?? "medium"}). Motivo: ${d.razon ?? ""}`
        : `No conviene derivar. ${d.razon ?? ""}`;
      return (
        <Section title={d.derivar ? "Conviene derivar" : "No derivar"} badge={d.urgencia}>
          <p className="text-[12px]">{text}</p>
          <Actions onUse={() => onInsertNote(text)} useLabel="Guardar como nota interna" onCopy={() => copy(text)} useIcon={StickyNote} />
        </Section>
      );
    }

    default:
      return <pre className="text-[11px] text-muted-foreground">{JSON.stringify(d, null, 2)}</pre>;
  }
}

function Section({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-md p-3 bg-background/50">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{title}</p>
        {badge && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wide">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Actions({
  onUse, useLabel, onCopy, useIcon,
}: {
  onUse: () => void;
  useLabel: string;
  onCopy: () => void;
  useIcon?: typeof Send;
}) {
  const Icon = useIcon ?? Send;
  return (
    <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-border/60">
      <button
        onClick={onUse}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-[11px] font-medium"
      >
        <Icon className="w-3 h-3" />
        {useLabel}
      </button>
      <button
        onClick={onCopy}
        className="flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-accent/50 text-[11px] text-muted-foreground"
      >
        <Copy className="w-3 h-3" />
        Copiar
      </button>
    </div>
  );
}

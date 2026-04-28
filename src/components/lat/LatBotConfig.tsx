import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bot, Save, RotateCcw, Info, GitMerge, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface BotConfig {
  id: string;
  nombre: string;
  activo: boolean;
  modelo: string;
  max_turnos: number;
  temperatura: number;
  prompt_identidad: string;
  prompt_reglas: string;
  prompt_categorias: string;
  min_preguntas_calificacion: number;
  prompt_calificacion: string;
  crear_gestion_auto: boolean;
  gestion_process_id: string | null;
  gestion_stage_id: string | null;
  updated_at: string;
  updated_by: string | null;
}

const MODELOS = [
  { value: "gpt-4o-mini",  label: "GPT-4o Mini — rápido y económico (recomendado)" },
  { value: "gpt-4o",       label: "GPT-4o — más inteligente, más caro" },
  { value: "gpt-4-turbo",  label: "GPT-4 Turbo" },
];

const TEMP_LABELS: Record<string, string> = {
  "0.1": "Muy preciso (respuestas consistentes)",
  "0.4": "Balanceado (recomendado)",
  "0.7": "Creativo (más variado)",
  "1.0": "Muy creativo (puede improvisar)",
};

export function LatBotConfig({ readonly, canal = "whatsapp" }: { readonly?: boolean; canal?: "whatsapp" | "email" }) {
  const qc = useQueryClient();

  const { data: cfg, isLoading } = useQuery<BotConfig | null>({
    queryKey: ["lat_bot_config", canal],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("lat_bot_config")
        .select("*")
        .eq("activo", true)
        .eq("canal", canal)
        .single();
      return data ?? null;
    },
  });

  const [form, setForm] = useState<Partial<BotConfig>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const current = { ...cfg, ...form } as BotConfig;

  function set(field: keyof BotConfig, value: any) {
    setForm(f => ({ ...f, [field]: value }));
    setDirty(true);
  }

  function reset() {
    setForm({});
    setDirty(false);
  }

  async function save() {
    if (!cfg?.id) return;
    setSaving(true);
    try {
      const colaboradorId = localStorage.getItem("mis_gestiones_colaborador");
      const { error } = await (supabase as any)
        .from("lat_bot_config")
        .update({
          ...form,
          updated_at: new Date().toISOString(),
          updated_by: colaboradorId ?? null,
        })
        .eq("id", cfg.id)
        .eq("canal", canal);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["lat_bot_config"] });
      setForm({});
      setDirty(false);
      toast.success("Configuración de Lati guardada");
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!cfg) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No se encontró configuración activa del bot.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${canal === "email" ? "bg-blue-500/10" : "bg-fuchsia-500/10"}`}>
            <Bot className={`w-5 h-5 ${canal === "email" ? "text-blue-600" : "text-fuchsia-600"}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold">
              {canal === "email" ? "Agente Email — total@estropical.com" : "Lati — Agente IA de WhatsApp"}
            </h3>
            {cfg.updated_by && (
              <p className="text-[11px] text-muted-foreground">
                Última edición: {new Date(cfg.updated_at).toLocaleDateString("es-BO")}
              </p>
            )}
          </div>
          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
            Activo
          </Badge>
        </div>
        {!readonly && dirty && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={reset}>
              <RotateCcw className="w-3.5 h-3.5" />Descartar
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={save} disabled={saving}>
              <Save className="w-3.5 h-3.5" />{saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        )}
      </div>

      {/* Modelo y parámetros */}
      <section className="p-4 rounded-xl border border-border bg-card space-y-4">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Modelo y parámetros</h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Modelo */}
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs font-medium">Modelo de IA</label>
            <select
              disabled={readonly}
              value={current.modelo ?? "gpt-4o-mini"}
              onChange={e => set("modelo", e.target.value)}
              className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            >
              {MODELOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          {/* Max turnos */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Turnos máximos</label>
            <input
              type="number" min={2} max={20} disabled={readonly}
              value={current.max_turnos ?? 6}
              onChange={e => set("max_turnos", parseInt(e.target.value))}
              className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <p className="text-[10px] text-muted-foreground">Mensajes antes de derivar al asesor</p>
          </div>
        </div>

        {/* Temperatura */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium">Temperatura (creatividad)</label>
            <span className="text-[11px] text-muted-foreground">
              {TEMP_LABELS[String(current.temperatura ?? 0.4)] ?? current.temperatura}
            </span>
          </div>
          <input
            type="range" min={0.1} max={1.0} step={0.1} disabled={readonly}
            value={current.temperatura ?? 0.4}
            onChange={e => set("temperatura", parseFloat(e.target.value))}
            className="w-full accent-fuchsia-500 disabled:opacity-50"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Preciso</span><span>Creativo</span>
          </div>
        </div>
      </section>

      {/* Identidad */}
      <section className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Identidad del bot</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">Quién es Lati, su empresa y su propósito.</p>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <Info className="w-3 h-3" />Primera línea del system prompt
          </div>
        </div>
        <textarea
          disabled={readonly}
          value={current.prompt_identidad ?? ""}
          onChange={e => set("prompt_identidad", e.target.value)}
          rows={3}
          className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none font-mono"
        />
      </section>

      {/* Reglas */}
      <section className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reglas de comportamiento</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Una regla por línea comenzando con "–". Ej: "– Nunca inventes precios"
            </p>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-1">
            <Info className="w-3 h-3" />Comportamiento y tono
          </div>
        </div>
        <textarea
          disabled={readonly}
          value={current.prompt_reglas ?? ""}
          onChange={e => set("prompt_reglas", e.target.value)}
          rows={7}
          className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none font-mono"
        />
      </section>

      {/* Categorías */}
      <section className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Categorías de necesidad</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Las categorías que Lati puede detectar. Una por línea: "– nombre: descripción"
            </p>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
            <Info className="w-3 h-3" />Afecta el routing
          </div>
        </div>
        <textarea
          disabled={readonly}
          value={current.prompt_categorias ?? ""}
          onChange={e => set("prompt_categorias", e.target.value)}
          rows={10}
          className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none font-mono"
        />
      </section>

      {/* Calificación */}
      <section className="p-4 rounded-xl border border-border bg-card space-y-4">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <GitMerge className="w-3.5 h-3.5" />Calificación antes de derivar
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Cuántas preguntas debe hacer el bot para entender bien la necesidad antes de pasar al asesor.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Preguntas mínimas</label>
            <input
              type="number" min={0} max={5} disabled={readonly}
              value={current.min_preguntas_calificacion ?? 1}
              onChange={e => set("min_preguntas_calificacion", parseInt(e.target.value))}
              className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <p className="text-[10px] text-muted-foreground">0 = derivar sin preguntas</p>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs font-medium">Preguntas por categoría</label>
            <textarea
              disabled={readonly}
              value={current.prompt_calificacion ?? ""}
              onChange={e => set("prompt_calificacion", e.target.value)}
              rows={8}
              placeholder="- vacacional: preguntá destino, fechas y viajeros&#10;- visa: preguntá país destino y tipo de visa&#10;- emergencia: NO preguntes, derivá inmediatamente"
              className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none font-mono"
            />
          </div>
        </div>
      </section>

      {/* Gestión automática */}
      <section className="p-4 rounded-xl border border-border bg-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" />Crear gestión automática al derivar
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Cuando el bot deriva al asesor, crea una Gestión con toda la info del contacto.
            </p>
          </div>
          <button
            disabled={readonly}
            onClick={() => set("crear_gestion_auto", !current.crear_gestion_auto)}
            className={[
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50",
              current.crear_gestion_auto ? "bg-emerald-500" : "bg-muted",
            ].join(" ")}
          >
            <span className={[
              "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
              current.crear_gestion_auto ? "translate-x-4" : "translate-x-0.5",
            ].join(" ")} />
          </button>
        </div>

        {current.crear_gestion_auto && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-700 space-y-1">
            <p className="font-medium">Al derivar, Lati crea automáticamente:</p>
            <ul className="space-y-0.5 ml-2">
              <li>• Gestión con título, descripción e intención detectada</li>
              <li>• Vinculada al cliente y a la conversación de WhatsApp</li>
              <li>• Prioridad según urgencia (emergencia → urgent, alta → high…)</li>
              <li>• Proceso: Ventas → Lead (para vacacional/visa/grupos/corporativo)</li>
            </ul>
          </div>
        )}
      </section>

      {!readonly && dirty && (
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={reset}>
            <RotateCcw className="w-3.5 h-3.5" />Descartar
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={save} disabled={saving}>
            <Save className="w-3.5 h-3.5" />{saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      )}
    </div>
  );
}

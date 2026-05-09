import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot, Sparkles, Save, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AccesoRol {
  gestiones: boolean;
  clientes: boolean;
  actividades: boolean;
  equipo?: boolean;
  reportes?: boolean;
  limite_registros: number;
}

interface AiConfig {
  id: string;
  identidad: string;
  temperatura: number;
  max_tokens: number;
  acceso_asesor: AccesoRol;
  acceso_supervisor: AccesoRol;
  acceso_admin: AccesoRol;
  activo: boolean;
}

const DEFAULT_CONFIG: Omit<AiConfig, "id"> = {
  identidad: "Sos el asistente IA del CRM Latidos de Estropical, una agencia de viajes boliviana. Respondé siempre en español, de forma concisa y útil.",
  temperatura: 0.4,
  max_tokens: 800,
  acceso_asesor:    { gestiones: true, clientes: true, actividades: true, limite_registros: 20 },
  acceso_supervisor:{ gestiones: true, clientes: true, actividades: true, equipo: true, limite_registros: 30 },
  acceso_admin:     { gestiones: true, clientes: true, actividades: true, equipo: true, reportes: true, limite_registros: 50 },
  activo: true,
};

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? "bg-violet-600" : "bg-muted-foreground/30"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
        checked ? "translate-x-5" : "translate-x-0.5"
      }`} />
    </button>
  );
}

function RolAccesoPanel({
  label, color, acceso, onChange, readonly,
}: {
  label: string; color: string;
  acceso: AccesoRol;
  onChange: (a: AccesoRol) => void;
  readonly: boolean;
}) {
  const filas: { key: keyof AccesoRol; label: string; desc: string }[] = [
    { key: "gestiones",  label: "Gestiones",        desc: "Puede consultar gestiones asignadas / del equipo" },
    { key: "clientes",   label: "Clientes",          desc: "Puede consultar datos de clientes" },
    { key: "actividades",label: "Actividades",       desc: "Puede ver tareas y actividades" },
    { key: "equipo",     label: "Datos del equipo",  desc: "Incluye información de colaboradores a cargo" },
    { key: "reportes",   label: "Reportes globales", desc: "Accede a métricas y resúmenes de toda la empresa" },
  ];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className={`px-4 py-2.5 border-b border-border flex items-center gap-2 ${color}`}>
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="divide-y divide-border">
        {filas.map(({ key, label: fLabel, desc }) => {
          const val = !!(acceso as any)[key];
          const available = key in acceso || key === "gestiones" || key === "clientes" || key === "actividades";
          if (!available && val === undefined) return null;
          return (
            <div key={key} className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{fLabel}</p>
                <p className="text-[11px] text-muted-foreground">{desc}</p>
              </div>
              <Toggle
                checked={val}
                onChange={(v) => onChange({ ...acceso, [key]: v })}
                disabled={readonly}
              />
            </div>
          );
        })}
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground">Límite de registros</p>
            <p className="text-[11px] text-muted-foreground">Máximo de registros cargados como contexto</p>
          </div>
          <select
            value={acceso.limite_registros}
            onChange={(e) => onChange({ ...acceso, limite_registros: Number(e.target.value) })}
            disabled={readonly}
            className="text-xs border border-input rounded-md px-2 py-1 bg-background disabled:opacity-50"
          >
            {[10, 20, 30, 50, 100].map(n => (
              <option key={n} value={n}>{n} registros</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export function AgenteIAConfig({ readonly }: { readonly: boolean }) {
  const qc = useQueryClient();
  const colaboradorId = localStorage.getItem("mis_gestiones_colaborador") || "";

  const { data: config, isLoading } = useQuery({
    queryKey: ["ai-assistant-config"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ai_assistant_config")
        .select("*")
        .limit(1)
        .single();
      return (data as AiConfig) ?? null;
    },
  });

  const [local, setLocal] = useState<Omit<AiConfig, "id"> | null>(null);
  const effective = local ?? (config ? { ...config } : DEFAULT_CONFIG);

  const mutation = useMutation({
    mutationFn: async (values: Omit<AiConfig, "id">) => {
      const { error } = await (supabase as any)
        .from("ai_assistant_config")
        .update({ ...values, updated_at: new Date().toISOString(), updated_by: colaboradorId })
        .eq("id", config!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuración guardada");
      setLocal(null);
      qc.invalidateQueries({ queryKey: ["ai-assistant-config"] });
    },
    onError: () => toast.error("Error al guardar"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
      </div>
    );
  }

  const isDirty = local !== null;

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Header del agente */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-violet-50 border border-violet-200">
        <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-violet-900">Asistente IA — CRM Latidos</p>
          <p className="text-xs text-violet-600">Powered by GPT-4o Mini · Contexto basado en rol</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge className={`text-[10px] ${effective.activo ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
            {effective.activo ? "Activo" : "Inactivo"}
          </Badge>
          <Toggle
            checked={effective.activo}
            onChange={(v) => setLocal({ ...effective, activo: v })}
            disabled={readonly}
          />
        </div>
      </div>

      {/* Identidad */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-600" />
          <p className="text-sm font-semibold">Identidad del asistente</p>
          <Badge variant="outline" className="text-[9px]">Primera línea del system prompt</Badge>
        </div>
        <textarea
          value={effective.identidad}
          onChange={(e) => setLocal({ ...effective, identidad: e.target.value })}
          disabled={readonly}
          rows={3}
          className="w-full text-sm border border-input rounded-lg px-3 py-2 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          placeholder="Describí la identidad del asistente..."
        />
      </div>

      {/* Modelo y parámetros */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Modelo y Parámetros</p>
        </div>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <div>
              <p className="text-xs font-medium">Modelo de IA</p>
              <p className="text-[11px] text-muted-foreground">Modelo de OpenAI utilizado</p>
            </div>
            <div className="text-xs bg-muted px-2.5 py-1 rounded-md text-muted-foreground font-mono">gpt-4o-mini</div>
          </div>
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <div>
              <p className="text-xs font-medium">Temperatura (creatividad)</p>
              <p className="text-[11px] text-muted-foreground">0 = preciso · 1 = creativo</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range" min="0" max="1" step="0.1"
                value={effective.temperatura}
                onChange={(e) => setLocal({ ...effective, temperatura: Number(e.target.value) })}
                disabled={readonly}
                className="w-24 accent-violet-600 disabled:opacity-50"
              />
              <span className="text-xs font-mono w-6 text-right">{effective.temperatura}</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <div>
              <p className="text-xs font-medium">Tokens máximos en respuesta</p>
              <p className="text-[11px] text-muted-foreground">Limita el largo de cada respuesta</p>
            </div>
            <select
              value={effective.max_tokens}
              onChange={(e) => setLocal({ ...effective, max_tokens: Number(e.target.value) })}
              disabled={readonly}
              className="text-xs border border-input rounded-md px-2 py-1 bg-background disabled:opacity-50"
            >
              {[400, 600, 800, 1200, 2000].map(n => (
                <option key={n} value={n}>{n} tokens</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Acceso por rol */}
      <div className="space-y-3">
        <p className="text-sm font-semibold">Acceso por Rol</p>
        <p className="text-xs text-muted-foreground">Configurá qué información puede ver el asistente según el rol del usuario.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <RolAccesoPanel
            label="Asesor" color="bg-blue-50 text-blue-700"
            acceso={effective.acceso_asesor}
            onChange={(a) => setLocal({ ...effective, acceso_asesor: a })}
            readonly={readonly}
          />
          <RolAccesoPanel
            label="Supervisor" color="bg-amber-50 text-amber-700"
            acceso={effective.acceso_supervisor}
            onChange={(a) => setLocal({ ...effective, acceso_supervisor: a })}
            readonly={readonly}
          />
          <RolAccesoPanel
            label="Admin / Gerente" color="bg-red-50 text-red-700"
            acceso={effective.acceso_admin}
            onChange={(a) => setLocal({ ...effective, acceso_admin: a })}
            readonly={readonly}
          />
        </div>
      </div>

      {/* Acciones */}
      {!readonly && (
        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={() => mutation.mutate(effective)}
            disabled={!isDirty || mutation.isPending}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
          >
            {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar cambios
          </Button>
          {isDirty && (
            <Button variant="ghost" size="sm" onClick={() => setLocal(null)} className="gap-1.5 text-xs">
              <RotateCcw className="w-3.5 h-3.5" />Descartar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Phone, Globe, Layers, ClipboardList, Clock, Plus, Pencil, Trash2,
  Check, X, ChevronDown, ChevronUp, ToggleLeft, ToggleRight,
  AlertCircle, Zap, DollarSign, Star, HelpCircle, Bus, Plane,
  FileText, Users, Briefcase, BarChart3, Bot, Activity, MessageSquare,
  Mail, Wifi, WifiOff, ChevronRight, RefreshCw, LogOut, ChevronLeft,
} from "lucide-react";
import { LatBotConfig } from "./LatBotConfig";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "overview" | "canales" | "colas" | "horarios" | "agentes-ia";

interface Troncal {
  id: string; nombre: string; proveedor: string; tipo: string;
  numero: string | null; activo: boolean; descripcion: string | null;
}

interface Canal {
  id: string; troncal_id: string | null; nombre: string; tipo: string;
  numero_origen: string | null; activo: boolean; descripcion: string | null;
  cola_default_id: string | null;
}

interface Accion {
  tipo: "asignar_cola" | "asignar_bot" | "ignorar" | "asignar_prioridad" | "etiquetar";
  cola_id?: string | null;
  cola_nombre?: string;
  prioridad?: string;
  etiqueta?: string;
}

interface Cola {
  id: string; nombre: string; descripcion: string | null; area: string | null;
  canal_id: string | null; estrategia_asignacion: string;
  max_conversaciones_agente: number; activa: boolean;
  orden: number; color: string; icono: string | null;
}

interface Horario {
  id: string; nombre: string; zona_horaria: string;
  franjas: Record<string, { inicio: string; fin: string } | null>; activo: boolean;
}

interface Condicion {
  campo: string; operador: string; valor: string;
}

interface Regla {
  id: string; nombre: string; descripcion: string | null;
  activa: boolean; prioridad: number;
  canal_id: string | null;
  condiciones: Condicion[]; accion: Accion;
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICONOS: Record<string, React.ElementType> = {
  Plane, FileText, Users, Briefcase, Zap, PlaneTakeoff: Plane,
  Bus, AlertCircle, DollarSign, ClipboardList, Star, HelpCircle,
  BarChart3, Phone, Globe, Layers,
};

const DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const DIAS_LABELS: Record<string, string> = {
  lunes: "Lun", martes: "Mar", miercoles: "Mié",
  jueves: "Jue", viernes: "Vie", sabado: "Sáb", domingo: "Dom",
};

const TIPO_COLORS: Record<string, string> = {
  whatsapp: "bg-green-500/10 text-green-600 border-green-200",
  instagram: "bg-purple-500/10 text-purple-600 border-purple-200",
  facebook: "bg-blue-500/10 text-blue-600 border-blue-200",
  email: "bg-amber-500/10 text-amber-600 border-amber-200",
  web: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
  interno: "bg-slate-500/10 text-slate-600 border-slate-200",
};

const TIPO_ICONS: Record<string, React.ElementType> = {
  whatsapp: MessageSquare,
  instagram: Globe,
  facebook: Globe,
  email: Mail,
  web: Globe,
  interno: Layers,
};

// ─── Constantes de reglas ─────────────────────────────────────────────────────

const CAMPOS_WA = [
  { value: "numero_remitente", label: "Número remitente" },
  { value: "texto_mensaje",    label: "Texto del mensaje" },
  { value: "palabras_clave",   label: "Palabras clave" },
  { value: "etiqueta_origen",  label: "Etiqueta / campaña / origen" },
];

const CAMPOS_EMAIL = [
  { value: "remitente",          label: "Remitente" },
  { value: "destinatario",       label: "Destinatario" },
  { value: "alias_destinatario", label: "Alias destinatario" },
  { value: "asunto",             label: "Asunto" },
  { value: "cuerpo",             label: "Cuerpo del correo" },
  { value: "nombre_adjunto",     label: "Nombre del archivo adjunto" },
];

const CAMPOS_COMUNES = [
  { value: "mensaje_inicial", label: "Mensaje inicial" },
  { value: "canal_tipo",      label: "Canal tipo" },
  { value: "hora_ingreso",    label: "Hora de ingreso" },
  { value: "cliente_area",    label: "Área del cliente" },
];

const OPERADORES = [
  { value: "contiene",     label: "contiene" },
  { value: "no_contiene",  label: "no contiene" },
  { value: "es",           label: "es igual a" },
  { value: "empieza_con",  label: "empieza con" },
  { value: "termina_con",  label: "termina con" },
];

const TIPOS_ACCION = [
  { value: "asignar_cola",      label: "Derivar a cola" },
  { value: "asignar_bot",       label: "Derivar a bot / Agente IA" },
  { value: "ignorar",           label: "No sincronizar / ignorar" },
  { value: "asignar_prioridad", label: "Asignar prioridad" },
  { value: "etiquetar",         label: "Etiquetar comunicación" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function db() { return supabase as any; }

function ColaBadge({ color, nombre, icono }: { color: string; nombre: string; icono?: string | null }) {
  const Icon = icono && ICONOS[icono] ? ICONOS[icono] : Layers;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: color + "22", color }}
    >
      <Icon className="w-3 h-3" />
      {nombre}
    </span>
  );
}

// ─── VISTA GENERAL TAB ────────────────────────────────────────────────────────

function VistaGeneralTab() {
  const { data: canales = [] } = useQuery<Canal[]>({
    queryKey: ["lat_canales"],
    queryFn: async () => {
      const { data } = await db().from("lat_canales").select("*").order("nombre");
      return data || [];
    },
  });
  const { data: colas = [] } = useQuery<Cola[]>({
    queryKey: ["lat_colas"],
    queryFn: async () => {
      const { data } = await db().from("lat_colas").select("*").order("orden");
      return data || [];
    },
  });
  const { data: reglas = [] } = useQuery<Regla[]>({
    queryKey: ["lat_reglas"],
    queryFn: async () => {
      const { data } = await db().from("lat_reglas_asignacion").select("*").order("prioridad");
      return data || [];
    },
  });
  const { data: horarios = [] } = useQuery<Horario[]>({
    queryKey: ["lat_horarios"],
    queryFn: async () => {
      const { data } = await db().from("lat_horarios").select("*").order("nombre");
      return data || [];
    },
  });

  const canalesActivos = canales.filter(c => c.activo).length;
  const colasActivas = colas.filter(c => c.activa).length;
  const reglasActivas = reglas.filter(r => r.activa).length;
  const horariosActivos = horarios.filter(h => h.activo).length;

  const stats = [
    { label: "Canales activos", value: canalesActivos, total: canales.length, icon: Globe, color: "text-green-600", bg: "bg-green-500/10" },
    { label: "Colas activas", value: colasActivas, total: colas.length, icon: Layers, color: "text-indigo-600", bg: "bg-indigo-500/10" },
    { label: "Reglas activas", value: reglasActivas, total: reglas.length, icon: Zap, color: "text-amber-600", bg: "bg-amber-500/10" },
    { label: "Horarios", value: horariosActivos, total: horarios.length, icon: Clock, color: "text-blue-600", bg: "bg-blue-500/10" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="p-4 rounded-xl border border-border bg-card space-y-2">
              <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <div>
                <p className="text-2xl font-semibold">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
                {s.total > s.value && (
                  <p className="text-[10px] text-muted-foreground">{s.total - s.value} inactivo{s.total - s.value > 1 ? "s" : ""}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Canal status */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Estado de canales</h4>
        <div className="space-y-2">
          {canales.length === 0 && (
            <p className="text-xs text-muted-foreground p-4 rounded-xl border border-dashed border-border text-center">
              No hay canales configurados
            </p>
          )}
          {canales.map(canal => {
            const TipoIcon = TIPO_ICONS[canal.tipo] || Globe;
            return (
              <div key={canal.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card">
                <div className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${TIPO_COLORS[canal.tipo] || "bg-muted text-muted-foreground border-border"}`}>
                  <TipoIcon className="w-3 h-3" />
                  {canal.tipo}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{canal.nombre}</p>
                  {canal.numero_origen && (
                    <p className="text-[10px] text-muted-foreground">{canal.numero_origen}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {canal.activo
                    ? <><Wifi className="w-3.5 h-3.5 text-emerald-500" /><span className="text-[10px] text-emerald-600 font-medium">Activo</span></>
                    : <><WifiOff className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-[10px] text-muted-foreground">Inactivo</span></>
                  }
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Colas resumen */}
      {colas.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Colas de atención</h4>
          <div className="flex flex-wrap gap-2">
            {colas.map(cola => (
              <div key={cola.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card">
                <ColaBadge color={cola.color} nombre={cola.nombre} icono={cola.icono} />
                <span className="text-[10px] text-muted-foreground">{cola.estrategia_asignacion.replace("_", " ")}</span>
                {!cola.activa && <Badge variant="secondary" className="text-[10px]">Inactiva</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CANAL REGLAS PANEL ───────────────────────────────────────────────────────

function CanalReglasPanel({
  canalId, canalTipo = "whatsapp", colas, readonly,
}: {
  canalId: string | null; canalTipo?: string; colas: Cola[]; readonly: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Regla> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const isGlobalMode = canalId === null;
  const isEmail = canalTipo === "email";
  const CAMPOS = isGlobalMode ? CAMPOS_COMUNES : isEmail ? CAMPOS_EMAIL : CAMPOS_WA;

  const { data: reglas = [], isLoading } = useQuery<Regla[]>({
    queryKey: ["lat_reglas_canal", canalId ?? "global"],
    queryFn: async () => {
      const q = db().from("lat_reglas_asignacion").select("*").order("prioridad");
      const { data } = isGlobalMode ? await q.is("canal_id", null) : await q.eq("canal_id", canalId);
      return (data || []).map((r: any) => ({
        ...r,
        condiciones: Array.isArray(r.condiciones) ? r.condiciones : [],
        accion: typeof r.accion === "object" ? r.accion : { tipo: "asignar_cola" },
      }));
    },
  });

  const save = async () => {
    if (!editing?.nombre?.trim()) return;
    const payload = {
      nombre: editing.nombre,
      descripcion: editing.descripcion || null,
      activa: editing.activa ?? true,
      prioridad: editing.prioridad ?? 50,
      canal_id: canalId,
      condiciones: editing.condiciones || [],
      accion: editing.accion || { tipo: "asignar_cola" },
    };
    if (isNew) {
      await db().from("lat_reglas_asignacion").insert(payload);
      toast.success("Regla creada");
    } else {
      await db().from("lat_reglas_asignacion").update(payload).eq("id", editing.id);
      toast.success("Regla actualizada");
    }
    qc.invalidateQueries({ queryKey: ["lat_reglas_canal", canalId] });
    qc.invalidateQueries({ queryKey: ["lat_reglas"] });
    setEditing(null);
  };

  const remove = async (id: string) => {
    await db().from("lat_reglas_asignacion").delete().eq("id", id);
    toast.success("Regla eliminada");
    qc.invalidateQueries({ queryKey: ["lat_reglas_canal", canalId] });
    qc.invalidateQueries({ queryKey: ["lat_reglas"] });
  };

  const toggle = async (r: Regla) => {
    await db().from("lat_reglas_asignacion").update({ activa: !r.activa }).eq("id", r.id);
    qc.invalidateQueries({ queryKey: ["lat_reglas_canal", canalId] });
  };

  const addCondicion = () => {
    const defaultCampo = CAMPOS[0]?.value ?? "texto_mensaje";
    setEditing(p => ({
      ...p,
      condiciones: [...(p?.condiciones || []), { campo: defaultCampo, operador: "contiene", valor: "" }],
    }));
  };

  const removeCondicion = (idx: number) => {
    setEditing(p => ({ ...p, condiciones: (p?.condiciones || []).filter((_, i) => i !== idx) }));
  };

  const updateCondicion = (idx: number, key: keyof Condicion, val: string) => {
    setEditing(p => ({
      ...p,
      condiciones: (p?.condiciones || []).map((c, i) => i === idx ? { ...c, [key]: val } : c),
    }));
  };

  if (isLoading) return <div className="text-xs text-muted-foreground py-6 text-center">Cargando reglas...</div>;

  // ── Form view ───────────────────────────────────────────────────────────────
  if (editing) {
    const accion: Accion = (editing.accion as Accion) || { tipo: "asignar_cola" };
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(null)} className="p-1.5 rounded hover:bg-accent text-muted-foreground">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h4 className="text-sm font-semibold">{isNew ? "Nueva regla" : "Editar regla"}</h4>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Nombre *</label>
            <input className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={editing.nombre || ""} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Prioridad</label>
            <input type="number" min={1} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
              value={editing.prioridad ?? 50} onChange={e => setEditing(p => ({ ...p, prioridad: parseInt(e.target.value) || 50 }))} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium">Condiciones <span className="text-muted-foreground font-normal">(todas deben cumplirse)</span></label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={(editing.condiciones || []).length === 0}
                  onChange={e => {
                    if (e.target.checked) setEditing(p => ({ ...p, condiciones: [] }));
                    else addCondicion();
                  }}
                />
                <span className="text-xs text-muted-foreground">Regla por defecto</span>
              </label>
              {(editing.condiciones || []).length > 0 && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addCondicion}>
                  <Plus className="w-3 h-3" />Agregar
                </Button>
              )}
            </div>
          </div>
          {(editing.condiciones || []).length === 0 && (
            <p className="text-xs text-amber-700 bg-amber-500/10 border border-amber-200 p-3 rounded-lg">
              Sin condiciones — se aplica como fallback cuando ninguna otra regla coincide
            </p>
          )}
          {(editing.condiciones || []).map((cond, idx) => (
            <div key={idx} className="flex items-center gap-2 mb-2">
              <select className="border border-border rounded-lg px-2 py-1.5 text-xs bg-background focus:outline-none flex-1 min-w-0"
                value={cond.campo} onChange={e => updateCondicion(idx, "campo", e.target.value)}>
                {CAMPOS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <select className="border border-border rounded-lg px-2 py-1.5 text-xs bg-background focus:outline-none shrink-0"
                value={cond.operador} onChange={e => updateCondicion(idx, "operador", e.target.value)}>
                {OPERADORES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs bg-background focus:outline-none min-w-0"
                placeholder="valor..." value={cond.valor} onChange={e => updateCondicion(idx, "valor", e.target.value)} />
              <button onClick={() => removeCondicion(idx)} className="p-1.5 rounded hover:bg-destructive/10 shrink-0">
                <X className="w-3.5 h-3.5 text-destructive/70" />
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <label className="text-xs font-medium block">Acción</label>
          <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
            value={accion.tipo || "asignar_cola"}
            onChange={e => setEditing(p => ({ ...p, accion: { ...p?.accion, tipo: e.target.value as Accion["tipo"] } }))}>
            {TIPOS_ACCION.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          {(!accion.tipo || accion.tipo === "asignar_cola") && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Cola destino</label>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                value={accion.cola_id || ""}
                onChange={e => {
                  const c = colas.find(c => c.id === e.target.value);
                  setEditing(p => ({ ...p, accion: { ...p?.accion, tipo: "asignar_cola", cola_id: e.target.value || null, cola_nombre: c?.nombre || "" } }));
                }}>
                <option value="">Seleccionar cola...</option>
                {colas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
          {accion.tipo === "asignar_prioridad" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nivel de prioridad</label>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                value={accion.prioridad || "alta"}
                onChange={e => setEditing(p => ({ ...p, accion: { ...p?.accion, prioridad: e.target.value } }))}>
                <option value="urgente">Urgente</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          )}
          {accion.tipo === "etiquetar" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Etiqueta</label>
              <input className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                placeholder="ej. vip, urgente..." value={accion.etiqueta || ""}
                onChange={e => setEditing(p => ({ ...p, accion: { ...p?.accion, etiqueta: e.target.value } }))} />
            </div>
          )}
          {accion.tipo === "ignorar" && (
            <p className="text-xs text-amber-600 bg-amber-500/10 border border-amber-200 rounded-lg p-3">
              Las comunicaciones que coincidan no se sincronizarán ni aparecerán en LAT.
            </p>
          )}
          {accion.tipo === "asignar_bot" && (
            <p className="text-xs text-blue-600 bg-blue-500/10 border border-blue-200 rounded-lg p-3">
              Las comunicaciones que coincidan se derivarán al Agente IA configurado para este canal.
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button size="sm" onClick={save} className="gap-1.5"><Check className="w-3.5 h-3.5" />Guardar</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
    );
  }

  // ── List view ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {reglas.length} regla{reglas.length !== 1 ? "s" : ""} · evaluadas en orden de prioridad
        </p>
        {!readonly && (
          <Button size="sm" className="gap-1.5 h-8"
            onClick={() => { setIsNew(true); setEditing({ activa: true, prioridad: 50, canal_id: canalId, condiciones: [], accion: { tipo: "asignar_cola" } }); }}>
            <Plus className="w-3.5 h-3.5" />Nueva regla
          </Button>
        )}
      </div>
      {reglas.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
          No hay reglas para este canal.{!readonly && " Crea la primera regla para controlar cómo se asignan las comunicaciones."}
        </div>
      )}
      <div className="space-y-2">
        {reglas.map(r => {
          const cola = colas.find(c => c.id === r.accion?.cola_id || c.nombre === r.accion?.cola_nombre);
          const accionLabel = TIPOS_ACCION.find(a => a.value === r.accion?.tipo)?.label ?? "Acción";
          return (
            <div key={r.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-3 p-3.5 hover:bg-accent/20 cursor-pointer"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{r.prioridad}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.nombre}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {r.condiciones.length > 0 ? `${r.condiciones.length} condición${r.condiciones.length > 1 ? "es" : ""}` : "Regla por defecto"}
                    {" → "}{r.accion?.tipo === "asignar_cola" && cola ? cola.nombre : accionLabel}
                  </p>
                </div>
                {r.accion?.tipo === "asignar_cola" && cola
                  ? <ColaBadge color={cola.color} nombre={cola.nombre} icono={cola.icono} />
                  : <Badge variant="outline" className={`text-[10px] shrink-0 ${r.accion?.tipo === "ignorar" ? "border-amber-300 text-amber-600" : r.accion?.tipo === "asignar_bot" ? "border-blue-300 text-blue-600" : ""}`}>{accionLabel}</Badge>
                }
                {!r.activa && <Badge variant="secondary" className="text-[10px] shrink-0">Inactiva</Badge>}
                {expanded === r.id ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              </div>
              {expanded === r.id && (
                <div className="border-t border-border px-4 py-3 bg-accent/10 space-y-2">
                  {r.condiciones.length === 0 && <p className="text-xs text-muted-foreground italic">Sin condiciones — se aplica a cualquier comunicación del canal</p>}
                  {r.condiciones.map((c, i) => {
                    const campoLabel = [...CAMPOS_WA, ...CAMPOS_EMAIL, ...CAMPOS_COMUNES].find(f => f.value === c.campo)?.label ?? c.campo;
                    const opLabel = OPERADORES.find(o => o.value === c.operador)?.label ?? c.operador;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded bg-muted font-mono">{campoLabel}</span>
                        <span className="text-muted-foreground">{opLabel}</span>
                        <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">{c.valor}</span>
                      </div>
                    );
                  })}
                  {!readonly && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => toggle(r)}>
                        {r.activa ? <ToggleRight className="w-3.5 h-3.5 text-emerald-500" /> : <ToggleLeft className="w-3.5 h-3.5 text-muted-foreground" />}
                        {r.activa ? "Desactivar" : "Activar"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => { setIsNew(false); setEditing(r); }}>
                        <Pencil className="w-3.5 h-3.5" />Editar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => remove(r.id)}>
                        <Trash2 className="w-3.5 h-3.5" />Eliminar
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CANALES TAB ─────────────────────────────────────────────────────────────

interface CanalConTroncal extends Canal {
  lat_troncales?: { nombre: string; proveedor: string; numero: string | null } | null;
}

interface GmailBotCfg {
  id: string;
  activo: boolean;
  nombre: string | null;
  gmail_email: string | null;
  gmail_refresh_token: string | null;
  gmail_token_expiry: string | null;
  updated_at: string | null;
}

type CanalEditTab = "detalles" | "reglas" | "conexion";
type EditMode = { kind: "canal"; id: string | null } | { kind: "gmail" } | null;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

async function fetchGmailOAuthUrl(): Promise<string | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/lat-gmail-oauth-url`, {
      headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
    });
    const json = await res.json();
    return json.url ?? null;
  } catch { return null; }
}

function ConnStatus({ activo, hasToken }: { activo: boolean; hasToken?: boolean }) {
  const connected = activo && (hasToken === undefined || hasToken);
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${connected ? "text-emerald-600" : activo ? "text-amber-600" : "text-muted-foreground"}`}>
      {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      {connected ? "Conectado" : activo ? "Sin token" : "Inactivo"}
    </span>
  );
}

function CanalesTab({ readonly }: { readonly: boolean }) {
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [canalDraft, setCanalDraft] = useState<Partial<CanalConTroncal>>({});
  const [isNewCanal, setIsNewCanal] = useState(false);
  const [canalTab, setCanalTab] = useState<CanalEditTab>("detalles");
  const [editingTroncal, setEditingTroncal] = useState<Partial<Troncal> | null>(null);
  const [isNewTroncal, setIsNewTroncal] = useState(false);
  const [showTroncales, setShowTroncales] = useState(false);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [disconnectingGmail, setDisconnectingGmail] = useState(false);
  const [newCanalType, setNewCanalType] = useState<string | null>(null);
  const [gmailCanalId, setGmailCanalId] = useState<string | null>(null);
  const [gmailColaDraft, setGmailColaDraft] = useState<string | null>(null);

  const { data: canales = [], isLoading } = useQuery<CanalConTroncal[]>({
    queryKey: ["lat_canales"],
    queryFn: async () => {
      const { data } = await db().from("lat_canales").select("*, lat_troncales(nombre, proveedor, numero)").order("nombre");
      return data || [];
    },
  });

  const { data: gmailCfg } = useQuery<GmailBotCfg | null>({
    queryKey: ["lat_bot_config", "email"],
    queryFn: async () => {
      const { data } = await db().from("lat_bot_config")
        .select("id, activo, nombre, gmail_email, gmail_refresh_token, gmail_token_expiry, updated_at")
        .eq("canal", "email").maybeSingle();
      return data ?? null;
    },
  });

  const { data: troncales = [] } = useQuery<Troncal[]>({
    queryKey: ["lat_troncales"],
    queryFn: async () => {
      const { data } = await db().from("lat_troncales").select("*").order("nombre");
      return data || [];
    },
  });

  const { data: colas = [] } = useQuery<Cola[]>({
    queryKey: ["lat_colas"],
    queryFn: async () => {
      const { data } = await db().from("lat_colas").select("*").order("orden");
      return data || [];
    },
  });

  // ── Canal CRUD ────────────────────────────────────────────────────────────────

  const openNewCanal = (tipo = "whatsapp") => {
    setIsNewCanal(true);
    setCanalDraft({ activo: true, tipo });
    setCanalTab("detalles");
    setNewCanalType(null);
    setEditMode({ kind: "canal", id: null });
  };

  const openEditCanal = (canal: CanalConTroncal) => {
    setIsNewCanal(false);
    setCanalDraft(canal);
    setCanalTab("detalles");
    setEditMode({ kind: "canal", id: canal.id });
  };

  const openEditGmail = async () => {
    const { data } = await db().from("lat_canales")
      .select("id, cola_default_id").eq("tipo", "email").maybeSingle();
    setGmailCanalId(data?.id ?? null);
    setGmailColaDraft(data?.cola_default_id ?? null);
    setCanalTab("detalles");
    setEditMode({ kind: "gmail" });
  };

  const saveGmailColaDefault = async (colaId: string | null) => {
    if (gmailCanalId) {
      await db().from("lat_canales").update({ cola_default_id: colaId }).eq("id", gmailCanalId);
    } else if (gmailCfg) {
      const { data } = await db().from("lat_canales").insert({
        nombre: gmailCfg.gmail_email || gmailCfg.nombre || "Gmail",
        tipo: "email",
        numero_origen: gmailCfg.gmail_email,
        activo: gmailCfg.activo,
        cola_default_id: colaId,
      }).select("id").single();
      if (data) setGmailCanalId(data.id);
    }
    setGmailColaDraft(colaId);
    qc.invalidateQueries({ queryKey: ["lat_canales"] });
    toast.success("Cola por defecto guardada");
  };

  const quickToggleCanal = async (canal: CanalConTroncal) => {
    await db().from("lat_canales").update({ activo: !canal.activo }).eq("id", canal.id);
    qc.invalidateQueries({ queryKey: ["lat_canales"] });
    toast.success(canal.activo ? "Canal desactivado" : "Canal activado");
  };

  const closeEdit = () => {
    setEditMode(null);
    setCanalDraft({});
    setIsNewCanal(false);
  };

  const saveCanal = async () => {
    if (!canalDraft.nombre?.trim()) return;
    const payload = {
      nombre: canalDraft.nombre,
      tipo: canalDraft.tipo || "whatsapp",
      troncal_id: canalDraft.troncal_id || null,
      numero_origen: canalDraft.numero_origen || null,
      descripcion: canalDraft.descripcion || null,
      activo: canalDraft.activo ?? true,
      cola_default_id: canalDraft.cola_default_id || null,
    };
    if (isNewCanal) {
      await db().from("lat_canales").insert(payload);
      toast.success("Canal creado");
    } else {
      await db().from("lat_canales").update(payload).eq("id", canalDraft.id);
      toast.success("Canal actualizado");
    }
    qc.invalidateQueries({ queryKey: ["lat_canales"] });
    closeEdit();
  };

  const removeCanal = async (id: string) => {
    await db().from("lat_canales").delete().eq("id", id);
    toast.success("Canal eliminado");
    qc.invalidateQueries({ queryKey: ["lat_canales"] });
  };

  const toggleCanalActivo = async () => {
    const newActivo = !canalDraft.activo;
    await db().from("lat_canales").update({ activo: newActivo }).eq("id", canalDraft.id);
    setCanalDraft(p => ({ ...p, activo: newActivo }));
    qc.invalidateQueries({ queryKey: ["lat_canales"] });
    toast.success(newActivo ? "Canal activado" : "Canal desactivado");
  };

  // ── Troncal CRUD ──────────────────────────────────────────────────────────────

  const saveTroncal = async () => {
    if (!editingTroncal || !editingTroncal.nombre?.trim()) return;
    const payload = {
      nombre: editingTroncal.nombre,
      proveedor: editingTroncal.proveedor || "gupshup",
      tipo: editingTroncal.tipo || "whatsapp",
      numero: editingTroncal.numero || null,
      descripcion: editingTroncal.descripcion || null,
      activo: editingTroncal.activo ?? true,
    };
    if (isNewTroncal) {
      await db().from("lat_troncales").insert(payload);
      toast.success("Proveedor creado");
    } else {
      await db().from("lat_troncales").update(payload).eq("id", editingTroncal.id);
      toast.success("Proveedor actualizado");
    }
    qc.invalidateQueries({ queryKey: ["lat_troncales"] });
    qc.invalidateQueries({ queryKey: ["lat_canales"] });
    setEditingTroncal(null);
  };

  const removeTroncal = async (id: string) => {
    await db().from("lat_troncales").delete().eq("id", id);
    toast.success("Proveedor eliminado");
    qc.invalidateQueries({ queryKey: ["lat_troncales"] });
  };

  // ── Gmail actions ─────────────────────────────────────────────────────────────

  const handleGmailConnect = async () => {
    setConnectingGmail(true);
    const url = await fetchGmailOAuthUrl();
    setConnectingGmail(false);
    if (url) {
      window.open(url, "_blank");
    } else {
      toast.error("No se pudo obtener el URL de autorización de Gmail");
    }
  };

  const handleGmailDisconnect = async () => {
    if (!gmailCfg) return;
    setDisconnectingGmail(true);
    await db().from("lat_bot_config").update({
      gmail_access_token: null,
      gmail_refresh_token: null,
      gmail_token_expiry: null,
      activo: false,
      updated_at: new Date().toISOString(),
    }).eq("id", gmailCfg.id);
    qc.invalidateQueries({ queryKey: ["lat_bot_config", "email"] });
    setDisconnectingGmail(false);
    toast.success("Sesión de Gmail cerrada");
  };

  // ── Troncal form ──────────────────────────────────────────────────────────────

  if (editingTroncal) {
    return (
      <div className="p-6 max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setEditingTroncal(null)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h3 className="font-semibold text-sm">{isNewTroncal ? "Nuevo proveedor" : "Editar proveedor"}</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nombre *</label>
            <input className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={editingTroncal.nombre || ""} onChange={e => setEditingTroncal(p => ({ ...p, nombre: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Proveedor</label>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                value={editingTroncal.proveedor || "gupshup"} onChange={e => setEditingTroncal(p => ({ ...p, proveedor: e.target.value }))}>
                <option value="gupshup">Gupshup</option>
                <option value="twilio">Twilio</option>
                <option value="meta">Meta Business</option>
                <option value="google">Google Workspace</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                value={editingTroncal.tipo || "whatsapp"} onChange={e => setEditingTroncal(p => ({ ...p, tipo: e.target.value }))}>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="voz">Voz</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Número / Dirección</label>
            <input className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
              value={editingTroncal.numero || ""} onChange={e => setEditingTroncal(p => ({ ...p, numero: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Descripción</label>
            <textarea rows={2} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none resize-none"
              value={editingTroncal.descripcion || ""} onChange={e => setEditingTroncal(p => ({ ...p, descripcion: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={saveTroncal} className="gap-1.5"><Check className="w-3.5 h-3.5" />Guardar</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditingTroncal(null)}><X className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
    );
  }

  // ── Canal / Gmail edit view ───────────────────────────────────────────────────

  if (editMode !== null) {
    const isGmail = editMode.kind === "gmail";
    const currentTroncal = troncales.find(t => t.id === canalDraft.troncal_id);
    const tokenExpiry = gmailCfg?.gmail_token_expiry ? new Date(gmailCfg.gmail_token_expiry) : null;
    const isTokenExpired = tokenExpiry ? tokenExpiry < new Date() : false;
    const webhookUrl = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/wpp-webhook` : null;

    const editHeader = (
      <>
        <div className="flex items-center gap-3 px-6 pt-5 pb-0 shrink-0">
          <button onClick={closeEdit} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${isGmail ? TIPO_COLORS["email"] : TIPO_COLORS[canalDraft.tipo || "whatsapp"] || "bg-muted text-muted-foreground border-border"}`}>
              {isGmail ? "email" : canalDraft.tipo || "whatsapp"}
            </span>
            <span className="text-sm font-semibold truncate">
              {isGmail
                ? (gmailCfg?.nombre || gmailCfg?.gmail_email || "Gmail")
                : (canalDraft.nombre || (isNewCanal ? "Nuevo canal" : "Canal"))}
            </span>
          </div>
          <div className="shrink-0">
            {isGmail
              ? <ConnStatus activo={gmailCfg?.activo ?? false} hasToken={!!gmailCfg?.gmail_refresh_token} />
              : <ConnStatus activo={canalDraft.activo ?? false} />}
          </div>
        </div>
        <div className="flex items-center gap-1 px-6 pt-3 pb-0 border-b border-border shrink-0">
          {(["detalles", "reglas", "conexion"] as CanalEditTab[]).map(t => (
            <button
              key={t}
              onClick={() => setCanalTab(t)}
              className={[
                "px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors",
                canalTab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50",
              ].join(" ")}
            >
              {t === "detalles" ? "Detalles" : t === "reglas" ? "Reglas" : "Conexión"}
            </button>
          ))}
        </div>
      </>
    );

    const renderTabContent = () => {
      // ── Detalles ────────────────────────────────────────────────────────────
      if (canalTab === "detalles") {
        if (isGmail) {
          return (
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cuenta</p>
                <div className="p-4 rounded-xl border border-border bg-card space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Correo</span>
                    <span className="text-xs font-medium">{gmailCfg?.gmail_email ?? "No disponible"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Estado del token</span>
                    {gmailCfg?.gmail_refresh_token
                      ? <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isTokenExpired ? "bg-red-500/10 text-red-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                          {isTokenExpired ? "Expirado" : "Válido"}
                        </span>
                      : <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">Sin token</span>
                    }
                  </div>
                  {tokenExpiry && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Vence</span>
                      <span className="text-xs font-medium">{tokenExpiry.toLocaleString("es-BO")}</span>
                    </div>
                  )}
                  {gmailCfg?.updated_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Última actualización</span>
                      <span className="text-xs font-medium">{new Date(gmailCfg.updated_at).toLocaleString("es-BO")}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tipo</p>
                <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Canal</span>
                    <span className="text-xs font-medium">Gmail / Google Workspace</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Proveedor</span>
                    <span className="text-xs font-medium">Google</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Asignación por defecto</p>
                <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                  value={gmailColaDraft || ""}
                  onChange={e => setGmailColaDraft(e.target.value || null)}>
                  <option value="">Sin cola por defecto</option>
                  {colas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <p className="text-[10px] text-muted-foreground">Cola de destino cuando ninguna regla coincida con el correo entrante.</p>
                {!readonly && (
                  <Button size="sm" className="gap-1.5 w-full" onClick={() => saveGmailColaDefault(gmailColaDraft)}>
                    <Check className="w-3.5 h-3.5" />Guardar cola por defecto
                  </Button>
                )}
              </div>
            </div>
          );
        }
        // Regular canal
        return (
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Identificación</p>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nombre *</label>
                <input className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={canalDraft.nombre || ""} onChange={e => setCanalDraft(p => ({ ...p, nombre: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
                  <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                    value={canalDraft.tipo || "whatsapp"} onChange={e => setCanalDraft(p => ({ ...p, tipo: e.target.value }))}>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="instagram">Instagram</option>
                    <option value="facebook">Facebook</option>
                    <option value="email">Email</option>
                    <option value="web">Web Chat</option>
                    <option value="interno">Interno</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Número / Dirección</label>
                  <input className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                    placeholder="+591..." value={canalDraft.numero_origen || ""} onChange={e => setCanalDraft(p => ({ ...p, numero_origen: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Descripción</label>
                <textarea rows={2} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none resize-none"
                  value={canalDraft.descripcion || ""} onChange={e => setCanalDraft(p => ({ ...p, descripcion: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Proveedor de conexión</p>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                value={canalDraft.troncal_id || ""} onChange={e => setCanalDraft(p => ({ ...p, troncal_id: e.target.value || null }))}>
                <option value="">Sin proveedor asignado</option>
                {troncales.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre} — {t.proveedor}{t.numero ? ` · ${t.numero}` : ""}</option>
                ))}
              </select>
              {currentTroncal && (
                <div className="p-3 rounded-xl border border-border bg-card space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Proveedor</span>
                    <span className="text-xs font-medium">{currentTroncal.proveedor}</span>
                  </div>
                  {currentTroncal.numero && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Número</span>
                      <span className="text-xs font-medium">{currentTroncal.numero}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Estado del proveedor</span>
                    <ConnStatus activo={currentTroncal.activo} />
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Asignación por defecto</p>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Cola por defecto</label>
                <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                  value={canalDraft.cola_default_id || ""}
                  onChange={e => setCanalDraft(p => ({ ...p, cola_default_id: e.target.value || null }))}>
                  <option value="">Sin cola por defecto</option>
                  {colas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">Cola de destino cuando ninguna regla coincida con la comunicación entrante.</p>
              </div>
            </div>
            {!readonly && (
              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={saveCanal} className="gap-1.5"><Check className="w-3.5 h-3.5" />Guardar</Button>
                <Button size="sm" variant="ghost" onClick={closeEdit}><X className="w-3.5 h-3.5" /></Button>
              </div>
            )}
          </div>
        );
      }

      // ── Reglas ──────────────────────────────────────────────────────────────
      if (canalTab === "reglas") {
        if (isNewCanal) {
          return (
            <p className="text-xs text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
              Guarda el canal primero para configurar sus reglas.
            </p>
          );
        }
        const canalIdForRules = isGmail ? gmailCanalId : (canalDraft.id ?? null);
        const canalTipoForRules = isGmail ? "email" : (canalDraft.tipo || "whatsapp");
        if (!canalIdForRules) {
          return (
            <p className="text-xs text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
              {isGmail ? "Abre Detalles y guarda la cola por defecto para activar las reglas de este canal." : "No se pudo determinar el ID del canal."}
            </p>
          );
        }
        return <CanalReglasPanel canalId={canalIdForRules} canalTipo={canalTipoForRules} colas={colas} readonly={readonly} />;
      }

      // ── Conexión ────────────────────────────────────────────────────────────
      if (isGmail) {
        return (
          <div className="space-y-5">
            <div className="p-4 rounded-xl border border-border bg-card space-y-2">
              <p className="text-xs font-semibold">Estado de la conexión</p>
              <div className="flex items-center gap-2">
                <ConnStatus activo={gmailCfg?.activo ?? false} hasToken={!!gmailCfg?.gmail_refresh_token} />
                {gmailCfg?.gmail_email && (
                  <span className="text-xs text-muted-foreground">· {gmailCfg.gmail_email}</span>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Acciones</p>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleGmailConnect}
                disabled={connectingGmail || readonly}
              >
                <RefreshCw className={`w-4 h-4 ${connectingGmail ? "animate-spin" : ""}`} />
                {connectingGmail ? "Obteniendo URL..." : "Reconectar cuenta de Gmail"}
              </Button>
              {gmailCfg?.gmail_refresh_token && (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive"
                  onClick={handleGmailDisconnect}
                  disabled={disconnectingGmail || readonly}
                >
                  <LogOut className={`w-4 h-4 ${disconnectingGmail ? "animate-pulse" : ""}`} />
                  {disconnectingGmail ? "Cerrando sesión..." : "Cerrar sesión de Gmail"}
                </Button>
              )}
              <p className="text-[10px] text-muted-foreground">
                Al reconectar se abrirá la ventana de autorización de Google. Al cerrar sesión se eliminan los tokens de acceso.
              </p>
            </div>
          </div>
        );
      }

      // WhatsApp / otros
      return (
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Estado del canal</p>
            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
              <div>
                <p className="text-sm font-medium">{canalDraft.activo ? "Canal activo" : "Canal inactivo"}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {canalDraft.activo ? "Recibiendo y enviando mensajes" : "No recibe ni envía mensajes"}
                </p>
              </div>
              {!readonly && (
                <button
                  onClick={toggleCanalActivo}
                  className={`shrink-0 transition-colors ${canalDraft.activo ? "text-emerald-500 hover:text-emerald-700" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {canalDraft.activo ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                </button>
              )}
            </div>
          </div>
          {canalDraft.tipo === "whatsapp" && webhookUrl && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Webhook de entrada</p>
              <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                <p className="text-xs text-muted-foreground">URL a configurar en el panel de Gupshup:</p>
                <div className="flex items-center gap-2">
                  <code className="text-[10px] bg-muted px-2 py-1.5 rounded-md font-mono break-all flex-1">{webhookUrl}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL copiada"); }}
                    className="shrink-0 p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                    title="Copiar"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Proveedor asignado</p>
            {currentTroncal ? (
              <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Nombre</span>
                  <span className="text-xs font-medium">{currentTroncal.nombre}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Proveedor</span>
                  <span className="text-xs font-medium capitalize">{currentTroncal.proveedor}</span>
                </div>
                {currentTroncal.numero && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Número</span>
                    <span className="text-xs font-medium">{currentTroncal.numero}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Estado del proveedor</span>
                  <ConnStatus activo={currentTroncal.activo} />
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-border text-center">
                <p className="text-xs text-muted-foreground">Sin proveedor asignado. Configúralo en la pestaña Detalles.</p>
              </div>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col h-full">
        {editHeader}
        <div className="flex-1 overflow-auto p-6 max-w-lg">
          {renderTabContent()}
        </div>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────────

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Cargando...</div>;

  const totalActivos = canales.filter(c => c.activo).length + (gmailCfg?.activo ? 1 : 0);
  const total = canales.length + (gmailCfg ? 1 : 0);

  // ── Type selector overlay ──────────────────────────────────────────────────
  if (newCanalType === "select") {
    return (
      <div className="p-6 space-y-5 max-w-lg">
        <div className="flex items-center gap-2">
          <button onClick={() => setNewCanalType(null)} className="p-1.5 rounded hover:bg-accent text-muted-foreground">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-sm font-semibold">Nuevo canal</p>
            <p className="text-[10px] text-muted-foreground">Elige el tipo de canal a configurar</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => openNewCanal("whatsapp")}
            className="flex flex-col items-start gap-2 p-4 rounded-xl border-2 border-border hover:border-green-400 hover:bg-green-500/5 transition-colors text-left">
            <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold">WhatsApp</p>
              <p className="text-[10px] text-muted-foreground">Vía Gupshup, Meta o WATI</p>
            </div>
          </button>
          <button
            onClick={gmailCfg ? () => { setNewCanalType(null); openEditGmail(); } : handleGmailConnect}
            className="flex flex-col items-start gap-2 p-4 rounded-xl border-2 border-border hover:border-amber-400 hover:bg-amber-500/5 transition-colors text-left">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Mail className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold">Gmail / Email</p>
              <p className="text-[10px] text-muted-foreground">{gmailCfg ? "Ya configurado — ver detalles" : "Conectar cuenta Google"}</p>
            </div>
          </button>
          {(["Instagram", "Facebook", "SMS", "Web Chat"] as const).map(tipo => (
            <div key={tipo} className="flex flex-col items-start gap-2 p-4 rounded-xl border-2 border-dashed border-border opacity-50 cursor-not-allowed text-left">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <Globe className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">{tipo}</p>
                <p className="text-[10px] text-muted-foreground">Próximamente</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Canales */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Canales de comunicación</p>
            <p className="text-[10px] text-muted-foreground">{total} canales · {totalActivos} activos</p>
          </div>
          {!readonly && (
            <Button size="sm" className="gap-1.5 h-8" onClick={() => setNewCanalType("select")}>
              <Plus className="w-3.5 h-3.5" />Nuevo canal
            </Button>
          )}
        </div>
        <div className="space-y-2">
          {/* Gmail row */}
          {gmailCfg && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:bg-accent/30 group">
              <div className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${TIPO_COLORS["email"]}`}>
                <Mail className="w-3 h-3" />
                email
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{gmailCfg.nombre || gmailCfg.gmail_email || "Gmail"}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  Google · {gmailCfg.gmail_email ?? "No disponible"}
                  {gmailCfg.updated_at ? ` · Últ. sync ${new Date(gmailCfg.updated_at).toLocaleDateString("es-BO")}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <ConnStatus activo={gmailCfg.activo} hasToken={!!gmailCfg.gmail_refresh_token} />
              </div>
              {!readonly && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                  {!gmailCfg.gmail_refresh_token && (
                    <button onClick={handleGmailConnect} className="p-1.5 rounded hover:bg-accent" title="Conectar Gmail">
                      <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                  <button onClick={openEditGmail} className="p-1.5 rounded hover:bg-accent">
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* WhatsApp / other channels */}
          {canales.map((canal: CanalConTroncal) => {
            const TipoIcon = TIPO_ICONS[canal.tipo] || Globe;
            return (
              <div key={canal.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:bg-accent/30 group">
                <div className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${TIPO_COLORS[canal.tipo] || "bg-muted text-muted-foreground border-border"}`}>
                  <TipoIcon className="w-3 h-3" />
                  {canal.tipo}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{canal.nombre}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {canal.lat_troncales
                      ? `${canal.lat_troncales.proveedor}${canal.lat_troncales.numero ? ` · ${canal.lat_troncales.numero}` : ""}`
                      : "Sin proveedor"
                    }
                    {canal.numero_origen ? ` · ${canal.numero_origen}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <ConnStatus activo={canal.activo} />
                </div>
                {!readonly && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <button onClick={() => quickToggleCanal(canal)} className="p-1.5 rounded hover:bg-accent" title={canal.activo ? "Desactivar" : "Activar"}>
                      {canal.activo ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                    </button>
                    <button onClick={() => openEditCanal(canal)} className="p-1.5 rounded hover:bg-accent">
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => removeCanal(canal.id)} className="p-1.5 rounded hover:bg-destructive/10">
                      <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Separator */}
      <div className="border-t border-border" />

      {/* Proveedores / Troncales */}
      <div className="space-y-3">
        <button
          className="flex items-center justify-between w-full group"
          onClick={() => setShowTroncales(v => !v)}
        >
          <div>
            <p className="text-sm font-semibold flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-muted-foreground" />
              Proveedores de conexión
            </p>
            <p className="text-[10px] text-muted-foreground text-left">{troncales.length} proveedores · credenciales y webhooks</p>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showTroncales ? "rotate-180" : ""}`} />
        </button>

        {showTroncales && (
          <div className="space-y-3">
            {!readonly && (
              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => { setIsNewTroncal(true); setEditingTroncal({ activo: true, tipo: "whatsapp", proveedor: "gupshup" }); }}>
                  <Plus className="w-3.5 h-3.5" />Nuevo proveedor
                </Button>
              </div>
            )}
            <div className="space-y-2">
              {troncales.map(t => (
                <div key={t.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:bg-accent/30 group">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Phone className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.nombre}</p>
                    <p className="text-[10px] text-muted-foreground">{t.proveedor} · {t.tipo}{t.numero ? ` · ${t.numero}` : ""}</p>
                  </div>
                  <Badge variant={t.activo ? "default" : "secondary"} className="text-[10px] shrink-0">
                    {t.activo ? "Activo" : "Inactivo"}
                  </Badge>
                  {!readonly && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                      <button onClick={() => { setIsNewTroncal(false); setEditingTroncal(t); }} className="p-1.5 rounded hover:bg-accent">
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => removeTroncal(t.id)} className="p-1.5 rounded hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {troncales.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No hay proveedores configurados</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="border-t border-border" />

      {/* Reglas globales */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
            Reglas globales
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Se evalúan en todos los canales cuando ninguna regla de canal coincide.
          </p>
        </div>
        <CanalReglasPanel canalId={null} colas={colas} readonly={readonly} />
      </div>
    </div>
  );
}

// ─── COLAS TAB ───────────────────────────────────────────────────────────────

function ColasTab({ readonly }: { readonly: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Cola> | null>(null);
  const [isNew, setIsNew] = useState(false);

  const { data: colas = [], isLoading } = useQuery<Cola[]>({
    queryKey: ["lat_colas"],
    queryFn: async () => {
      const { data } = await db().from("lat_colas").select("*").order("orden");
      return data || [];
    },
  });

  const { data: canales = [] } = useQuery<Canal[]>({
    queryKey: ["lat_canales"],
    queryFn: async () => {
      const { data } = await db().from("lat_canales").select("id, nombre, tipo").order("nombre");
      return data || [];
    },
  });

  const save = async () => {
    if (!editing || !editing.nombre?.trim()) return;
    const payload = {
      nombre: editing.nombre,
      descripcion: editing.descripcion || null,
      area: editing.area || null,
      canal_id: editing.canal_id || null,
      estrategia_asignacion: editing.estrategia_asignacion || "round_robin",
      max_conversaciones_agente: editing.max_conversaciones_agente || 5,
      activa: editing.activa ?? true,
      color: editing.color || "#6366f1",
      icono: editing.icono || null,
    };
    if (isNew) {
      await db().from("lat_colas").insert({ ...payload, orden: colas.length + 1 });
      toast.success("Cola creada");
    } else {
      await db().from("lat_colas").update(payload).eq("id", editing.id);
      toast.success("Cola actualizada");
    }
    qc.invalidateQueries({ queryKey: ["lat_colas"] });
    setEditing(null);
  };

  const toggle = async (cola: Cola) => {
    await db().from("lat_colas").update({ activa: !cola.activa }).eq("id", cola.id);
    qc.invalidateQueries({ queryKey: ["lat_colas"] });
  };

  const remove = async (id: string) => {
    await db().from("lat_colas").delete().eq("id", id);
    toast.success("Cola eliminada");
    qc.invalidateQueries({ queryKey: ["lat_colas"] });
  };

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Cargando...</div>;

  if (editing) {
    return (
      <div className="p-6 max-w-lg space-y-4">
        <h3 className="font-semibold text-sm">{isNew ? "Nueva cola" : "Editar cola"}</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nombre *</label>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={editing.nombre || ""}
              onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Área</label>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={editing.area || ""}
                onChange={e => setEditing(p => ({ ...p, area: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  className="w-10 h-9 border border-border rounded-lg cursor-pointer"
                  value={editing.color || "#6366f1"}
                  onChange={e => setEditing(p => ({ ...p, color: e.target.value }))}
                />
                <input
                  className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                  value={editing.color || "#6366f1"}
                  onChange={e => setEditing(p => ({ ...p, color: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Estrategia</label>
              <select
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                value={editing.estrategia_asignacion || "round_robin"}
                onChange={e => setEditing(p => ({ ...p, estrategia_asignacion: e.target.value }))}
              >
                <option value="round_robin">Round Robin</option>
                <option value="menos_carga">Menos Carga</option>
                <option value="primero_disponible">Primer Disponible</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Máx. conv/agente</label>
              <input
                type="number" min={1} max={50}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                value={editing.max_conversaciones_agente || 5}
                onChange={e => setEditing(p => ({ ...p, max_conversaciones_agente: parseInt(e.target.value) || 5 }))}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Canal</label>
            <select
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
              value={editing.canal_id || ""}
              onChange={e => setEditing(p => ({ ...p, canal_id: e.target.value || null }))}
            >
              <option value="">Sin canal</option>
              {canales.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Descripción</label>
            <textarea
              rows={2}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none resize-none"
              value={editing.descripcion || ""}
              onChange={e => setEditing(p => ({ ...p, descripcion: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} className="gap-1.5"><Check className="w-3.5 h-3.5" />Guardar</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{colas.length} colas configuradas</p>
        {!readonly && (
          <Button size="sm" className="gap-1.5 h-8" onClick={() => { setIsNew(true); setEditing({ activa: true, estrategia_asignacion: "round_robin", max_conversaciones_agente: 5, color: "#6366f1" }); }}>
            <Plus className="w-3.5 h-3.5" />Nueva cola
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {colas.map(cola => (
          <div key={cola.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors group">
            <ColaBadge color={cola.color} nombre={cola.nombre} icono={cola.icono} />
            <div className="flex-1 min-w-0">
              {cola.area && <span className="text-[10px] text-muted-foreground">{cola.area}</span>}
            </div>
            <Badge variant="outline" className="text-[10px] hidden sm:inline-flex shrink-0">
              {cola.estrategia_asignacion.replace("_", " ")}
            </Badge>
            <span className="text-[10px] text-muted-foreground shrink-0">máx {cola.max_conversaciones_agente}</span>
            {!readonly && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => toggle(cola)}
                  className="p-1.5 rounded hover:bg-accent transition-colors"
                  title={cola.activa ? "Desactivar" : "Activar"}
                >
                  {cola.activa
                    ? <ToggleRight className="w-4 h-4 text-emerald-500" />
                    : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                </button>
                <button onClick={() => { setIsNew(false); setEditing(cola); }} className="p-1.5 rounded hover:bg-accent transition-colors">
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button onClick={() => remove(cola.id)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                </button>
              </div>
            )}
            {!cola.activa && <Badge variant="secondary" className="text-[10px] shrink-0">Inactiva</Badge>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── HORARIOS TAB ─────────────────────────────────────────────────────────────

function HorariosTab({ readonly }: { readonly: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Horario> | null>(null);
  const [isNew, setIsNew] = useState(false);

  const { data: horarios = [], isLoading } = useQuery<Horario[]>({
    queryKey: ["lat_horarios"],
    queryFn: async () => {
      const { data } = await db().from("lat_horarios").select("*").order("nombre");
      return (data || []).map((h: any) => ({
        ...h,
        franjas: typeof h.franjas === "object" ? h.franjas : {},
      }));
    },
  });

  const defaultFranjas = () => ({
    lunes: { inicio: "08:00", fin: "18:00" },
    martes: { inicio: "08:00", fin: "18:00" },
    miercoles: { inicio: "08:00", fin: "18:00" },
    jueves: { inicio: "08:00", fin: "18:00" },
    viernes: { inicio: "08:00", fin: "18:00" },
    sabado: null, domingo: null,
  });

  const save = async () => {
    if (!editing || !editing.nombre?.trim()) return;
    const payload = {
      nombre: editing.nombre,
      zona_horaria: editing.zona_horaria || "America/La_Paz",
      franjas: editing.franjas || defaultFranjas(),
      activo: editing.activo ?? true,
    };
    if (isNew) {
      await db().from("lat_horarios").insert(payload);
      toast.success("Horario creado");
    } else {
      await db().from("lat_horarios").update(payload).eq("id", editing.id);
      toast.success("Horario actualizado");
    }
    qc.invalidateQueries({ queryKey: ["lat_horarios"] });
    setEditing(null);
  };

  const remove = async (id: string) => {
    await db().from("lat_horarios").delete().eq("id", id);
    toast.success("Horario eliminado");
    qc.invalidateQueries({ queryKey: ["lat_horarios"] });
  };

  const toggleDia = (dia: string) => {
    setEditing(p => {
      const franjas = { ...(p?.franjas || {}) };
      franjas[dia] = franjas[dia] ? null : { inicio: "08:00", fin: "18:00" };
      return { ...p, franjas };
    });
  };

  const updateFranja = (dia: string, key: "inicio" | "fin", val: string) => {
    setEditing(p => {
      const franjas = { ...(p?.franjas || {}) };
      franjas[dia] = { ...(franjas[dia] || { inicio: "08:00", fin: "18:00" }), [key]: val };
      return { ...p, franjas };
    });
  };

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Cargando...</div>;

  if (editing) {
    return (
      <div className="p-6 max-w-lg space-y-4">
        <h3 className="font-semibold text-sm">{isNew ? "Nuevo horario" : "Editar horario"}</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nombre *</label>
              <input className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={editing.nombre || ""} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Zona horaria</label>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                value={editing.zona_horaria || "America/La_Paz"} onChange={e => setEditing(p => ({ ...p, zona_horaria: e.target.value }))}>
                <option value="America/La_Paz">America/La_Paz (BOT)</option>
                <option value="America/Lima">America/Lima (PET)</option>
                <option value="America/Santiago">America/Santiago (CLT)</option>
                <option value="America/Buenos_Aires">America/Buenos_Aires (ART)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Franjas horarias</label>
            <div className="space-y-2">
              {DIAS.map(dia => {
                const franja = (editing.franjas || {})[dia];
                const activo = franja !== null && franja !== undefined;
                return (
                  <div key={dia} className="flex items-center gap-3">
                    <button
                      onClick={() => toggleDia(dia)}
                      className={`w-9 text-xs font-medium rounded-md py-1 transition-colors ${activo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                    >
                      {DIAS_LABELS[dia]}
                    </button>
                    {activo ? (
                      <div className="flex items-center gap-1.5">
                        <input type="time" className="border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none"
                          value={(franja as any)?.inicio || "08:00"} onChange={e => updateFranja(dia, "inicio", e.target.value)} />
                        <span className="text-xs text-muted-foreground">–</span>
                        <input type="time" className="border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none"
                          value={(franja as any)?.fin || "18:00"} onChange={e => updateFranja(dia, "fin", e.target.value)} />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Cerrado</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} className="gap-1.5"><Check className="w-3.5 h-3.5" />Guardar</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{horarios.length} horarios</p>
        {!readonly && (
          <Button size="sm" className="gap-1.5 h-8" onClick={() => { setIsNew(true); setEditing({ activo: true, zona_horaria: "America/La_Paz", franjas: defaultFranjas() }); }}>
            <Plus className="w-3.5 h-3.5" />Nuevo horario
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {horarios.map(h => {
          const diasActivos = DIAS.filter(d => h.franjas[d] !== null && h.franjas[d] !== undefined);
          return (
            <div key={h.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:bg-accent/30 group">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{h.nombre}</p>
                <div className="flex gap-1 mt-0.5">
                  {DIAS.map(dia => (
                    <span key={dia} className={`text-[9px] px-1 rounded ${h.franjas[dia] ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {DIAS_LABELS[dia]}
                    </span>
                  ))}
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{diasActivos.length}d/semana</span>
              {!readonly && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                  <button onClick={() => { setIsNew(false); setEditing(h); }} className="p-1.5 rounded hover:bg-accent">
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => remove(h.id)} className="p-1.5 rounded hover:bg-destructive/10">
                    <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── AGENTES IA TAB ───────────────────────────────────────────────────────────

function AgentesIATab({ readonly }: { readonly: boolean }) {
  const [agente, setAgente] = useState<"whatsapp" | "email">("whatsapp");

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab selector */}
      <div className="flex items-center gap-2 px-6 pt-5 pb-0">
        <button
          onClick={() => setAgente("whatsapp")}
          className={[
            "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors",
            agente === "whatsapp"
              ? "bg-fuchsia-500/10 text-fuchsia-700 border border-fuchsia-200"
              : "text-muted-foreground hover:bg-accent border border-transparent",
          ].join(" ")}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Lati — WhatsApp
        </button>
        <button
          onClick={() => setAgente("email")}
          className={[
            "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors",
            agente === "email"
              ? "bg-blue-500/10 text-blue-700 border border-blue-200"
              : "text-muted-foreground hover:bg-accent border border-transparent",
          ].join(" ")}
        >
          <Mail className="w-3.5 h-3.5" />
          Email IA — total@estropical.com
        </button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <LatBotConfig readonly={readonly} canal={agente} />
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview",   label: "Vista General", icon: Activity },
  { id: "canales",    label: "Canales",        icon: Globe },
  { id: "colas",      label: "Colas",          icon: Layers },
  { id: "horarios",   label: "Horarios",       icon: Clock },
  { id: "agentes-ia", label: "Agentes IA",     icon: Bot },
];

interface Props { readonly?: boolean; }

export function LatOmnicanalConfig({ readonly = false }: Props) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-4 pb-0 border-b border-border bg-card overflow-x-auto shrink-0">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap",
                tab === t.id
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50",
              ].join(" ")}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
        {readonly && (
          <span className="ml-auto text-[10px] text-muted-foreground px-2 shrink-0">Solo lectura</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === "overview"   && <VistaGeneralTab />}
        {tab === "canales"    && <CanalesTab    readonly={readonly} />}
        {tab === "colas"      && <ColasTab      readonly={readonly} />}
        {tab === "horarios"   && <HorariosTab   readonly={readonly} />}
        {tab === "agentes-ia" && <AgentesIATab  readonly={readonly} />}
      </div>
    </div>
  );
}

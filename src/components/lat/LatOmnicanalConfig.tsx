import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Phone, Globe, Layers, ClipboardList, Clock, Plus, Pencil, Trash2,
  Check, X, ChevronDown, ChevronUp, ToggleLeft, ToggleRight,
  AlertCircle, Zap, DollarSign, Star, HelpCircle, Bus, Plane,
  FileText, Users, Briefcase, BarChart3, Bot
} from "lucide-react";
import { LatBotConfig } from "./LatBotConfig";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "colas" | "canales" | "troncales" | "reglas" | "horarios" | "bot";

interface Troncal {
  id: string; nombre: string; proveedor: string; tipo: string;
  numero: string | null; activo: boolean; descripcion: string | null;
}

interface Canal {
  id: string; troncal_id: string | null; nombre: string; tipo: string;
  numero_origen: string | null; activo: boolean; descripcion: string | null;
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
  condiciones: Condicion[]; accion: { tipo: string; cola_nombre: string };
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

// ─── CANALES TAB ──────────────────────────────────────────────────────────────

function CanalesTab({ readonly }: { readonly: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Canal> | null>(null);
  const [isNew, setIsNew] = useState(false);

  const { data: canales = [], isLoading } = useQuery<Canal[]>({
    queryKey: ["lat_canales"],
    queryFn: async () => {
      const { data } = await db().from("lat_canales").select("*, lat_troncales(nombre)").order("nombre");
      return data || [];
    },
  });

  const { data: troncales = [] } = useQuery<Troncal[]>({
    queryKey: ["lat_troncales"],
    queryFn: async () => {
      const { data } = await db().from("lat_troncales").select("id, nombre, tipo").order("nombre");
      return data || [];
    },
  });

  const save = async () => {
    if (!editing || !editing.nombre?.trim()) return;
    const payload = {
      nombre: editing.nombre,
      tipo: editing.tipo || "whatsapp",
      troncal_id: editing.troncal_id || null,
      numero_origen: editing.numero_origen || null,
      descripcion: editing.descripcion || null,
      activo: editing.activo ?? true,
    };
    if (isNew) {
      await db().from("lat_canales").insert(payload);
      toast.success("Canal creado");
    } else {
      await db().from("lat_canales").update(payload).eq("id", editing.id);
      toast.success("Canal actualizado");
    }
    qc.invalidateQueries({ queryKey: ["lat_canales"] });
    setEditing(null);
  };

  const remove = async (id: string) => {
    await db().from("lat_canales").delete().eq("id", id);
    toast.success("Canal eliminado");
    qc.invalidateQueries({ queryKey: ["lat_canales"] });
  };

  const TIPO_COLORS: Record<string, string> = {
    whatsapp: "bg-green-500/10 text-green-600",
    instagram: "bg-purple-500/10 text-purple-600",
    facebook: "bg-blue-500/10 text-blue-600",
    email: "bg-amber-500/10 text-amber-600",
    web: "bg-cyan-500/10 text-cyan-600",
    interno: "bg-slate-500/10 text-slate-600",
  };

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Cargando...</div>;

  if (editing) {
    return (
      <div className="p-6 max-w-lg space-y-4">
        <h3 className="font-semibold text-sm">{isNew ? "Nuevo canal" : "Editar canal"}</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nombre *</label>
            <input className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={editing.nombre || ""} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                value={editing.tipo || "whatsapp"} onChange={e => setEditing(p => ({ ...p, tipo: e.target.value }))}>
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="email">Email</option>
                <option value="web">Web Chat</option>
                <option value="interno">Interno</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Troncal</label>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                value={editing.troncal_id || ""} onChange={e => setEditing(p => ({ ...p, troncal_id: e.target.value || null }))}>
                <option value="">Sin troncal</option>
                {troncales.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Número origen</label>
            <input className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
              value={editing.numero_origen || ""} onChange={e => setEditing(p => ({ ...p, numero_origen: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Descripción</label>
            <textarea rows={2} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none resize-none"
              value={editing.descripcion || ""} onChange={e => setEditing(p => ({ ...p, descripcion: e.target.value }))} />
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
        <p className="text-xs text-muted-foreground">{canales.length} canales</p>
        {!readonly && (
          <Button size="sm" className="gap-1.5 h-8" onClick={() => { setIsNew(true); setEditing({ activo: true, tipo: "whatsapp" }); }}>
            <Plus className="w-3.5 h-3.5" />Nuevo canal
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {canales.map((canal: any) => (
          <div key={canal.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:bg-accent/30 group">
            <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${TIPO_COLORS[canal.tipo] || "bg-muted text-muted-foreground"}`}>
              {canal.tipo}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{canal.nombre}</p>
              {canal.lat_troncales && (
                <p className="text-[10px] text-muted-foreground truncate">Troncal: {canal.lat_troncales.nombre}</p>
              )}
            </div>
            {canal.numero_origen && (
              <span className="text-xs text-muted-foreground shrink-0">{canal.numero_origen}</span>
            )}
            {!readonly && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                <button onClick={() => { setIsNew(false); setEditing(canal); }} className="p-1.5 rounded hover:bg-accent">
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button onClick={() => remove(canal.id)} className="p-1.5 rounded hover:bg-destructive/10">
                  <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TRONCALES TAB ────────────────────────────────────────────────────────────

function TroncalesTab({ readonly }: { readonly: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Troncal> | null>(null);
  const [isNew, setIsNew] = useState(false);

  const { data: troncales = [], isLoading } = useQuery<Troncal[]>({
    queryKey: ["lat_troncales"],
    queryFn: async () => {
      const { data } = await db().from("lat_troncales").select("*").order("nombre");
      return data || [];
    },
  });

  const save = async () => {
    if (!editing || !editing.nombre?.trim()) return;
    const payload = {
      nombre: editing.nombre,
      proveedor: editing.proveedor || "gupshup",
      tipo: editing.tipo || "whatsapp",
      numero: editing.numero || null,
      descripcion: editing.descripcion || null,
      activo: editing.activo ?? true,
    };
    if (isNew) {
      await db().from("lat_troncales").insert(payload);
      toast.success("Troncal creado");
    } else {
      await db().from("lat_troncales").update(payload).eq("id", editing.id);
      toast.success("Troncal actualizado");
    }
    qc.invalidateQueries({ queryKey: ["lat_troncales"] });
    setEditing(null);
  };

  const remove = async (id: string) => {
    await db().from("lat_troncales").delete().eq("id", id);
    toast.success("Troncal eliminado");
    qc.invalidateQueries({ queryKey: ["lat_troncales"] });
  };

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Cargando...</div>;

  if (editing) {
    return (
      <div className="p-6 max-w-lg space-y-4">
        <h3 className="font-semibold text-sm">{isNew ? "Nuevo troncal" : "Editar troncal"}</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nombre *</label>
            <input className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={editing.nombre || ""} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Proveedor</label>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                value={editing.proveedor || "gupshup"} onChange={e => setEditing(p => ({ ...p, proveedor: e.target.value }))}>
                <option value="gupshup">Gupshup</option>
                <option value="twilio">Twilio</option>
                <option value="meta">Meta Business</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                value={editing.tipo || "whatsapp"} onChange={e => setEditing(p => ({ ...p, tipo: e.target.value }))}>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="voz">Voz</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Número</label>
            <input className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
              value={editing.numero || ""} onChange={e => setEditing(p => ({ ...p, numero: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Descripción</label>
            <textarea rows={2} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none resize-none"
              value={editing.descripcion || ""} onChange={e => setEditing(p => ({ ...p, descripcion: e.target.value }))} />
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
        <p className="text-xs text-muted-foreground">{troncales.length} troncales</p>
        {!readonly && (
          <Button size="sm" className="gap-1.5 h-8" onClick={() => { setIsNew(true); setEditing({ activo: true, tipo: "whatsapp", proveedor: "gupshup" }); }}>
            <Plus className="w-3.5 h-3.5" />Nuevo troncal
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {troncales.map(t => (
          <div key={t.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:bg-accent/30 group">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4 text-primary" />
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
                <button onClick={() => { setIsNew(false); setEditing(t); }} className="p-1.5 rounded hover:bg-accent">
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button onClick={() => remove(t.id)} className="p-1.5 rounded hover:bg-destructive/10">
                  <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── REGLAS TAB ───────────────────────────────────────────────────────────────

const CAMPOS = [
  { value: "mensaje_inicial", label: "Mensaje inicial" },
  { value: "canal_tipo", label: "Canal tipo" },
  { value: "hora_ingreso", label: "Hora de ingreso" },
  { value: "cliente_area", label: "Área del cliente" },
];

const OPERADORES = [
  { value: "contiene", label: "contiene" },
  { value: "no_contiene", label: "no contiene" },
  { value: "es", label: "es igual a" },
  { value: "empieza_con", label: "empieza con" },
];

function ReglasTab({ readonly }: { readonly: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Regla> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: reglas = [], isLoading } = useQuery<Regla[]>({
    queryKey: ["lat_reglas"],
    queryFn: async () => {
      const { data } = await db().from("lat_reglas_asignacion").select("*").order("prioridad");
      return (data || []).map((r: any) => ({
        ...r,
        condiciones: Array.isArray(r.condiciones) ? r.condiciones : [],
        accion: typeof r.accion === "object" ? r.accion : {},
      }));
    },
  });

  const { data: colas = [] } = useQuery<Cola[]>({
    queryKey: ["lat_colas"],
    queryFn: async () => {
      const { data } = await db().from("lat_colas").select("id, nombre, color, icono").order("orden");
      return data || [];
    },
  });

  const save = async () => {
    if (!editing || !editing.nombre?.trim()) return;
    const payload = {
      nombre: editing.nombre,
      descripcion: editing.descripcion || null,
      activa: editing.activa ?? true,
      prioridad: editing.prioridad ?? 50,
      condiciones: editing.condiciones || [],
      accion: editing.accion || { tipo: "asignar_cola", cola_nombre: "" },
    };
    if (isNew) {
      await db().from("lat_reglas_asignacion").insert(payload);
      toast.success("Regla creada");
    } else {
      await db().from("lat_reglas_asignacion").update(payload).eq("id", editing.id);
      toast.success("Regla actualizada");
    }
    qc.invalidateQueries({ queryKey: ["lat_reglas"] });
    setEditing(null);
  };

  const remove = async (id: string) => {
    await db().from("lat_reglas_asignacion").delete().eq("id", id);
    toast.success("Regla eliminada");
    qc.invalidateQueries({ queryKey: ["lat_reglas"] });
  };

  const toggle = async (r: Regla) => {
    await db().from("lat_reglas_asignacion").update({ activa: !r.activa }).eq("id", r.id);
    qc.invalidateQueries({ queryKey: ["lat_reglas"] });
  };

  const addCondicion = () => {
    setEditing(p => ({
      ...p,
      condiciones: [...(p?.condiciones || []), { campo: "mensaje_inicial", operador: "contiene", valor: "" }]
    }));
  };

  const removeCondicion = (idx: number) => {
    setEditing(p => ({
      ...p,
      condiciones: (p?.condiciones || []).filter((_, i) => i !== idx)
    }));
  };

  const updateCondicion = (idx: number, key: keyof Condicion, val: string) => {
    setEditing(p => ({
      ...p,
      condiciones: (p?.condiciones || []).map((c, i) => i === idx ? { ...c, [key]: val } : c)
    }));
  };

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Cargando...</div>;

  if (editing) {
    return (
      <div className="p-6 max-w-2xl space-y-4">
        <h3 className="font-semibold text-sm">{isNew ? "Nueva regla" : "Editar regla"}</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Nombre *</label>
              <input className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={editing.nombre || ""} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prioridad (menor = antes)</label>
              <input type="number" min={1} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                value={editing.prioridad ?? 50} onChange={e => setEditing(p => ({ ...p, prioridad: parseInt(e.target.value) || 50 }))} />
            </div>
          </div>

          {/* Condiciones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">Condiciones <span className="text-muted-foreground font-normal">(todas deben cumplirse)</span></label>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addCondicion}>
                <Plus className="w-3 h-3" />Agregar
              </Button>
            </div>
            {(editing.condiciones || []).length === 0 && (
              <div className="text-xs text-muted-foreground p-3 rounded-lg border border-dashed border-border text-center">
                Sin condiciones — la regla se aplica a todas las conversaciones (regla por defecto)
              </div>
            )}
            {(editing.condiciones || []).map((cond, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-2">
                <select className="border border-border rounded-lg px-2 py-1.5 text-xs bg-background focus:outline-none"
                  value={cond.campo} onChange={e => updateCondicion(idx, "campo", e.target.value)}>
                  {CAMPOS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <select className="border border-border rounded-lg px-2 py-1.5 text-xs bg-background focus:outline-none"
                  value={cond.operador} onChange={e => updateCondicion(idx, "operador", e.target.value)}>
                  {OPERADORES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs bg-background focus:outline-none"
                  placeholder="valor..." value={cond.valor} onChange={e => updateCondicion(idx, "valor", e.target.value)} />
                <button onClick={() => removeCondicion(idx)} className="p-1 rounded hover:bg-destructive/10">
                  <X className="w-3.5 h-3.5 text-destructive/70" />
                </button>
              </div>
            ))}
          </div>

          {/* Acción */}
          <div>
            <label className="text-xs font-medium mb-2 block">Acción — asignar a cola</label>
            <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
              value={editing.accion?.cola_nombre || ""}
              onChange={e => setEditing(p => ({ ...p, accion: { tipo: "asignar_cola", cola_nombre: e.target.value } }))}>
              <option value="">Seleccionar cola...</option>
              {colas.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
            </select>
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
        <p className="text-xs text-muted-foreground">{reglas.length} reglas · se evalúan en orden de prioridad</p>
        {!readonly && (
          <Button size="sm" className="gap-1.5 h-8" onClick={() => { setIsNew(true); setEditing({ activa: true, prioridad: 50, condiciones: [], accion: { tipo: "asignar_cola", cola_nombre: "" } }); }}>
            <Plus className="w-3.5 h-3.5" />Nueva regla
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {reglas.map(r => {
          const cola = colas.find(c => c.nombre === r.accion?.cola_nombre);
          return (
            <div key={r.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div
                className="flex items-center gap-3 p-3.5 hover:bg-accent/20 cursor-pointer"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                  {r.prioridad}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.nombre}</p>
                  {r.condiciones.length > 0 ? (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {r.condiciones.length} condición(es) → {r.accion?.cola_nombre || "?"}
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">Regla por defecto → {r.accion?.cola_nombre || "?"}</p>
                  )}
                </div>
                {cola && <ColaBadge color={cola.color} nombre={cola.nombre} icono={cola.icono} />}
                {!r.activa && <Badge variant="secondary" className="text-[10px]">Inactiva</Badge>}
                {expanded === r.id ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
              </div>
              {expanded === r.id && (
                <div className="border-t border-border px-4 py-3 bg-accent/10 space-y-2">
                  {r.condiciones.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">Sin condiciones — se aplica a cualquier conversación</p>
                  )}
                  {r.condiciones.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded bg-muted font-mono">{c.campo}</span>
                      <span className="text-muted-foreground">{c.operador}</span>
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">{c.valor}</span>
                    </div>
                  ))}
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

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "colas",     label: "Colas",     icon: Layers },
  { id: "canales",   label: "Canales",   icon: Globe },
  { id: "troncales", label: "Troncales", icon: Phone },
  { id: "reglas",    label: "Reglas",    icon: Zap },
  { id: "horarios",  label: "Horarios",  icon: Clock },
  { id: "bot",       label: "Lati IA",   icon: Bot },
];

interface Props { readonly?: boolean; }

export function LatOmnicanalConfig({ readonly = false }: Props) {
  const [tab, setTab] = useState<Tab>("colas");

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
        {tab === "colas"     && <ColasTab     readonly={readonly} />}
        {tab === "canales"   && <CanalesTab   readonly={readonly} />}
        {tab === "troncales" && <TroncalesTab readonly={readonly} />}
        {tab === "reglas"    && <ReglasTab    readonly={readonly} />}
        {tab === "horarios"  && <HorariosTab  readonly={readonly} />}
        {tab === "bot"       && (
          <div className="p-6">
            <LatBotConfig readonly={readonly} />
          </div>
        )}
      </div>
    </div>
  );
}

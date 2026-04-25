import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreateClienteDialog } from "@/components/CreateClienteDialog";
import { GestionDetailView } from "@/components/GestionDetailView";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUserRol } from "@/hooks/useSharedQueries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Users, Search, Phone, Mail, MapPin, Calendar, User,
  Star, AlertTriangle, FileText, Plane, CreditCard,
  MessageSquare, Heart, DollarSign, Wallet,
  CheckCircle2, Clock, Globe, Landmark,
  Sparkles, RefreshCw, Home, Tag, Building2, UserCircle,
  ClipboardList, Pencil, Plus, Trash2, X, Check,
  Video, PhoneCall, ExternalLink, Send, ChevronRight, Inbox,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgente", className: "bg-red-500/15 text-red-600"         },
  high:   { label: "Alta",    className: "bg-orange-500/15 text-orange-600"   },
  medium: { label: "Media",   className: "bg-primary/10 text-primary"         },
  low:    { label: "Baja",    className: "bg-muted text-muted-foreground"      },
};

const statusDot: Record<string, string> = {
  to_do:  "bg-status-todo",
  doing:  "bg-status-doing",
  review: "bg-status-review",
  done:   "bg-status-done",
};

// ─── Local types (until Supabase types.ts regenerates after migration) ───────

type Cliente = {
  id: string;
  tipo_cliente: "natural" | "juridica";
  nombre_completo: string;
  razon_social: string | null;
  nit: string | null;
  contacto_nombre: string | null;
  contacto_cargo: string | null;
  email: string | null;
  email_secundario: string | null;
  telefono: string | null;
  telefono_secundario: string | null;
  documento_tipo: string | null;
  documento_numero: string | null;
  fecha_nacimiento: string | null;
  nacionalidad: string | null;
  ciudad: string | null;
  pais: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  estado: string;
  profesion: string | null;
  estado_civil: string | null;
  club_viajes: boolean;
  espacio_a_bordo: boolean;
  pases_a_bordo: number;
  asesor_nombre: string | null;
  score_valor: number;
  score_etiqueta: string | null;
  notas_rapidas: string | null;
  dias_credito: number | null;
  created_at: string;
  updated_at: string;
};

type Documento = {
  id: string;
  tipo: string;
  numero: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  pais_emisor: string | null;
  observaciones: string | null;
};

type Banco       = { id: string; banco: string; tipo_cuenta: string | null; observaciones: string | null };
type Lealtad     = { id: string; programa: string; numero_membresia: string | null; estado: string | null; nivel: string | null; millas_acumuladas: number | null; observaciones: string | null };
type Viaje       = { id: string; destino: string; fecha_salida: string | null; fecha_regreso: string | null; tipo_viaje: string | null; estado: string | null; monto: number | null };
type IdeaViaje   = { id: string; destino: string; notas: string | null; prioridad: string | null };
type Referido = { id: string; referido_nombre: string | null; referido_id: string | null; tipo: string; fecha: string | null; observaciones: string | null };
type Familiar = { id: string; nombre: string; relacion: string; fecha_nacimiento: string | null; documento_numero: string | null; familiar_cliente_id: string | null };
type Pago        = { id: string; tipo: string; monto: number; moneda: string | null; concepto: string | null; fecha: string | null; estado: string | null };
type Cobranza    = { id: string; concepto: string; monto: number; moneda: string; fecha_emision: string | null; fecha_vencimiento: string | null; estado: string; notas: string | null };

// ─── Constants ────────────────────────────────────────────────────────────────

const PROGRAMAS_LEALTAD = [
  // Aerolíneas — Sudamérica / regionales
  "LATAM Pass", "Aerolíneas Plus", "LifeMiles (Avianca)", "Smiles (GOL)",
  "ConnectMiles (Copa)", "Iberia Plus",
  // Aerolíneas — globales
  "Flying Blue (Air France/KLM)", "Miles & More (Lufthansa)",
  "AAdvantage (American)", "MileagePlus (United)", "SkyMiles (Delta)",
  "Executive Club (British Airways)", "Miles&Smiles (Turkish)",
  "Aeroplan (Air Canada)",
  // Hoteles
  "Marriott Bonvoy", "Hilton Honors", "World of Hyatt",
  "IHG One Rewards", "Accor Live Limitless",
  // Otro
  "Otro",
];

const BANCOS_BOLIVIA = [
  "BNB", "BMSC", "BISA", "BCP", "Banco Ganadero",
  "Banco Unión", "Banco Económico", "Banco FIE",
  "Banco Prodem", "Banco Fortaleza", "BancoSol",
];

const estadoConfig: Record<string, { label: string; className: string }> = {
  activo:    { label: "Activo",    className: "bg-emerald-500/10 text-emerald-600 border-emerald-200" },
  vip:       { label: "VIP",       className: "bg-amber-500/10  text-amber-600  border-amber-200"  },
  potencial: { label: "Potencial", className: "bg-blue-500/10   text-blue-600   border-blue-200"   },
  inactivo:  { label: "Inactivo",  className: "bg-muted         text-muted-foreground border-border" },
};

const docLabels: Record<string, string> = {
  pasaporte:     "Pasaporte",
  carnet:        "Carnet de identidad",
  visa_usa:      "Visa EE.UU.",
  visa_ue:       "Visa Europa",
  visa_schengen: "Visa Schengen",
  otro:          "Otro",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function docVigencia(fecha: string | null): { label: string; className: string } {
  if (!fecha) return { label: "Sin fecha", className: "bg-muted text-muted-foreground" };
  const days = Math.floor((new Date(fecha).getTime() - Date.now()) / 86_400_000);
  if (days < 0)   return { label: "Vencido",           className: "bg-red-500/10    text-red-600"    };
  if (days < 90)  return { label: `Vence en ${days}d`, className: "bg-amber-500/10  text-amber-600"  };
  return              { label: "Vigente",           className: "bg-emerald-500/10 text-emerald-600" };
}

function fmtDate(iso: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return null;
  // Append T00:00:00 for date-only strings (YYYY-MM-DD) so JS parses as
  // local midnight instead of UTC midnight (avoids off-by-one day in UTC-N zones)
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return d.toLocaleDateString("es-AR", opts ?? { day: "2-digit", month: "short", year: "numeric" });
}

async function safeQuery<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try { return await fn(); } catch { return []; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreRing({ value }: { value: number }) {
  const color  = value >= 70 ? "#10b981" : value >= 40 ? "#f59e0b" : "#ef4444";
  const r      = 22;
  const circ   = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="relative w-16 h-16 flex-shrink-0">
      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/30" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function EmptySection({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-xs text-muted-foreground max-w-xs">{label}</p>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      {children}
    </h4>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Cliente360View() {
  const [search,       setSearch]       = useState("");
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [activeTab,    setActiveTab]    = useState("resumen");
  const [showCreate,   setShowCreate]   = useState(false);
  const [createNombre, setCreateNombre] = useState("");
  const [showEdit,     setShowEdit]     = useState(false);
  const [editDoc,      setEditDoc]      = useState<Documento & { _new?: boolean } | null>(null);
  const [editLealtad,   setEditLealtad]   = useState<Lealtad   & { _new?: boolean } | null>(null);
  const [editCobranza,   setEditCobranza]   = useState<Cobranza  & { _new?: boolean } | null>(null);
  const [openGestionId,  setOpenGestionId]  = useState<string | null>(null);
  const { isAdmin } = useCurrentUserRol();
  const queryClient = useQueryClient();

  // ── Clientes list ──
  const { data: clientes = [] } = useQuery<Cliente[]>({
    queryKey: ["clientes"],
    queryFn: () => safeQuery(async () => {
      const { data } = await (supabase as any).from("clientes").select("*").order("nombre_completo");
      return data ?? [];
    }),
  });

  const filtered = useMemo(() => {
    if (search.length < 2) return clientes;
    const q = search.toLowerCase();
    return clientes.filter(c =>
      c.nombre_completo.toLowerCase().includes(q) ||
      c.razon_social?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.telefono?.includes(q) ||
      c.nit?.includes(q) ||
      c.documento_numero?.includes(q)
    );
  }, [clientes, search]);

  const cliente = clientes.find(c => c.id === selectedId) ?? null;

  // ── Detail queries ──
  const { data: documentos = [] } = useQuery<Documento[]>({
    queryKey: ["cliente_docs", selectedId],
    enabled: !!selectedId,
    queryFn: () => safeQuery(async () => {
      const { data } = await (supabase as any).from("cliente_documentos").select("*").eq("cliente_id", selectedId);
      return data ?? [];
    }),
  });

  const { data: bancos = [] } = useQuery<Banco[]>({
    queryKey: ["cliente_bancos", selectedId],
    enabled: !!selectedId,
    queryFn: () => safeQuery(async () => {
      const { data } = await (supabase as any).from("cliente_bancos").select("*").eq("cliente_id", selectedId);
      return data ?? [];
    }),
  });

  const { data: lealtad = [] } = useQuery<Lealtad[]>({
    queryKey: ["cliente_lealtad", selectedId],
    enabled: !!selectedId,
    queryFn: () => safeQuery(async () => {
      const { data } = await (supabase as any).from("cliente_lealtad").select("*").eq("cliente_id", selectedId);
      return data ?? [];
    }),
  });

  const { data: viajes = [] } = useQuery<Viaje[]>({
    queryKey: ["cliente_viajes", selectedId],
    enabled: !!selectedId,
    queryFn: () => safeQuery(async () => {
      const { data } = await (supabase as any).from("cliente_viajes").select("*")
        .eq("cliente_id", selectedId).order("fecha_salida", { ascending: false });
      return data ?? [];
    }),
  });

  const { data: ideas = [] } = useQuery<IdeaViaje[]>({
    queryKey: ["cliente_ideas", selectedId],
    enabled: !!selectedId,
    queryFn: () => safeQuery(async () => {
      const { data } = await (supabase as any).from("cliente_ideas_viaje").select("*").eq("cliente_id", selectedId);
      return data ?? [];
    }),
  });

  const { data: referidos = [] } = useQuery<Referido[]>({
    queryKey: ["cliente_referidos", selectedId],
    enabled: !!selectedId,
    queryFn: () => safeQuery(async () => {
      const { data } = await (supabase as any).from("cliente_referidos").select("*").eq("cliente_id", selectedId);
      return data ?? [];
    }),
  });

  const { data: familiares = [] } = useQuery<Familiar[]>({
    queryKey: ["cliente_familiar", selectedId],
    enabled: !!selectedId,
    queryFn: () => safeQuery(async () => {
      const { data } = await (supabase as any).from("cliente_familiar").select("*").eq("cliente_id", selectedId);
      return data ?? [];
    }),
  });

  const { data: pagos = [] } = useQuery<Pago[]>({
    queryKey: ["cliente_pagos", selectedId],
    enabled: !!selectedId,
    queryFn: () => safeQuery(async () => {
      const { data } = await (supabase as any).from("cliente_pagos").select("*")
        .eq("cliente_id", selectedId).order("fecha", { ascending: false });
      return data ?? [];
    }),
  });

  const { data: cobranzas = [] } = useQuery<Cobranza[]>({
    queryKey: ["cliente_cobranzas", selectedId],
    enabled: !!selectedId,
    queryFn: () => safeQuery(async () => {
      const { data } = await (supabase as any).from("cliente_cobranzas").select("*")
        .eq("cliente_id", selectedId).order("fecha_vencimiento", { ascending: true });
      return data ?? [];
    }),
  });

  const { data: gestionesCliente = [] } = useQuery<any[]>({
    queryKey: ["gestiones_cliente_id", selectedId],
    enabled: !!selectedId,
    queryFn: () => safeQuery(async () => {
      const { data } = await (supabase as any)
        .from("gestiones")
        .select("id, title, priority, due_date, updated_at, pipeline_stages(name, global_status), processes(name), areas_empresa(nombre)")
        .eq("cliente_id", selectedId)
        .order("updated_at", { ascending: false })
        .limit(50);
      return data ?? [];
    }),
  });

  // ── Comunicaciones: conversaciones WA + actividades ──
  const { data: convWA = [] } = useQuery<any[]>({
    queryKey: ["cliente_conv_wa", selectedId],
    enabled: !!selectedId,
    queryFn: () => safeQuery(async () => {
      const { data } = await (supabase as any)
        .from("lat_conversaciones")
        .select("id, asunto, canal, estado, ultimo_mensaje, ultima_interaccion, no_leidos, responsable_nombre, ventana_whatsapp")
        .eq("cliente_id", selectedId)
        .order("ultima_interaccion", { ascending: false })
        .limit(10);
      return data ?? [];
    }),
  });

  const { data: actividadesComm = [] } = useQuery<any[]>({
    queryKey: ["cliente_actividades_comm", selectedId],
    enabled: !!selectedId,
    queryFn: () => safeQuery(async () => {
      const { data } = await (supabase as any)
        .from("activities")
        .select("id, tipo, titulo, fecha_hora, fecha_limite, status, notas, meet_link, assigned_to_id, colaboradores!activities_assigned_to_id_fkey(nombre)")
        .eq("cliente_id", selectedId)
        .in("tipo", ["llamada", "reunion"])
        .order("fecha_hora", { ascending: false })
        .limit(30);
      return data ?? [];
    }),
  });

  // ── Bank toggle handlers ──
  const toggleBanco = async (banco: string) => {
    if (!selectedId) return;
    const existing = bancos.find(b => b.banco === banco);
    if (existing) {
      await (supabase as any).from("cliente_bancos").delete().eq("id", existing.id);
    } else {
      await (supabase as any).from("cliente_bancos").insert({ cliente_id: selectedId, banco, tipo_cuenta: null });
    }
    queryClient.invalidateQueries({ queryKey: ["cliente_bancos", selectedId] });
  };

  const toggleTipoBanco = async (banco: string, tipo: string) => {
    if (!selectedId) return;
    const existing = bancos.find(b => b.banco === banco);
    if (!existing) return;
    const tipos = (existing.tipo_cuenta ?? "").split("|").filter(Boolean);
    const newTipos = tipos.includes(tipo) ? tipos.filter(t => t !== tipo) : [...tipos, tipo];
    await (supabase as any).from("cliente_bancos").update({ tipo_cuenta: newTipos.join("|") || null }).eq("id", existing.id);
    queryClient.invalidateQueries({ queryKey: ["cliente_bancos", selectedId] });
  };

  // ── Document handlers ──
  const saveDoc = async (doc: Documento & { _new?: boolean }) => {
    if (!selectedId) return;
    const payload = {
      tipo:               doc.tipo,
      numero:             doc.numero             || null,
      fecha_emision:      doc.fecha_emision      || null,
      fecha_vencimiento:  doc.fecha_vencimiento  || null,
      pais_emisor:        doc.pais_emisor         || null,
      observaciones:      doc.observaciones       || null,
    };
    if (doc._new) {
      await (supabase as any).from("cliente_documentos").insert({ ...payload, cliente_id: selectedId });
    } else {
      await (supabase as any).from("cliente_documentos").update(payload).eq("id", doc.id);
    }
    queryClient.invalidateQueries({ queryKey: ["cliente_docs", selectedId] });
    setEditDoc(null);
  };

  const deleteDoc = async (id: string) => {
    await (supabase as any).from("cliente_documentos").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["cliente_docs", selectedId] });
    setEditDoc(null);
  };

  // ── Lealtad handlers ──
  const saveLealtad = async (l: Lealtad & { _new?: boolean }) => {
    if (!selectedId) return;
    const payload = {
      programa:          l.programa,
      numero_membresia:  l.numero_membresia  || null,
      estado:            l.estado            || null,
      nivel:             l.nivel             || null,
      millas_acumuladas: l.millas_acumuladas != null && !isNaN(Number(l.millas_acumuladas)) ? Number(l.millas_acumuladas) : null,
      observaciones:     l.observaciones     || null,
    };
    if (l._new) {
      await (supabase as any).from("cliente_lealtad").insert({ ...payload, cliente_id: selectedId });
    } else {
      await (supabase as any).from("cliente_lealtad").update(payload).eq("id", l.id);
    }
    queryClient.invalidateQueries({ queryKey: ["cliente_lealtad", selectedId] });
    setEditLealtad(null);
  };

  const deleteLealtad = async (id: string) => {
    await (supabase as any).from("cliente_lealtad").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["cliente_lealtad", selectedId] });
    setEditLealtad(null);
  };

  // ── Cobranza handlers ──
  const saveCobranza = async (c: Cobranza & { _new?: boolean }) => {
    if (!selectedId) return;
    const payload = {
      concepto:          c.concepto,
      monto:             Number(c.monto) || 0,
      moneda:            c.moneda || "Bs",
      fecha_emision:     c.fecha_emision     || null,
      fecha_vencimiento: c.fecha_vencimiento || null,
      estado:            c.estado || "pendiente",
      notas:             c.notas || null,
    };
    if (c._new) {
      await (supabase as any).from("cliente_cobranzas").insert({ ...payload, cliente_id: selectedId });
    } else {
      await (supabase as any).from("cliente_cobranzas").update(payload).eq("id", c.id);
    }
    queryClient.invalidateQueries({ queryKey: ["cliente_cobranzas", selectedId] });
    setEditCobranza(null);
  };

  const deleteCobranza = async (id: string) => {
    await (supabase as any).from("cliente_cobranzas").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["cliente_cobranzas", selectedId] });
    setEditCobranza(null);
  };

  // ── Summary stats ──
  const totalPagado     = pagos.filter(p => p.tipo === "pago").reduce((a, b) => a + b.monto, 0);
  const totalDevol      = pagos.filter(p => p.tipo === "devolucion").reduce((a, b) => a + b.monto, 0);
  const totalCreditos   = pagos.filter(p => p.tipo === "credito").reduce((a, b) => a + b.monto, 0);
  const docsVencidos    = documentos.filter(d => d.fecha_vencimiento && new Date(d.fecha_vencimiento) < new Date()).length;
  const docsPorVencer   = documentos.filter(d => {
    if (!d.fecha_vencimiento) return false;
    const days = Math.floor((new Date(d.fecha_vencimiento).getTime() - Date.now()) / 86_400_000);
    return days >= 0 && days < 90;
  }).length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-5 h-5 text-primary shrink-0" />
            <h2 className="text-base sm:text-lg font-semibold text-foreground truncate">Cliente 360</h2>
            {cliente && (
              <Badge variant="outline" className="text-xs ml-1 truncate max-w-[120px] hidden sm:inline-flex">
                {cliente.nombre_completo}
              </Badge>
            )}
          </div>
          <button
            onClick={() => { setCreateNombre(""); setShowCreate(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors shrink-0"
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nuevo cliente</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>

        {/* Search — full width below on mobile */}
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, email o teléfono…"
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onBlur={() => setTimeout(() => setSearch(""), 200)}
          />
          {search.length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-2">No se encontró "{search}"</p>
                  <button
                    onMouseDown={() => { setCreateNombre(search); setShowCreate(true); setSearch(""); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Users className="w-3 h-3" />
                    Crear cliente nuevo
                  </button>
                </div>
              ) : filtered.map(c => (
                <button
                  key={c.id}
                  onMouseDown={() => { setSelectedId(c.id); setActiveTab("resumen"); setSearch(""); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent text-left transition-colors"
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c.tipo_cliente === "juridica" ? "bg-violet-500/10 text-violet-600" : "bg-primary/10 text-primary"}`}>
                    {c.tipo_cliente === "juridica" ? <Building2 className="w-3.5 h-3.5" /> : c.nombre_completo.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{c.tipo_cliente === "juridica" ? (c.razon_social ?? c.nombre_completo) : c.nombre_completo}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {c.tipo_cliente === "juridica" ? (c.nit ? `NIT: ${c.nit}` : "Empresa") : (c.email ?? c.telefono ?? "Sin contacto")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${c.tipo_cliente === "juridica" ? "bg-violet-500/10 text-violet-600 border-violet-200" : "bg-muted text-muted-foreground"}`}>
                      {c.tipo_cliente === "juridica" ? "Empresa" : "Persona"}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${estadoConfig[c.estado]?.className ?? ""}`}>
                      {estadoConfig[c.estado]?.label ?? c.estado}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Empty state ── */}
      {!cliente ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">Vista 360° del cliente</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Buscá un cliente por nombre, email o teléfono para ver su perfil completo.
            </p>
            <button
              onClick={() => { setCreateNombre(""); setShowCreate(true); }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Users className="w-4 h-4" />
              Crear primer cliente
            </button>
            {clientes.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2 opacity-60">
                Aún no hay clientes registrados en la base de datos.
              </p>
            )}
          </div>
        </div>

      ) : (
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

          {/* ════════════════════════════════════════
              LEFT PANEL  (identity + score)
          ════════════════════════════════════════ */}
          <div className="md:w-72 md:flex-shrink-0 border-b md:border-b-0 md:border-r border-border flex flex-col overflow-y-auto bg-card/50 max-h-48 md:max-h-none">

            {/* Identity card */}
            <div className="p-4 border-b border-border">
              <div className="flex items-start gap-3 mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0 ${cliente.tipo_cliente === "juridica" ? "bg-violet-500/10 text-violet-600" : "bg-primary/10 text-primary"}`}>
                  {cliente.tipo_cliente === "juridica" ? <Building2 className="w-6 h-6" /> : cliente.nombre_completo.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm text-foreground leading-tight">
                    {cliente.tipo_cliente === "juridica" ? (cliente.razon_social ?? cliente.nombre_completo) : cliente.nombre_completo}
                  </h3>
                  {cliente.tipo_cliente === "juridica" && cliente.razon_social && (
                    <p className="text-xs text-muted-foreground">{cliente.nombre_completo}</p>
                  )}
                  {cliente.profesion && cliente.tipo_cliente === "natural" && (
                    <p className="text-xs text-muted-foreground">{cliente.profesion}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] ${cliente.tipo_cliente === "juridica" ? "bg-violet-500/10 text-violet-600 border-violet-200" : "bg-blue-500/10 text-blue-600 border-blue-200"}`}>
                      {cliente.tipo_cliente === "juridica" ? <><Building2 className="w-2.5 h-2.5 mr-1" />Empresa</> : <><UserCircle className="w-2.5 h-2.5 mr-1" />Persona natural</>}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${estadoConfig[cliente.estado]?.className ?? ""}`}>
                      {estadoConfig[cliente.estado]?.label ?? cliente.estado}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {/* NIT (jurídica) o CI (natural) */}
                {cliente.tipo_cliente === "juridica" && cliente.nit && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>NIT: <span className="text-foreground font-medium">{cliente.nit}</span></span>
                  </div>
                )}
                {cliente.tipo_cliente === "natural" && cliente.documento_numero && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{cliente.documento_tipo ?? "CI"}: <span className="text-foreground font-medium">{cliente.documento_numero}</span></span>
                  </div>
                )}
                {/* Contacto empresa */}
                {cliente.tipo_cliente === "juridica" && cliente.contacto_nombre && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <UserCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>
                      {cliente.contacto_nombre}
                      {cliente.contacto_cargo && <span className="opacity-70"> · {cliente.contacto_cargo}</span>}
                    </span>
                  </div>
                )}
                {cliente.telefono && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{cliente.telefono}</span>
                    {cliente.telefono_secundario && <span className="opacity-60">/ {cliente.telefono_secundario}</span>}
                  </div>
                )}
                {cliente.email && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{cliente.email}</span>
                  </div>
                )}
                {(cliente.ciudad || cliente.pais) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{[cliente.ciudad, cliente.pais].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                {cliente.tipo_cliente === "natural" && cliente.fecha_nacimiento && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{fmtDate(cliente.fecha_nacimiento)}</span>
                  </div>
                )}
                {cliente.asesor_nombre && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <User className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Asesor: <span className="text-foreground font-medium">{cliente.asesor_nombre}</span></span>
                  </div>
                )}
              </div>
            </div>

            {/* Score + Alerts */}
            <div className="p-4 border-b border-border space-y-3">
              <div className="flex items-center gap-3">
                <ScoreRing value={cliente.score_valor} />
                <div>
                  <p className="text-xs font-medium text-foreground">Score del cliente</p>
                  {cliente.score_etiqueta && (
                    <p className="text-[10px] text-muted-foreground">{cliente.score_etiqueta}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {docsVencidos > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-red-600 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {docsVencidos} vencido{docsVencidos > 1 ? "s" : ""}
                      </span>
                    )}
                    {docsPorVencer > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                        <Clock className="w-2.5 h-2.5" />
                        {docsPorVencer} por vencer
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {cliente.notas_rapidas && (
                <div className="bg-amber-500/5 border border-amber-200/60 rounded-lg p-2.5">
                  <p className="text-[10px] font-medium text-amber-700 mb-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Nota rápida
                  </p>
                  <p className="text-xs text-foreground/80 leading-relaxed">{cliente.notas_rapidas}</p>
                </div>
              )}
            </div>

            {/* Quick stats */}
            <div className="p-4 grid grid-cols-2 sm:grid-cols-2 gap-2">
              {[
                { value: viajes.length,                                        label: "Viajes",    color: "" },
                { value: referidos.filter(r => r.tipo === "saliente").length,  label: "Referidos", color: "" },
                { value: `Bs ${totalPagado.toLocaleString()}`,                 label: "Pagado",    color: "text-primary" },
                { value: `Bs ${totalCreditos.toLocaleString()}`,               label: "Créditos",  color: "text-emerald-600" },
              ].map(s => (
                <div key={s.label} className="bg-muted/40 rounded-lg p-2.5 text-center">
                  <p className={`text-sm font-bold text-foreground ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="px-4 pb-4">
              <p className="text-[10px] text-muted-foreground">
                Creado {fmtDate(cliente.created_at, { day: "2-digit", month: "short", year: "numeric" })}
                {" · "}Act. {fmtDate(cliente.updated_at, { day: "2-digit", month: "short" })}
              </p>
            </div>
          </div>

          {/* ════════════════════════════════════════
              RIGHT PANEL  (tabs)
          ════════════════════════════════════════ */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">

              {/* Tab bar */}
              <div className="border-b border-border bg-card/50 px-4 flex-shrink-0 overflow-x-auto">
                <TabsList className="h-10 bg-transparent gap-0 p-0 w-max">
                  {[
                    { value: "resumen",         label: "Resumen"            },
                    { value: "perfil",          label: "Perfil"             },
                    { value: "documentos",      label: "Documentos"         },
                    { value: "familia",         label: "Familia & Referidos"},
                    { value: "viajes",          label: "Viajes"             },
                    { value: "finanzas",        label: "Finanzas"           },
                    { value: "comunicaciones",  label: (() => { const n = convWA.length + actividadesComm.length + gestionesCliente.length; return n > 0 ? `Comunicaciones (${n})` : "Comunicaciones"; })() },
                    { value: "lealtad",         label: "Fidelización"       },
                  ].map(t => (
                    <TabsTrigger
                      key={t.value}
                      value={t.value}
                      className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-3 whitespace-nowrap"
                    >
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {/* ──────────── Tab contents ──────────── */}
              <div className="flex-1 overflow-y-auto">

                {/* ── RESUMEN ── */}
                <TabsContent value="resumen" className="m-0 p-5 space-y-5">

                  {/* Alert strip */}
                  {(docsVencidos > 0 || docsPorVencer > 0) && (
                    <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-200 rounded-lg px-3 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">
                        {docsVencidos > 0 && <><strong>{docsVencidos}</strong> documento(s) vencido(s). </>}
                        {docsPorVencer > 0 && <><strong>{docsPorVencer}</strong> documento(s) por vencer en menos de 90 días.</>}
                        {" "}Revisá la pestaña <strong>Documentos</strong>.
                      </p>
                    </div>
                  )}

                  {/* Gestiones */}
                  <div>
                    <SectionTitle icon={ClipboardList}>
                      Gestiones
                      {gestionesCliente.length > 0 && (
                        <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                          ({gestionesCliente.filter((g: any) => g.pipeline_stages?.global_status !== "done").length} activas)
                        </span>
                      )}
                    </SectionTitle>
                    {gestionesCliente.length > 0 ? (
                      <div className="space-y-1.5">
                        {gestionesCliente.slice(0, 5).map((g: any) => {
                          const pCfg = priorityConfig[g.priority] || priorityConfig.medium;
                          const status = g.pipeline_stages?.global_status || "to_do";
                          const isOverdue = g.due_date && new Date(g.due_date) < new Date() && status !== "done";
                          return (
                            <div key={g.id} className="flex items-center gap-2.5 bg-muted/30 rounded-lg px-3 py-2">
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot[status] || "bg-muted"}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{g.title}</p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {g.processes?.name}
                                  {g.pipeline_stages?.name && ` · ${g.pipeline_stages.name}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${pCfg.className}`}>{pCfg.label}</span>
                                {isOverdue && <AlertTriangle className="w-3 h-3 text-red-500" />}
                              </div>
                            </div>
                          );
                        })}
                        {gestionesCliente.length > 5 && (
                          <button
                            onClick={() => setActiveTab("comunicaciones")}
                            className="text-[11px] text-primary hover:underline pl-1"
                          >
                            Ver todas ({gestionesCliente.length}) →
                          </button>
                        )}
                      </div>
                    ) : (
                      <EmptySection icon={ClipboardList} label="Sin gestiones asociadas a este cliente" />
                    )}
                  </div>

                  {/* Último viaje + próxima idea */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-muted/30 rounded-xl p-4">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Último viaje</p>
                      {viajes[0] ? (
                        <>
                          <p className="text-sm font-semibold text-foreground">{viajes[0].destino}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {fmtDate(viajes[0].fecha_salida, { month: "long", year: "numeric" }) ?? "Sin fecha"}
                          </p>
                          {viajes[0].tipo_viaje && <Badge variant="outline" className="mt-2 text-[10px]">{viajes[0].tipo_viaje}</Badge>}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">Sin viajes registrados</p>
                      )}
                    </div>
                    <div className="bg-muted/30 rounded-xl p-4">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Próxima idea</p>
                      {ideas[0] ? (
                        <>
                          <p className="text-sm font-semibold text-foreground">{ideas[0].destino}</p>
                          {ideas[0].notas && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ideas[0].notas}</p>}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">Sin ideas guardadas</p>
                      )}
                    </div>
                  </div>

                  {/* Familia rápida */}
                  {familiares.length > 0 && (
                    <div>
                      <SectionTitle icon={Home}>Grupo familiar</SectionTitle>
                      <div className="flex flex-wrap gap-2">
                        {familiares.map(f => (
                          <div key={f.id} className="flex items-center gap-1.5 bg-muted/30 rounded-full px-3 py-1">
                            <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                              {f.nombre.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs">{f.nombre}</span>
                            <span className="text-[10px] text-muted-foreground capitalize">({f.relacion})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* ── PERFIL ── */}
                <TabsContent value="perfil" className="m-0 p-5 space-y-6">

                  {/* Info básica */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <div className="flex items-center gap-2">
                        <SectionTitle icon={cliente.tipo_cliente === "juridica" ? Building2 : User}>
                          {cliente.tipo_cliente === "juridica" ? "Datos de la empresa" : "Información básica"}
                        </SectionTitle>
                        <Badge variant="outline" className={`text-[10px] mb-3 ${cliente.tipo_cliente === "juridica" ? "bg-violet-500/10 text-violet-600 border-violet-200" : "bg-blue-500/10 text-blue-600 border-blue-200"}`}>
                          {cliente.tipo_cliente === "juridica" ? "Persona jurídica" : "Persona natural"}
                        </Badge>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => setShowEdit(true)}
                          className="flex items-center gap-1.5 px-2.5 py-1 mb-3 bg-muted hover:bg-muted/80 border border-border rounded-md text-xs font-medium transition-colors shrink-0"
                        >
                          <Pencil className="w-3 h-3" />
                          Editar perfil
                        </button>
                      )}
                    </div>

                    {cliente.tipo_cliente === "juridica" ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                        {[
                          { label: "Razón social",         value: cliente.razon_social },
                          { label: "NIT",                  value: cliente.nit },
                          { label: "Persona de contacto",  value: cliente.contacto_nombre },
                          { label: "Cargo del contacto",   value: cliente.contacto_cargo },
                          { label: "Teléfono principal",   value: cliente.telefono },
                          { label: "Teléfono secundario",  value: cliente.telefono_secundario },
                          { label: "Email principal",      value: cliente.email },
                          { label: "Email secundario",     value: cliente.email_secundario },
                          { label: "Ciudad / País",        value: [cliente.ciudad, cliente.pais].filter(Boolean).join(" / ") || null },
                          { label: "Instagram",            value: cliente.instagram },
                          { label: "Facebook",             value: cliente.facebook },
                          { label: "TikTok",               value: cliente.tiktok },
                          { label: "Canal de contacto",    value: (cliente as any).canal_contacto },
                          { label: "Días de crédito",      value: cliente.dias_credito != null ? `${cliente.dias_credito} días` : null },
                          { label: "Asesor asignado",      value: cliente.asesor_nombre },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                            <p className="text-xs font-medium text-foreground">{value || "—"}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                        {[
                          { label: "Nombre completo",    value: cliente.nombre_completo },
                          { label: "Carnet de identidad",value: cliente.documento_numero ? `${cliente.documento_tipo ?? "CI"} ${cliente.documento_numero}`.trim() : null },
                          { label: "Teléfono principal", value: cliente.telefono },
                          { label: "Teléfono secundario",value: cliente.telefono_secundario },
                          { label: "Email principal",    value: cliente.email },
                          { label: "Email secundario",   value: cliente.email_secundario },
                          { label: "Fecha de nacimiento",value: fmtDate(cliente.fecha_nacimiento, { day: "2-digit", month: "long", year: "numeric" }) },
                          { label: "Nacionalidad",       value: cliente.nacionalidad },
                          { label: "Ciudad / País",      value: [cliente.ciudad, cliente.pais].filter(Boolean).join(" / ") || null },
                          { label: "Profesión",          value: cliente.profesion },
                          { label: "Instagram",          value: cliente.instagram },
                          { label: "Facebook",           value: cliente.facebook },
                          { label: "TikTok",             value: cliente.tiktok },
                          { label: "Estado civil",       value: cliente.estado_civil },
                          { label: "Canal de contacto",  value: (cliente as any).canal_contacto },
                          { label: "Asesor asignado",    value: cliente.asesor_nombre },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                            <p className="text-xs font-medium text-foreground">{value || "—"}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Info clave */}
                  <div>
                    <SectionTitle icon={Star}>Información clave</SectionTitle>

                    <div className="flex flex-wrap gap-2 mb-5">
                      {[
                        { label: "Club de viajes",   active: cliente.club_viajes,     icon: Star   },
                        { label: "Espacio a bordo",  active: cliente.espacio_a_bordo, icon: Plane  },
                      ].map(({ label, active, icon: Icon }) => (
                        <div key={label} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${active ? "bg-primary/10 border-primary/30 text-primary font-medium" : "bg-muted/30 border-border text-muted-foreground"}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {label}
                          {active && <CheckCircle2 className="w-3 h-3 ml-0.5" />}
                        </div>
                      ))}
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 text-xs">
                        <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                        {cliente.pases_a_bordo} pase{cliente.pases_a_bordo !== 1 ? "s" : ""} a bordo
                      </div>
                    </div>

                    {/* Bancos Bolivia */}
                    <div>
                      <p className="text-xs font-medium text-foreground mb-2.5 flex items-center gap-1.5">
                        <Landmark className="w-3.5 h-3.5 text-muted-foreground" />
                        Bancos con los que trabaja el cliente
                        {isAdmin && <span className="ml-1 text-[10px] text-muted-foreground font-normal">(clic para editar)</span>}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {BANCOS_BOLIVIA.map(banco => {
                          const rec    = bancos.find(b => b.banco === banco);
                          const activo = !!rec;
                          const tipos  = (rec?.tipo_cuenta ?? "").split("|").filter(Boolean);
                          return (
                            <div key={banco} className={`rounded-lg border transition-colors ${activo ? "bg-emerald-500/10 border-emerald-200" : "bg-muted/20 border-border"}`}>
                              <button
                                onClick={() => isAdmin && toggleBanco(banco)}
                                className={`w-full flex items-center gap-1.5 px-2.5 py-2 text-[11px] text-left ${activo ? "text-emerald-700 font-medium" : "text-muted-foreground"} ${isAdmin ? "cursor-pointer" : "cursor-default"}`}
                              >
                                {activo
                                  ? <CheckCircle2 className="w-3 h-3 flex-shrink-0 text-emerald-600" />
                                  : <div className="w-3 h-3 rounded-full border border-muted-foreground/30 flex-shrink-0" />
                                }
                                {banco}
                              </button>
                              {activo && (
                                <div className="flex gap-1 px-2 pb-2">
                                  {(["Cuenta", "TC", "TD"] as const).map(t => {
                                    const key = t.toLowerCase();
                                    const on  = tipos.includes(key);
                                    return (
                                      <button
                                        key={t}
                                        onClick={() => isAdmin && toggleTipoBanco(banco, key)}
                                        className={`text-[9px] px-1.5 py-0.5 rounded font-medium border transition-colors ${on ? "bg-emerald-600 text-white border-emerald-600" : "bg-background text-muted-foreground border-border"} ${isAdmin ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                                      >
                                        {t}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* ── DOCUMENTOS ── */}
                <TabsContent value="documentos" className="m-0 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <SectionTitle icon={FileText}>Documentos y vigencia</SectionTitle>
                    {isAdmin && !editDoc && (
                      <button
                        onClick={() => setEditDoc({ id: "", tipo: "pasaporte", numero: null, fecha_emision: null, fecha_vencimiento: null, pais_emisor: "Bolivia", observaciones: null, _new: true })}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors"
                      >
                        <span className="text-base leading-none">+</span> Agregar
                      </button>
                    )}
                  </div>

                  {/* ── Inline form (create / edit) ── */}
                  {editDoc && (
                    <div className="mb-4 p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
                      <p className="text-xs font-semibold text-foreground">{editDoc._new ? "Nuevo documento" : "Editar documento"}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">Tipo</label>
                          <select
                            className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                            value={editDoc.tipo}
                            onChange={e => setEditDoc(d => d && ({ ...d, tipo: e.target.value }))}
                          >
                            {Object.entries(docLabels).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">Número</label>
                          <input className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editDoc.numero ?? ""} onChange={e => setEditDoc(d => d && ({ ...d, numero: e.target.value }))} placeholder="Ej: P8812345" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">Fecha de emisión</label>
                          <input type="date" className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editDoc.fecha_emision ?? ""} onChange={e => setEditDoc(d => d && ({ ...d, fecha_emision: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">Fecha de vencimiento</label>
                          <input type="date" className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editDoc.fecha_vencimiento ?? ""} onChange={e => setEditDoc(d => d && ({ ...d, fecha_vencimiento: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">País emisor</label>
                          <input className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editDoc.pais_emisor ?? ""} onChange={e => setEditDoc(d => d && ({ ...d, pais_emisor: e.target.value }))} placeholder="Bolivia" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">Observaciones</label>
                          <input className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editDoc.observaciones ?? ""} onChange={e => setEditDoc(d => d && ({ ...d, observaciones: e.target.value }))} placeholder="Opcional" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          {!editDoc._new && (
                            <button onClick={() => deleteDoc(editDoc.id)} className="text-[10px] text-destructive hover:underline">Eliminar documento</button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEditDoc(null)} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors">Cancelar</button>
                          <button onClick={() => saveDoc(editDoc)} className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Guardar</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {documentos.length === 0 && !editDoc ? (
                    <EmptySection icon={FileText} label="No hay documentos registrados para este cliente" />
                  ) : (
                    <div className="space-y-2">
                      {documentos.map(doc => {
                        const vig       = docVigencia(doc.fecha_vencimiento);
                        const isEditing = editDoc?.id === doc.id;
                        return (
                          <div
                            key={doc.id}
                            onClick={() => isAdmin && !editDoc && setEditDoc({ ...doc })}
                            className={`flex items-center gap-3 rounded-xl p-3 transition-colors ${isEditing ? "bg-primary/5 border border-primary/30" : "bg-muted/30"} ${isAdmin && !editDoc ? "cursor-pointer hover:bg-muted/50" : ""}`}
                          >
                            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <FileText className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium">{docLabels[doc.tipo] ?? doc.tipo}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {doc.numero ?? "Sin número"}
                                {doc.pais_emisor && ` · ${doc.pais_emisor}`}
                                {doc.fecha_vencimiento && ` · Vence: ${fmtDate(doc.fecha_vencimiento)}`}
                              </p>
                              {doc.observaciones && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 italic">{doc.observaciones}</p>
                              )}
                            </div>
                            <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${vig.className}`}>
                              {vig.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* ── FAMILIA & REFERIDOS ── */}
                <TabsContent value="familia" className="m-0 p-5 space-y-6">
                  <FamiliaReferidosTab
                    clienteId={selectedId!}
                    familiares={familiares}
                    referidos={referidos}
                    fmtDate={fmtDate}
                    onRefresh={() => {
                      queryClient.invalidateQueries({ queryKey: ["cliente_familiar", selectedId] });
                      queryClient.invalidateQueries({ queryKey: ["cliente_referidos", selectedId] });
                    }}
                  />
                </TabsContent>

                {/* ── VIAJES ── */}
                <TabsContent value="viajes" className="m-0 p-5 space-y-6">

                  {/* Historial */}
                  <div>
                    <SectionTitle icon={Plane}>Historial de viajes</SectionTitle>
                    {viajes.length === 0 ? (
                      <EmptySection icon={Plane} label="Sin historial de viajes registrado" />
                    ) : (
                      <div className="space-y-2">
                        {viajes.map(v => (
                          <div key={v.id} className="flex items-center gap-3 bg-muted/30 rounded-xl p-3">
                            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Globe className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold">{v.destino}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {[
                                  v.tipo_viaje,
                                  v.fecha_salida ? fmtDate(v.fecha_salida, { month: "short", year: "numeric" }) : null,
                                  v.fecha_regreso ? `→ ${fmtDate(v.fecha_regreso, { month: "short", year: "numeric" })}` : null,
                                ].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {v.monto != null && (
                                <p className="text-xs font-semibold text-primary">Bs {v.monto.toLocaleString()}</p>
                              )}
                              <Badge variant="outline" className={`text-[10px] mt-0.5 ${v.estado === "completado" ? "text-emerald-600 border-emerald-200" : "text-muted-foreground"}`}>
                                {v.estado ?? "completado"}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Ideas de viaje */}
                  <div>
                    <SectionTitle icon={Heart}>Ideas de viaje</SectionTitle>
                    {ideas.length === 0 ? (
                      <EmptySection icon={Heart} label="Sin ideas de viaje guardadas. En el futuro se conectará con favoritos de AIO." />
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {ideas.map(i => (
                          <div key={i.id} className={`rounded-xl p-3 border ${i.prioridad === "alta" ? "bg-rose-500/5 border-rose-200" : "bg-muted/30 border-border"}`}>
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold">{i.destino}</p>
                              {i.prioridad && (
                                <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${i.prioridad === "alta" ? "text-rose-600 border-rose-200" : ""}`}>
                                  {i.prioridad}
                                </Badge>
                              )}
                            </div>
                            {i.notas && <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{i.notas}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* ── FINANZAS ── */}
                <TabsContent value="finanzas" className="m-0 p-5">

                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {[
                      { label: "Total pagado",   value: `Bs ${totalPagado.toLocaleString()}`,  icon: DollarSign, color: "text-primary"      },
                      { label: "Devoluciones",   value: `Bs ${totalDevol.toLocaleString()}`,   icon: RefreshCw,  color: "text-amber-600"     },
                      { label: "Créditos",       value: `Bs ${totalCreditos.toLocaleString()}`,icon: Wallet,     color: "text-emerald-600"   },
                    ].map(s => (
                      <div key={s.label} className="bg-muted/30 rounded-xl p-3.5">
                        <s.icon className={`w-4 h-4 ${s.color} mb-1.5`} />
                        <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Bancos del cliente */}
                  {bancos.length > 0 && (
                    <div className="mb-5">
                      <SectionTitle icon={Landmark}>Bancos del cliente</SectionTitle>
                      <div className="flex flex-wrap gap-2">
                        {bancos.map(b => {
                          const tipos = (b.tipo_cuenta ?? "").split("|").filter(Boolean);
                          return (
                            <div key={b.id} className="flex items-center gap-1.5 bg-muted/30 border border-border rounded-lg px-3 py-2">
                              <Landmark className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                              <span className="text-xs font-medium">{b.banco}</span>
                              {tipos.map(t => (
                                <span key={t} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 uppercase">
                                  {t}
                                </span>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Cobranzas pendientes ── */}
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-3">
                      <SectionTitle icon={CreditCard}>Cobranzas</SectionTitle>
                      {isAdmin && !editCobranza && (
                        <button
                          onClick={() => setEditCobranza({ id: "", concepto: "", monto: 0, moneda: "Bs", fecha_emision: null, fecha_vencimiento: null, estado: "pendiente", notas: null, _new: true })}
                          className="flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors"
                        >
                          <span className="text-base leading-none">+</span> Nueva
                        </button>
                      )}
                    </div>

                    {editCobranza && (
                      <div className="mb-3 p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
                        <p className="text-xs font-semibold">{editCobranza._new ? "Nueva cobranza" : "Editar cobranza"}</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1 col-span-2">
                            <label className="text-[10px] text-muted-foreground">Concepto *</label>
                            <input className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editCobranza.concepto} onChange={e => setEditCobranza(c => c && ({ ...c, concepto: e.target.value }))} placeholder="Ej: Factura #001 - Paquete Europa" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground">Monto</label>
                            <input type="number" min="0" className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editCobranza.monto} onChange={e => setEditCobranza(c => c && ({ ...c, monto: Number(e.target.value) }))} placeholder="0" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground">Moneda</label>
                            <select className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editCobranza.moneda} onChange={e => setEditCobranza(c => c && ({ ...c, moneda: e.target.value }))}>
                              <option value="Bs">Bs (Bolivianos)</option>
                              <option value="USD">USD</option>
                              <option value="EUR">EUR</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground">Fecha de emisión</label>
                            <input type="date" className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editCobranza.fecha_emision ?? ""} onChange={e => setEditCobranza(c => c && ({ ...c, fecha_emision: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground">Fecha de vencimiento</label>
                            <input type="date" className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editCobranza.fecha_vencimiento ?? ""} onChange={e => setEditCobranza(c => c && ({ ...c, fecha_vencimiento: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground">Estado</label>
                            <select className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editCobranza.estado} onChange={e => setEditCobranza(c => c && ({ ...c, estado: e.target.value }))}>
                              <option value="pendiente">Pendiente</option>
                              <option value="pagado">Pagado</option>
                              <option value="vencido">Vencido</option>
                            </select>
                          </div>
                          <div className="space-y-1 col-span-2">
                            <label className="text-[10px] text-muted-foreground">Notas</label>
                            <input className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editCobranza.notas ?? ""} onChange={e => setEditCobranza(c => c && ({ ...c, notas: e.target.value }))} placeholder="Opcional" />
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <div>{!editCobranza._new && <button onClick={() => deleteCobranza(editCobranza.id)} className="text-[10px] text-destructive hover:underline">Eliminar</button>}</div>
                          <div className="flex gap-2">
                            <button onClick={() => setEditCobranza(null)} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors">Cancelar</button>
                            <button onClick={() => editCobranza.concepto.trim() && saveCobranza(editCobranza)} className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Guardar</button>
                          </div>
                        </div>
                      </div>
                    )}

                    {cobranzas.length === 0 && !editCobranza ? (
                      <p className="text-xs text-muted-foreground py-2">Sin cobranzas registradas</p>
                    ) : (
                      <div className="space-y-1.5">
                        {cobranzas.map(c => {
                          const dias = c.fecha_vencimiento
                            ? Math.floor((new Date(`${c.fecha_vencimiento}T00:00:00`).getTime() - Date.now()) / 86_400_000)
                            : null;
                          const estadoCfg = {
                            pendiente: { label: "Pendiente", className: "bg-amber-500/10 text-amber-700 border-amber-200" },
                            pagado:    { label: "Pagado",    className: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
                            vencido:   { label: "Vencido",   className: "bg-red-500/10 text-red-700 border-red-200" },
                          }[c.estado] ?? { label: c.estado, className: "bg-muted text-muted-foreground" };
                          const autoVencido = dias !== null && dias < 0 && c.estado === "pendiente";
                          return (
                            <div
                              key={c.id}
                              onClick={() => isAdmin && !editCobranza && setEditCobranza({ ...c })}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${autoVencido ? "bg-red-500/5 border border-red-200" : "bg-muted/20"} ${isAdmin && !editCobranza ? "cursor-pointer hover:bg-muted/40" : ""}`}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{c.concepto}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {c.fecha_vencimiento ? `Vence: ${fmtDate(c.fecha_vencimiento)}` : "Sin fecha"}
                                  {dias !== null && c.estado === "pendiente" && (
                                    <span className={`ml-1.5 font-medium ${dias < 0 ? "text-red-600" : dias < 7 ? "text-amber-600" : "text-muted-foreground"}`}>
                                      {dias < 0 ? `Vencido hace ${Math.abs(dias)}d` : dias === 0 ? "Vence hoy" : `En ${dias}d`}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <p className="text-xs font-semibold flex-shrink-0">
                                {c.moneda} {Number(c.monto).toLocaleString()}
                              </p>
                              <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${autoVencido ? "bg-red-500/10 text-red-700 border-red-200" : estadoCfg.className}`}>
                                {autoVencido ? "Vencido" : estadoCfg.label}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <SectionTitle icon={DollarSign}>Movimientos</SectionTitle>
                  {pagos.length === 0 ? (
                    <EmptySection icon={DollarSign} label="Sin movimientos financieros registrados" />
                  ) : (
                    <div className="space-y-1.5">
                      {pagos.map(p => {
                        const cfg = {
                          pago:       { label: "Pago",       color: "text-primary",    sign: "+" },
                          devolucion: { label: "Devolución", color: "text-amber-600",  sign: "−" },
                          credito:    { label: "Crédito",    color: "text-emerald-600",sign: "+" },
                        }[p.tipo] ?? { label: p.tipo, color: "text-foreground", sign: "" };
                        return (
                          <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 bg-muted/20 rounded-lg">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium">{p.concepto ?? cfg.label}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {fmtDate(p.fecha)} {p.moneda && `· ${p.moneda}`}
                              </p>
                            </div>
                            {p.estado && (
                              <Badge variant="outline" className={`text-[10px] ${p.estado === "completado" ? "text-emerald-600 border-emerald-200" : ""}`}>
                                {p.estado}
                              </Badge>
                            )}
                            <p className={`text-xs font-semibold flex-shrink-0 ${cfg.color}`}>
                              {cfg.sign}Bs {p.monto.toLocaleString()}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* ── COMUNICACIONES ── */}
                <TabsContent value="comunicaciones" className="m-0 p-5 space-y-6">

                  {/* ── Acciones rápidas ── */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground mr-1">Acciones rápidas:</span>
                    {/* WhatsApp — abre LAT Bandeja */}
                    {cliente?.telefono && (
                      <button
                        onClick={() => {
                          const phone = (cliente?.telefono ?? "").replace(/\D/g, "");
                          window.open(`https://wa.me/${phone}`, "_blank");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (cliente?.telefono) window.open(`tel:${cliente?.telefono}`);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-500/20 transition-colors"
                    >
                      <PhoneCall className="w-3.5 h-3.5" /> Llamar
                    </button>
                    {cliente?.email && (
                      <button
                        onClick={() => window.open(`mailto:${selectedCliente.email}`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 text-violet-700 border border-violet-200 rounded-lg text-xs font-medium hover:bg-violet-500/20 transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" /> Email
                      </button>
                    )}
                  </div>

                  <Separator />

                  {/* ── Conversaciones WhatsApp ── */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <SectionTitle icon={MessageSquare}>
                        WhatsApp
                        {convWA.length > 0 && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">({convWA.length})</span>}
                      </SectionTitle>
                    </div>
                    {convWA.length === 0 ? (
                      <EmptySection icon={Inbox} label="Sin conversaciones de WhatsApp registradas" />
                    ) : (
                      <div className="space-y-2">
                        {convWA.map((c: any) => {
                          const vencida = c.ventana_whatsapp && new Date(c.ventana_whatsapp) < new Date();
                          const estadoColor: Record<string, string> = {
                            abierto: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
                            nuevo: "bg-blue-500/10 text-blue-700 border-blue-200",
                            en_curso: "bg-amber-500/10 text-amber-700 border-amber-200",
                            cerrado: "bg-muted text-muted-foreground border-border",
                            liberado: "bg-slate-500/10 text-slate-600 border-slate-200",
                          };
                          return (
                            <div key={c.id} className="flex items-start gap-3 bg-muted/20 rounded-xl p-3 border border-border hover:bg-muted/40 transition-colors">
                              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                                <MessageSquare className="w-4 h-4 text-emerald-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-xs font-semibold truncate">{c.asunto || "Conversación WA"}</p>
                                  <Badge variant="outline" className={`text-[10px] py-0 ${estadoColor[c.estado] ?? ""}`}>
                                    {c.estado?.replace("_", " ")}
                                  </Badge>
                                  {c.no_leidos > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-primary text-primary-foreground rounded-full font-bold">
                                      {c.no_leidos}
                                    </span>
                                  )}
                                </div>
                                {c.ultimo_mensaje && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{c.ultimo_mensaje}</p>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                  {c.responsable_nombre && (
                                    <span className="text-[10px] text-muted-foreground">Resp: {c.responsable_nombre}</span>
                                  )}
                                  {c.ventana_whatsapp && (
                                    <span className={`text-[10px] ${vencida ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                                      Ventana: {vencida ? "Vencida" : fmtDate(c.ventana_whatsapp, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className="text-[10px] text-muted-foreground flex-shrink-0">
                                {c.ultima_interaccion ? fmtDate(c.ultima_interaccion, { day: "2-digit", month: "short" }) : "—"}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* ── Llamadas y Reuniones ── */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <SectionTitle icon={PhoneCall}>
                        Llamadas y reuniones
                        {actividadesComm.length > 0 && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">({actividadesComm.length})</span>}
                      </SectionTitle>
                    </div>
                    {actividadesComm.length === 0 ? (
                      <EmptySection icon={PhoneCall} label="Sin llamadas ni reuniones registradas con este cliente" />
                    ) : (
                      <div className="space-y-2">
                        {actividadesComm.map((a: any) => {
                          const isReunion = a.tipo === "reunion";
                          const statusLabel: Record<string, string> = { to_do: "Pendiente", doing: "En curso", done: "Completada" };
                          return (
                            <div key={a.id} className="flex items-start gap-3 bg-muted/20 rounded-xl p-3 border border-border">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isReunion ? "bg-blue-500/10" : "bg-orange-500/10"}`}>
                                {isReunion
                                  ? <Video className="w-4 h-4 text-blue-600" />
                                  : <PhoneCall className="w-4 h-4 text-orange-600" />
                                }
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">{a.titulo}</p>
                                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                  <Badge variant="outline" className="text-[10px] py-0 capitalize">{a.tipo}</Badge>
                                  {a.status && (
                                    <span className="text-[10px] text-muted-foreground">{statusLabel[a.status] ?? a.status}</span>
                                  )}
                                  {a.colaboradores?.nombre && (
                                    <span className="text-[10px] text-muted-foreground">· {a.colaboradores.nombre}</span>
                                  )}
                                </div>
                                {a.notas && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{a.notas}</p>}
                                {a.meet_link && (
                                  <a href={a.meet_link} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline mt-0.5">
                                    <Video className="w-2.5 h-2.5" /> Unirse a Meet
                                  </a>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground flex-shrink-0">
                                {a.fecha_hora ? fmtDate(a.fecha_hora, { day: "2-digit", month: "short" }) : a.fecha_limite ? fmtDate(a.fecha_limite, { day: "2-digit", month: "short" }) : "—"}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* ── Historial de gestiones ── */}
                  <div>
                    <SectionTitle icon={ClipboardList}>
                      Gestiones asociadas
                      {gestionesCliente.length > 0 && (
                        <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                          ({gestionesCliente.length})
                        </span>
                      )}
                    </SectionTitle>
                    {gestionesCliente.length === 0 ? (
                      <EmptySection icon={ClipboardList} label="No hay gestiones asociadas a este cliente" />
                    ) : (
                      <div className="space-y-2">
                        {gestionesCliente.map((g: any) => {
                          const pCfg  = priorityConfig[g.priority] || priorityConfig.medium;
                          const status = g.pipeline_stages?.global_status || "to_do";
                          const statusLabel: Record<string, string> = { to_do: "Por hacer", doing: "En curso", review: "En revisión", done: "Completada" };
                          const isOverdue = g.due_date && new Date(g.due_date) < new Date() && status !== "done";
                          return (
                            <div
                              key={g.id}
                              onClick={() => setOpenGestionId(g.id)}
                              className="flex items-start gap-3 bg-muted/30 rounded-xl p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                            >
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${statusDot[status] || "bg-muted"}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">{g.title}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {g.processes?.name}
                                  {g.pipeline_stages?.name && <> · <span className="font-medium">{g.pipeline_stages.name}</span></>}
                                  {g.areas_empresa?.nombre && <> · {g.areas_empresa.nombre}</>}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap mt-1.5">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${pCfg.className}`}>{pCfg.label}</span>
                                  <Badge variant="outline" className="text-[10px]">{statusLabel[status] ?? status}</Badge>
                                  {g.due_date && (
                                    <span className={`inline-flex items-center gap-1 text-[10px] ${isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                                      <Calendar className="w-2.5 h-2.5" />
                                      {fmtDate(g.due_date, { day: "2-digit", month: "short" })}
                                      {isOverdue && " · Vencida"}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className="text-[10px] text-muted-foreground flex-shrink-0">
                                {fmtDate(g.updated_at, { day: "2-digit", month: "short" })}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* ── FIDELIZACIÓN ── */}
                <TabsContent value="lealtad" className="m-0 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <SectionTitle icon={CreditCard}>Programas de lealtad</SectionTitle>
                    {isAdmin && !editLealtad && (
                      <button
                        onClick={() => setEditLealtad({ id: "", programa: "LATAM Pass", numero_membresia: null, estado: "activo", nivel: null, millas_acumuladas: null, observaciones: null, _new: true })}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors"
                      >
                        <span className="text-base leading-none">+</span> Agregar
                      </button>
                    )}
                  </div>

                  {/* Inline form */}
                  {editLealtad && (
                    <div className="mb-4 p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
                      <p className="text-xs font-semibold text-foreground">{editLealtad._new ? "Nuevo programa" : "Editar programa"}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1 col-span-2">
                          <label className="text-[10px] text-muted-foreground">Programa</label>
                          <select
                            className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                            value={editLealtad.programa}
                            onChange={e => setEditLealtad(l => l && ({ ...l, programa: e.target.value }))}
                          >
                            {PROGRAMAS_LEALTAD.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">Número de membresía</label>
                          <input className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editLealtad.numero_membresia ?? ""} onChange={e => setEditLealtad(l => l && ({ ...l, numero_membresia: e.target.value }))} placeholder="LAT-445566" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">Estado</label>
                          <select className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editLealtad.estado ?? "activo"} onChange={e => setEditLealtad(l => l && ({ ...l, estado: e.target.value }))}>
                            <option value="activo">Activo</option>
                            <option value="inactivo">Inactivo</option>
                            <option value="suspendido">Suspendido</option>
                            <option value="vencido">Vencido</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">Nivel / Categoría</label>
                          <select className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editLealtad.nivel ?? ""} onChange={e => setEditLealtad(l => l && ({ ...l, nivel: e.target.value }))}>
                            <option value="">— Sin nivel —</option>
                            <option value="Básico">Básico</option>
                            <option value="Plata">Plata</option>
                            <option value="Oro">Oro</option>
                            <option value="Platino">Platino</option>
                            <option value="Black / Elite">Black / Elite</option>
                            <option value="Diamante">Diamante</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">Millas / Puntos acumulados</label>
                          <input type="number" min="0" className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editLealtad.millas_acumuladas ?? ""} onChange={e => setEditLealtad(l => l && ({ ...l, millas_acumuladas: e.target.value === "" ? null : Number(e.target.value) }))} placeholder="78000" />
                        </div>
                        <div className="space-y-1 col-span-2">
                          <label className="text-[10px] text-muted-foreground">Observaciones</label>
                          <input className="w-full h-8 text-xs rounded-md border border-input bg-background px-2" value={editLealtad.observaciones ?? ""} onChange={e => setEditLealtad(l => l && ({ ...l, observaciones: e.target.value }))} placeholder="Opcional" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          {!editLealtad._new && (
                            <button onClick={() => deleteLealtad(editLealtad.id)} className="text-[10px] text-destructive hover:underline">Eliminar programa</button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEditLealtad(null)} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors">Cancelar</button>
                          <button onClick={() => saveLealtad(editLealtad)} className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Guardar</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {lealtad.length === 0 && !editLealtad ? (
                    <EmptySection icon={CreditCard} label="Sin programas de lealtad registrados" />
                  ) : (
                    <div className="space-y-2">
                      {lealtad.map(l => (
                        <div
                          key={l.id}
                          onClick={() => isAdmin && !editLealtad && setEditLealtad({ ...l })}
                          className={`flex items-center gap-3 bg-muted/30 rounded-xl p-3 transition-colors ${isAdmin && !editLealtad ? "cursor-pointer hover:bg-muted/50" : ""}`}
                        >
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <CreditCard className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold">{l.programa}</p>
                            <p className="text-[10px] text-muted-foreground">{l.numero_membresia ?? "Sin número de membresía"}</p>
                            {l.observaciones && <p className="text-[10px] text-muted-foreground italic">{l.observaciones}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            {l.nivel && <Badge variant="outline" className="text-[10px] block mb-1">{l.nivel}</Badge>}
                            {l.millas_acumuladas != null && (
                              <p className="text-[10px] text-muted-foreground">{l.millas_acumuladas.toLocaleString()} pts/millas</p>
                            )}
                            {l.estado && (
                              <p className={`text-[10px] font-medium mt-0.5 ${l.estado === "activo" ? "text-emerald-600" : "text-muted-foreground"}`}>
                                {l.estado}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

              </div>
            </Tabs>
          </div>

        </div>
      )}

      <CreateClienteDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        initialNombre={createNombre}
      />

      {cliente && (
        <CreateClienteDialog
          open={showEdit}
          onOpenChange={setShowEdit}
          clienteId={cliente.id}
          clienteData={cliente}
        />
      )}

      {openGestionId && (
        <GestionDetailView
          open={!!openGestionId}
          onOpenChange={open => { if (!open) setOpenGestionId(null); }}
          gestionId={openGestionId}
        />
      )}
    </div>
  );
}

// ── Familia & Referidos editable tab ─────────────────────────────────────────
type FamiliaReferidosTabProps = {
  clienteId: string;
  familiares: Familiar[];
  referidos: Referido[];
  fmtDate: (d: string, opts?: any) => string;
  onRefresh: () => void;
};

type ClienteOption = { id: string; nombre_completo: string };

function useClienteSearch(q: string) {
  return useQuery({
    queryKey: ["clientes-search-360", q],
    queryFn: async () => {
      if (q.trim().length < 2) return [];
      const { data } = await (supabase as any)
        .from("clientes").select("id, nombre_completo")
        .ilike("nombre_completo", `%${q}%`).order("nombre_completo").limit(10);
      return (data || []) as ClienteOption[];
    },
    enabled: q.trim().length >= 2,
  });
}

function ClientePicker({ value, onChange, placeholder }: {
  value: ClienteOption | null;
  onChange: (c: ClienteOption | null) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState(value?.nombre_completo || "");
  const [open, setOpen] = useState(false);
  const { data: results = [] } = useClienteSearch(q);
  useMemo(() => { if (value) setQ(value.nombre_completo); else setQ(""); }, [value?.id]);
  return (
    <div className="relative">
      <Input value={q} onChange={e => { setQ(e.target.value); onChange(null); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || "Buscar cliente..."} className="h-8 text-sm" />
      {value && <button onClick={() => { onChange(null); setQ(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-md max-h-40 overflow-y-auto">
          {results.map(c => (
            <button key={c.id} onMouseDown={e => { e.preventDefault(); onChange(c); setQ(c.nombre_completo); setOpen(false); }}
              className="w-full px-3 py-2 text-sm text-left hover:bg-accent transition-colors">{c.nombre_completo}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const RELACIONES = ["conyuge", "hijo", "hija", "padre", "madre", "hermano", "hermana", "abuelo", "abuela", "otro"];

function FamiliaReferidosTab({ clienteId, familiares, referidos, fmtDate, onRefresh }: FamiliaReferidosTabProps) {
  const [showFamiliarDialog, setShowFamiliarDialog] = useState(false);
  const [showReferidoDialog, setShowReferidoDialog] = useState(false);
  const [editFamiliar, setEditFamiliar] = useState<Familiar | null>(null);
  const [editReferido, setEditReferido] = useState<Referido | null>(null);

  const deleteFamiliar = async (id: string) => {
    await (supabase as any).from("cliente_familiar").delete().eq("id", id);
    onRefresh(); toast.success("Familiar eliminado");
  };
  const deleteReferido = async (id: string) => {
    await (supabase as any).from("cliente_referidos").delete().eq("id", id);
    onRefresh(); toast.success("Referido eliminado");
  };

  return (
    <div className="space-y-6">
      {/* ── Grupo familiar ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Home className="w-4 h-4 text-muted-foreground" /> Grupo familiar
          </div>
          <button onClick={() => { setEditFamiliar(null); setShowFamiliarDialog(true); }}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Agregar
          </button>
        </div>
        {familiares.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No hay familiares registrados</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {familiares.map(f => (
              <div key={f.id} className="group flex items-center gap-3 bg-muted/30 rounded-xl p-3 relative">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                  {f.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{f.nombre}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{f.relacion}</p>
                  {f.fecha_nacimiento && <p className="text-[10px] text-muted-foreground">{fmtDate(f.fecha_nacimiento)}</p>}
                  {f.documento_numero && <p className="text-[10px] text-muted-foreground">CI: {f.documento_numero}</p>}
                </div>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditFamiliar(f); setShowFamiliarDialog(true); }}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => deleteFamiliar(f.id)}
                    className="p-1 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* ── Red de referidos ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="w-4 h-4 text-muted-foreground" /> Red de referidos
          </div>
          <button onClick={() => { setEditReferido(null); setShowReferidoDialog(true); }}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Agregar
          </button>
        </div>
        {referidos.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Sin referidos registrados</p>
        ) : (
          <div className="space-y-2">
            {referidos.map(r => (
              <div key={r.id} className="group flex items-center gap-2.5 bg-muted/30 rounded-lg px-3 py-2">
                <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${r.tipo === "saliente" ? "bg-blue-500/10 text-blue-600 border-blue-200" : "bg-violet-500/10 text-violet-600 border-violet-200"}`}>
                  {r.tipo === "saliente" ? "Referido" : "Vino de"}
                </Badge>
                <p className="text-xs font-medium flex-1">{r.referido_nombre ?? "Cliente registrado"}</p>
                {r.observaciones && <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{r.observaciones}</p>}
                {r.fecha && <p className="text-[10px] text-muted-foreground flex-shrink-0">{fmtDate(r.fecha, { month: "short", year: "numeric" })}</p>}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                  <button onClick={() => { setEditReferido(r); setShowReferidoDialog(true); }}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => deleteReferido(r.id)}
                    className="p-1 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Dialogs ── */}
      <FamiliarDialog
        open={showFamiliarDialog} onOpenChange={setShowFamiliarDialog}
        clienteId={clienteId} familiar={editFamiliar} onSaved={onRefresh}
      />
      <ReferidoDialog
        open={showReferidoDialog} onOpenChange={setShowReferidoDialog}
        clienteId={clienteId} referido={editReferido} onSaved={onRefresh}
      />
    </div>
  );
}

function FamiliarDialog({ open, onOpenChange, clienteId, familiar, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  clienteId: string; familiar: Familiar | null; onSaved: () => void;
}) {
  const [nombre,    setNombre]    = useState(familiar?.nombre || "");
  const [relacion,  setRelacion]  = useState(familiar?.relacion || "");
  const [fechaNac,  setFechaNac]  = useState(familiar?.fecha_nacimiento?.slice(0, 10) || "");
  const [docNum,    setDocNum]    = useState(familiar?.documento_numero || "");
  const [clienteVinculo, setClienteVinculo] = useState<ClienteOption | null>(null);
  const [loading,   setLoading]   = useState(false);

  useMemo(() => {
    if (!open) return;
    setNombre(familiar?.nombre || "");
    setRelacion(familiar?.relacion || "");
    setFechaNac(familiar?.fecha_nacimiento?.slice(0, 10) || "");
    setDocNum(familiar?.documento_numero || "");
    setClienteVinculo(null);
  }, [open, familiar?.id]);

  const handleSave = async () => {
    if (!nombre.trim() || !relacion) { toast.error("Nombre y relación son requeridos"); return; }
    setLoading(true);
    try {
      const payload: any = {
        cliente_id:          clienteId,
        nombre:              nombre.trim(),
        relacion,
        fecha_nacimiento:    fechaNac || null,
        documento_numero:    docNum.trim() || null,
        familiar_cliente_id: clienteVinculo?.id || familiar?.familiar_cliente_id || null,
      };
      if (familiar) {
        await (supabase as any).from("cliente_familiar").update(payload).eq("id", familiar.id);
        toast.success("Familiar actualizado");
      } else {
        await (supabase as any).from("cliente_familiar").insert(payload);
        toast.success("Familiar agregado");
      }
      onSaved(); onOpenChange(false);
    } catch { toast.error("Error al guardar"); } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Home className="w-4 h-4 text-primary" /> {familiar ? "Editar familiar" : "Agregar familiar"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nombre completo *</label>
            <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del familiar" className="h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Relación *</label>
            <Select value={relacion} onValueChange={setRelacion}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                {RELACIONES.map(r => <SelectItem key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Fecha de nac.</label>
              <Input type="date" value={fechaNac} onChange={e => setFechaNac(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">CI / Documento</label>
              <Input value={docNum} onChange={e => setDocNum(e.target.value)} placeholder="Nro. documento" className="h-8 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Vincular a cliente existente</label>
            <ClientePicker value={clienteVinculo} onChange={setClienteVinculo} placeholder="Buscar en clientes..." />
            {familiar?.familiar_cliente_id && !clienteVinculo && (
              <p className="text-[10px] text-emerald-600 mt-0.5">✓ Ya vinculado a un cliente</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={loading || !nombre.trim() || !relacion}>
            {loading ? "Guardando..." : familiar ? "Guardar cambios" : "Agregar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReferidoDialog({ open, onOpenChange, clienteId, referido, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  clienteId: string; referido: Referido | null; onSaved: () => void;
}) {
  const [tipo,         setTipo]         = useState(referido?.tipo || "saliente");
  const [observaciones, setObservaciones] = useState(referido?.observaciones || "");
  const [fecha,        setFecha]        = useState(referido?.fecha?.slice(0, 10) || "");
  const [clienteVinculo, setClienteVinculo] = useState<ClienteOption | null>(null);
  const [nombreLibre,  setNombreLibre]  = useState(referido?.referido_nombre || "");
  const [loading,      setLoading]      = useState(false);

  useMemo(() => {
    if (!open) return;
    setTipo(referido?.tipo || "saliente");
    setObservaciones(referido?.observaciones || "");
    setFecha(referido?.fecha?.slice(0, 10) || "");
    setClienteVinculo(null);
    setNombreLibre(referido?.referido_nombre || "");
  }, [open, referido?.id]);

  const handleSave = async () => {
    if (!clienteVinculo && !nombreLibre.trim()) { toast.error("Indicá el nombre o seleccioná un cliente"); return; }
    setLoading(true);
    try {
      const payload: any = {
        cliente_id:      clienteId,
        tipo,
        observaciones:   observaciones.trim() || null,
        fecha:           fecha || null,
        referido_id:     clienteVinculo?.id || referido?.referido_id || null,
        referido_nombre: clienteVinculo ? clienteVinculo.nombre_completo : nombreLibre.trim(),
      };
      if (referido) {
        await (supabase as any).from("cliente_referidos").update(payload).eq("id", referido.id);
        toast.success("Referido actualizado");
      } else {
        await (supabase as any).from("cliente_referidos").insert(payload);
        toast.success("Referido agregado");
      }
      onSaved(); onOpenChange(false);
    } catch { toast.error("Error al guardar"); } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> {referido ? "Editar referido" : "Agregar referido"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="saliente">Referido por este cliente</SelectItem>
                <SelectItem value="entrante">Este cliente vino referido de</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Buscar en clientes registrados</label>
            <ClientePicker value={clienteVinculo} onChange={c => { setClienteVinculo(c); if (c) setNombreLibre(c.nombre_completo); }} placeholder="Buscar cliente..." />
          </div>
          {!clienteVinculo && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">O escribir nombre manualmente</label>
              <Input value={nombreLibre} onChange={e => setNombreLibre(e.target.value)} placeholder="Nombre del referido" className="h-8 text-sm" />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Observaciones</label>
            <Input value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Ej: Colega empresario, viajó a Miami" className="h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Fecha</label>
            <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={loading || (!clienteVinculo && !nombreLibre.trim())}>
            {loading ? "Guardando..." : referido ? "Guardar cambios" : "Agregar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreateClienteDialog } from "@/components/CreateClienteDialog";
import { supabase } from "@/integrations/supabase/client";
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
} from "lucide-react";

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
type Lealtad     = { id: string; programa: string; numero_membresia: string | null; estado: string | null; nivel: string | null; millas_acumuladas: number | null };
type Viaje       = { id: string; destino: string; fecha_salida: string | null; fecha_regreso: string | null; tipo_viaje: string | null; estado: string | null; monto: number | null };
type IdeaViaje   = { id: string; destino: string; notas: string | null; prioridad: string | null };
type Referido    = { id: string; referido_nombre: string | null; tipo: string; fecha: string | null; observaciones: string | null };
type Familiar    = { id: string; nombre: string; relacion: string; fecha_nacimiento: string | null; documento_numero: string | null };
type Pago        = { id: string; tipo: string; monto: number; moneda: string | null; concepto: string | null; fecha: string | null; estado: string | null };

// ─── Constants ────────────────────────────────────────────────────────────────

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
  return new Date(iso).toLocaleDateString("es-AR", opts ?? { day: "2-digit", month: "short", year: "numeric" });
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

  const { data: gestionesCliente = [] } = useQuery<any[]>({
    queryKey: ["gestiones_cliente", selectedId, cliente?.nombre_completo],
    enabled: !!selectedId && !!cliente,
    queryFn: () => safeQuery(async () => {
      const { data } = await (supabase as any)
        .from("gestiones")
        .select("id, title, pipeline_stages(name, global_status), processes(name)")
        .ilike("title", `%${cliente!.nombre_completo}%`)
        .limit(10);
      return data ?? [];
    }),
  });

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
                    { value: "comunicaciones",  label: "Comunicaciones"     },
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

                  {/* Gestiones activas */}
                  <div>
                    <SectionTitle icon={Tag}>Gestiones activas</SectionTitle>
                    {gestionesCliente.length > 0 ? (
                      <div className="space-y-2">
                        {gestionesCliente.map((g: any) => (
                          <div key={g.id} className="flex items-center gap-2.5 bg-muted/30 rounded-lg px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{g.title}</p>
                              <p className="text-[10px] text-muted-foreground">{g.processes?.name}</p>
                            </div>
                            <Badge variant="outline" className="text-[10px] flex-shrink-0">{g.pipeline_stages?.name}</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptySection icon={Tag} label="Sin gestiones activas relacionadas" />
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
                    <div className="flex items-center gap-2 mb-4">
                      <SectionTitle icon={cliente.tipo_cliente === "juridica" ? Building2 : User}>
                        {cliente.tipo_cliente === "juridica" ? "Datos de la empresa" : "Información básica"}
                      </SectionTitle>
                      <Badge variant="outline" className={`text-[10px] mb-3 ${cliente.tipo_cliente === "juridica" ? "bg-violet-500/10 text-violet-600 border-violet-200" : "bg-blue-500/10 text-blue-600 border-blue-200"}`}>
                        {cliente.tipo_cliente === "juridica" ? "Persona jurídica" : "Persona natural"}
                      </Badge>
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
                          { label: "Estado civil",       value: cliente.estado_civil },
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
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {BANCOS_BOLIVIA.map(banco => {
                          const activo = bancos.some(b => b.banco === banco);
                          return (
                            <div key={banco} className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-[11px] transition-colors ${activo ? "bg-emerald-500/10 border-emerald-200 text-emerald-700 font-medium" : "bg-muted/20 border-border text-muted-foreground"}`}>
                              {activo
                                ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                                : <div className="w-3 h-3 rounded-full border border-muted-foreground/30 flex-shrink-0" />
                              }
                              {banco}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* ── DOCUMENTOS ── */}
                <TabsContent value="documentos" className="m-0 p-5">
                  <SectionTitle icon={FileText}>Documentos y vigencia</SectionTitle>
                  {documentos.length === 0 ? (
                    <EmptySection icon={FileText} label="No hay documentos registrados para este cliente" />
                  ) : (
                    <div className="space-y-2">
                      {documentos.map(doc => {
                        const vig = docVigencia(doc.fecha_vencimiento);
                        return (
                          <div key={doc.id} className="flex items-center gap-3 bg-muted/30 rounded-xl p-3">
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

                  {/* Familia */}
                  <div>
                    <SectionTitle icon={Home}>Grupo familiar</SectionTitle>
                    {familiares.length === 0 ? (
                      <EmptySection icon={Home} label="No hay familiares registrados" />
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {familiares.map(f => (
                          <div key={f.id} className="flex items-center gap-3 bg-muted/30 rounded-xl p-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                              {f.nombre.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">{f.nombre}</p>
                              <p className="text-[10px] text-muted-foreground capitalize">{f.relacion}</p>
                              {f.fecha_nacimiento && (
                                <p className="text-[10px] text-muted-foreground">{fmtDate(f.fecha_nacimiento)}</p>
                              )}
                              {f.documento_numero && (
                                <p className="text-[10px] text-muted-foreground">CI: {f.documento_numero}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Referidos */}
                  <div>
                    <SectionTitle icon={Users}>Red de referidos</SectionTitle>
                    {referidos.length === 0 ? (
                      <EmptySection icon={Users} label="Sin referidos registrados" />
                    ) : (
                      <div className="space-y-2">
                        {referidos.map(r => (
                          <div key={r.id} className="flex items-center gap-2.5 bg-muted/30 rounded-lg px-3 py-2">
                            <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${r.tipo === "saliente" ? "bg-blue-500/10 text-blue-600 border-blue-200" : "bg-violet-500/10 text-violet-600 border-violet-200"}`}>
                              {r.tipo === "saliente" ? "Referido" : "Vino de"}
                            </Badge>
                            <p className="text-xs font-medium flex-1">{r.referido_nombre ?? "Cliente registrado"}</p>
                            {r.observaciones && <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{r.observaciones}</p>}
                            {r.fecha && <p className="text-[10px] text-muted-foreground flex-shrink-0">{fmtDate(r.fecha, { month: "short", year: "numeric" })}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
                <TabsContent value="comunicaciones" className="m-0 p-5">
                  <SectionTitle icon={MessageSquare}>Comunicaciones</SectionTitle>
                  <EmptySection
                    icon={MessageSquare}
                    label="El módulo de comunicaciones se habilitará próximamente. Aquí vas a poder ver leads asociados, campañas enviadas, historial de contacto e interacciones por distintos medios."
                  />
                </TabsContent>

                {/* ── FIDELIZACIÓN ── */}
                <TabsContent value="lealtad" className="m-0 p-5">
                  <SectionTitle icon={CreditCard}>Programas de lealtad</SectionTitle>
                  {lealtad.length === 0 ? (
                    <EmptySection icon={CreditCard} label="Sin tarjetas de lealtad registradas" />
                  ) : (
                    <div className="space-y-2">
                      {lealtad.map(l => (
                        <div key={l.id} className="flex items-center gap-3 bg-muted/30 rounded-xl p-3">
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
                              <p className="text-[10px] text-muted-foreground">{l.millas_acumuladas.toLocaleString()} millas</p>
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
    </div>
  );
}

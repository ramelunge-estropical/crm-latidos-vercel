// ============================================================================
// DerivarChatDialog
// ----------------------------------------------------------------------------
// Derivación manual de conversaciones con validación de disponibilidad.
//
// Reglas de negocio:
//  - Tab USUARIO: valida presencia (disponible / ocupado / pausa / desconectado)
//    y capacidad (chats_abiertos < max_conversaciones_agente de la cola).
//    Si el usuario NO es elegible → fallback automático a la cola del usuario.
//  - Tab COLA: la conversación queda en lat_colas sin asignación nominal;
//    el motor lat-assign-engine intentará asignar agente disponible.
//  - Cada derivación se registra en lat_trazabilidad (vía assign-engine).
//  - Se inserta un mensaje de sistema en el hilo para auditoría visible.
// ============================================================================

import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  User, Users, AlertTriangle, CheckCircle2, Clock, Coffee, WifiOff,
  Loader2, Info, GitBranch, Layers,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ---------- Tipos ----------------------------------------------------------

type EstadoPresencia = "disponible" | "ocupado" | "pausa" | "desconectado";

interface Colaborador {
  id: string;
  nombre: string;
  cargo: string | null;
  color: string;
  activo: boolean;
}

interface Presencia {
  colaborador_id: string;
  estado: EstadoPresencia;
  capacidad_maxima: number;
  chats_abiertos: number;
  ultima_actividad: string;
  motivo_pausa: string | null;
}

interface Cola {
  id: string;
  nombre: string;
  color: string;
  area: string | null;
  icono: string | null;
  max_conversaciones_agente: number;
  activa: boolean;
}

interface ColaMiembro {
  colaborador_id: string;
  cola_id: string;
  rol: string;
}

interface DerivarChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversacionId: string;
  conversacionAsunto?: string | null;
  clienteNombre?: string;
  actorId?: string | null;
  actorNombre?: string;
}

// ---------- Meta de presencia ---------------------------------------------

const presenciaMeta: Record<EstadoPresencia, { label: string; icon: typeof User; className: string; eligible: boolean }> = {
  disponible:   { label: "Disponible",  icon: CheckCircle2, className: "text-success",          eligible: true  },
  ocupado:      { label: "Ocupado",     icon: Clock,        className: "text-warning",          eligible: false },
  pausa:        { label: "En pausa",    icon: Coffee,       className: "text-muted-foreground", eligible: false },
  desconectado: { label: "Desconectado",icon: WifiOff,      className: "text-destructive",      eligible: false },
};

// ---------- Trigger assign-engine -----------------------------------------

async function triggerAssignEngine(conversacionId: string, actorId?: string | null, actorNombre?: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey    = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  await fetch(`${supabaseUrl}/functions/v1/lat-assign-engine`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${anonKey}`,
      "apikey":        anonKey,
    },
    body: JSON.stringify({
      conversacion_id: conversacionId,
      actor_id:        actorId ?? null,
      actor_nombre:    actorNombre ?? "Manual",
      es_reasignacion_manual: true,
    }),
  }).catch(e => console.error("assign-engine trigger:", e));
}

// ---------- Componente ----------------------------------------------------

export function DerivarChatDialog({
  open,
  onOpenChange,
  conversacionId,
  conversacionAsunto,
  clienteNombre = "el cliente",
  actorId,
  actorNombre = "Sistema",
}: DerivarChatDialogProps) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"usuario" | "cola">("usuario");
  const [selUsuarioId, setSelUsuarioId] = useState<string>("");
  const [selColaId, setSelColaId] = useState<string>("");
  const [nota, setNota] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelUsuarioId("");
      setSelColaId("");
      setNota("");
      setTab("usuario");
    }
  }, [open]);

  // ---- Cargar datos -------------------------------------------------------

  const { data: colaboradores = [], isLoading: loadingCol } = useQuery<Colaborador[]>({
    queryKey: ["derivar-colaboradores"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("colaboradores")
        .select("id, nombre, cargo, color, activo")
        .eq("activo", true)
        .order("nombre");
      return data ?? [];
    },
    enabled: open,
  });

  const { data: presencias = [], isLoading: loadingPres } = useQuery<Presencia[]>({
    queryKey: ["derivar-presencia"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("colaborador_presencia")
        .select("*");
      return data ?? [];
    },
    enabled: open,
    refetchInterval: open ? 15000 : false,
  });

  const { data: colas = [], isLoading: loadingColas } = useQuery<Cola[]>({
    queryKey: ["derivar-lat-colas"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("lat_colas")
        .select("id, nombre, color, area, icono, max_conversaciones_agente, activa")
        .eq("activa", true)
        .order("orden");
      return data ?? [];
    },
    enabled: open,
  });

  // Membresías: qué agente pertenece a qué cola
  const { data: memberships = [] } = useQuery<ColaMiembro[]>({
    queryKey: ["derivar-cola-miembros"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("lat_cola_miembros")
        .select("colaborador_id, cola_id, rol");
      return data ?? [];
    },
    enabled: open,
  });

  // Maps
  const presenciaMap = useMemo(() => {
    const m = new Map<string, Presencia>();
    presencias.forEach(p => m.set(p.colaborador_id, p));
    return m;
  }, [presencias]);

  // cola_id[] por colaborador
  const colasDeColaborador = useMemo(() => {
    const m = new Map<string, string[]>();
    memberships.forEach(mb => {
      const arr = m.get(mb.colaborador_id) ?? [];
      arr.push(mb.cola_id);
      m.set(mb.colaborador_id, arr);
    });
    return m;
  }, [memberships]);

  // Número de miembros disponibles por cola
  const colaDisponibles = useMemo(() => {
    const m = new Map<string, number>();
    colas.forEach(c => m.set(c.id, 0));
    memberships.forEach(mb => {
      if (mb.rol !== "agente") return;
      const p = presenciaMap.get(mb.colaborador_id);
      const cola = colas.find(c => c.id === mb.cola_id);
      if (!p || !cola) return;
      const max = cola.max_conversaciones_agente ?? 5;
      if (p.estado === "disponible" && (p.chats_abiertos ?? 0) < max) {
        m.set(mb.cola_id, (m.get(mb.cola_id) ?? 0) + 1);
      }
    });
    return m;
  }, [colas, memberships, presenciaMap]);

  const getPresencia = (colaboradorId: string): Presencia =>
    presenciaMap.get(colaboradorId) ?? {
      colaborador_id: colaboradorId,
      estado: "desconectado",
      capacidad_maxima: 5,
      chats_abiertos: 0,
      ultima_actividad: new Date().toISOString(),
      motivo_pausa: null,
    };

  const isUsuarioElegible = (colId: string) => {
    const p = getPresencia(colId);
    // Use max from any of their queues (or fallback 5)
    const colaIds = colasDeColaborador.get(colId) ?? [];
    const maxConv = colaIds.length > 0
      ? Math.max(...colaIds.map(cid => colas.find(c => c.id === cid)?.max_conversaciones_agente ?? 5))
      : 5;
    return p.estado === "disponible" && (p.chats_abiertos ?? 0) < maxConv;
  };

  const selectedUsuario = colaboradores.find(c => c.id === selUsuarioId) ?? null;
  const selectedCola    = colas.find(c => c.id === selColaId) ?? null;
  const presenciaSelUsuario = selectedUsuario ? getPresencia(selectedUsuario.id) : null;
  const elegible = selectedUsuario ? isUsuarioElegible(selectedUsuario.id) : false;

  // Fallback queue: first queue the user belongs to
  const colaFallbackId = useMemo<string | null>(() => {
    if (!selectedUsuario || elegible) return null;
    return colasDeColaborador.get(selectedUsuario.id)?.[0] ?? null;
  }, [selectedUsuario, elegible, colasDeColaborador]);

  const colaFallback = useMemo<Cola | null>(() => {
    if (!colaFallbackId) return null;
    return colas.find(c => c.id === colaFallbackId) ?? null;
  }, [colaFallbackId, colas]);

  // ---- Submit -------------------------------------------------------------

  const handleConfirm = async () => {
    if (tab === "usuario" && !selectedUsuario) {
      toast.error("Elegí un usuario destino");
      return;
    }
    if (tab === "cola" && !selectedCola) {
      toast.error("Elegí una cola destino");
      return;
    }
    if (tab === "usuario" && !elegible && !colaFallback) {
      toast.error("El usuario no está disponible y no pertenece a ninguna cola configurada. Derivá directamente a una cola.");
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      let efectivo_tipo: "usuario" | "cola";
      let efectivo_usuario: Colaborador | null = null;
      let efectivo_cola: Cola | null = null;
      let hubo_fallback = false;
      let motivo_fallback: string | null = null;

      if (tab === "cola") {
        efectivo_tipo = "cola";
        efectivo_cola = selectedCola;
      } else if (selectedUsuario && elegible) {
        efectivo_tipo = "usuario";
        efectivo_usuario = selectedUsuario;
      } else {
        efectivo_tipo = "cola";
        efectivo_cola = colaFallback;
        hubo_fallback = true;
        const p = presenciaSelUsuario!;
        motivo_fallback = p.estado !== "disponible"
          ? `${selectedUsuario!.nombre} está ${presenciaMeta[p.estado as EstadoPresencia].label.toLowerCase()}.`
          : `${selectedUsuario!.nombre} alcanzó su capacidad máxima (${p.chats_abiertos}/${p.capacidad_maxima}).`;
      }

      // 1) Actualizar conversación
      const updateConv: Record<string, unknown> = {
        en_foco:          true,
        estado:           efectivo_tipo === "usuario" ? "asignada" : "en_cola",
        estado_asignacion: efectivo_tipo === "usuario" ? "asignada" : "en_cola",
        ts_cola_asignada: now,
      };

      if (efectivo_tipo === "usuario" && efectivo_usuario) {
        updateConv.responsable_id     = efectivo_usuario.id;
        updateConv.responsable_nombre = efectivo_usuario.nombre;
        updateConv.owner_actual_id    = efectivo_usuario.id;
        updateConv.ts_agente_asignado = now;
        updateConv.en_cola            = false;
        // keep cola_id from the user's first queue for traceability
        if (colaFallbackId) updateConv.cola_id = colaFallbackId;
      } else if (efectivo_cola) {
        updateConv.cola_id            = efectivo_cola.id;
        updateConv.responsable_id     = null;
        updateConv.responsable_nombre = null;
        updateConv.en_cola            = true;
        updateConv.motivo_no_asignada = motivo_fallback ?? null;
      }

      const { error: errConv } = await (supabase as any)
        .from("lat_conversaciones")
        .update(updateConv)
        .eq("id", conversacionId);
      if (errConv) throw errConv;

      // 2) Mensaje de sistema en el hilo
      const sysMsg = efectivo_tipo === "usuario"
        ? `🔀 ${actorNombre} derivó la conversación a ${efectivo_usuario!.nombre}${nota.trim() ? ` — "${nota.trim()}"` : ""}.`
        : hubo_fallback
          ? `🔀 ${actorNombre} intentó derivar a ${selectedUsuario!.nombre}, pero ${motivo_fallback} Derivada a cola ${efectivo_cola?.nombre ?? "desconocida"}.`
          : `🔀 ${actorNombre} envió la conversación a la cola ${efectivo_cola?.nombre ?? "desconocida"}${nota.trim() ? ` — "${nota.trim()}"` : ""}.`;

      await (supabase as any).from("lat_mensajes").insert({
        conversacion_id: conversacionId,
        tipo:            "sistema",
        contenido:       sysMsg,
        estado:          "enviado",
      });

      // 3) Si se derivó a usuario directamente: actualizar capacidad y registrar trazabilidad
      if (efectivo_tipo === "usuario" && efectivo_usuario) {
        const p = getPresencia(efectivo_usuario.id);
        await (supabase as any)
          .from("colaborador_presencia")
          .upsert({
            colaborador_id:  efectivo_usuario.id,
            estado:          p.estado,
            capacidad_maxima: p.capacidad_maxima,
            chats_abiertos:  (p.chats_abiertos ?? 0) + 1,
            ultima_actividad: now,
            motivo_pausa:    p.motivo_pausa,
          }, { onConflict: "colaborador_id" });

        await (supabase as any).from("lat_trazabilidad").insert({
          conversacion_id: conversacionId,
          tipo_evento:     "reasignacion_manual",
          cola_id:         updateConv.cola_id ?? null,
          owner_nuevo_id:  efectivo_usuario.id,
          intervencion:    true,
          motivo:          nota.trim() || "Reasignación manual directa a usuario",
          detalle: {
            actor_id:    actorId,
            actor_nombre: actorNombre,
            agente_nombre: efectivo_usuario.nombre,
            disponibilidad_snap: p.estado,
          },
        });
      }

      // 4) Si se derivó a cola: lanzar assign-engine para que seleccione agente
      if (efectivo_tipo === "cola" && efectivo_cola) {
        await triggerAssignEngine(conversacionId, actorId, actorNombre);
      }

      // 5) Toast
      if (efectivo_tipo === "usuario") {
        toast.success(`Conversación derivada a ${efectivo_usuario!.nombre}`);
      } else if (hubo_fallback) {
        toast.warning(`Fallback a cola: ${efectivo_cola?.nombre ?? ""}`, { description: motivo_fallback ?? undefined });
      } else {
        toast.success(`Conversación enviada a cola ${efectivo_cola?.nombre ?? ""}`);
      }

      qc.invalidateQueries({ queryKey: ["lat_conversaciones"] });
      qc.invalidateQueries({ queryKey: ["lat-conversaciones"] });
      qc.invalidateQueries({ queryKey: ["lat_mensajes", conversacionId] });
      onOpenChange(false);
    } catch (e: any) {
      console.error("derivar:", e);
      toast.error(e.message ?? "Error al derivar la conversación");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Render -------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <GitBranch className="w-4 h-4 text-primary" />
            Derivar conversación
          </DialogTitle>
          <DialogDescription className="text-xs">
            {conversacionAsunto
              ? <>Conversación con <span className="font-medium text-foreground">{clienteNombre}</span> — {conversacionAsunto}</>
              : <>Conversación con <span className="font-medium text-foreground">{clienteNombre}</span></>}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as "usuario" | "cola")} className="mt-1">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="usuario" className="text-xs gap-1.5">
              <User className="w-3.5 h-3.5" /> Usuario
            </TabsTrigger>
            <TabsTrigger value="cola" className="text-xs gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Cola
            </TabsTrigger>
          </TabsList>

          {/* --- Tab Usuario --- */}
          <TabsContent value="usuario" className="space-y-2 mt-3">
            <div className="text-[11px] text-muted-foreground flex items-start gap-1.5 bg-muted/40 rounded p-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Si el usuario no está disponible o sin capacidad, la conversación
                se enviará a su cola principal para asignación automática.
              </span>
            </div>

            <div className="max-h-[280px] overflow-y-auto scrollbar-thin space-y-1 pr-1">
              {loadingCol || loadingPres ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : colaboradores.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No hay colaboradores activos</p>
              ) : (
                colaboradores.map(c => {
                  const p = getPresencia(c.id);
                  const meta = presenciaMeta[p.estado as EstadoPresencia] ?? presenciaMeta.desconectado;
                  const Icon = meta.icon;
                  const elegibleC = isUsuarioElegible(c.id);
                  const isSel = c.id === selUsuarioId;
                  const cargaPct = p.capacidad_maxima > 0
                    ? Math.min(100, ((p.chats_abiertos ?? 0) / p.capacidad_maxima) * 100)
                    : 0;
                  const colaIds = colasDeColaborador.get(c.id) ?? [];
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelUsuarioId(c.id)}
                      className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-all ${
                        isSel ? "border-primary bg-primary/5" : "border-border hover:border-primary/30 hover:bg-accent/30"
                      }`}
                    >
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                        style={{ backgroundColor: c.color }}
                      >
                        {c.nombre.charAt(0).toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium truncate">{c.nombre}</p>
                          {!elegibleC && isSel && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">
                              fallback a cola
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`flex items-center gap-1 text-[10px] ${meta.className}`}>
                            <Icon className="w-2.5 h-2.5" />
                            {meta.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {p.chats_abiertos ?? 0}/{p.capacidad_maxima} chats
                          </span>
                          {colaIds.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              · {colaIds.length} cola{colaIds.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <div className="h-0.5 w-full bg-muted rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              cargaPct >= 100 ? "bg-destructive" : cargaPct >= 80 ? "bg-warning" : "bg-success"
                            }`}
                            style={{ width: `${cargaPct}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {selectedUsuario && !elegible && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-[11px] text-warning flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">Fallback automático a cola</p>
                  <p>
                    {selectedUsuario.nombre}{" "}
                    {presenciaSelUsuario && presenciaSelUsuario.estado !== "disponible"
                      ? `está ${presenciaMeta[presenciaSelUsuario.estado as EstadoPresencia].label.toLowerCase()}.`
                      : `alcanzó su capacidad (${presenciaSelUsuario?.chats_abiertos}/${presenciaSelUsuario?.capacidad_maxima}).`}
                    {" "}
                    {colaFallback
                      ? <>La conversación se enviará a la cola <span className="font-medium">{colaFallback.nombre}</span> para asignación automática.</>
                      : <>El usuario no pertenece a ninguna cola — elegí una cola directamente.</>}
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* --- Tab Cola --- */}
          <TabsContent value="cola" className="space-y-2 mt-3">
            <div className="text-[11px] text-muted-foreground flex items-start gap-1.5 bg-muted/40 rounded p-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                La conversación ingresa a la cola y el motor de asignación selecciona
                automáticamente al agente disponible según la estrategia configurada.
              </span>
            </div>

            <div className="max-h-[280px] overflow-y-auto scrollbar-thin space-y-1 pr-1">
              {loadingColas ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : colas.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No hay colas configuradas</p>
              ) : (
                colas.map(c => {
                  const isSel = c.id === selColaId;
                  const totalMiembros = memberships.filter(m => m.cola_id === c.id && m.rol === "agente").length;
                  const disponibles = colaDisponibles.get(c.id) ?? 0;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelColaId(c.id)}
                      className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-all ${
                        isSel ? "border-primary bg-primary/5" : "border-border hover:border-primary/30 hover:bg-accent/30"
                      }`}
                    >
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: c.color }}
                      >
                        <Layers className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{c.nombre}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {c.area && <><span>{c.area}</span> · </>}
                          {totalMiembros} agente{totalMiembros !== 1 ? "s" : ""} ·{" "}
                          <span className={disponibles > 0 ? "text-success" : "text-muted-foreground"}>
                            {disponibles} disponible{disponibles !== 1 ? "s" : ""}
                          </span>
                        </p>
                      </div>
                      {disponibles === 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium shrink-0">
                          sin agentes
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-1 mt-2">
          <Label htmlFor="derivar-nota" className="text-[11px] text-muted-foreground">
            Motivo / nota (opcional)
          </Label>
          <Textarea
            id="derivar-nota"
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder="Ej: cliente pregunta por reserva grupal, derivar a operaciones."
            className="text-xs min-h-[56px] resize-none"
            maxLength={300}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={
              submitting ||
              (tab === "usuario" && !selectedUsuario) ||
              (tab === "cola" && !selectedCola)
            }
            className="gap-1.5"
          >
            {submitting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <GitBranch className="w-3.5 h-3.5" />}
            {tab === "usuario" && selectedUsuario && !elegible
              ? "Derivar (fallback a cola)"
              : "Derivar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

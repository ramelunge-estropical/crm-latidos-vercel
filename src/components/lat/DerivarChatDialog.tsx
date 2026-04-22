// ============================================================================
// DerivarChatDialog
// ----------------------------------------------------------------------------
// Derivación inteligente de chats con fallback automático a cola.
//
// Reglas de negocio:
//  - Si destino es USUARIO: validar presencia (disponible / ocupado / pausa /
//    desconectado) y capacidad (chats_abiertos < capacidad_maxima).
//  - Si el usuario NO es elegible → fallback automático a la cola del área
//    del usuario (o, si no tiene área, se le pide al usuario elegir cola).
//  - Si destino es EQUIPO/COLA: la conversación queda visible para el equipo,
//    sin asignación nominal.
//  - Cada derivación queda registrada en `chat_derivaciones` (auditoría).
//  - Además se inserta un mensaje de sistema en el hilo del chat para que
//    quede VISIBLE en la conversación y en Cliente 360.
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
  Loader2, Info, GitBranch,
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
  area_id: string | null;
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

interface Area {
  id: string;
  nombre: string;
  color: string;
}

interface DerivarChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversacionId: string;
  conversacionAsunto?: string | null;
  clienteNombre?: string;
  // Quién está derivando — opcional; si no, se rotula como "Sistema"
  actorId?: string | null;
  actorNombre?: string;
}

// ---------- Meta de presencia ---------------------------------------------

const presenciaMeta: Record<EstadoPresencia, { label: string; icon: typeof User; className: string; eligible: boolean }> = {
  disponible:    { label: "Disponible",   icon: CheckCircle2, className: "text-success",          eligible: true  },
  ocupado:       { label: "Ocupado",      icon: Clock,        className: "text-warning",          eligible: false },
  pausa:         { label: "En pausa",     icon: Coffee,       className: "text-muted-foreground", eligible: false },
  desconectado:  { label: "Desconectado", icon: WifiOff,      className: "text-destructive",      eligible: false },
};

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
  const [tab, setTab] = useState<"usuario" | "equipo">("usuario");
  const [selUsuarioId, setSelUsuarioId] = useState<string>("");
  const [selAreaId, setSelAreaId] = useState<string>("");
  const [nota, setNota] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setSelUsuarioId("");
      setSelAreaId("");
      setNota("");
      setTab("usuario");
    }
  }, [open]);

  // ---- Cargar colaboradores + presencia + áreas ---------------------------
  const { data: colaboradores = [], isLoading: loadingCol } = useQuery<Colaborador[]>({
    queryKey: ["derivar-colaboradores"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("colaboradores")
        .select("id, nombre, cargo, color, area_id, activo")
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
    refetchInterval: open ? 15000 : false, // refresco cada 15s mientras está abierto
  });

  const { data: areas = [] } = useQuery<Area[]>({
    queryKey: ["derivar-areas"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("areas_empresa")
        .select("id, nombre, color")
        .order("nombre");
      return data ?? [];
    },
    enabled: open,
  });

  // Map presencia por colaborador
  const presenciaMap = useMemo(() => {
    const m = new Map<string, Presencia>();
    presencias.forEach(p => m.set(p.colaborador_id, p));
    return m;
  }, [presencias]);

  // Helper: presencia de un colaborador (o por defecto desconectado)
  const getPresencia = (colaboradorId: string): Presencia => {
    return presenciaMap.get(colaboradorId) ?? {
      colaborador_id: colaboradorId,
      estado: "desconectado",
      capacidad_maxima: 5,
      chats_abiertos: 0,
      ultima_actividad: new Date().toISOString(),
      motivo_pausa: null,
    };
  };

  // ¿Es elegible? (disponible + tiene capacidad)
  const isUsuarioElegible = (colId: string) => {
    const p = getPresencia(colId);
    return p.estado === "disponible" && p.chats_abiertos < p.capacidad_maxima;
  };

  // ---- Determinar resultado al confirmar -----------------------------------
  const selectedUsuario = colaboradores.find(c => c.id === selUsuarioId) ?? null;
  const selectedArea    = areas.find(a => a.id === selAreaId) ?? null;
  const presenciaSelUsuario = selectedUsuario ? getPresencia(selectedUsuario.id) : null;
  const elegible = selectedUsuario ? isUsuarioElegible(selectedUsuario.id) : false;

  // Si elige usuario y NO es elegible, vamos a hacer fallback. Resolvemos a qué cola.
  const colaFallback = useMemo<Area | null>(() => {
    if (tab !== "usuario" || !selectedUsuario) return null;
    if (elegible) return null;
    // Cola = área del usuario destino, si tiene
    if (selectedUsuario.area_id) {
      return areas.find(a => a.id === selectedUsuario.area_id) ?? null;
    }
    return null;
  }, [tab, selectedUsuario, elegible, areas]);

  // ---- Submit -------------------------------------------------------------
  const handleConfirm = async () => {
    if (tab === "usuario" && !selectedUsuario) {
      toast.error("Elegí un usuario destino");
      return;
    }
    if (tab === "equipo" && !selectedArea) {
      toast.error("Elegí un equipo / cola destino");
      return;
    }
    if (tab === "usuario" && !elegible && !colaFallback && !selectedArea) {
      toast.error("El usuario no está disponible y no tiene equipo asignado. Elegí una cola en la pestaña Equipo.");
      return;
    }

    setSubmitting(true);

    try {
      // 1) Decidir destino efectivo
      let efectivo_tipo: "usuario" | "cola";
      let efectivo_usuario: Colaborador | null = null;
      let efectivo_area: Area | null = null;
      let hubo_fallback = false;
      let motivo_fallback: string | null = null;

      if (tab === "equipo") {
        efectivo_tipo = "cola";
        efectivo_area = selectedArea;
      } else if (selectedUsuario && elegible) {
        efectivo_tipo = "usuario";
        efectivo_usuario = selectedUsuario;
      } else {
        // Fallback a cola
        efectivo_tipo = "cola";
        efectivo_area = colaFallback ?? selectedArea;
        hubo_fallback = true;
        const p = presenciaSelUsuario!;
        const pm = presenciaMeta[p.estado];
        if (p.estado !== "disponible") {
          motivo_fallback = `${selectedUsuario!.nombre} está ${pm.label.toLowerCase()}.`;
        } else {
          motivo_fallback = `${selectedUsuario!.nombre} alcanzó su capacidad máxima (${p.chats_abiertos}/${p.capacidad_maxima}).`;
        }
      }

      // 2) Actualizar la conversación
      const updateConv: any = {
        en_foco: true,
        estado: "abierto",
      };
      if (efectivo_tipo === "usuario") {
        updateConv.responsable_id     = efectivo_usuario!.id;
        updateConv.responsable_nombre = efectivo_usuario!.nombre;
        updateConv.en_cola            = false;
        updateConv.cola_area_id       = null;
        updateConv.cola_area_nombre   = null;
      } else {
        updateConv.responsable_id     = null;
        updateConv.responsable_nombre = null;
        updateConv.en_cola            = true;
        updateConv.cola_area_id       = efectivo_area?.id ?? null;
        updateConv.cola_area_nombre   = efectivo_area?.nombre ?? null;
      }

      const { error: errConv } = await (supabase as any)
        .from("lat_conversaciones")
        .update(updateConv)
        .eq("id", conversacionId);
      if (errConv) throw errConv;

      // 3) Registrar en bitácora
      const presenciaSnap = presenciaSelUsuario;
      const { error: errBit } = await (supabase as any)
        .from("chat_derivaciones")
        .insert({
          conversacion_id: conversacionId,
          derivado_por_id: actorId ?? null,
          derivado_por_nombre: actorNombre,

          destino_tipo: tab === "usuario" ? "usuario" : "equipo",
          destino_usuario_id: tab === "usuario" ? selectedUsuario?.id ?? null : null,
          destino_usuario_nombre: tab === "usuario" ? selectedUsuario?.nombre ?? null : null,
          destino_area_id: tab === "equipo" ? selectedArea?.id ?? null : (selectedUsuario?.area_id ?? null),
          destino_area_nombre: tab === "equipo"
            ? selectedArea?.nombre ?? null
            : (areas.find(a => a.id === selectedUsuario?.area_id)?.nombre ?? null),

          efectivo_tipo,
          efectivo_usuario_id: efectivo_usuario?.id ?? null,
          efectivo_usuario_nombre: efectivo_usuario?.nombre ?? null,
          efectivo_area_id: efectivo_area?.id ?? null,
          efectivo_area_nombre: efectivo_area?.nombre ?? null,

          hubo_fallback,
          motivo_fallback,

          presencia_destino: presenciaSnap?.estado ?? null,
          capacidad_destino: presenciaSnap?.capacidad_maxima ?? null,
          chats_abiertos_destino: presenciaSnap?.chats_abiertos ?? null,

          nota: nota.trim() || null,
        });
      if (errBit) throw errBit;

      // 4) Mensaje de sistema visible en el hilo del chat
      const sysMsg =
        efectivo_tipo === "usuario"
          ? `🔀 ${actorNombre} derivó la conversación a ${efectivo_usuario!.nombre}${nota.trim() ? ` — “${nota.trim()}”` : ""}.`
          : hubo_fallback
            ? `🔀 ${actorNombre} intentó derivar a ${selectedUsuario!.nombre}, pero ${motivo_fallback} La conversación se envió a la cola general de ${efectivo_area?.nombre ?? "el equipo"}.`
            : `🔀 ${actorNombre} envió la conversación a la cola general de ${efectivo_area?.nombre ?? "el equipo"}${nota.trim() ? ` — “${nota.trim()}”` : ""}.`;

      await (supabase as any).from("lat_mensajes").insert({
        conversacion_id: conversacionId,
        tipo: "sistema",
        contenido: sysMsg,
        estado: "enviado",
      });

      // 5) Actualizar contador de chats_abiertos del usuario efectivo (best-effort)
      if (efectivo_tipo === "usuario" && efectivo_usuario) {
        const p = getPresencia(efectivo_usuario.id);
        await (supabase as any)
          .from("colaborador_presencia")
          .upsert({
            colaborador_id: efectivo_usuario.id,
            estado: p.estado,
            capacidad_maxima: p.capacidad_maxima,
            chats_abiertos: (p.chats_abiertos ?? 0) + 1,
            ultima_actividad: new Date().toISOString(),
            motivo_pausa: p.motivo_pausa,
          }, { onConflict: "colaborador_id" });
      }

      // 6) Toast + invalidar
      if (efectivo_tipo === "usuario") {
        toast.success(`Conversación derivada a ${efectivo_usuario!.nombre}`);
      } else if (hubo_fallback) {
        toast.warning(`Fallback a cola: ${efectivo_area?.nombre ?? "equipo"}`, {
          description: motivo_fallback ?? undefined,
        });
      } else {
        toast.success(`Conversación enviada a cola de ${efectivo_area?.nombre ?? "equipo"}`);
      }

      qc.invalidateQueries({ queryKey: ["lat_conversaciones"] });
      qc.invalidateQueries({ queryKey: ["lat-conversaciones"] });
      qc.invalidateQueries({ queryKey: ["lat_mensajes", conversacionId] });
      qc.invalidateQueries({ queryKey: ["chat-derivaciones", conversacionId] });

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

        <Tabs value={tab} onValueChange={v => setTab(v as "usuario" | "equipo")} className="mt-1">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="usuario" className="text-xs gap-1.5">
              <User className="w-3.5 h-3.5" /> Usuario
            </TabsTrigger>
            <TabsTrigger value="equipo" className="text-xs gap-1.5">
              <Users className="w-3.5 h-3.5" /> Equipo / Cola
            </TabsTrigger>
          </TabsList>

          {/* --- Tab Usuario --- */}
          <TabsContent value="usuario" className="space-y-2 mt-3">
            <div className="text-[11px] text-muted-foreground flex items-start gap-1.5 bg-muted/40 rounded p-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Si el usuario destino no está disponible, ocupado o sin capacidad,
                la conversación se enviará automáticamente a la cola del equipo.
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
                  const meta = presenciaMeta[p.estado];
                  const Icon = meta.icon;
                  const elegibleC = isUsuarioElegible(c.id);
                  const isSel = c.id === selUsuarioId;
                  const cargaPct = p.capacidad_maxima > 0 ? Math.min(100, (p.chats_abiertos / p.capacidad_maxima) * 100) : 0;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelUsuarioId(c.id)}
                      className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-all ${
                        isSel
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30 hover:bg-accent/30"
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
                            {p.chats_abiertos}/{p.capacidad_maxima} chats
                          </span>
                        </div>
                        {/* Barra de capacidad */}
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

            {/* Aviso fallback */}
            {selectedUsuario && !elegible && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-[11px] text-warning flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">Fallback automático a cola</p>
                  <p>
                    {selectedUsuario.nombre} {presenciaSelUsuario && presenciaSelUsuario.estado !== "disponible"
                      ? `está ${presenciaMeta[presenciaSelUsuario.estado].label.toLowerCase()}.`
                      : `alcanzó su capacidad (${presenciaSelUsuario?.chats_abiertos}/${presenciaSelUsuario?.capacidad_maxima}).`}
                    {" "}
                    {colaFallback
                      ? <>La conversación se enviará a la cola de <span className="font-medium">{colaFallback.nombre}</span>.</>
                      : <>El usuario no tiene equipo asignado — elegí una cola en la pestaña Equipo.</>
                    }
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* --- Tab Equipo --- */}
          <TabsContent value="equipo" className="space-y-2 mt-3">
            <div className="text-[11px] text-muted-foreground flex items-start gap-1.5 bg-muted/40 rounded p-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                La conversación queda visible para todos los integrantes del equipo. El primero que la tome pasa a ser responsable.
              </span>
            </div>
            <div className="max-h-[280px] overflow-y-auto scrollbar-thin space-y-1 pr-1">
              {areas.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No hay áreas configuradas</p>
              ) : (
                areas.map(a => {
                  const isSel = a.id === selAreaId;
                  const integrantes = colaboradores.filter(c => c.area_id === a.id);
                  const disponibles = integrantes.filter(c => isUsuarioElegible(c.id)).length;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelAreaId(a.id)}
                      className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-all ${
                        isSel
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30 hover:bg-accent/30"
                      }`}
                    >
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: a.color }}
                      >
                        <Users className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{a.nombre}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {integrantes.length} integrante{integrantes.length === 1 ? "" : "s"} · {disponibles} disponible{disponibles === 1 ? "" : "s"}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Nota opcional */}
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
            disabled={submitting || (tab === "usuario" && !selectedUsuario) || (tab === "equipo" && !selectedArea)}
            className="gap-1.5"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
            {tab === "usuario" && selectedUsuario && !elegible ? "Derivar (con fallback a cola)" : "Derivar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

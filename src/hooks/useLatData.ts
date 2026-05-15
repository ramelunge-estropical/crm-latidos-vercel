/**
 * useLatData — Hooks para el módulo LAT (comunicaciones)
 *
 * Arquitectura:
 *  - Si existen filas en lat_conversaciones en Supabase → usa datos reales
 *  - Si la tabla está vacía → cae al mock data para demostración
 *  - Supabase Realtime actualiza el listado en tiempo real
 */

import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { conversaciones as mockConvs, mensajes as mockMensajes } from "@/data/latMockData";

// ── Tipos DB ──────────────────────────────────────────────────────────────────

export interface LatConversacion {
  id: string;
  cliente_id: string | null;
  cliente_nombre: string | null;
  telefono: string | null;
  canal: "whatsapp" | "email" | "phone" | "instagram" | "facebook" | "web" | "interno";
  estado: string;
  asunto: string | null;
  ultimo_mensaje: string | null;
  ultima_interaccion: string;
  no_leidos: number;
  prioridad: string;
  responsable_id: string | null;
  responsable_nombre: string | null;
  proxima_accion: string | null;
  ventana_whatsapp: string | null;
  wpp_contact_id: string | null;
  gestion_id: string | null;
  en_foco: boolean;
  created_at: string;
  updated_at: string;
  // Cola / equipo destino
  en_cola?: boolean;
  cola_area_id?: string | null;
  cola_area_nombre?: string | null;
  cola_id?: string | null;
  troncal_id?: string | null;
  // Canal y regla de enrutamiento
  canal_id_fk?: string | null;
  canal_entrante_id?: string | null;
  regla_aplicada_id?: string | null;
  // Asignación pipeline
  // Valores válidos: pendiente | en_cola | asignada | en_gestion | en_espera | desborde | ignorada | cerrada
  estado_asignacion?: string | null;
  motivo_no_asignada?: string | null;
  agente_disponibilidad_snap?: string | null;
  owner_original_id?: string | null;
  owner_actual_id?: string | null;
  desborde_aplicado?: boolean;
  cola_desborde_id?: string | null;
  // Timestamps de transición
  ts_regla_aplicada?: string | null;
  ts_cola_asignada?: string | null;
  ts_agente_asignado?: string | null;
  ts_desborde?: string | null;
  // IA fields
  intencion_detectada?: string | null;
  urgencia_detectada?: string | null;
  sentimiento_detectado?: string | null;
  resumen_ia?: string | null;
  cola_sugerida_id?: string | null;
  bot_contexto?: {
    intenciones_secundarias?: Array<{
      intencion: string;
      cola_sugerida_id: string;
      urgencia: "baja" | "media" | "alta" | "critica";
      evidencia: string;
    }>;
    [key: string]: unknown;
  } | null;
  // Routing result (Phase 3)
  routing_status?: string | null;
  routing_reason?: string | null;
  channel_type?: string | null;
  // Source flag
  _source?: "db" | "mock";
}

// ── Tipos Trazabilidad ────────────────────────────────────────────────────────

export interface LatTrazabilidadEvento {
  id: string;
  conversacion_id: string;
  tipo_evento: string;
  canal_id: string | null;
  regla_id: string | null;
  cola_id: string | null;
  cola_desborde_id: string | null;
  owner_original_id: string | null;
  owner_nuevo_id: string | null;
  intervencion: boolean;
  motivo: string | null;
  detalle: Record<string, any> | null;
  channel_type: string | null;
  routing_status: string | null;
  routing_reason: string | null;
  created_at: string;
}

export interface LatMensaje {
  id: string;
  conversacion_id: string;
  tipo: "inbound" | "outbound" | "nota_interna" | "sistema";
  contenido: string;
  estado: string;
  adjunto_url: string | null;
  adjunto_nombre: string | null;
  adjunto_tipo: string | null;
  wpp_message_id: string | null;
  autor_nombre: string | null;
  created_at: string;
  _source?: "db" | "mock";
  // Email fields (populated for canal=email conversations)
  email_subject?: string | null;
  email_from_name?: string | null;
  email_from_email?: string | null;
  email_to?: string[] | null;
  email_cc?: string[] | null;
  email_bcc?: string[] | null;
  email_body_html?: string | null;
  email_body_text?: string | null;
  email_message_id?: string | null;
  email_thread_id?: string | null;
  email_in_reply_to?: string | null;
  email_references?: string | null;
  email_has_attachments?: boolean | null;
  email_date?: string | null;
  /** Array de adjuntos: [{url, nombre, tipo, size_bytes}] */
  email_attachments?: { url: string; nombre: string; tipo: string; size_bytes?: number }[] | null;
}

// ── Adapters mock → DB types ──────────────────────────────────────────────────

function adaptMockConv(c: (typeof mockConvs)[0]): LatConversacion {
  return {
    id:                  c.id,
    cliente_id:          null,
    cliente_nombre:      null,
    telefono:            null,
    canal:               c.canal,
    estado:              c.estado,
    asunto:              c.asunto,
    ultimo_mensaje:      c.ultimoMensaje,
    ultima_interaccion:  c.ultimaInteraccion.toISOString(),
    no_leidos:           c.noLeidos,
    prioridad:           c.prioridad,
    responsable_id:      null,
    responsable_nombre:  null,
    proxima_accion:      c.proximaAccion,
    ventana_whatsapp:    c.ventanaWhatsapp?.toISOString() ?? null,
    wpp_contact_id:      null,
    gestion_id:          null,
    en_foco:             true,
    created_at:          c.ultimaInteraccion.toISOString(),
    updated_at:          c.ultimaInteraccion.toISOString(),
    _source:             "mock",
  };
}

// ── useLatConversaciones ──────────────────────────────────────────────────────

export function useLatConversaciones() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<LatConversacion[]>({
    queryKey: ["lat_conversaciones"],
    queryFn: async () => {
      try {
        const { data: rows, error } = await (supabase as any)
          .from("lat_conversaciones")
          .select("*")
          .order("ultima_interaccion", { ascending: false });

        if (error) throw error;

        if (rows && rows.length > 0) {
          return (rows as LatConversacion[]).map(r => ({ ...r, _source: "db" as const }));
        }
        // Fallback a mock
        return mockConvs.map(adaptMockConv);
      } catch {
        // Si la tabla no existe todavía → mock
        return mockConvs.map(adaptMockConv);
      }
    },
    staleTime: 30_000,
    refetchInterval: 30_000,           // polling fallback si Realtime falla
    refetchIntervalInBackground: false,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = (supabase as any)
      .channel("lat-conv-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lat_conversaciones" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["lat_conversaciones"] });
          queryClient.invalidateQueries({ queryKey: ["lat-conversaciones"] });
        }
      )
      .subscribe((status: string) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ["lat_conversaciones"] });
          }, 3000);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { data: data ?? [], isLoading, error };
}

// ── useLatMensajes ────────────────────────────────────────────────────────────

export function useLatMensajes(conversacionId: string | null, isMock: boolean) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<LatMensaje[]>({
    queryKey: ["lat_mensajes", conversacionId],
    enabled: !!conversacionId,
    queryFn: async () => {
      if (isMock) {
        // Adaptar mock messages
        const mockList = mockMensajes[conversacionId!] ?? [];
        return mockList.map(m => ({
          id:              m.id,
          conversacion_id: m.conversacionId,
          tipo:            m.tipo as LatMensaje["tipo"],
          contenido:       m.contenido,
          estado:          m.estado,
          adjunto_url:     m.adjunto?.url ?? null,
          adjunto_nombre:  m.adjunto?.nombre ?? null,
          adjunto_tipo:    m.adjunto?.tipo ?? null,
          wpp_message_id:  null,
          autor_nombre:    null,
          created_at:      m.timestamp.toISOString(),
          _source:         "mock" as const,
        }));
      }

      try {
        const { data: rows, error } = await (supabase as any)
          .from("lat_mensajes")
          .select("*")
          .eq("conversacion_id", conversacionId)
          .order("created_at", { ascending: true });

        if (error) throw error;
        return (rows as LatMensaje[]).map(r => ({ ...r, _source: "db" as const }));
      } catch {
        return [];
      }
    },
    staleTime: 10_000,
    refetchInterval: 15_000,           // polling fallback para mensajes
    refetchIntervalInBackground: false,
  });

  // Realtime para mensajes en tiempo real
  useEffect(() => {
    if (!conversacionId || isMock) return;
    const channel = (supabase as any)
      .channel(`lat-msg-${conversacionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lat_mensajes", filter: `conversacion_id=eq.${conversacionId}` },
        () => queryClient.invalidateQueries({ queryKey: ["lat_mensajes", conversacionId] })
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lat_mensajes", filter: `conversacion_id=eq.${conversacionId}` },
        () => queryClient.invalidateQueries({ queryKey: ["lat_mensajes", conversacionId] })
      )
      .subscribe((status: string) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ["lat_mensajes", conversacionId] });
          }, 3000);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversacionId, isMock, queryClient]);

  return { data: data ?? [], isLoading };
}

// ── useSendMensaje ────────────────────────────────────────────────────────────

// ── useSendAdjunto ────────────────────────────────────────────────────────────

export function useSendAdjunto() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const sendAdjunto = useCallback(async (
    conversacionId: string,
    file: File,
    caption: string,
    isMock: boolean,
    autorNombre?: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (isMock) return { ok: false, error: "Disponible solo en modo real" };
    setLoading(true);
    try {
      // File → base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload  = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Error leyendo archivo"));
        r.readAsDataURL(file);
      });

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/wpp-send-media`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          conversacion_id: conversacionId,
          file_name:       file.name || `adjunto-${Date.now()}`,
          mime_type:       file.type || "application/octet-stream",
          file_base64:     base64,
          caption:         caption?.trim() || null,
          autor_nombre:    autorNombre ?? null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json?.error ?? `Error ${res.status}` };

      queryClient.invalidateQueries({ queryKey: ["lat_mensajes", conversacionId] });
      queryClient.invalidateQueries({ queryKey: ["lat_conversaciones"] });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  return { sendAdjunto, loading };
}

// ── useSendMensaje ────────────────────────────────────────────────────────────

export function useSendMensaje() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const send = useCallback(async (
    conversacionId: string,
    contenido: string,
    tipo: "outbound" | "nota_interna",
    isMock: boolean,
    autorNombre?: string,
  ) => {
    if (isMock) {
      return { ok: true, simulated: true };
    }
    setLoading(true);
    try {
      if (tipo === "outbound") {
        // Enviar via Edge Function (llama a Gupshup + guarda en BD)
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const res = await fetch(`${supabaseUrl}/functions/v1/wpp-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversacion_id: conversacionId,
            contenido: contenido.trim(),
            autor_nombre: autorNombre ?? null,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? "Error al enviar mensaje");
        }
      } else {
        // Nota interna: directo a BD
        const { error } = await (supabase as any).from("lat_mensajes").insert({
          conversacion_id: conversacionId,
          tipo,
          contenido: contenido.trim(),
          estado: "enviado",
          autor_nombre: autorNombre ?? null,
        });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["lat_mensajes", conversacionId] });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  return { send, loading };
}

// ── useLatTrazabilidad ────────────────────────────────────────────────────────
// Historial de eventos de routing para una conversación.

export function useLatTrazabilidad(conversacionId: string | null) {
  return useQuery<LatTrazabilidadEvento[]>({
    queryKey: ["lat_trazabilidad", conversacionId],
    enabled: !!conversacionId,
    queryFn: async () => {
      if (!conversacionId) return [];
      const { data, error } = await (supabase as any)
        .from("lat_trazabilidad")
        .select("*")
        .eq("conversacion_id", conversacionId)
        .order("created_at", { ascending: true });
      if (error) return [];
      return data as LatTrazabilidadEvento[];
    },
    staleTime: 30_000,
  });
}

// ── useReasignarConversacion ──────────────────────────────────────────────────
// Llama a la función RPC lat_reasignar_conversacion con trazabilidad completa.

export function useReasignarConversacion() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const reasignar = useCallback(async (
    conversacionId: string,
    nuevoResponsableId: string,
    intervenidoPorId: string,
    motivo?: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    setLoading(true);
    try {
      const { error } = await (supabase as any).rpc("lat_reasignar_conversacion", {
        p_conversacion_id:   conversacionId,
        p_nuevo_responsable: nuevoResponsableId,
        p_intervenido_por:   intervenidoPorId,
        p_motivo:            motivo ?? null,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["lat_conversaciones"] });
      queryClient.invalidateQueries({ queryKey: ["lat_bandeja"] });
      queryClient.invalidateQueries({ queryKey: ["lat_trazabilidad", conversacionId] });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  return { reasignar, loading };
}

// ── useLatBandeja ─────────────────────────────────────────────────────────────
// Bandeja INDIVIDUAL del usuario logueado.
// Todos los roles (colaborador, supervisor, admin) ven únicamente sus propias
// conversaciones: responsable_id = colaboradorId del usuario autenticado.
// Para la vista global de la cola, los supervisores usan el Dashboard.

export function useLatBandeja(
  colaboradorId: string,
  rol: string,
) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<LatConversacion[]>({
    queryKey: ["lat_bandeja", colaboradorId, rol],
    enabled: !!colaboradorId,
    queryFn: async () => {
      try {
        // Verificar si la tabla tiene datos
        const { count } = await (supabase as any)
          .from("lat_conversaciones")
          .select("id", { count: "exact", head: true });

        if (!count || count === 0) {
          // Tabla vacía → modo demo con mock
          return mockConvs.map(adaptMockConv);
        }

        console.log("[LAT_BANDEJA] colaboradorId:", colaboradorId, "| rol:", rol);

        // sadmin ve absolutamente todo sin filtro
        if (rol === "sadmin") {
          const { data: rows, error } = await (supabase as any)
            .from("lat_conversaciones")
            .select("*")
            .order("ultima_interaccion", { ascending: false });
          if (error) throw error;
          console.log("[LAT_BANDEJA] sadmin — total:", rows?.length);
          return (rows as LatConversacion[]).map(r => ({ ...r, _source: "db" as const }));
        }

        // supervisor/admin ven sus colas además de sus conversaciones asignadas.
        // colaborador (y cualquier otro rol) SOLO ve sus propias conversaciones asignadas.
        const canSeeQueues = rol === "supervisor" || rol === "admin";
        let colaIds: string[] = [];

        if (canSeeQueues) {
          const { data: colaRows } = await (supabase as any)
            .from("lat_cola_miembros")
            .select("cola_id")
            .eq("colaborador_id", colaboradorId)
            .eq("activo", true);
          colaIds = (colaRows ?? []).map((r: any) => r.cola_id as string);
          console.log("[LAT_BANDEJA] colas del colaborador:", colaIds.length);
        }

        let query = (supabase as any)
          .from("lat_conversaciones")
          .select("*")
          .not("estado_asignacion", "in", "(cerrada,ignorada)")
          .order("ultima_interaccion", { ascending: false });

        if (canSeeQueues && colaIds.length > 0) {
          query = query.or(
            `responsable_id.eq.${colaboradorId},cola_id.in.(${colaIds.join(",")})`,
          );
        } else {
          // colaborador: estrictamente solo sus chats asignados
          query = query.eq("responsable_id", colaboradorId);
        }

        const { data: rows, error } = await query;
        if (error) throw error;
        console.log("[LAT_BANDEJA] total devuelto:", rows?.length);
        return (rows as LatConversacion[]).map(r => ({ ...r, _source: "db" as const }));
      } catch {
        return mockConvs.map(adaptMockConv);
      }
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  // Realtime subscription
  useEffect(() => {
    if (!colaboradorId) return;
    const channel = (supabase as any)
      .channel(`lat-bandeja-${colaboradorId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lat_conversaciones" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["lat_bandeja", colaboradorId, rol] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [colaboradorId, rol, queryClient]);

  return { data: data ?? [], isLoading, error };
}

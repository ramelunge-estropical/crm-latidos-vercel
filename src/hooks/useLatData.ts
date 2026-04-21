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
  canal: "whatsapp" | "email" | "phone";
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
  created_at: string;
  updated_at: string;
  // Source flag (para saber si es real o mock)
  _source?: "db" | "mock";
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
  });

  // Realtime subscription
  useEffect(() => {
    const channel = (supabase as any)
      .channel("lat-conv-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lat_conversaciones" },
        () => queryClient.invalidateQueries({ queryKey: ["lat_conversaciones"] })
      )
      .subscribe();

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversacionId, isMock, queryClient]);

  return { data: data ?? [], isLoading };
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

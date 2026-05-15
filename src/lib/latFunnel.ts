/**
 * latFunnel — Lógica unificada de etapas para LAT
 * Bandeja, Dashboard y Funnel deben usar SIEMPRE este helper.
 *
 * 4 etapas operativas:
 *  - por_atender  → requiere acción inmediata del asesor
 *  - en_gestion   → ya atendida, activa, bajo control del asesor
 *  - en_espera    → siguiente paso no depende del asesor ahora
 *  - finalizado   → cerrada
 *
 * Los siguientes NO son etapas, son flags/atributos:
 *  nuevo, urgente, sin_leer, reabierto, fuera_ventana, sla_vencido, con_gestion
 */

import { LatConversacion } from "@/hooks/useLatData";

export type FunnelStage = "por_atender" | "en_gestion" | "en_espera" | "finalizado";

export const FUNNEL_STAGES: { key: FunnelStage; label: string; description: string; color: string; bg: string; text: string }[] = [
  {
    key: "por_atender",
    label: "Por atender",
    description: "Requiere acción inmediata",
    color: "bg-info",
    bg: "bg-info/10",
    text: "text-info",
  },
  {
    key: "en_gestion",
    label: "En gestión",
    description: "Activa, bajo control del asesor",
    color: "bg-primary",
    bg: "bg-primary/10",
    text: "text-primary",
  },
  {
    key: "en_espera",
    label: "En espera",
    description: "Siguiente paso no depende del asesor",
    color: "bg-warning",
    bg: "bg-warning/10",
    text: "text-warning",
  },
  {
    key: "finalizado",
    label: "Finalizado",
    description: "Cerrada",
    color: "bg-success",
    bg: "bg-success/10",
    text: "text-success",
  },
];

/**
 * Mapeo determinístico estado DB → etapa funnel.
 * Considera tanto conv.estado (legado) como conv.estado_asignacion (Phase 1+).
 * Cualquier conversación tiene UNA y solo UNA etapa.
 */
export function getFunnelStage(conv: LatConversacion): FunnelStage {
  const estado     = (conv.estado          ?? "").toLowerCase();
  const estadoAsig = (conv.estado_asignacion ?? "").toLowerCase();

  // Cerrada/finalizada
  if (
    estado === "finalizado" || estado === "cerrado" || estado === "resuelto" ||
    estadoAsig === "cerrada" || estadoAsig === "ignorada"
  ) {
    return "finalizado";
  }

  // En espera: esperando respuesta del cliente / fuera de ventana / liberado
  if (
    estado === "en_espera" || estado === "fuera_ventana" ||
    estado === "liberado"  || estado === "esperando_cliente" ||
    estadoAsig === "en_espera"
  ) {
    return "en_espera";
  }

  // Por atender: sin asignar, en cola, pendiente o nuevo sin leer
  if (
    estadoAsig === "en_cola" || estadoAsig === "pendiente" ||
    estadoAsig === "desborde" ||
    estado === "en_cola" || estado === "nuevo" ||
    estado === "pendiente_respuesta" || estado === "abierto" ||
    conv.en_cola ||
    (conv.no_leidos ?? 0) > 0
  ) {
    return "por_atender";
  }

  // En gestión: asignada o activamente gestionada
  return "en_gestion";
}

// ── Flags operativos (atributos, no etapas) ──────────────────────────────────

export interface ConvFlags {
  nuevo: boolean;
  urgente: boolean;
  sin_leer: boolean;
  reabierto: boolean;
  fuera_ventana: boolean;
  sla_vencido: boolean;
  con_gestion: boolean;
  en_cola: boolean;
}

export function getFlags(conv: LatConversacion): ConvFlags {
  const ahora = Date.now();
  const ventana = conv.ventana_whatsapp ? new Date(conv.ventana_whatsapp).getTime() : null;
  const ultimaInt = conv.ultima_interaccion ? new Date(conv.ultima_interaccion).getTime() : ahora;
  const horasDesdeInt = (ahora - ultimaInt) / (1000 * 60 * 60);
  const estadoAsig = (conv.estado_asignacion ?? "").toLowerCase();

  return {
    nuevo:    conv.estado === "nuevo",
    urgente:  conv.prioridad === "urgente" || conv.estado === "urgente",
    sin_leer: (conv.no_leidos ?? 0) > 0,
    reabierto: conv.estado === "reabierto",
    fuera_ventana: conv.canal === "whatsapp" && ventana !== null && ventana < ahora,
    // SLA simple: pendiente de respuesta hace más de 4h
    sla_vencido:
      (conv.estado === "nuevo" || conv.estado === "pendiente_respuesta" ||
       estadoAsig === "en_cola" || estadoAsig === "pendiente") && horasDesdeInt > 4,
    con_gestion: !!conv.gestion_id,
    en_cola: !!conv.en_cola || estadoAsig === "en_cola",
  };
}

// ── Helpers de agrupación ────────────────────────────────────────────────────

export function groupByStage(convs: LatConversacion[]): Record<FunnelStage, LatConversacion[]> {
  const acc: Record<FunnelStage, LatConversacion[]> = {
    por_atender: [],
    en_gestion: [],
    en_espera: [],
    finalizado: [],
  };
  for (const c of convs) {
    acc[getFunnelStage(c)].push(c);
  }
  return acc;
}

export function countFlag(convs: LatConversacion[], flag: keyof ConvFlags): number {
  return convs.filter(c => getFlags(c)[flag]).length;
}

export function isFinalizadaHoy(conv: LatConversacion): boolean {
  if (getFunnelStage(conv) !== "finalizado") return false;
  const upd = new Date(conv.updated_at ?? conv.ultima_interaccion).getTime();
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return upd >= hoy.getTime();
}

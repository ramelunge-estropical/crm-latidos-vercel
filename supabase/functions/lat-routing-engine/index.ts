/**
 * lat-routing-engine — Motor Central de Enrutamiento
 *
 * Implementa routeIncomingCommunication: flujo unificado para WhatsApp, Gmail
 * y cualquier canal futuro.
 *
 * Flujo:
 *   Canal conectado → reglas por prioridad → cola validada →
 *   usuario activo/conectado/con capacidad → asignación única → trazabilidad
 *
 * Llamado por:
 *   - wpp-webhook      (cada mensaje entrante de WhatsApp)
 *   - lat-email-agent  (cada email nuevo)
 *   - Futuros canales
 *
 * routing_status values:
 *   asignada            — conversación asignada a agente humano
 *   en_cola             — sin agente disponible, en espera
 *   bot_delegado        — pasa al agente IA (bot activo o regla asignar_bot)
 *   ignorada            — regla dice no sincronizar
 *   desborde            — derivada a cola de desborde (sin agente en desborde tampoco)
 *   canal_desconectado  — canal no conectado o inexistente
 *   sin_cola            — sin regla ni cola default configurada
 *   cola_invalida       — cola no pasó validación básica
 *   ya_asignada         — conversación ya tiene agente activo; no se reasigna
 *
 * Secrets requeridos:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoutingRequest {
  conversation_id: string;
  channel_id?:     string;
  channel_type?:   string;
  message_content?: string;
  metadata?:       Record<string, string>;
}

export interface RoutingResult {
  queue_id:         string | null;
  assigned_user_id: string | null;
  routing_status:   string;
  routing_reason:   string | null;
}

interface Canal {
  id:              string;
  tipo:            string;
  nombre:          string;
  estado:          string;
  cola_default_id: string | null;
  bot_default_id:  string | null;
}

interface Cola {
  id:                        string;
  nombre:                    string;
  activa:                    boolean;
  estrategia_asignacion:     string;
  max_conversaciones_agente: number;
  canales_entrantes_ids:     string[];
  owner_auto_asignar:        boolean;
  owner_nivel:               string;
  owner_last_user_activo:    boolean;
  owner_last_user_dias:      number;
  desborde_activo:           boolean;
  desborde_cola_id:          string | null;
  desborde_tiempo_espera:    number;
}

interface ColaMiembro {
  colaborador_id:     string;
  max_conversaciones: number | null;
  peso:               number;
  colaboradores:      { nombre: string } | null;
}

interface Presencia {
  colaborador_id:  string;
  conectado:       boolean;
  estado:          string;
  capacidad_maxima: number;
}

interface RuleEvalResult {
  colaId:     string | null;
  reglaId:    string | null;
  accionTipo: string | null;
}

interface AgentSelection {
  asignado:           boolean;
  colaborador_id:     string | null;
  colaborador_nombre: string | null;
  motivo:             string | null;
}

// ─── Canal ───────────────────────────────────────────────────────────────────

async function getCanal(channelId?: string, channelType?: string): Promise<Canal | null> {
  if (!channelId && !channelType) return null;

  const q = supabase
    .from("lat_canales")
    .select("id, tipo, nombre, estado, cola_default_id, bot_default_id");

  const { data } = channelId
    ? await q.eq("id", channelId).maybeSingle()
    : await q.eq("tipo", channelType!).limit(1).maybeSingle();

  return data as Canal | null;
}

// ─── Reglas ───────────────────────────────────────────────────────────────────

function matchCondicion(
  cond: { campo: string; operador: string; valor: string },
  fields: Record<string, string>,
): boolean {
  const fieldVal = (fields[cond.campo] ?? "").toLowerCase();
  const matchVal = (cond.valor ?? "").toLowerCase();
  switch (cond.operador) {
    case "contiene":    return fieldVal.includes(matchVal);
    case "no_contiene": return !fieldVal.includes(matchVal);
    case "es":          return fieldVal === matchVal;
    case "empieza_con": return fieldVal.startsWith(matchVal);
    case "termina_con": return fieldVal.endsWith(matchVal);
    default:            return false;
  }
}

async function evaluarReglas(
  canalId:        string,
  channelType:    string,
  messageContent: string,
  metadata:       Record<string, string>,
  colaDefaultId:  string | null,
): Promise<RuleEvalResult> {
  const { data: allReglas } = await supabase
    .from("lat_reglas_asignacion")
    .select("id, prioridad, canal_id, condiciones, accion")
    .eq("activa", true)
    .order("prioridad", { ascending: true });

  const reglas = allReglas ?? [];

  // Canal-specific rules first, then global rules
  const canalRules  = reglas.filter((r: any) => r.canal_id === canalId);
  const globalRules = reglas.filter((r: any) => !r.canal_id);
  const ordered     = [...canalRules, ...globalRules];

  const fields: Record<string, string> = {
    canal_tipo:      channelType,
    texto_mensaje:   messageContent,
    mensaje_inicial: messageContent,
    palabras_clave:  messageContent,
    ...metadata,
  };

  for (const regla of ordered) {
    const conds = Array.isArray(regla.condiciones) ? regla.condiciones : [];
    const matches = conds.length === 0 || conds.every((c: any) => matchCondicion(c, fields));
    if (!matches) continue;

    const accion     = (typeof regla.accion === "object" && regla.accion) ? regla.accion as Record<string, unknown> : {};
    const accionTipo = (accion.tipo as string) ?? null;

    if (accionTipo === "ignorar" || accionTipo === "asignar_bot") {
      return { colaId: null, reglaId: regla.id, accionTipo };
    }

    if (accionTipo === "asignar_cola") {
      let colaId: string | null = null;
      if (accion.cola_id) {
        colaId = accion.cola_id as string;
      } else if (accion.cola_nombre) {
        const { data: c } = await supabase
          .from("lat_colas").select("id").eq("nombre", accion.cola_nombre).maybeSingle();
        colaId = (c as any)?.id ?? null;
      }
      return { colaId, reglaId: regla.id, accionTipo: "asignar_cola" };
    }

    // Other actions (asignar_prioridad, etiquetar): register rule but continue to default queue
    break;
  }

  return { colaId: colaDefaultId, reglaId: null, accionTipo: colaDefaultId ? "default" : null };
}

// ─── Bot config ───────────────────────────────────────────────────────────────

async function isBotActivo(canal: string): Promise<boolean> {
  const { data } = await supabase
    .from("lat_bot_config")
    .select("activo")
    .eq("canal", canal)
    .maybeSingle();
  return (data as any)?.activo === true;
}

// ─── Cola ─────────────────────────────────────────────────────────────────────

async function getCola(colaId: string): Promise<Cola | null> {
  const { data } = await supabase
    .from("lat_colas")
    .select(`
      id, nombre, activa, estrategia_asignacion, max_conversaciones_agente,
      canales_entrantes_ids,
      owner_auto_asignar, owner_nivel, owner_last_user_activo, owner_last_user_dias,
      desborde_activo, desborde_cola_id, desborde_tiempo_espera
    `)
    .eq("id", colaId)
    .maybeSingle();
  return data as Cola | null;
}

function validarCola(cola: Cola, canalId: string): { valida: boolean; motivo: string | null } {
  if (!cola.activa) return { valida: false, motivo: "Cola inactiva" };

  const ids = cola.canales_entrantes_ids ?? [];
  if (ids.length > 0 && !ids.includes(canalId)) {
    return { valida: false, motivo: "Canal no permitido en esta cola" };
  }
  return { valida: true, motivo: null };
}

// ─── Miembros y presencia ─────────────────────────────────────────────────────

async function getMiembrosActivos(colaId: string): Promise<ColaMiembro[]> {
  const { data } = await supabase
    .from("lat_cola_miembros")
    .select("colaborador_id, max_conversaciones, peso, colaboradores(nombre)")
    .eq("cola_id", colaId)
    .eq("activo", true)
    .eq("rol", "agente");
  return (data ?? []) as ColaMiembro[];
}

async function getPresencias(ids: string[]): Promise<Map<string, Presencia>> {
  if (!ids.length) return new Map();
  const { data } = await supabase
    .from("colaborador_presencia")
    .select("colaborador_id, conectado, estado, capacidad_maxima")
    .in("colaborador_id", ids);
  const map = new Map<string, Presencia>();
  for (const p of (data ?? []) as Presencia[]) map.set(p.colaborador_id, p);
  return map;
}

async function getCargaActiva(colaboradorId: string): Promise<number> {
  const { count } = await supabase
    .from("lat_conversaciones")
    .select("id", { count: "exact", head: true })
    .eq("responsable_id", colaboradorId)
    .not("estado_asignacion", "in", '("cerrada","ignorada")');
  return count ?? 0;
}

async function getRoundRobinNext(colaId: string, miembros: ColaMiembro[]): Promise<string | null> {
  const { data } = await supabase
    .from("lat_conversaciones")
    .select("responsable_id")
    .eq("cola_id", colaId)
    .not("responsable_id", "is", null)
    .order("ts_agente_asignado", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastId = (data as any)?.responsable_id ?? null;
  if (!lastId) return miembros[0]?.colaborador_id ?? null;
  const idx = miembros.findIndex(m => m.colaborador_id === lastId);
  return miembros[(idx + 1) % miembros.length]?.colaborador_id ?? null;
}

async function getOwnerVigente(cola: Cola, convId: string, clienteId: string | null): Promise<string | null> {
  if (!cola.owner_last_user_activo || !clienteId) return null;

  if (cola.owner_nivel === "por_conversacion") {
    const { data: c } = await supabase
      .from("lat_conversaciones").select("owner_actual_id").eq("id", convId).maybeSingle();
    return (c as any)?.owner_actual_id ?? null;
  }

  const cutoff = new Date(Date.now() - cola.owner_last_user_dias * 86400_000).toISOString();
  const { data } = await supabase
    .from("lat_conversaciones")
    .select("responsable_id")
    .eq("cliente_id", clienteId)
    .eq("estado", "finalizado")
    .not("responsable_id", "is", null)
    .gte("updated_at", cutoff)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as any)?.responsable_id ?? null;
}

// ─── Selección de agente ─────────────────────────────────────────────────────

async function seleccionarAgente(
  cola:            Cola,
  miembros:        ColaMiembro[],
  presenciaMap:    Map<string, Presencia>,
  ownerVigenteId:  string | null,
  estrategia:      string,
  rrCandidateId:   string | null,
): Promise<AgentSelection> {
  const maxConvCola = cola.max_conversaciones_agente ?? 5;

  // Build eligible list with real load counts
  type Elegible = { miembro: ColaMiembro; carga: number; capacidad: number };
  const elegibles: Elegible[] = [];

  for (const m of miembros) {
    const p = presenciaMap.get(m.colaborador_id);
    if (!p)              continue;
    if (!p.conectado)    continue;   // sesión activa requerida
    if (p.estado !== "disponible") continue;

    const capacidad = m.max_conversaciones ?? maxConvCola;
    const carga     = await getCargaActiva(m.colaborador_id);

    if (carga < capacidad) elegibles.push({ miembro: m, carga, capacidad });
  }

  if (!elegibles.length) {
    const total      = miembros.length;
    const conectados = miembros.filter(m => presenciaMap.get(m.colaborador_id)?.conectado).length;
    const motivo = total === 0
      ? "sin_agentes_en_cola"
      : conectados === 0
        ? "usuarios_desconectados"
        : "capacidad_completa";
    return { asignado: false, colaborador_id: null, colaborador_nombre: null, motivo };
  }

  // Priority: owner vigente si está en elegibles
  if (ownerVigenteId) {
    const ownerEntry = elegibles.find(e => e.miembro.colaborador_id === ownerVigenteId);
    if (ownerEntry) {
      return {
        asignado:           true,
        colaborador_id:     ownerEntry.miembro.colaborador_id,
        colaborador_nombre: ownerEntry.miembro.colaboradores?.nombre ?? null,
        motivo:             "owner_vigente",
      };
    }
  }

  let elegido: Elegible | undefined;

  switch (estrategia) {
    case "menor_carga":
      elegido = elegibles.reduce((best, e) => e.carga < best.carga ? e : best);
      break;
    case "round_robin":
      if (rrCandidateId) elegido = elegibles.find(e => e.miembro.colaborador_id === rrCandidateId);
      elegido = elegido ?? elegibles[0];
      break;
    case "aleatorio":
      elegido = elegibles[Math.floor(Math.random() * elegibles.length)];
      break;
    case "primera_disponible":
    default:
      elegido = elegibles[0];
      break;
  }

  if (!elegido) {
    return { asignado: false, colaborador_id: null, colaborador_nombre: null, motivo: "sin_elegible" };
  }

  return {
    asignado:           true,
    colaborador_id:     elegido.miembro.colaborador_id,
    colaborador_nombre: elegido.miembro.colaboradores?.nombre ?? null,
    motivo:             null,
  };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function patchConv(convId: string, patch: Record<string, unknown>) {
  await supabase.from("lat_conversaciones").update(patch).eq("id", convId);
}

async function registrarTraza(
  convId:      string,
  tipoEvento:  string,
  extras:      Record<string, unknown> = {},
) {
  await supabase.from("lat_trazabilidad").insert({
    conversacion_id: convId,
    tipo_evento:     tipoEvento,
    ...extras,
  });
}

async function incrementarCarga(colaboradorId: string) {
  const { data: p } = await supabase
    .from("colaborador_presencia")
    .select("chats_abiertos, capacidad_maxima, estado, motivo_pausa")
    .eq("colaborador_id", colaboradorId)
    .maybeSingle();
  if (!p) return;
  await supabase.from("colaborador_presencia").upsert({
    colaborador_id:   colaboradorId,
    estado:           (p as any).estado,
    capacidad_maxima: (p as any).capacidad_maxima,
    chats_abiertos:   ((p as any).chats_abiertos ?? 0) + 1,
    ultima_actividad: new Date().toISOString(),
    motivo_pausa:     (p as any).motivo_pausa,
  }, { onConflict: "colaborador_id" });
}

// ─── tryAssignFromQueue: intento de asignación desde una cola específica ──────
// Sin side effects de BD — solo calcula la selección. El motor principal
// actualiza la conversación y registra trazabilidad.

async function tryAssignFromQueue(
  colaId:    string,
  convId:    string,
  canalId:   string,
): Promise<AgentSelection & { colaValida: boolean; motivoCola: string | null }> {
  const cola = await getCola(colaId);

  if (!cola) {
    return { colaValida: false, motivoCola: "Cola no encontrada", asignado: false, colaborador_id: null, colaborador_nombre: null, motivo: "Cola no encontrada" };
  }

  const { valida, motivo: motivoCola } = validarCola(cola, canalId);
  if (!valida) {
    return { colaValida: false, motivoCola, asignado: false, colaborador_id: null, colaborador_nombre: null, motivo: motivoCola };
  }

  const miembros    = await getMiembrosActivos(colaId);
  const presenciaMap = await getPresencias(miembros.map(m => m.colaborador_id));

  const { data: convData } = await supabase
    .from("lat_conversaciones")
    .select("cliente_id, owner_original_id")
    .eq("id", convId)
    .maybeSingle();

  const ownerVigenteId = await getOwnerVigente(cola, convId, (convData as any)?.cliente_id ?? null);
  const rrCandidateId  = cola.estrategia_asignacion === "round_robin"
    ? await getRoundRobinNext(colaId, miembros)
    : null;

  const selection = await seleccionarAgente(cola, miembros, presenciaMap, ownerVigenteId, cola.estrategia_asignacion, rrCandidateId);

  return { colaValida: true, motivoCola: null, ...selection };
}

// ─── Motor principal ──────────────────────────────────────────────────────────

export async function routeIncomingCommunication(
  params: RoutingRequest,
): Promise<RoutingResult> {
  const {
    conversation_id,
    channel_id,
    channel_type,
    message_content = "",
    metadata = {},
  } = params;

  console.log(`[routing] Iniciando: conv=${conversation_id} canal=${channel_id ?? channel_type}`);

  // ── Guardia: conversación ya asignada activamente ─────────────────────────
  const { data: convActual } = await supabase
    .from("lat_conversaciones")
    .select("estado_asignacion, responsable_id")
    .eq("id", conversation_id)
    .maybeSingle();

  const estadoActual = (convActual as any)?.estado_asignacion;
  if (estadoActual === "asignada" || estadoActual === "en_gestion") {
    console.log(`[routing] Ya asignada: conv=${conversation_id} estado=${estadoActual}`);
    return {
      queue_id:         null,
      assigned_user_id: (convActual as any)?.responsable_id ?? null,
      routing_status:   "ya_asignada",
      routing_reason:   "Conversación ya tiene agente activo",
    };
  }

  // ── 1. Validar canal ───────────────────────────────────────────────────────
  const canal = await getCanal(channel_id, channel_type);
  const now   = new Date().toISOString();

  if (!canal) {
    await patchConv(conversation_id, {
      estado_asignacion:  "en_cola",
      motivo_no_asignada: "Canal no encontrado",
    });
    await registrarTraza(conversation_id, "canal_no_disponible", {
      motivo:         "Canal no encontrado",
      routing_status: "canal_desconectado",
      channel_type,
      detalle:        { channel_id, channel_type },
    });
    return { queue_id: null, assigned_user_id: null, routing_status: "canal_desconectado", routing_reason: "Canal no encontrado" };
  }

  if (canal.estado !== "conectado") {
    await patchConv(conversation_id, {
      canal_id_fk:        canal.id,
      canal_entrante_id:  canal.id,
      estado_asignacion:  "en_cola",
      motivo_no_asignada: `Canal en estado: ${canal.estado}`,
    });
    await registrarTraza(conversation_id, "canal_no_disponible", {
      canal_id:       canal.id,
      motivo:         `Canal ${canal.estado}`,
      routing_status: "canal_desconectado",
      channel_type:   canal.tipo,
      detalle:        { estado: canal.estado },
    });
    console.log(`[routing] Canal ${canal.estado}: conv=${conversation_id}`);
    return { queue_id: null, assigned_user_id: null, routing_status: "canal_desconectado", routing_reason: `Canal ${canal.estado}` };
  }

  // ── 2. Evaluar reglas ──────────────────────────────────────────────────────
  const { colaId, reglaId, accionTipo } = await evaluarReglas(
    canal.id,
    channel_type ?? canal.tipo,
    message_content,
    metadata,
    canal.cola_default_id,
  );

  // Registrar canal y regla en la conversación
  const convPatch: Record<string, unknown> = {
    canal_id_fk:       canal.id,
    canal_entrante_id: canal.id,
  };
  if (reglaId) {
    convPatch.regla_aplicada_id = reglaId;
    convPatch.ts_regla_aplicada = now;
  }
  await patchConv(conversation_id, convPatch);

  if (reglaId) {
    await registrarTraza(conversation_id, "regla_aplicada", {
      canal_id:       canal.id,
      regla_id:       reglaId,
      motivo:         `Acción: ${accionTipo}`,
      routing_status: accionTipo ?? "regla_evaluada",
      routing_reason: `Regla aplicada: ${accionTipo}`,
      channel_type:   canal.tipo,
      detalle:        { accion_tipo: accionTipo, cola_id: colaId },
    });
  }

  // ── Acción: ignorar ────────────────────────────────────────────────────────
  if (accionTipo === "ignorar") {
    await patchConv(conversation_id, {
      estado:            "ignorada",
      estado_asignacion: "ignorada",
    });
    console.log(`[routing] Ignorada: conv=${conversation_id}`);
    return { queue_id: null, assigned_user_id: null, routing_status: "ignorada", routing_reason: "Regla: ignorar" };
  }

  // ── Acción: asignar_bot ────────────────────────────────────────────────────
  if (accionTipo === "asignar_bot") {
    console.log(`[routing] Bot delegado por regla: conv=${conversation_id}`);
    return { queue_id: colaId, assigned_user_id: null, routing_status: "bot_delegado", routing_reason: "Regla: asignar_bot" };
  }

  // ── Sin cola definida ──────────────────────────────────────────────────────
  if (!colaId) {
    await patchConv(conversation_id, {
      estado_asignacion:  "en_cola",
      motivo_no_asignada: "Sin cola asignada por reglas ni por defecto del canal",
    });
    await registrarTraza(conversation_id, "agente_no_disponible", {
      canal_id:       canal.id,
      motivo:         "Sin cola definida",
      routing_status: "sin_cola",
      channel_type:   canal.tipo,
    });
    console.log(`[routing] Sin cola: conv=${conversation_id}`);
    return { queue_id: null, assigned_user_id: null, routing_status: "sin_cola", routing_reason: "Sin cola definida" };
  }

  // ── Bot activo para este canal → delegar al bot (con cola pre-asignada) ────
  const botActivo = await isBotActivo(channel_type ?? canal.tipo);
  const isEmailChannel = (channel_type ?? canal.tipo) === "email";
  // Email has its own AI agent. It may analyze/reply, but inbound messages must
  // still continue to human assignment so they appear in the advisor inbox.
  if (botActivo && !isEmailChannel) {
    await patchConv(conversation_id, {
      cola_id:           colaId,
      estado:            "en_cola",
      estado_asignacion: "en_cola",
      ts_cola_asignada:  now,
    });
    await registrarTraza(conversation_id, "cola_asignada", {
      canal_id:       canal.id,
      cola_id:        colaId,
      regla_id:       reglaId,
      motivo:         "Cola pre-asignada para agente IA",
      routing_status: "bot_delegado",
      routing_reason: "Agente IA activo para este canal",
      channel_type:   canal.tipo,
    });
    console.log(`[routing] Bot delegado: conv=${conversation_id} cola=${colaId}`);
    return { queue_id: colaId, assigned_user_id: null, routing_status: "bot_delegado", routing_reason: "Agente IA activo" };
  }

  // ── 3 & 4. Intentar asignar desde la cola principal ───────────────────────
  const resultado = await tryAssignFromQueue(colaId, conversation_id, canal.id);

  if (!resultado.colaValida) {
    await patchConv(conversation_id, {
      cola_id:            colaId,
      estado:             "en_cola",
      estado_asignacion:  "en_cola",
      motivo_no_asignada: resultado.motivoCola,
      ts_cola_asignada:   now,
    });
    await registrarTraza(conversation_id, "agente_no_disponible", {
      canal_id:       canal.id,
      cola_id:        colaId,
      regla_id:       reglaId,
      motivo:         resultado.motivoCola,
      routing_status: "cola_invalida",
      channel_type:   canal.tipo,
    });
    return { queue_id: colaId, assigned_user_id: null, routing_status: "cola_invalida", routing_reason: resultado.motivoCola };
  }

  // Cola válida → registrar en conversación
  await patchConv(conversation_id, {
    cola_id:           colaId,
    estado:            "en_cola",
    estado_asignacion: "en_cola",
    ts_cola_asignada:  now,
    en_cola:           true,
  });
  await registrarTraza(conversation_id, "cola_asignada", {
    canal_id:       canal.id,
    cola_id:        colaId,
    regla_id:       reglaId,
    routing_status: "en_cola",
    channel_type:   canal.tipo,
  });

  // ── 5. Asignar si hay agente disponible ────────────────────────────────────
  if (resultado.asignado && resultado.colaborador_id) {
    return await ejecutarAsignacion(
      conversation_id, colaId, canal.id, canal.tipo, reglaId,
      resultado.colaborador_id, resultado.colaborador_nombre, resultado.motivo, now,
    );
  }

  // ── Sin agente: evaluar desborde ───────────────────────────────────────────
  const cola = await getCola(colaId);

  if (cola?.desborde_activo && cola.desborde_cola_id) {
    await patchConv(conversation_id, {
      cola_desborde_id:   cola.desborde_cola_id,
      desborde_aplicado:  true,
      estado_asignacion:  "desborde",
      motivo_no_asignada: resultado.motivo,
      ts_desborde:        now,
    });
    await registrarTraza(conversation_id, "desborde_activado", {
      canal_id:         canal.id,
      cola_id:          colaId,
      cola_desborde_id: cola.desborde_cola_id,
      regla_id:         reglaId,
      motivo:           resultado.motivo,
      routing_status:   "desborde",
      channel_type:     canal.tipo,
      detalle:          { tiempo_espera: cola.desborde_tiempo_espera },
    });

    const resultadoDesborde = await tryAssignFromQueue(cola.desborde_cola_id, conversation_id, canal.id);

    if (resultadoDesborde.asignado && resultadoDesborde.colaborador_id) {
      return await ejecutarAsignacion(
        conversation_id, cola.desborde_cola_id, canal.id, canal.tipo, reglaId,
        resultadoDesborde.colaborador_id, resultadoDesborde.colaborador_nombre, "Asignado desde cola de desborde", now,
      );
    }

    // Desborde sin agente → en espera
    await patchConv(conversation_id, {
      estado_asignacion:  "en_cola",
      motivo_no_asignada: resultadoDesborde.motivo ?? resultado.motivo,
    });
    await registrarTraza(conversation_id, "agente_no_disponible", {
      canal_id:         canal.id,
      cola_id:          cola.desborde_cola_id,
      regla_id:         reglaId,
      motivo:           resultadoDesborde.motivo ?? resultado.motivo,
      routing_status:   "en_cola",
      channel_type:     canal.tipo,
      detalle:          { tipo: "sin_agente_en_desborde" },
    });
    console.log(`[routing] Desborde sin agente: conv=${conversation_id}`);
    return { queue_id: cola.desborde_cola_id, assigned_user_id: null, routing_status: "desborde", routing_reason: resultadoDesborde.motivo ?? resultado.motivo };
  }

  // ── Sin agente, sin desborde → encolar ────────────────────────────────────
  await patchConv(conversation_id, {
    estado_asignacion:  "en_cola",
    motivo_no_asignada: resultado.motivo,
  });
  await registrarTraza(conversation_id, "agente_no_disponible", {
    canal_id:       canal.id,
    cola_id:        colaId,
    regla_id:       reglaId,
    motivo:         resultado.motivo,
    routing_status: "en_cola",
    channel_type:   canal.tipo,
    detalle:        { motivo_detallado: resultado.motivo },
  });

  console.log(`[routing] Sin agente disponible (${resultado.motivo}): conv=${conversation_id}`);
  return { queue_id: colaId, assigned_user_id: null, routing_status: "en_cola", routing_reason: resultado.motivo };
}

// ─── ejecutarAsignacion: side-effects de asignación ──────────────────────────

async function ejecutarAsignacion(
  convId:           string,
  colaId:           string,
  canalId:          string,
  canalTipo:        string,
  reglaId:          string | null,
  colaboradorId:    string,
  colaboradorNombre: string | null,
  motivo:           string | null,
  now:              string,
): Promise<RoutingResult> {
  const { data: convData } = await supabase
    .from("lat_conversaciones")
    .select("owner_original_id")
    .eq("id", convId)
    .maybeSingle();

  const { data: presData } = await supabase
    .from("colaborador_presencia")
    .select("estado")
    .eq("colaborador_id", colaboradorId)
    .maybeSingle();

  await patchConv(convId, {
    responsable_id:             colaboradorId,
    responsable_nombre:         colaboradorNombre,
    owner_actual_id:            colaboradorId,
    owner_original_id:          (convData as any)?.owner_original_id ?? colaboradorId,
    estado:                     "asignada",
    estado_asignacion:          "asignada",
    motivo_no_asignada:         null,
    agente_disponibilidad_snap: (presData as any)?.estado ?? null,
    ts_agente_asignado:         now,
    en_cola:                    false,
  });

  await incrementarCarga(colaboradorId);

  await registrarTraza(convId, "agente_asignado", {
    canal_id:       canalId,
    cola_id:        colaId,
    regla_id:       reglaId,
    owner_nuevo_id: colaboradorId,
    motivo:         motivo ?? "Agente asignado",
    routing_status: "asignada",
    routing_reason: motivo ?? "Agente asignado",
    channel_type:   canalTipo,
    detalle:        { agente_nombre: colaboradorNombre },
  });

  console.log(`[routing] Asignado: ${colaboradorNombre} → conv=${convId}`);
  return {
    queue_id:         colaId,
    assigned_user_id: colaboradorId,
    routing_status:   "asignada",
    routing_reason:   motivo,
  };
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405 });

  try {
    const body = await req.json() as RoutingRequest;
    if (!body.conversation_id) {
      return new Response(JSON.stringify({ error: "missing conversation_id" }), { status: 400 });
    }

    const result = await routeIncomingCommunication(body);

    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[routing] Error:", err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
});

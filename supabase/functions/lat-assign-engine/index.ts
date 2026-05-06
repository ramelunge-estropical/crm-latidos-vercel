/**
 * lat-assign-engine — Motor de asignación Cola → Agente
 *
 * Flujo:
 *   1. Recibe conversacion_id (con cola_id ya fijada)
 *   2. Carga configuración de la cola (estrategia, max_conv, owner, desborde)
 *   3. Carga miembros activos de la cola (lat_cola_miembros)
 *   4. Evalúa presencia de cada agente (colaborador_presencia)
 *   5. Aplica estrategia: menor_carga | round_robin | aleatorio | primera_disponible
 *   6. Si hay owner activo vigente, prioriza antes de la estrategia
 *   7. Asigna agente o deja en espera/desborde si no hay disponibles
 *   8. Registra cada transición en lat_trazabilidad
 *
 * Llamado por:
 *   - lat-bot-agent (después de shouldHandoff)
 *   - wpp-webhook (cuando bot está inactivo y cola_id fue fijada por regla)
 *   - DerivarChatDialog (reasignación manual a cola)
 *
 * Secrets requeridos:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cola {
  id: string;
  nombre: string;
  estrategia_asignacion: string;
  max_conversaciones_agente: number;
  owner_auto_asignar: boolean;
  owner_nivel: "por_cliente" | "por_conversacion";
  owner_last_user_activo: boolean;
  owner_last_user_dias: number;
  owner_registrar_trazabilidad: boolean;
  desborde_activo: boolean;
  desborde_cola_id: string | null;
  desborde_tiempo_espera: number;
  desborde_condiciones: string[];
}

interface ColaMiembro {
  colaborador_id: string;
  rol: string;
  colaboradores: { id: string; nombre: string; color: string } | null;
}

interface Presencia {
  colaborador_id: string;
  estado: string;
  capacidad_maxima: number;
  chats_abiertos: number;
  ultima_actividad: string;
}

interface Conversacion {
  id: string;
  cliente_id: string | null;
  cola_id: string | null;
  owner_original_id: string | null;
  owner_actual_id: string | null;
  canal: string;
  canal_id_fk: string | null;
}

// ─── Helpers DB ───────────────────────────────────────────────────────────────

async function getCola(colaId: string): Promise<Cola | null> {
  const { data } = await supabase
    .from("lat_colas")
    .select(`
      id, nombre, estrategia_asignacion, max_conversaciones_agente,
      owner_auto_asignar, owner_nivel, owner_last_user_activo, owner_last_user_dias,
      owner_registrar_trazabilidad,
      desborde_activo, desborde_cola_id, desborde_tiempo_espera, desborde_condiciones
    `)
    .eq("id", colaId)
    .eq("activa", true)
    .single();
  return data as Cola | null;
}

async function getColaMiembros(colaId: string): Promise<ColaMiembro[]> {
  const { data } = await supabase
    .from("lat_cola_miembros")
    .select("colaborador_id, rol, colaboradores(id, nombre, color)")
    .eq("cola_id", colaId)
    .eq("rol", "agente");
  return (data ?? []) as ColaMiembro[];
}

async function getPresencias(colaboradorIds: string[]): Promise<Presencia[]> {
  if (!colaboradorIds.length) return [];
  const { data } = await supabase
    .from("colaborador_presencia")
    .select("colaborador_id, estado, capacidad_maxima, chats_abiertos, ultima_actividad")
    .in("colaborador_id", colaboradorIds);
  return (data ?? []) as Presencia[];
}

async function getConversacion(convId: string): Promise<Conversacion | null> {
  const { data } = await supabase
    .from("lat_conversaciones")
    .select("id, cliente_id, cola_id, owner_original_id, owner_actual_id, canal, canal_id_fk")
    .eq("id", convId)
    .single();
  return data as Conversacion | null;
}

async function getOwnerVigente(cola: Cola, conv: Conversacion): Promise<string | null> {
  if (!cola.owner_last_user_activo) return null;
  if (!conv.cliente_id) return null;

  const cutoff = new Date(Date.now() - cola.owner_last_user_dias * 24 * 60 * 60 * 1000).toISOString();

  // Last agent who attended this client (or conversation) within the owner window
  const query = supabase
    .from("lat_conversaciones")
    .select("responsable_id")
    .eq("estado", "finalizado")
    .not("responsable_id", "is", null)
    .gte("updated_at", cutoff)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (cola.owner_nivel === "por_cliente") {
    query.eq("cliente_id", conv.cliente_id);
  } else {
    // por_conversacion → only applies to the current conversation's history (handoff scenario)
    return conv.owner_actual_id ?? null;
  }

  const { data } = await query.maybeSingle();
  return data?.responsable_id ?? null;
}

// Round-robin: pick the member whose cola_miembros position comes after the last assigned
async function getRoundRobinNext(colaId: string, miembros: ColaMiembro[]): Promise<string | null> {
  // Use a lightweight counter stored in cola metadata — here we use a quick heuristic:
  // find who was last assigned in this queue and take the next one
  const { data } = await supabase
    .from("lat_conversaciones")
    .select("responsable_id")
    .eq("cola_id", colaId)
    .not("responsable_id", "is", null)
    .order("ts_agente_asignado", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastId = data?.responsable_id ?? null;
  if (!lastId) return miembros[0]?.colaborador_id ?? null;

  const idx = miembros.findIndex(m => m.colaborador_id === lastId);
  const next = miembros[(idx + 1) % miembros.length];
  return next?.colaborador_id ?? null;
}

async function registrarTrazabilidad(
  convId: string,
  tipoEvento: string,
  extras: Record<string, unknown> = {},
) {
  await supabase.from("lat_trazabilidad").insert({
    conversacion_id: convId,
    tipo_evento: tipoEvento,
    ...extras,
  });
}

async function incrementarChatsAbiertos(colaboradorId: string) {
  const { data: p } = await supabase
    .from("colaborador_presencia")
    .select("chats_abiertos, capacidad_maxima, estado, motivo_pausa")
    .eq("colaborador_id", colaboradorId)
    .maybeSingle();

  if (!p) return;

  await supabase.from("colaborador_presencia").upsert({
    colaborador_id:  colaboradorId,
    estado:          p.estado,
    capacidad_maxima: p.capacidad_maxima,
    chats_abiertos:  (p.chats_abiertos ?? 0) + 1,
    ultima_actividad: new Date().toISOString(),
    motivo_pausa:    p.motivo_pausa,
  }, { onConflict: "colaborador_id" });
}

// ─── Core selection logic ─────────────────────────────────────────────────────

interface SelectionResult {
  asignado: boolean;
  colaborador_id: string | null;
  colaborador_nombre: string | null;
  motivo: string | null;
  desborde: boolean;
}

function selectAgente(
  cola: Cola,
  miembros: ColaMiembro[],
  presenciaMap: Map<string, Presencia>,
  preferidoId: string | null,
  estrategia: string,
  roundRobinCandidateId: string | null,
): SelectionResult {
  const maxConv = cola.max_conversaciones_agente ?? 5;

  // Build eligible list: connected + disponible + under capacity
  const elegibles = miembros.filter(m => {
    const p = presenciaMap.get(m.colaborador_id);
    if (!p) return false;
    return p.estado === "disponible" && (p.chats_abiertos ?? 0) < maxConv;
  });

  if (!elegibles.length) {
    const totalMiembros = miembros.length;
    const enLinea = miembros.filter(m => {
      const p = presenciaMap.get(m.colaborador_id);
      return p && p.estado !== "desconectado";
    }).length;

    let motivo: string;
    if (totalMiembros === 0) {
      motivo = "La cola no tiene agentes asignados";
    } else if (enLinea === 0) {
      motivo = `Ninguno de los ${totalMiembros} agentes está conectado`;
    } else {
      motivo = `Los ${enLinea} agentes conectados alcanzaron su capacidad máxima (${maxConv} conversaciones c/u)`;
    }
    return { asignado: false, colaborador_id: null, colaborador_nombre: null, motivo, desborde: false };
  }

  // Priority: owner vigente si está en elegibles
  if (preferidoId) {
    const ownerElegible = elegibles.find(m => m.colaborador_id === preferidoId);
    if (ownerElegible) {
      return {
        asignado: true,
        colaborador_id: ownerElegible.colaborador_id,
        colaborador_nombre: ownerElegible.colaboradores?.nombre ?? null,
        motivo: "Owner vigente disponible",
        desborde: false,
      };
    }
  }

  let elegido: ColaMiembro | undefined;

  switch (estrategia) {
    case "menor_carga":
      elegido = elegibles.reduce((best, m) => {
        const pB = presenciaMap.get(best.colaborador_id)!;
        const pM = presenciaMap.get(m.colaborador_id)!;
        return pM.chats_abiertos < pB.chats_abiertos ? m : best;
      });
      break;

    case "round_robin":
      if (roundRobinCandidateId) {
        elegido = elegibles.find(m => m.colaborador_id === roundRobinCandidateId);
      }
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
    return { asignado: false, colaborador_id: null, colaborador_nombre: null, motivo: "No se encontró agente elegible", desborde: false };
  }

  return {
    asignado: true,
    colaborador_id: elegido.colaborador_id,
    colaborador_nombre: elegido.colaboradores?.nombre ?? null,
    motivo: null,
    desborde: false,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const { conversacion_id, actor_id, actor_nombre, es_reasignacion_manual } = await req.json();
    if (!conversacion_id) return new Response("missing conversacion_id", { status: 400 });

    console.log(`[assign-engine] Iniciando asignación: conv=${conversacion_id}`);

    // 1. Load conversation
    const conv = await getConversacion(conversacion_id);
    if (!conv) return new Response("conv not found", { status: 404 });
    if (!conv.cola_id) return new Response(JSON.stringify({ ok: false, motivo: "Sin cola_id" }), { status: 200 });

    // 2. Load queue config
    const cola = await getCola(conv.cola_id);
    if (!cola) {
      await supabase.from("lat_conversaciones").update({
        estado_asignacion: "en_espera",
        motivo_no_asignada: "Cola no encontrada o inactiva",
      }).eq("id", conversacion_id);
      return new Response(JSON.stringify({ ok: false, motivo: "Cola inactiva" }), { status: 200 });
    }

    // 3. Load queue members
    const miembros = await getColaMiembros(cola.id);
    const colaboradorIds = miembros.map(m => m.colaborador_id);

    // 4. Load presences
    const presencias = await getPresencias(colaboradorIds);
    const presenciaMap = new Map<string, Presencia>();
    presencias.forEach(p => presenciaMap.set(p.colaborador_id, p));

    // Fill absent members with default "desconectado"
    colaboradorIds.forEach(id => {
      if (!presenciaMap.has(id)) {
        presenciaMap.set(id, {
          colaborador_id: id,
          estado: "desconectado",
          capacidad_maxima: 5,
          chats_abiertos: 0,
          ultima_actividad: new Date().toISOString(),
        });
      }
    });

    // 5. Evaluate owner
    const ownerVigenteId = await getOwnerVigente(cola, conv);

    // 6. Round-robin candidate
    const rrCandidate = cola.estrategia_asignacion === "round_robin"
      ? await getRoundRobinNext(cola.id, miembros)
      : null;

    // 7. Run selection
    const result = selectAgente(cola, miembros, presenciaMap, ownerVigenteId, cola.estrategia_asignacion, rrCandidate);

    const now = new Date().toISOString();

    if (result.asignado && result.colaborador_id) {
      // ── Assign ──────────────────────────────────────────────────────────────
      const presenciaSnap = presenciaMap.get(result.colaborador_id);

      await supabase.from("lat_conversaciones").update({
        responsable_id:              result.colaborador_id,
        responsable_nombre:          result.colaborador_nombre,
        owner_actual_id:             result.colaborador_id,
        owner_original_id:           conv.owner_original_id ?? result.colaborador_id,
        estado:                      "asignada",
        estado_asignacion:           "asignada",
        motivo_no_asignada:          null,
        agente_disponibilidad_snap:  presenciaSnap?.estado ?? null,
        ts_agente_asignado:          now,
        en_cola:                     false,
      }).eq("id", conversacion_id);

      await incrementarChatsAbiertos(result.colaborador_id);

      await registrarTrazabilidad(conversacion_id, "agente_asignado", {
        cola_id:         cola.id,
        owner_nuevo_id:  result.colaborador_id,
        intervencion:    !!es_reasignacion_manual,
        motivo:          result.motivo ?? `Estrategia: ${cola.estrategia_asignacion}`,
        detalle: {
          estrategia:            cola.estrategia_asignacion,
          agente_nombre:         result.colaborador_nombre,
          disponibilidad_snap:   presenciaSnap?.estado,
          chats_abiertos:        presenciaSnap?.chats_abiertos,
          owner_vigente_usado:   ownerVigenteId === result.colaborador_id,
          es_reasignacion_manual: !!es_reasignacion_manual,
          actor_id:              actor_id ?? null,
          actor_nombre:          actor_nombre ?? null,
        },
      });

      console.log(`[assign-engine] Asignado: ${result.colaborador_nombre} → conv=${conversacion_id}`);
      return new Response(JSON.stringify({ ok: true, asignado: true, colaborador_id: result.colaborador_id, colaborador_nombre: result.colaborador_nombre }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // ── No agent available ────────────────────────────────────────────────────

    // Check overflow
    if (cola.desborde_activo && cola.desborde_cola_id) {
      await supabase.from("lat_conversaciones").update({
        cola_id:             cola.desborde_cola_id,
        cola_desborde_id:    cola.desborde_cola_id,
        desborde_aplicado:   true,
        estado_asignacion:   "desborde",
        motivo_no_asignada:  result.motivo,
        ts_desborde:         now,
        estado:              "en_cola",
      }).eq("id", conversacion_id);

      await registrarTrazabilidad(conversacion_id, "desborde_activado", {
        cola_id:          conv.cola_id,
        cola_desborde_id: cola.desborde_cola_id,
        motivo:           result.motivo,
        detalle: { tiempo_espera: cola.desborde_tiempo_espera, condiciones: cola.desborde_condiciones },
      });

      console.log(`[assign-engine] Desborde → cola=${cola.desborde_cola_id} conv=${conversacion_id}`);

      // Immediately try to assign from the overflow queue
      const overflowUrl = `${SUPABASE_URL}/functions/v1/lat-assign-engine`;
      fetch(overflowUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ conversacion_id }),
      }).catch(e => console.error("[assign-engine] overflow re-trigger error:", e));

      return new Response(JSON.stringify({ ok: true, asignado: false, desborde: true, motivo: result.motivo }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // No agent, no overflow → put in waiting
    await supabase.from("lat_conversaciones").update({
      estado_asignacion:  "en_espera",
      motivo_no_asignada: result.motivo,
      estado:             "en_cola",
    }).eq("id", conversacion_id);

    await registrarTrazabilidad(conversacion_id, "agente_no_disponible", {
      cola_id: conv.cola_id,
      motivo:  result.motivo,
      detalle: {
        total_miembros: miembros.length,
        presencias: presencias.map(p => ({ id: p.colaborador_id, estado: p.estado, chats: p.chats_abiertos })),
      },
    });

    console.log(`[assign-engine] Sin agente disponible: ${result.motivo} conv=${conversacion_id}`);
    return new Response(JSON.stringify({ ok: true, asignado: false, desborde: false, motivo: result.motivo }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[assign-engine] error:", err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
});

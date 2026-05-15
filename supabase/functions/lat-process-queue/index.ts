/**
 * lat-process-queue — Procesador de cola FIFO de conversaciones sin agente asignado
 *
 * Flujo:
 *   1. Obtiene todas las conversaciones en 'en_cola' o 'en_espera' en orden FIFO
 *   2. Para cada una llama a lat-assign-engine (reutiliza lógica existente)
 *   3. Optimización por cola: si una cola no tiene agentes, omite sus conversaciones restantes
 *
 * Disparado por:
 *   - Trigger trg_presencia_libera_cola (cuando un agente gana disponibilidad)
 *   - pg_cron cada 3 minutos (red de seguridad)
 *
 * Secrets requeridos:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const body = await req.json().catch(() => ({}));
  const source = body.source ?? "unknown";

  console.log(`[lat-process-queue] Iniciando. source=${source}`);

  // 1. Obtener conversaciones sin agente (en_cola + en_espera) FIFO con cola válida.
  //    Excluir conversaciones bot_delegado donde el bot sigue activo (bot_estado != 'handed_off'):
  //    - routing_status IS NULL → no pasó por bot, incluir
  //    - routing_status != 'bot_delegado' → canal normal (email u otro), incluir
  //    - routing_status = 'bot_delegado' y bot_estado = 'handed_off' → bot terminó, incluir
  //    - routing_status = 'bot_delegado' y bot_estado = 'activo' → bot en curso, EXCLUIR
  const { data: waiting, error } = await supabase
    .from("lat_conversaciones")
    .select("id, cola_id")
    .in("estado_asignacion", ["en_cola", "en_espera"])
    .not("cola_id", "is", null)
    .or("routing_status.is.null,routing_status.neq.bot_delegado,bot_estado.eq.handed_off")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[lat-process-queue] Error al obtener cola:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!waiting?.length) {
    console.log("[lat-process-queue] Cola vacía, nada que procesar.");
    return new Response(JSON.stringify({ assigned: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[lat-process-queue] ${waiting.length} conversaciones pendientes de asignación`);

  // 2. Procesar FIFO con short-circuit por cola
  const exhaustedQueues = new Set<string>();
  let assigned = 0;

  for (const conv of waiting) {
    const colaId = conv.cola_id as string;

    // Si esta cola ya agotó sus agentes, omitir
    if (exhaustedQueues.has(colaId)) continue;

    // Guard anti-race: verificar que siga sin asignar antes de llamar al motor
    const { data: fresh } = await supabase
      .from("lat_conversaciones")
      .select("id")
      .eq("id", conv.id)
      .in("estado_asignacion", ["en_cola", "en_espera"])
      .maybeSingle();

    if (!fresh) continue; // Ya fue asignada por llamada concurrente

    // 3. Delegar al motor existente (reutiliza owner, estrategia, desborde, trazabilidad)
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/lat-assign-engine`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ conversacion_id: conv.id }),
    });

    if (!resp.ok) {
      console.error(`[lat-process-queue] assign-engine HTTP ${resp.status} conv=${conv.id}`);
      continue;
    }

    const result = await resp.json();

    if (result.asignado) {
      assigned++;
      console.log(`[lat-process-queue] Asignado: conv=${conv.id} agente=${result.colaborador_id}`);
    } else if (!result.desborde) {
      // Sin agentes en esta cola — omitir sus conversaciones restantes
      exhaustedQueues.add(colaId);
      console.log(`[lat-process-queue] Cola agotada: cola=${colaId} motivo=${result.motivo}`);
    }
    // Si hubo desborde: el motor ya re-intentó en la cola alternativa, continuar con las demás
  }

  console.log(`[lat-process-queue] Completado. asignados=${assigned} colas_agotadas=${exhaustedQueues.size}`);
  return new Response(JSON.stringify({ assigned }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

/**
 * lat-bot-agent v3 — Motor de conversación WhatsApp
 *
 * GPT-4o-mini: clasifica intención y redacta respuesta breve (JSON estructurado)
 * Código: horario, contadores, cola, handoff, asignación, auditoría
 *
 * Secrets: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *          GUPSHUP_API_KEY, GUPSHUP_NUMBER, GUPSHUP_APP_NAME
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GS_API_KEY   = Deno.env.get("GUPSHUP_API_KEY") ?? "";
const GS_NUMBER    = Deno.env.get("GUPSHUP_NUMBER") ?? "";
const GS_APP_NAME  = Deno.env.get("GUPSHUP_APP_NAME") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Types ─────────────────────────────────────────────────────────────────────

interface Cola { id: string; nombre: string; area: string | null; }

interface BotContexto {
  fase: "identificacion" | "necesidad" | "finalizado";
  nombre?: string | null;
  cliente_id?: string | null;
  preguntas_intencion: number;
}

interface AiClasificacion {
  cola_id: string;
  intencion: string;
  urgencia: "baja" | "media" | "alta" | "critica";
  confianza: number;
  resumen: string;
}

interface AiResponse {
  accion: "responder" | "identificar" | "clasificar" | "identificar_y_clasificar";
  mensaje_cliente: string;
  identificacion?: { nombre_completo: string } | null;
  clasificacion?: AiClasificacion | null;
}

// ── Horario (calculado en código, no en GPT) ──────────────────────────────────

function isWithinHorario(cfg: any): boolean {
  const zona: string   = cfg?.horario_zona_horaria ?? "America/La_Paz";
  const franjas: Record<string, string[]> = cfg?.horario_franjas ?? {
    "1": ["08:00-19:00"], "2": ["08:00-19:00"], "3": ["08:00-19:00"],
    "4": ["08:00-19:00"], "5": ["08:00-19:00"], "6": ["08:00-13:00"],
  };

  const localStr = new Date().toLocaleString("en-US", { timeZone: zona, hour12: false });
  const local    = new Date(localStr);
  const dow      = String(local.getDay());
  const hhmm     = `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;

  return (franjas[dow] ?? []).some(tramo => {
    const [inicio, fin] = tramo.split("-");
    return hhmm >= inicio && hhmm <= fin;
  });
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getBotConfig() {
  const { data } = await supabase
    .from("lat_bot_config")
    .select("activo, modelo, max_turnos, max_tokens, temperatura, prompt_identidad, prompt_reglas, prompt_categorias, prompt_calificacion, min_preguntas_calificacion, crear_gestion_auto, gestion_process_id, gestion_stage_id, horario_zona_horaria, horario_franjas")
    .eq("canal", "whatsapp")
    .maybeSingle();
  return data as any;
}

async function getColas(): Promise<Cola[]> {
  const { data } = await supabase
    .from("lat_colas")
    .select("id, nombre, area")
    .eq("activa", true)
    .order("orden");
  return (data ?? []) as Cola[];
}

async function getConversacion(id: string) {
  const { data } = await supabase
    .from("lat_conversaciones")
    .select("id, telefono, bot_estado, bot_contexto, bot_turnos, cliente_id, cliente_nombre, ultima_interaccion, responsable_nombre")
    .eq("id", id)
    .single();
  return data as any;
}

async function getMensajesRecientes(convId: string, limit = 8) {
  const { data } = await supabase
    .from("lat_mensajes")
    .select("tipo, contenido")
    .eq("conversacion_id", convId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).reverse() as any[];
}

async function getClienteByTelefono(telefono: string) {
  const clean = telefono.replace(/\D/g, "");
  const last9 = clean.slice(-9);
  const last8 = clean.slice(-8);
  const { data } = await supabase
    .from("clientes")
    .select("id, nombre_completo, razon_social")
    .or(`telefono.ilike.%${clean}%,telefono.ilike.%${last9}%,telefono.ilike.%${last8}%`)
    .limit(1)
    .maybeSingle();
  return data as any;
}

async function updateConversacion(id: string, updates: Record<string, any>) {
  await supabase.from("lat_conversaciones").update(updates).eq("id", id);
}

// ── WhatsApp ──────────────────────────────────────────────────────────────────

async function sendWhatsApp(telefono: string, texto: string, convId: string) {
  await supabase.from("lat_mensajes").insert({
    conversacion_id: convId,
    tipo:            "outbound",
    contenido:       texto,
    estado:          GS_API_KEY ? "enviando" : "enviado",
    autor_nombre:    "Lati",
  });

  if (!GS_API_KEY || !GS_NUMBER) return;
  try {
    await fetch("https://api.gupshup.io/wa/api/v1/msg", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", apikey: GS_API_KEY },
      body: new URLSearchParams({
        channel:     "whatsapp",
        source:      GS_NUMBER,
        destination: telefono,
        message:     JSON.stringify({ type: "text", text: texto }),
        "src.name":  GS_APP_NAME,
      }).toString(),
    });
  } catch (err) {
    console.error("[bot] sendWhatsApp error:", err);
  }
}

// ── Assign engine ─────────────────────────────────────────────────────────────

// Awaitable: llamado con `await` en el handoff para garantizar que la asignación
// ocurra dentro del ciclo de vida de la Edge Function, no como fire-and-forget.
async function triggerAssignEngine(convId: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/lat-assign-engine`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ conversacion_id: convId }),
    });
  } catch (e) {
    console.error("[bot] assign-engine error:", e);
  }
}

// ── Audit log ─────────────────────────────────────────────────────────────────

async function logAudit(entry: {
  conversacion_id: string;
  turno: number;
  mensaje_cliente: string;
  accion: string;
  intencion_detectada?: string | null;
  cola_sugerida?: string | null;
  cola_id?: string | null;
  confianza?: number | null;
  motivo?: string | null;
  output_modelo?: any;
}) {
  await supabase.from("lat_routing_audit_log").insert(entry)
    .then(() => {}, (err: any) => console.error("[bot] audit log error:", err?.message));
}

// ── Gestión automática ────────────────────────────────────────────────────────

async function crearGestion(
  conv: any,
  ctx: BotContexto & { intencion?: string; urgencia?: string; descripcion?: string },
  cfg: any,
) {
  if (!cfg?.crear_gestion_auto || !cfg?.gestion_process_id) return;
  const prioMap: Record<string, string> = { critica: "urgent", alta: "high", media: "medium", baja: "low" };
  await supabase.from("gestiones").insert({
    title:                  `${ctx.intencion ?? "Consulta"} — ${ctx.nombre ?? "Nuevo contacto"} (WhatsApp)`,
    description:            ctx.descripcion ?? "Contacto vía WhatsApp",
    process_id:             cfg.gestion_process_id,
    stage_id:               cfg.gestion_stage_id ?? null,
    cliente_id:             conv.cliente_id ?? null,
    cliente_nombre:         ctx.nombre ?? null,
    priority:               prioMap[ctx.urgencia ?? "media"] ?? "medium",
    subtype:                ctx.intencion ?? "otro",
    canal_origen:           "whatsapp",
    conversacion_id_origen: conv.id,
  });
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(
  ctx: BotContexto,
  clienteInfo: string,
  colas: Cola[],
  turno: number,
  maxTurnos: number,
  maxPreguntas: number,
  enHorario: boolean,
  cfg?: any,
): string {
  const reglas      = cfg?.prompt_reglas     ? `\nREGLAS ADICIONALES:\n${cfg.prompt_reglas}`        : "";
  const calificacion = cfg?.prompt_calificacion ? `\nPREGUNTAS POR CATEGORÍA:\n${cfg.prompt_calificacion}` : "";
  const identidad   = cfg?.prompt_identidad  ? cfg.prompt_identidad : "Lati, parte del equipo de Tropical Tours Bolivia.";
  const colasList   = colas.map(c =>
    `  { "id": "${c.id}", "nombre": "${c.nombre}"${c.area ? `, "area": "${c.area}"` : ""} }`
  ).join(",\n");

  return `Eres ${identidad}
Tono: amigable, cálido, profesional. Español neutro latinoamericano (sin voseo: usa "puedes", "eres", "tienes", no "podés", "sos", "tenés").
Nunca menciones que eres IA, bot, sistema automático o asistente virtual. Eres Lati, del equipo de Tropical Tours.
Nunca inventes precios, fechas ni disponibilidad. Si no sabes algo específico, indica que un asesor lo confirmará.

ESTADO ACTUAL:
- Turno: ${turno + 1}/${maxTurnos}
- Preguntas de clasificación usadas: ${ctx.preguntas_intencion}/${maxPreguntas}
- Fase: ${ctx.fase}
- Cliente: ${clienteInfo}
- En horario de atención: ${enHorario ? "sí" : "no (fuera de horario — igual clasifica y deriva)"}

COLAS DISPONIBLES — usa el id exacto (campo "id") al clasificar:
[
${colasList}
]

FLUJO:
${ctx.fase === "identificacion"
  ? `1. Saluda e, en un solo mensaje, pide NOMBRE Y APELLIDO completos y pregunta en qué puedes ayudar.`
  : `1. El cliente ya está identificado como: ${ctx.nombre}. Pregunta directamente en qué puedes ayudar.`
}
2. Cuando tengas nombre + motivo claro, clasifica y deriva en el mismo turno (accion "identificar_y_clasificar" o "clasificar").
3. Puedes hacer máximo ${maxPreguntas} preguntas de clasificación. Si ya alcanzaste el límite, deriva.
4. Si llegas al turno ${maxTurnos} sin clasificar, deriva a la cola "No Clasificada Revisión Supervisor".
5. EMERGENCIAS (accidente, hospitalización, vuelo perdido, robo en destino): deriva INMEDIATAMENTE al asesor de Emergencia en Destino. Sin preguntas adicionales.
6. Mensajes no-texto (imagen, audio, sticker, documento): pide que escriban su consulta en texto.${reglas}${calificacion}

RESPONDE SIEMPRE con este JSON exacto (sin markdown extra ni texto fuera del JSON):
{
  "accion": "responder" | "identificar" | "clasificar" | "identificar_y_clasificar",
  "mensaje_cliente": "Texto que se envía al cliente. Conciso, máximo 3 oraciones.",
  "identificacion": { "nombre_completo": "..." } | null,
  "clasificacion": {
    "cola_id": "id exacto de la lista",
    "intencion": "descripción corta de la necesidad",
    "urgencia": "baja" | "media" | "alta" | "critica",
    "confianza": 0.0,
    "resumen": "resumen para el asesor humano"
  } | null
}`;
}

// ── OpenAI (structured JSON) ──────────────────────────────────────────────────

async function callOpenAI(
  systemPrompt: string,
  mensajes: any[],
  nuevoMensaje: string,
  cfg: any,
): Promise<AiResponse | null> {
  const history = mensajes.map(m => ({
    role:    m.tipo === "inbound" ? "user" : "assistant",
    content: m.contenido,
  }));

  if (!history.length || history[history.length - 1].role !== "user") {
    history.push({ role: "user", content: nuevoMensaje });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model:           cfg?.modelo     ?? "gpt-4o-mini",
      messages:        [{ role: "system", content: systemPrompt }, ...history],
      response_format: { type: "json_object" },
      temperature:     cfg?.temperatura ?? 0.3,
      max_tokens:      cfg?.max_tokens  ?? 400,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);

  const raw = (await res.json()).choices?.[0]?.message?.content ?? null;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AiResponse;
  } catch {
    console.error("[bot] JSON parse error:", raw?.slice(0, 200));
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });

  try {
    const { conversacion_id, telefono, contenido } = await req.json();
    if (!conversacion_id) return new Response("missing conversacion_id", { status: 400 });

    // 1. Paralelo: config + conversación + colas
    const [cfg, conv, colas] = await Promise.all([
      getBotConfig(),
      getConversacion(conversacion_id),
      getColas(),
    ]);

    if (!conv) return new Response("conv not found", { status: 404 });
    if (!cfg || cfg.activo === false) {
      return new Response(JSON.stringify({ ok: true, skipped: "bot disabled" }), { status: 200 });
    }

    const maxTurnos    = cfg?.max_turnos               ?? 6;
    const maxPreguntas = cfg?.min_preguntas_calificacion ?? 3;
    const enHorario    = isWithinHorario(cfg);

    // Colas especiales con búsqueda tolerante
    const colaFallback    = colas.find(c => c.nombre.toLowerCase().includes("no clasificada") || c.nombre.toLowerCase().includes("supervisor"));
    const colaFrontdesk   = colas.find(c => c.nombre.toLowerCase().includes("frontdesk"));
    const colaEmergencia  = colas.find(c => c.nombre.toLowerCase().includes("emergencia"));

    // 2. Reset sesión si handed_off, pausado o inactiva >3h
    const stale = conv.bot_estado === "activo"
      && (conv.bot_turnos ?? 0) > 0
      && Date.now() - new Date(conv.ultima_interaccion).getTime() > 3 * 60 * 60 * 1000;

    if (conv.bot_estado === "handed_off" || conv.bot_estado === "pausado" || stale) {
      const freshCtx: BotContexto = conv.cliente_id
        ? { fase: "necesidad",       cliente_id: conv.cliente_id, nombre: conv.cliente_nombre, preguntas_intencion: 0 }
        : { fase: "identificacion",  preguntas_intencion: 0 };
      await updateConversacion(conversacion_id, {
        bot_estado: "activo", bot_turnos: 0, bot_contexto: freshCtx,
        cola_id: null, intencion_detectada: null, urgencia_detectada: null, resumen_ia: null, estado: "abierta",
      });
      Object.assign(conv, { bot_estado: "activo", bot_turnos: 0, bot_contexto: freshCtx });
    }

    const ctx: BotContexto = (conv.bot_contexto && typeof conv.bot_contexto === "object")
      ? { preguntas_intencion: 0, ...(conv.bot_contexto as BotContexto) }
      : { fase: "identificacion", preguntas_intencion: 0 };

    const turno = conv.bot_turnos ?? 0;

    // 3. Handoff forzado por máximo de turnos
    if (turno >= maxTurnos) {
      const colaHF = colaFallback ?? colaFrontdesk ?? null;
      await updateConversacion(conversacion_id, {
        bot_estado: "handed_off", cola_id: colaHF?.id ?? null, cola_area_nombre: colaHF?.nombre ?? null,
        estado: "en_cola", estado_asignacion: "en_cola", ts_cola_asignada: new Date().toISOString(),
      });
      await sendWhatsApp(conv.telefono ?? telefono, "Te estoy conectando con un asesor. ¡Gracias por tu paciencia!", conversacion_id);
      if (colaHF?.id) await triggerAssignEngine(conversacion_id);
      await logAudit({ conversacion_id, turno, mensaje_cliente: contenido, accion: "handoff_max_turnos", cola_sugerida: colaHF?.nombre, cola_id: colaHF?.id, motivo: "max_turnos" });
      return new Response("max turns", { status: 200 });
    }

    // 4. Auto-identificar por teléfono si aún no está vinculado
    if (!ctx.cliente_id) {
      const clienteDB = await getClienteByTelefono(conv.telefono ?? telefono);
      if (clienteDB) {
        ctx.fase       = "necesidad";
        ctx.nombre     = clienteDB.nombre_completo ?? clienteDB.razon_social;
        ctx.cliente_id = clienteDB.id;
        await updateConversacion(conversacion_id, {
          cliente_id: clienteDB.id, cliente_nombre: ctx.nombre, bot_contexto: ctx,
        });
      }
    }

    const clienteInfo = ctx.nombre ? `${ctx.nombre} (identificado)` : "No identificado";

    // 5. Prompt + historial + llamada a OpenAI
    const systemPrompt = buildSystemPrompt(ctx, clienteInfo, colas, turno, maxTurnos, maxPreguntas, enHorario, cfg);
    const mensajes     = await getMensajesRecientes(conversacion_id, 8);
    const ai           = await callOpenAI(systemPrompt, mensajes, contenido, cfg);

    if (!ai) throw new Error("No structured response from OpenAI");

    const telefDest = conv.telefono ?? telefono;
    const newCtx    = { ...ctx };

    // 6. Procesar identificación
    const debeIdentificar = (ai.accion === "identificar" || ai.accion === "identificar_y_clasificar")
      && !!ai.identificacion?.nombre_completo;

    if (debeIdentificar) {
      const nombre = ai.identificacion!.nombre_completo;
      newCtx.nombre = nombre;
      newCtx.fase   = "necesidad";

      const { data: existing } = await supabase.from("clientes")
        .select("id, nombre_completo").ilike("nombre_completo", `%${nombre}%`).limit(1).maybeSingle();

      if (existing) {
        newCtx.cliente_id = existing.id;
        await updateConversacion(conversacion_id, { cliente_id: existing.id, cliente_nombre: existing.nombre_completo });
      } else {
        const clean = (conv.telefono ?? telefono).replace(/\D/g, "");
        const { data: nuevo } = await supabase.from("clientes").insert({
          nombre_completo: nombre, telefono: clean, canal_contacto: "whatsapp", tipo: "natural",
        }).select("id").single();
        if (nuevo?.id) {
          newCtx.cliente_id = nuevo.id;
          await updateConversacion(conversacion_id, { cliente_id: nuevo.id, cliente_nombre: nombre });
        }
      }
    }

    // 7. Procesar clasificación / handoff
    const debeClasificar = (ai.accion === "clasificar" || ai.accion === "identificar_y_clasificar")
      && !!ai.clasificacion;

    if (debeClasificar && ai.clasificacion) {
      const clasi = ai.clasificacion;

      // Validar cola_id contra lista real; fallback a "no clasificada"
      const colaMatch  = colas.find(c => c.id === clasi.cola_id);
      const colaFinal  = colaMatch ?? colaFallback ?? null;
      const esFallback = !colaMatch;

      const finalCtx: BotContexto = { ...newCtx, fase: "finalizado" };
      await updateConversacion(conversacion_id, {
        bot_estado:          "handed_off",
        bot_contexto:        finalCtx,
        bot_turnos:          turno + 1,
        cola_id:             colaFinal?.id ?? null,
        cola_area_nombre:    colaFinal?.nombre ?? null,
        intencion_detectada: clasi.intencion,
        urgencia_detectada:  clasi.urgencia,
        resumen_ia:          clasi.resumen,
        estado:              "en_cola",
        estado_asignacion:   "en_cola",
        ts_cola_asignada:    new Date().toISOString(),
      });

      await crearGestion(
        { ...conv, cliente_id: newCtx.cliente_id ?? conv.cliente_id },
        { ...finalCtx, intencion: clasi.intencion, urgencia: clasi.urgencia, descripcion: clasi.resumen },
        cfg,
      );

      await sendWhatsApp(telefDest, ai.mensaje_cliente, conversacion_id);
      if (colaFinal?.id) await triggerAssignEngine(conversacion_id);

      await logAudit({
        conversacion_id,
        turno,
        mensaje_cliente:     contenido,
        accion:              "handoff",
        intencion_detectada: clasi.intencion,
        cola_sugerida:       colaFinal?.nombre ?? null,
        cola_id:             colaFinal?.id ?? null,
        confianza:           clasi.confianza,
        motivo:              esFallback ? "fallback_cola_invalida" : "cola_exacta",
        output_modelo:       ai,
      });

      return new Response(
        JSON.stringify({ ok: true, turno: turno + 1, accion: "handoff", cola: colaFinal?.nombre }),
        { status: 200 },
      );
    }

    // 8. Respuesta simple
    await sendWhatsApp(telefDest, ai.mensaje_cliente, conversacion_id);

    if (newCtx.fase === "necesidad") {
      newCtx.preguntas_intencion = (newCtx.preguntas_intencion ?? 0) + 1;
    }

    await updateConversacion(conversacion_id, { bot_contexto: newCtx, bot_turnos: turno + 1 });

    await logAudit({ conversacion_id, turno, mensaje_cliente: contenido, accion: ai.accion, output_modelo: ai });

    return new Response(
      JSON.stringify({ ok: true, turno: turno + 1, fase: newCtx.fase }),
      { status: 200 },
    );

  } catch (err: any) {
    console.error("[lat-bot-agent] error:", err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
});

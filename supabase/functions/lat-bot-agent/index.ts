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
  intentos_identificacion?: number;
  intencion_preliminar?: string | null;
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

// ── Detección de rechazo / intención clara → corta bucle de identificación ────

function saltarIdentificacion(msg: string): boolean {
  const t = msg.toLowerCase();
  return (
    // Rechazo explícito a dar nombre
    /\bno\s+(gracias|quiero|me\s+gusta\s+mi\s+nombre)\b/.test(t) ||
    /\bno\s+quiero\s+(dar|decir)\b/.test(t) ||
    /\b(s[oó]lo|solo)\s+quiero\b/.test(t) ||
    // Solicitud de asesor / persona humana
    /\b(asesor|agente|operador|humano|persona\s+real|que\s+me\s+atienda|hablar\s+con)\b/.test(t)
  );
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
  const { data, error } = await supabase
    .from("lat_bot_config")
    .select("activo, modelo, max_turnos, temperatura, prompt_identidad, prompt_reglas, prompt_categorias, prompt_calificacion, min_preguntas_calificacion, crear_gestion_auto, gestion_process_id, gestion_stage_id, horario_zona_horaria, horario_franjas")
    .eq("canal", "whatsapp")
    .limit(1);
  if (error) console.error("[bot] getBotConfig error:", JSON.stringify(error));
  return (data?.[0] ?? null) as any;
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
  const { data: inserted } = await supabase.from("lat_mensajes").insert({
    conversacion_id: convId,
    tipo:            "outbound",
    contenido:       texto,
    estado:          "pendiente",
    autor_nombre:    "Lati",
  }).select("id").single();
  const msgId = inserted?.id ?? null;

  if (!GS_API_KEY || !GS_NUMBER) {
    if (msgId) await supabase.from("lat_mensajes").update({ estado: "enviado" }).eq("id", msgId);
    return;
  }
  try {
    const res = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
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
    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { /* */ }
    const ok = res.ok && (data?.status === "submitted" || !!data?.messageId);
    if (msgId) {
      await supabase.from("lat_mensajes")
        .update({ estado: ok ? "enviado" : "fallido", wpp_message_id: data?.messageId ?? null })
        .eq("id", msgId);
    }
  } catch (err) {
    console.error("[bot] sendWhatsApp error:", err);
    if (msgId) await supabase.from("lat_mensajes").update({ estado: "fallido" }).eq("id", msgId);
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
  const categorias  = cfg?.prompt_categorias ? `\nCATEGORÍAS DE INTENCIÓN (mapea el mensaje a la categoría y elige la cola correspondiente):\n${cfg.prompt_categorias}` : "";
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
- En horario de atención: ${enHorario ? "sí" : "no (fuera de horario — igual clasifica y deriva)"}${ctx.intencion_preliminar ? `\n- Intención mencionada en mensaje anterior: "${ctx.intencion_preliminar}"` : ""}

COLAS DISPONIBLES — usa el id exacto (campo "id") al clasificar:
[
${colasList}
]

REGLA — IDENTIFICACIÓN (máximo 1 solicitud de nombre por conversación):
Lati puede pedir nombre UNA sola vez. Si el cliente rechazó dar su nombre, no respondió con datos útiles, pidió asesor, o ya expresó una intención clara, NO volver a pedir nombre. Usar la intención disponible para clasificar y derivar aunque no exista cliente vinculado.

REGLA — CAPTURA OBLIGATORIA DE NOMBRE:
Si el mensaje del cliente parece ser un nombre de persona (uno o varios nombres y/o apellidos, ej: "Karen Rodriguez", "Juan Carlos Pérez", "María Elena Soto"), USA SIEMPRE accion "identificar" o "identificar_y_clasificar" con ese dato en identificacion.nombre_completo. NUNCA uses accion "responder" cuando el cliente está proporcionando su nombre como dato de identificación.

FLUJO:
${ctx.fase === "identificacion"
  ? `1. Analiza el mensaje y captura todos los datos útiles que el cliente haya proporcionado:
   - Nombre + intención suficiente para derivar → usa accion "identificar_y_clasificar".
   - Solo nombre (sin intención clara) → usa accion "identificar"; luego pregunta en qué puedes ayudar.
   - Solo intención (sin nombre) → usa accion "responder" y en UN ÚNICO mensaje pide el nombre completo; NO derives todavía a menos que el cliente pida asesor explícitamente.
   - Ni nombre ni intención → usa accion "responder": saluda y en UN ÚNICO mensaje pide nombre completo y en qué puedes ayudar. Esta es la única solicitud de nombre en toda la conversación.`
  : ctx.nombre
    ? `1. El cliente está identificado como: ${ctx.nombre}. Continúa con su necesidad. No pidas más datos de identificación.`
    : `1. No solicites nombre ni datos personales proactivamente (ya se pidió antes). Aplica la REGLA — CAPTURA OBLIGATORIA DE NOMBRE si el cliente lo proporciona en este mensaje. Si el mensaje contiene intención de servicio sin nombre, usa accion "clasificar" y deriva. Solo usa accion "responder" si el mensaje no es ni nombre ni intención clara.`
}
2. Si el cliente pide hablar con un asesor, agente o persona humana: usa accion "clasificar" y deriva INMEDIATAMENTE a Frontdesk o cola general. Sin preguntas adicionales.
3. Cuando tengas motivo claro, clasifica y deriva en el mismo turno (accion "clasificar" o "identificar_y_clasificar").
4. Puedes hacer máximo ${maxPreguntas} preguntas de clasificación. Si ya alcanzaste el límite, deriva.
5. Si llegas al turno ${maxTurnos} sin clasificar, deriva a la cola "No Clasificada Revisión Supervisor".
6. EMERGENCIAS (accidente, hospitalización, vuelo perdido, robo en destino): deriva INMEDIATAMENTE al asesor de Emergencia en Destino. Sin preguntas adicionales.
7. Mensajes no-texto (imagen, audio, sticker, documento): pide que escriban su consulta en texto.${reglas}${categorias}${calificacion}

RESPONDE SIEMPRE con este JSON exacto (sin markdown extra ni texto fuera del JSON):
{
  "accion": "responder" | "identificar" | "clasificar" | "identificar_y_clasificar",
  "mensaje_cliente": "Texto que se envía al cliente. Conciso, máximo 3 oraciones. IMPORTANTE: si accion es 'clasificar' o 'identificar_y_clasificar', el mensaje DEBE terminar informando que la conversación está siendo derivada a un asesor (ej: 'En un momento, uno de nuestros asesores continuará tu atención.').",
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

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 20_000);

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      signal:  abort.signal,
      body: JSON.stringify({
        model:           cfg?.modelo     ?? "gpt-4o-mini",
        messages:        [{ role: "system", content: systemPrompt }, ...history],
        response_format: { type: "json_object" },
        temperature:     cfg?.temperatura ?? 0.3,
        max_tokens:      cfg?.max_tokens  ?? 400,
      }),
    });
  } finally {
    clearTimeout(timer);
  }

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

  let conversacion_id: string | undefined;
  let contenido: string | undefined;

  try {
    console.log("[bot] ▶ inicio handler");
    // DIAGNÓSTICO: confirmar que la función es invocada
    await supabase.from("lat_routing_audit_log").insert({
      conversacion_id: null,
      turno: -99,
      mensaje_cliente: "",
      accion: "bot_invocado",
      motivo: new Date().toISOString(),
    }).then(() => {}, () => {});
    console.log("[bot] ✓ audit_log insert OK");
    const body = await req.json();
    conversacion_id = body.conversacion_id;
    const telefono  = body.telefono;
    contenido       = body.contenido;
    console.log("[bot] ✓ body parsed, conv_id:", conversacion_id);
    if (!conversacion_id) return new Response("missing conversacion_id", { status: 400 });

    // 1. Paralelo: config + conversación + colas
    console.log("[bot] → llamando getBotConfig / getConversacion / getColas");
    const [cfg, conv, colas] = await Promise.all([
      getBotConfig(),
      getConversacion(conversacion_id),
      getColas(),
    ]);
    console.log("[bot] ✓ DB queries OK — cfg.activo:", cfg?.activo, "conv:", !!conv, "colas:", colas?.length);

    if (!conv) { console.log("[bot] ← conv not found"); return new Response("conv not found", { status: 404 }); }
    if (!cfg || cfg.activo === false) {
      console.log("[bot] ← bot disabled (cfg null o activo=false)");
      return new Response(JSON.stringify({ ok: true, skipped: "bot disabled" }), { status: 200 });
    }
    console.log("[bot] ✓ bot activo, modelo:", cfg.modelo);

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

    const ctxRaw = conv.bot_contexto as any;
    const ctx: BotContexto = (ctxRaw?.fase)
      ? { preguntas_intencion: 0, ...ctxRaw }
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

    // 4b. Cortar bucle de identificación antes de construir el prompt:
    // si ya se intentó pedir nombre una vez, o si el mensaje contiene
    // rechazo explícito / intención de servicio clara → avanzar a "necesidad"
    // para que el system-prompt ordene clasificar en lugar de pedir nombre.
    if (ctx.fase === "identificacion") {
      const yaIntento = (ctx.intentos_identificacion ?? 0) >= 1;
      if (yaIntento || saltarIdentificacion(contenido ?? "")) {
        ctx.fase = "necesidad";
      }
    }

    const clienteInfo = ctx.nombre ? `${ctx.nombre} (identificado)` : "No identificado";

    // 5. Prompt + historial + llamada a OpenAI
    const systemPrompt = buildSystemPrompt(ctx, clienteInfo, colas, turno, maxTurnos, maxPreguntas, enHorario, cfg);
    console.log("[bot] → getMensajesRecientes");
    const mensajes     = await getMensajesRecientes(conversacion_id, 8);
    console.log("[bot] ✓ mensajes:", mensajes?.length, "→ llamando OpenAI");
    const ai           = await callOpenAI(systemPrompt, mensajes, contenido, cfg);
    console.log("[bot] ✓ OpenAI respondió, accion:", ai?.accion);

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

      // Aviso de derivación explícito — garantiza que el cliente siempre sepa que viene un asesor
      const nombreCola = colaFinal?.nombre ?? "nuestro equipo";
      await sendWhatsApp(
        telefDest,
        `Tu conversación está siendo transferida a un asesor de ${nombreCola}. En breve alguien te atenderá. ¡Gracias por tu paciencia! 🙏`,
        conversacion_id,
      );

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

    // Guardia anti-bucle: si el AI no logró identificar al cliente en este turno,
    // registrar el intento y avanzar a "necesidad" para no insistir indefinidamente.
    if (ctx.fase === "identificacion" && !debeIdentificar) {
      const intentos = (ctx.intentos_identificacion ?? 0) + 1;
      newCtx.intentos_identificacion = intentos;
      if (intentos >= 1) {
        newCtx.fase = "necesidad";
      }
    }

    if (newCtx.fase === "necesidad") {
      newCtx.preguntas_intencion = (newCtx.preguntas_intencion ?? 0) + 1;
    }

    // Guardar intención preliminar si el cliente mencionó servicio pero aún no se clasificó
    const tieneIntencion = /\b(cotizar|reservar|viaje|boleto|visa|vuelo|viajar|paquete|destino|hotel|hospedaje|turismo|precio|tarifa)\b/i.test(contenido ?? "");
    if (tieneIntencion && !newCtx.intencion_preliminar) {
      newCtx.intencion_preliminar = (contenido ?? "").slice(0, 300);
    }

    await updateConversacion(conversacion_id, { bot_contexto: newCtx, bot_turnos: turno + 1 });

    await logAudit({ conversacion_id, turno, mensaje_cliente: contenido, accion: ai.accion, output_modelo: ai });

    return new Response(
      JSON.stringify({ ok: true, turno: turno + 1, fase: newCtx.fase }),
      { status: 200 },
    );

  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error("[lat-bot-agent] error:", msg);
    if (conversacion_id) {
      await supabase.from("lat_routing_audit_log").insert({
        conversacion_id,
        turno: -1,
        mensaje_cliente: contenido ?? "",
        accion: "error",
        motivo: msg,
      }).then(() => {}, () => {});
    }
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});

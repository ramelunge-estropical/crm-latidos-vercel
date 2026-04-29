/**
 * lat-bot-agent — Agente IA de WhatsApp para Estropical
 *
 * Flujo:
 *   1. Identifica al cliente por teléfono en BD → si no, pide CI + nombre completo
 *   2. Entiende la necesidad (hasta MAX_TURNS intercambios)
 *   3. Deriva a la cola correcta usando lat_reglas_asignacion / lat_colas
 *
 * Llamado por wpp-webhook (fire-and-forget) después de cada mensaje inbound.
 *
 * Secrets requeridos:
 *   OPENAI_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GUPSHUP_API_KEY
 *   GUPSHUP_NUMBER      → número origen Gupshup
 *   GUPSHUP_APP_NAME    → nombre del app Gupshup
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_KEY     = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GS_API_KEY     = Deno.env.get("GUPSHUP_API_KEY") ?? "";
const GS_NUMBER      = Deno.env.get("GUPSHUP_NUMBER") ?? "";
const GS_APP_NAME    = Deno.env.get("GUPSHUP_APP_NAME") ?? "";

const supabase   = createClient(SUPABASE_URL, SERVICE_KEY);
const MAX_TURNS  = 6;
const MODEL      = "gpt-4o-mini";

function normalizePhone(phone: string): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface BotContexto {
  fase: "identificacion" | "necesidad" | "finalizado";
  ci?: string | null;
  nombre?: string | null;
  cliente_id?: string | null;
  intencion?: string | null;
  urgencia?: string | null;
}

// ─── OpenAI tools ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "identificar_cliente",
      description: "Llama cuando tenés el CI y nombre completo del contacto",
      parameters: {
        type: "object",
        properties: {
          nombre_completo: { type: "string" },
          ci:              { type: "string" },
          cliente_encontrado: { type: "boolean", description: "Si existe en la BD de clientes" },
        },
        required: ["nombre_completo", "ci", "cliente_encontrado"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detectar_intencion",
      description: "Registra la categoría e urgencia de la necesidad del cliente",
      parameters: {
        type: "object",
        properties: {
          categoria: {
            type: "string",
            enum: ["vacacional", "visa", "grupos", "corporativo", "soporte", "emergencia", "cobranzas", "otro"],
          },
          urgencia: { type: "string", enum: ["baja", "media", "alta", "critica"] },
          descripcion: { type: "string" },
        },
        required: ["categoria", "urgencia", "descripcion"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "asignar_cola",
      description: "Deriva al cliente a la cola correcta y finaliza la atención del bot. Usá esto cuando ya tenés la intención clara.",
      parameters: {
        type: "object",
        properties: {
          cola_nombre:       { type: "string", description: "Nombre exacto de la cola según la lista disponible" },
          razon:             { type: "string" },
          mensaje_despedida: { type: "string", description: "Mensaje cálido final que Lati envía antes de pasar al asesor" },
        },
        required: ["cola_nombre", "razon", "mensaje_despedida"],
      },
    },
  },
];

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  ctx: BotContexto,
  clienteInfo: string,
  colasInfo: string,
  turno: number,
  primerNombre?: string,
  cfg?: { prompt_identidad?: string; prompt_reglas?: string; prompt_categorias?: string; max_turnos?: number; min_preguntas_calificacion?: number; prompt_calificacion?: string },
): string {
  const saludo    = primerNombre ? `¡Hola, ${primerNombre}!` : "¡Hola!";
  const identidad  = cfg?.prompt_identidad ?? "Sos Lati, asistente virtual de Estropical Bolivia, agencia de viajes líder en Bolivia.";
  const reglas     = cfg?.prompt_reglas    ?? "- Hablá en español latinoamericano, cálido y profesional\n- Nunca inventes precios ni disponibilidad\n- La agencia opera 24/7";
  const cats       = cfg?.prompt_categorias ?? "- vacacional\n- visa\n- grupos\n- corporativo\n- soporte\n- emergencia\n- cobranzas\n- otro";
  const maxT       = cfg?.max_turnos ?? MAX_TURNS;
  const minCalif   = cfg?.min_preguntas_calificacion ?? 1;
  const califPrompt = cfg?.prompt_calificacion ?? "- Hacé al menos 1 pregunta de calificación antes de derivar (destino, fechas, cantidad de viajeros, etc.)";

  return `${identidad}
Tu trabajo es atender mensajes de WhatsApp siguiendo este flujo ESTRICTO:

## FASE 1 — IDENTIFICACIÓN
${ctx.fase === "identificacion" ? `
El cliente AÚN NO está identificado. Tu PRIMER mensaje debe:
1. Saludar cálidamente (${saludo} si ya tenés su nombre, sino "¡Hola! Bienvenido/a a Estropical 🌍")
2. Pedirle NOMBRE COMPLETO y CI en el mismo mensaje. Ejemplo:
   "Para atenderte mejor, ¿me podés compartir tu nombre completo y número de CI (cédula de identidad)?"

IMPORTANTE sobre la identificación:
- Si el cliente te da solo el nombre pero no el CI → agradecé y pedí el CI: "¡Gracias [nombre]! Solo me falta tu número de CI para completar tu registro."
- Si el cliente te da solo el CI pero no el nombre → pedí el nombre: "¡Gracias! ¿Y tu nombre completo?"
- Solo llamá a identificar_cliente() cuando tengas AMBOS: nombre completo Y CI.
- No avances a la siguiente fase sin ambos datos.
` : `✅ Cliente identificado: ${ctx.nombre ?? ""} (CI: ${ctx.ci ?? ""})`}

${ctx.fase === "necesidad" && turno === 1 ? `
PRIMER MENSAJE de esta sesión: Saludá al cliente por su nombre: "${saludo} ¿En qué te puedo ayudar hoy? 😊"
` : ""}

## FASE 2 — DETECCIÓN DE NECESIDAD
${ctx.fase !== "finalizado" ? `
Con el cliente identificado, escuchá su necesidad e identificá la categoría:
- vacacional: paquetes turísticos, destinos, hoteles, vuelos
- visa: trámites de visa, documentación, migración
- grupos: viajes grupales, bodas, eventos, incentivos
- corporativo: viajes de empresa, carteras corporativas
- soporte: problemas con reservas existentes, cambios, cancelaciones
- emergencia: problema activo mientras viajan (MÁXIMA PRIORIDAD → derivar inmediatamente)
- cobranzas: pagos, cuotas, saldos pendientes
- otro: no clasificado

Podés responder preguntas generales simples (destinos populares, requisitos generales, horarios de oficina).
Para cotizaciones, reservas específicas o gestiones: llamá a detectar_intencion() y luego a asignar_cola().
` : ""}

## FASE 2.5 — CALIFICACIÓN (OBLIGATORIA antes de derivar)
Antes de llamar a asignar_cola(), debés hacer al menos ${minCalif} pregunta(s) de calificación para entender bien la necesidad.
Preguntas sugeridas por categoría:
${califPrompt}

EXCEPCIÓN: Si es EMERGENCIA, derivá inmediatamente sin preguntas.

## FASE 3 — DERIVACIÓN
Solo cuando ya tengas la información de calificación, hacé LAS DOS COSAS EN EL MISMO MENSAJE:
1. Llamá a detectar_intencion()
2. Inmediatamente llamá a asignar_cola()
NO hagas una sin la otra. NO esperes respuesta intermedia.

## CATEGORÍAS DE NECESIDAD
${cats}

## COLAS DISPONIBLES
${colasInfo}

## INFORMACIÓN DEL CLIENTE
${clienteInfo}

## REGLAS
${reglas}
- Firmá siempre como "- Lati 🌍" al final de cada mensaje
- Si el cliente fue atendido antes por un asesor, mencionalo: "Anteriormente te atendió [nombre]."
- Turno actual: ${turno}/${maxT} — si llegás al límite, derivá de todos modos`;
}

// ─── Helpers DB ───────────────────────────────────────────────────────────────

async function getConversacion(id: string) {
  const { data } = await supabase
    .from("lat_conversaciones")
    .select("id, telefono, bot_estado, bot_contexto, bot_turnos, cliente_id, cliente_nombre")
    .eq("id", id)
    .single();
  return data as any;
}

async function getMensajesRecientes(convId: string) {
  const { data } = await supabase
    .from("lat_mensajes")
    .select("tipo, contenido, created_at")
    .eq("conversacion_id", convId)
    .order("created_at", { ascending: false })
    .limit(12);
  return (data ?? []).reverse() as any[];
}

async function getCliente(telefono: string) {
  if (!telefono) return null;
  const clean = telefono.replace(/\D/g, "");
  const { data } = await supabase
    .from("clientes")
    .select("id, nombre_completo, razon_social, telefono, email, documento_numero, canal_contacto")
    .or(`telefono.ilike.%${clean}%,telefono.ilike.%${telefono}%`)
    .limit(1)
    .maybeSingle();
  return data as any;
}

async function getClienteByCiOrNombre(ci: string, nombre: string) {
  if (!ci && !nombre) return null;
  const { data } = await supabase
    .from("clientes")
    .select("id, nombre_completo, telefono, email, documento_numero")
    .or(`documento_numero.ilike.%${ci}%,nombre_completo.ilike.%${nombre}%`)
    .limit(1)
    .maybeSingle();
  return data as any;
}

async function getBotConfig() {
  const { data } = await supabase
    .from("lat_bot_config")
    .select("activo, modelo, max_turnos, temperatura, prompt_identidad, prompt_reglas, prompt_categorias, min_preguntas_calificacion, prompt_calificacion, crear_gestion_auto, gestion_process_id, gestion_stage_id")
    .eq("canal", "whatsapp")
    .maybeSingle();
  return data as any;
}

async function crearGestion(conv: any, ctx: any, cfg: any) {
  if (!cfg?.crear_gestion_auto || !cfg?.gestion_process_id) return null;

  const PRIORIDAD_MAP: Record<string, string> = {
    critica: "urgent", alta: "high", media: "medium", baja: "low",
  };
  const TYPE_MAP: Record<string, string> = {
    vacacional: "consulta", visa: "consulta", grupos: "consulta",
    corporativo: "consulta", soporte: "soporte", emergencia: "soporte",
    cobranzas: "cobro", otro: "consulta",
  };

  const categoria  = ctx.intencion ?? "otro";
  const titulo     = `${categoria.charAt(0).toUpperCase() + categoria.slice(1)} — ${ctx.nombre ?? conv.cliente_nombre ?? "Nuevo contacto"} (WhatsApp)`;
  const prioridad  = PRIORIDAD_MAP[ctx.urgencia ?? "media"] ?? "medium";
  const tipo       = TYPE_MAP[categoria] ?? "consulta";

  const { data, error } = await supabase.from("gestiones").insert({
    title:                  titulo,
    description:            conv.resumen_ia ?? `Contacto vía WhatsApp. Categoría: ${categoria}.`,
    process_id:             cfg.gestion_process_id,
    stage_id:               cfg.gestion_stage_id ?? null,
    cliente_id:             conv.cliente_id ?? null,
    cliente_nombre:         conv.cliente_nombre ?? ctx.nombre ?? null,
    priority:               prioridad,
    type:                   tipo,
    subtype:                categoria,
    canal_origen:           "whatsapp",
    conversacion_id_origen: conv.id,
  }).select("id, codigo").single();

  if (error) { console.error("[bot] Error creando gestión:", error.message); return null; }
  console.log(`[bot] Gestión creada: ${data?.codigo} id:${data?.id}`);
  return data;
}

async function getColas() {
  const { data } = await supabase
    .from("lat_colas")
    .select("nombre, area, descripcion, color")
    .eq("activa", true)
    .order("orden");
  return (data ?? []) as any[];
}

async function getColaByNombre(nombre: string) {
  const { data } = await supabase
    .from("lat_colas")
    .select("id, nombre")
    .ilike("nombre", `%${nombre}%`)
    .eq("activa", true)
    .limit(1)
    .maybeSingle();
  return data as any;
}

async function updateConversacion(id: string, updates: Record<string, any>) {
  await supabase.from("lat_conversaciones").update(updates).eq("id", id);
}

async function saveMensajeSistema(convId: string, contenido: string) {
  await supabase.from("lat_mensajes").insert({
    conversacion_id: convId,
    tipo:            "outbound",
    contenido,
    estado:          "enviado",
    autor_nombre:    "Lati",
  });
}

// ─── Gupshup send ─────────────────────────────────────────────────────────────

async function sendWhatsApp(telefono: string, texto: string, convId: string) {
  if (!GS_API_KEY || !GS_NUMBER) {
    console.warn("Gupshup credentials missing — message not sent");
    await saveMensajeSistema(convId, texto);
    return;
  }

  const body = new URLSearchParams({
    channel:     "whatsapp",
    source:      GS_NUMBER,
    destination: telefono,
    message:     JSON.stringify({ type: "text", text: texto }),
    "src.name":  GS_APP_NAME,
  });

  try {
    const res = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", apikey: GS_API_KEY },
      body: body.toString(),
    });
    const resText = await res.text();
    const msgId   = (() => { try { return JSON.parse(resText)?.messageId ?? null; } catch { return null; } })();
    await supabase.from("lat_mensajes").insert({
      conversacion_id: convId,
      tipo:            "outbound",
      contenido:       texto,
      estado:          res.ok ? "enviado" : "fallido",
      autor_nombre:    "Lati",
      wpp_message_id:  msgId,
    });
  } catch (err) {
    console.error("sendWhatsApp error:", err);
    await saveMensajeSistema(convId, texto);
  }
}

// ─── OpenAI call ──────────────────────────────────────────────────────────────

async function callOpenAI(systemPrompt: string, mensajes: any[], nuevoMensaje: string, temperatura = 0.4) {
  const history = mensajes.map((m: any) => ({
    role: m.tipo === "inbound" ? "user" : "assistant",
    content: m.contenido,
  }));

  // Add current message if not already last
  if (!history.length || history[history.length - 1].role !== "user") {
    history.push({ role: "user", content: nuevoMensaje });
  }

  const payload = {
    model: MODEL,
    messages: [{ role: "system", content: systemPrompt }, ...history],
    tools: TOOLS,
    tool_choice: "auto",
    temperature: temperatura,
    max_tokens: 400,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message ?? null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });

  try {
    const { conversacion_id, telefono, contenido } = await req.json();
    if (!conversacion_id) return new Response("missing conversacion_id", { status: 400 });

    // 1. Load bot config + conversation in parallel
    const [botCfg, conv] = await Promise.all([getBotConfig(), getConversacion(conversacion_id)]);
    if (!conv) return new Response("conv not found", { status: 404 });

    // Skip if bot is disabled
    if (!botCfg || botCfg.activo === false) {
      console.log("[bot] WhatsApp bot desactivado — ignorando mensaje");
      return new Response(JSON.stringify({ ok: true, skipped: "bot disabled" }), { status: 200 });
    }

    const effectiveMaxTurns = botCfg?.max_turnos ?? MAX_TURNS;

    // 2a. Auto-reactivate / reset session on new inbound message
    //     Triggers when: handed_off, pausado, OR activo with stale context (>3h idle)
    const RESET_AFTER_MS = 3 * 60 * 60 * 1000;
    const lastInteractionAge = Date.now() - new Date(conv.ultima_interaccion).getTime();
    const isStaleSession = conv.bot_estado === "activo"
      && (conv.bot_turnos ?? 0) > 0
      && lastInteractionAge > RESET_AFTER_MS;

    if (conv.bot_estado === "handed_off" || conv.bot_estado === "pausado" || isStaleSession) {
      const freshCtx: BotContexto = conv.cliente_id
        ? { fase: "necesidad", cliente_id: conv.cliente_id, nombre: conv.cliente_nombre }
        : { fase: "identificacion" };

      await updateConversacion(conversacion_id, {
        bot_estado:          "activo",
        bot_turnos:          0,
        bot_contexto:        freshCtx,
        cola_id:             null,
        intencion_detectada: null,
        urgencia_detectada:  null,
        resumen_ia:          null,
        estado:              "abierta",
      });

      conv.bot_estado   = "activo";
      conv.bot_turnos   = 0;
      conv.bot_contexto = freshCtx;
      console.log(`[bot] Sesión reiniciada (motivo: ${isStaleSession ? "stale" : conv.bot_estado})`);
    }

    const ctx: BotContexto = (conv.bot_contexto && typeof conv.bot_contexto === "object")
      ? conv.bot_contexto as BotContexto
      : { fase: "identificacion" };

    const turno = conv.bot_turnos ?? 0;

    // 2b. Force handoff if max turns exceeded
    if (turno >= (botCfg?.max_turnos ?? MAX_TURNS)) {
      const cola = await getColaByNombre("Frontdesk Vacacional");
      await updateConversacion(conversacion_id, {
        bot_estado: "handed_off",
        cola_id:    cola?.id ?? null,
        estado:     "en_cola",
      });
      await sendWhatsApp(
        conv.telefono ?? telefono,
        "Ya te estoy conectando con uno de nuestros asesores, que van a poder ayudarte mejor. ¡Gracias por tu paciencia! 🙏",
        conversacion_id,
      );
      return new Response("max turns handed off", { status: 200 });
    }

    // 3. Load client context
    const clienteDB = conv.cliente_id
      ? null  // ya vinculado, no re-buscar por teléfono
      : await getCliente(conv.telefono ?? telefono);

    // If found by phone and context is still "identificacion", auto-advance to "necesidad"
    if (clienteDB && ctx.fase === "identificacion") {
      ctx.fase      = "necesidad";
      ctx.nombre    = clienteDB.nombre_completo ?? clienteDB.razon_social;
      ctx.ci        = clienteDB.documento_numero ?? null;
      ctx.cliente_id = clienteDB.id;
      await updateConversacion(conversacion_id, {
        cliente_id:     clienteDB.id,
        cliente_nombre: clienteDB.nombre_completo ?? clienteDB.razon_social,
        bot_contexto:   ctx,
      });
      console.log(`[bot] Cliente identificado por teléfono: ${ctx.nombre}`);
    }

    // Derive primer nombre for greeting
    const nombreCompleto = clienteDB?.nombre_completo ?? clienteDB?.razon_social ?? ctx.nombre ?? conv.cliente_nombre ?? null;
    const primerNombre   = nombreCompleto ? nombreCompleto.split(" ")[0] : undefined;

    const clienteInfo = clienteDB
      ? `Nombre: ${clienteDB.nombre_completo ?? clienteDB.razon_social}\nCI: ${clienteDB.documento_numero ?? "no registrado"}\nTeléfono: ${clienteDB.telefono}\nEmail: ${clienteDB.email ?? "-"}\n✅ Registrado en BD.`
      : ctx.nombre
        ? `Nombre: ${ctx.nombre}\nCI: ${ctx.ci ?? "pendiente"}\nNo está registrado en la BD.`
        : "Cliente no identificado aún. Pedí CI y nombre completo.";

    // 4. Load colas + last human agent name
    const [colas, lastHumanMsg] = await Promise.all([
      getColas(),
      supabase
        .from("lat_mensajes")
        .select("autor_nombre")
        .eq("conversacion_id", conversacion_id)
        .eq("tipo", "outbound")
        .neq("autor_nombre", "Lati")
        .not("autor_nombre", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(r => r.data?.autor_nombre ?? null),
    ]);
    const colasInfo       = colas.map(c => `- ${c.nombre} (${c.area ?? ""}): ${c.descripcion ?? ""}`).join("\n");
    const ultimoAsesor    = conv.responsable_nombre ?? lastHumanMsg ?? null;

    // Append last agent info to clienteInfo if available
    const clienteInfoFull = ultimoAsesor
      ? `${clienteInfo}\nÚltimo asesor que lo atendió: ${ultimoAsesor}`
      : clienteInfo;

    // 5. Load history
    const mensajes  = await getMensajesRecientes(conversacion_id);

    // 6. Build prompt & call OpenAI
    const systemPrompt = buildSystemPrompt(ctx, clienteInfoFull, colasInfo, turno + 1, primerNombre, botCfg);
    const aiMessage    = await callOpenAI(systemPrompt, mensajes, contenido, botCfg?.temperatura ?? 0.4);

    if (!aiMessage) throw new Error("No response from OpenAI");

    // 7. Execute tool calls
    let respuestaTexto: string | null = aiMessage.content ?? null;
    let newCtx = { ...ctx };
    let shouldHandoff = false;
    let handoffColaName = "";
    let handoffMsg = "";

    let toolCalledIdentificar = false;
    let toolCalledIntencion   = false;

    for (const toolCall of (aiMessage.tool_calls ?? [])) {
      const fn   = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments ?? "{}");

      if (fn === "identificar_cliente") {
        toolCalledIdentificar = true;
        newCtx.fase   = "necesidad";
        newCtx.nombre = args.nombre_completo;
        newCtx.ci     = args.ci;

        // Try to find/link client in DB
        const clienteMatch = await getClienteByCiOrNombre(args.ci, args.nombre_completo);
        const firstName = args.nombre_completo.split(" ")[0];

        if (clienteMatch) {
          newCtx.cliente_id = clienteMatch.id;
          await updateConversacion(conversacion_id, {
            cliente_id:     clienteMatch.id,
            cliente_nombre: clienteMatch.nombre_completo,
          });
          respuestaTexto = `¡Hola, ${firstName}! Ya te tengo registrado en nuestro sistema. ¿En qué te puedo ayudar hoy? 😊`;
        } else {
          // Client not in DB → auto-create as new lead so the asesor has it ready
          const { data: newCliente } = await supabase
            .from("clientes")
            .insert({
              nombre_completo:  args.nombre_completo,
              documento_numero: args.ci ?? null,
              telefono:         normalizePhone(conv.telefono ?? telefono),
              canal_contacto:   "whatsapp",
              tipo:             "natural",
            })
            .select("id")
            .single();

          if (newCliente?.id) {
            newCtx.cliente_id = newCliente.id;
            await updateConversacion(conversacion_id, {
              cliente_id:     newCliente.id,
              cliente_nombre: args.nombre_completo,
            });
            console.log(`[bot] Nuevo cliente creado: ${args.nombre_completo} id:${newCliente.id}`);
          }
          respuestaTexto = `¡Gracias, ${firstName}! ¿En qué te puedo ayudar hoy? 😊`;
        }
        console.log(`[bot] Cliente identificado: ${args.nombre_completo} CI:${args.ci} en_bd:${!!clienteMatch}`);
      }

      if (fn === "detectar_intencion") {
        toolCalledIntencion = true;
        newCtx.intencion = args.categoria;
        newCtx.urgencia  = args.urgencia;
        await updateConversacion(conversacion_id, {
          intencion_detectada: args.categoria,
          urgencia_detectada:  args.urgencia,
          resumen_ia:          args.descripcion,
        });
        console.log(`[bot] Intención detectada: ${args.categoria} urgencia:${args.urgencia}`);
      }

      if (fn === "asignar_cola") {
        shouldHandoff    = true;
        handoffColaName  = args.cola_nombre;
        handoffMsg       = args.mensaje_despedida;
        console.log(`[bot] Asignando a cola: ${args.cola_nombre}`);
      }
    }

    // Bug fix #2: if intencion was detected but asignar_cola was NOT called in the same turn,
    // make a second OpenAI call forcing it to assign the queue immediately
    if (toolCalledIntencion && !shouldHandoff) {
      console.log("[bot] detectar_intencion sin asignar_cola — forzando segunda llamada a OpenAI");
      const forcedSystemPrompt = buildSystemPrompt(newCtx, clienteInfo, colasInfo, turno + 1);
      const forcedAiMessage = await callOpenAI(
        forcedSystemPrompt + "\n\nIMPORTANTE: Ya tenés la intención del cliente. DEBES llamar a asignar_cola() AHORA.",
        mensajes,
        contenido,
      );
      for (const toolCall of (forcedAiMessage?.tool_calls ?? [])) {
        const fn   = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments ?? "{}");
        if (fn === "asignar_cola") {
          shouldHandoff   = true;
          handoffColaName = args.cola_nombre;
          handoffMsg      = args.mensaje_despedida;
          console.log(`[bot] (forzado) Asignando a cola: ${args.cola_nombre}`);
        }
      }
    }

    // 8. Send text response (before handoff)
    const telefDest = conv.telefono ?? telefono;
    if (respuestaTexto && !shouldHandoff) {
      await sendWhatsApp(telefDest, respuestaTexto, conversacion_id);
    }

    // 9. Execute handoff
    if (shouldHandoff) {
      const cola = await getColaByNombre(handoffColaName);
      const finalCtx = { ...newCtx, fase: "finalizado" };

      await updateConversacion(conversacion_id, {
        bot_estado:   "handed_off",
        bot_contexto: finalCtx,
        bot_turnos:   turno + 1,
        cola_id:      cola?.id ?? null,
        estado:       "en_cola",
      });

      // Auto-create gestión with full context
      const convActualizado = { ...conv, ...finalCtx, resumen_ia: conv.resumen_ia, cliente_id: newCtx.cliente_id ?? conv.cliente_id, cliente_nombre: newCtx.nombre ?? conv.cliente_nombre };
      await crearGestion(convActualizado, finalCtx, botCfg);

      const msg = handoffMsg || "Ya te comunico con un asesor especializado. ¡Gracias por contactarnos! 🌍";
      await sendWhatsApp(telefDest, msg, conversacion_id);
    } else {
      // 10. Update context
      await updateConversacion(conversacion_id, {
        bot_contexto: newCtx,
        bot_turnos:   turno + 1,
      });
    }

    return new Response(JSON.stringify({ ok: true, turno: turno + 1, fase: newCtx.fase }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("lat-bot-agent error:", err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
});

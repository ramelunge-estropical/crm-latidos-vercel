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

function buildSystemPrompt(ctx: BotContexto, clienteInfo: string, colasInfo: string, turno: number): string {
  return `Sos Lati, asistente virtual de Estropical Bolivia, agencia de viajes líder en Bolivia.
Tu trabajo es atender mensajes de WhatsApp siguiendo este flujo ESTRICTO:

## FASE 1 — IDENTIFICACIÓN (obligatoria si no está completada)
${ctx.fase === "identificacion" ? `
Pedí al cliente su CI (cédula de identidad) y nombre completo.
Podés hacerlo en el mismo mensaje: "Para atenderte mejor, ¿me podés compartir tu nombre completo y número de CI?"
Una vez que tengas AMBOS datos, llamá inmediatamente a la función identificar_cliente().
` : `✅ Cliente identificado: ${ctx.nombre ?? ""} (CI: ${ctx.ci ?? ""})`}

## FASE 2 — DETECCIÓN DE NECESIDAD
${ctx.fase !== "finalizado" ? `
Con el cliente identificado, preguntá en qué podés ayudar.
Escuchá la necesidad e identificá la categoría:
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

## FASE 3 — DERIVACIÓN
Cuando el cliente te diga qué necesita, hacé LAS DOS COSAS EN EL MISMO MENSAJE:
1. Llamá a detectar_intencion()
2. Inmediatamente llamá a asignar_cola()
NO hagas una sin la otra. NO esperes respuesta intermedia.
Si hay EMERGENCIA, derivá inmediatamente sin más preguntas.

## COLAS DISPONIBLES
${colasInfo}

## INFORMACIÓN DEL CLIENTE
${clienteInfo}

## REGLAS IMPORTANTES
- Siempre hablá en español latinoamericano, cálido y profesional
- Nunca inventes precios, fechas ni disponibilidad específica
- Si no sabés algo: "Nuestros asesores te darán información precisa"
- Turno actual: ${turno}/${MAX_TURNS} — si llegás al límite, derivá de todos modos
- La agencia opera 24/7
- Sos concisa: respuestas cortas y claras, sin párrafos largos`;
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
    autor_nombre:    "Lati IA",
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
      autor_nombre:    "Lati IA",
      wpp_message_id:  msgId,
    });
  } catch (err) {
    console.error("sendWhatsApp error:", err);
    await saveMensajeSistema(convId, texto);
  }
}

// ─── OpenAI call ──────────────────────────────────────────────────────────────

async function callOpenAI(systemPrompt: string, mensajes: any[], nuevoMensaje: string) {
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
    temperature: 0.4,
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

    // 1. Load conversation
    const conv = await getConversacion(conversacion_id);
    if (!conv) return new Response("conv not found", { status: 404 });

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
    if (turno >= MAX_TURNS) {
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
    const clienteDB   = conv.cliente_id
      ? null  // ya vinculado, no re-buscar por teléfono
      : await getCliente(conv.telefono ?? telefono);

    const clienteInfo = clienteDB
      ? `Nombre: ${clienteDB.nombre_completo ?? clienteDB.razon_social}\nCI: ${clienteDB.documento_numero ?? "no registrado"}\nTeléfono: ${clienteDB.telefono}\nEmail: ${clienteDB.email ?? "-"}`
      : ctx.nombre
        ? `Nombre: ${ctx.nombre}\nCI: ${ctx.ci ?? "pendiente"}\nNo está registrado en la BD.`
        : "Cliente no identificado aún. Pedí CI y nombre completo.";

    // 4. Load colas
    const colas     = await getColas();
    const colasInfo = colas.map(c => `- ${c.nombre} (${c.area ?? ""}): ${c.descripcion ?? ""}`).join("\n");

    // 5. Load history
    const mensajes  = await getMensajesRecientes(conversacion_id);

    // 6. Build prompt & call OpenAI
    const systemPrompt = buildSystemPrompt(ctx, clienteInfo, colasInfo, turno + 1);
    const aiMessage    = await callOpenAI(systemPrompt, mensajes, contenido);

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
        if (clienteMatch) {
          newCtx.cliente_id = clienteMatch.id;
          await updateConversacion(conversacion_id, {
            cliente_id:     clienteMatch.id,
            cliente_nombre: clienteMatch.nombre_completo,
          });
        }
        console.log(`[bot] Cliente identificado: ${args.nombre_completo} CI:${args.ci} en_bd:${args.cliente_encontrado}`);

        // Bug fix #1: override AI text — use our own acknowledgment instead of
        // the stale identification-request text OpenAI may return alongside the tool call
        const firstName = args.nombre_completo.split(" ")[0];
        respuestaTexto = clienteMatch
          ? `¡Gracias, ${firstName}! Ya te tengo registrado en nuestro sistema. ¿En qué te puedo ayudar hoy? 😊`
          : `¡Gracias, ${firstName}! ¿En qué te puedo ayudar hoy? 😊`;
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
      await updateConversacion(conversacion_id, {
        bot_estado:   "handed_off",
        bot_contexto: { ...newCtx, fase: "finalizado" },
        bot_turnos:   turno + 1,
        cola_id:      cola?.id ?? null,
        estado:       "en_cola",
      });
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

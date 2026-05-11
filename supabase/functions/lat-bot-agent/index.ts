/**
 * lat-bot-agent v2 — Motor de conversación WhatsApp (OpenAI + prompt optimizado)
 *
 * Responsabilidad del AI: saludo + identificación + detección de intención + FAQ simple
 * Responsabilidad del código: routing, horarios, asignación de asesor, estado
 *
 * Secrets requeridos:
 *   OPENAI_API_KEY
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GUPSHUP_API_KEY, GUPSHUP_NUMBER, GUPSHUP_APP_NAME
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GS_API_KEY   = Deno.env.get("GUPSHUP_API_KEY") ?? "";
const GS_NUMBER    = Deno.env.get("GUPSHUP_NUMBER") ?? "";
const GS_APP_NAME  = Deno.env.get("GUPSHUP_APP_NAME") ?? "";

const supabase  = createClient(SUPABASE_URL, SERVICE_KEY);
const MODEL     = "gpt-4o-mini";
const MAX_TURNS = 6;

// ─── Types ────────────────────────────────────────────────────────────────────

interface BotContexto {
  fase: "identificacion" | "necesidad" | "finalizado";
  nombre?: string | null;
  cliente_id?: string | null;
}

// ─── Prompt del sistema (mínimo — solo lo indispensable para el AI) ───────────

function buildSystemPrompt(
  ctx: BotContexto,
  clienteInfo: string,
  colasStr: string,
  turno: number,
  ultimoAsesor: string | null,
  cfg?: any,
): string {
  const maxT    = cfg?.max_turnos ?? MAX_TURNS;
  const reglas  = cfg?.prompt_reglas ? `\nREGLAS ADICIONALES:\n${cfg.prompt_reglas}` : "";

  return `Eres Lati, la asistente virtual de Tropical Tours Bolivia por WhatsApp.
Tono: amigable, cálido, profesional. Español latinoamericano. Firmá cada mensaje con "- Lati 🌍".
Nunca digas que sos IA, bot o sistema automático. Sos Lati, parte del equipo de Tropical Tours.
Nunca inventes precios, fechas ni disponibilidad. Si no sabés algo concreto, decí que un asesor lo confirmará.

TURNO: ${turno + 1}/${maxT}
FASE: ${ctx.fase}
CLIENTE: ${clienteInfo}${ultimoAsesor ? `\nÚLTIMO ASESOR: ${ultimoAsesor}` : ""}
COLAS DISPONIBLES: ${colasStr}

FLUJO OBLIGATORIO:
${ctx.fase === "identificacion"
  ? "PASO 1 — El cliente NO está identificado. Saludá con calidez y pedí su NOMBRE Y APELLIDO completos. No avances sin esto."
  : `PASO 1 — Cliente identificado: ${ctx.nombre}. Saludalo por su nombre y entendé su necesidad.`}
PASO 2 — Con máximo 2 preguntas adicionales, entendé qué necesita (destino, fechas, cantidad de personas, tipo de servicio).
PASO 3 — Cuando tengas suficiente información, llamá a detectar_intencion() Y asignar_cola() en el MISMO turno.
PASO 4 — Si llegás al turno ${maxT} sin resolución: derivar de todas formas.

EMERGENCIAS (derivar INMEDIATAMENTE sin preguntas adicionales):
- Cliente viajando actualmente con problema (accidente, hospitalización, vuelo perdido, robo)
- Palabras clave: "emergencia", "accidente", "hospital", "urgente", "perdí mi vuelo", "me robaron"
- En estos casos: asignar_cola("Emergencia en Destino") de inmediato.

INFORMACIÓN SEGURA QUE PODÉS CONFIRMAR:
- Horario de atención: Lunes a Viernes 8:00-19:00, Sábados 8:00-13:00 (hora Bolivia)
- Fuera de horario: el cliente queda en cola y un asesor lo atiende al inicio del siguiente turno
- Servicios: paquetes vacacionales, trámites de visa, viajes grupales, eventos y bodas, viajes corporativos, soporte post-viaje
- Para precios, disponibilidad y reservas específicas: siempre conectar con un asesor humano

MENSAJES NO-TEXTO (sticker, imagen, audio, documento):
- Si recibís algo que no es texto, respondé: "Recibí tu mensaje 😊 Para poder ayudarte mejor, ¿podés contarme en texto qué necesitás? - Lati 🌍"${reglas}`;
}

// ─── Tools ───────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "identificar_cliente",
      description: "Registra el nombre del cliente cuando lo menciona.",
      parameters: {
        type: "object",
        properties: {
          nombre_completo: { type: "string" },
        },
        required: ["nombre_completo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detectar_intencion",
      description: "Registra categoría e urgencia cuando entendiste la necesidad. Siempre junto a asignar_cola().",
      parameters: {
        type: "object",
        properties: {
          categoria: {
            type: "string",
            enum: ["vacacional", "visa", "grupos", "corporativo", "soporte", "emergencia", "cobranzas", "otro"],
          },
          urgencia:    { type: "string", enum: ["baja", "media", "alta", "critica"] },
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
      description: "Deriva al cliente. Llamar siempre en el mismo turno que detectar_intencion().",
      parameters: {
        type: "object",
        properties: {
          cola_nombre:       { type: "string" },
          mensaje_despedida: { type: "string" },
        },
        required: ["cola_nombre", "mensaje_despedida"],
      },
    },
  },
];

// ─── Helpers DB ───────────────────────────────────────────────────────────────

async function getConversacion(id: string) {
  const { data } = await supabase
    .from("lat_conversaciones")
    .select("id, telefono, bot_estado, bot_contexto, bot_turnos, cliente_id, cliente_nombre, ultima_interaccion, responsable_nombre")
    .eq("id", id)
    .single();
  return data as any;
}

async function getMensajesRecientes(convId: string, limit = 6) {
  const { data } = await supabase
    .from("lat_mensajes")
    .select("tipo, contenido")
    .eq("conversacion_id", convId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).reverse() as any[];
}

async function getClienteByTelefono(telefono: string) {
  const clean  = telefono.replace(/\D/g, "");          // ej: 59175001199
  const last8  = clean.slice(-8);                      // ej: 75001199 (sin código país)
  const last9  = clean.slice(-9);                      // ej: 591001199 — intermedio
  // Busca coincidencia con número completo, variante con +, o últimos 8 dígitos
  // (maneja formatos como "+591 75001199", "591 75001199", "59175001199")
  const { data } = await supabase
    .from("clientes")
    .select("id, nombre_completo, razon_social, documento_numero")
    .or(`telefono.ilike.%${clean}%,telefono.ilike.%${last9}%,telefono.ilike.%${last8}%`)
    .limit(1)
    .maybeSingle();
  return data as any;
}

async function getBotConfig() {
  const { data } = await supabase
    .from("lat_bot_config")
    .select("activo, max_turnos, temperatura, prompt_reglas, crear_gestion_auto, gestion_process_id, gestion_stage_id")
    .eq("canal", "whatsapp")
    .maybeSingle();
  return data as any;
}

async function getColas() {
  const { data } = await supabase
    .from("lat_colas")
    .select("id, nombre, area")
    .eq("activa", true)
    .order("orden");
  return (data ?? []) as any[];
}

async function updateConversacion(id: string, updates: Record<string, any>) {
  await supabase.from("lat_conversaciones").update(updates).eq("id", id);
}

// ─── Gupshup send ─────────────────────────────────────────────────────────────

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

// ─── Assign engine trigger ────────────────────────────────────────────────────

function triggerAssignEngine(convId: string) {
  const p = fetch(`${SUPABASE_URL}/functions/v1/lat-assign-engine`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ conversacion_id: convId }),
  }).catch(e => console.error("[bot] assign-engine error:", e));
  (globalThis as any).EdgeRuntime?.waitUntil?.(p);
}

// ─── Auto-crear gestión ───────────────────────────────────────────────────────

async function crearGestion(conv: any, ctx: any, cfg: any) {
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

// ─── OpenAI call ──────────────────────────────────────────────────────────────

async function callOpenAI(systemPrompt: string, mensajes: any[], nuevoMensaje: string, temperatura = 0.4) {
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
      model:      MODEL,
      messages:   [{ role: "system", content: systemPrompt }, ...history],
      tools:      TOOLS,
      tool_choice: "auto",
      temperature: temperatura,
      max_tokens:  400,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  return (await res.json()).choices?.[0]?.message ?? null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });

  try {
    const { conversacion_id, telefono, contenido } = await req.json();
    if (!conversacion_id) return new Response("missing conversacion_id", { status: 400 });

    // 1. Config + conversación en paralelo
    const [cfg, conv] = await Promise.all([getBotConfig(), getConversacion(conversacion_id)]);
    if (!conv) return new Response("conv not found", { status: 404 });
    if (!cfg || cfg.activo === false) return new Response(JSON.stringify({ ok: true, skipped: "bot disabled" }), { status: 200 });

    const maxTurns = cfg?.max_turnos ?? MAX_TURNS;

    // 2. Resetear sesión si viene de handed_off/pausado o inactiva >3h
    const stale = conv.bot_estado === "activo"
      && (conv.bot_turnos ?? 0) > 0
      && Date.now() - new Date(conv.ultima_interaccion).getTime() > 3 * 60 * 60 * 1000;

    if (conv.bot_estado === "handed_off" || conv.bot_estado === "pausado" || stale) {
      const freshCtx: BotContexto = conv.cliente_id
        ? { fase: "necesidad", cliente_id: conv.cliente_id, nombre: conv.cliente_nombre }
        : { fase: "identificacion" };
      await updateConversacion(conversacion_id, {
        bot_estado: "activo", bot_turnos: 0, bot_contexto: freshCtx,
        cola_id: null, intencion_detectada: null, urgencia_detectada: null, resumen_ia: null, estado: "abierta",
      });
      Object.assign(conv, { bot_estado: "activo", bot_turnos: 0, bot_contexto: freshCtx });
    }

    const ctx: BotContexto = (conv.bot_contexto && typeof conv.bot_contexto === "object")
      ? conv.bot_contexto as BotContexto
      : { fase: "identificacion" };

    const turno = conv.bot_turnos ?? 0;

    // 3. Handoff forzado por turnos
    if (turno >= maxTurns) {
      const { data: colaFD } = await supabase.from("lat_colas")
        .select("id").ilike("nombre", "%Frontdesk%").eq("activa", true).limit(1).maybeSingle();
      await updateConversacion(conversacion_id, {
        bot_estado: "handed_off", cola_id: colaFD?.id ?? null,
        estado: "en_cola", estado_asignacion: "en_cola", ts_cola_asignada: new Date().toISOString(),
      });
      await sendWhatsApp(conv.telefono ?? telefono, "Te estoy conectando con un asesor. ¡Gracias por tu paciencia! 🙏", conversacion_id);
      if (colaFD?.id) triggerAssignEngine(conversacion_id);
      return new Response("max turns", { status: 200 });
    }

    // 4. Auto-identificar por teléfono si no está vinculado
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

    // 5. Contexto dinámico mínimo
    const clienteInfo = ctx.nombre
      ? `${ctx.nombre} (${ctx.fase === "necesidad" ? "identificado" : "pendiente"})`
      : "No identificado — pedir nombre";

    const [colas, lastAsesor] = await Promise.all([
      getColas(),
      supabase.from("lat_mensajes")
        .select("autor_nombre").eq("conversacion_id", conversacion_id)
        .eq("tipo", "outbound").neq("autor_nombre", "Lati").not("autor_nombre", "is", null)
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
        .then(r => r.data?.autor_nombre ?? null),
    ]);

    const colasStr     = colas.map(c => `${c.nombre}${c.area ? ` (${c.area})` : ""}`).join(" | ");
    const systemPrompt = buildSystemPrompt(ctx, clienteInfo, colasStr, turno, conv.responsable_nombre ?? lastAsesor, cfg);

    // 6. Historial reducido (6 mensajes) + llamada a OpenAI
    const mensajes  = await getMensajesRecientes(conversacion_id, 6);
    const aiMessage = await callOpenAI(systemPrompt, mensajes, contenido, cfg?.temperatura ?? 0.4);
    if (!aiMessage) throw new Error("No response from OpenAI");

    // 7. Procesar tool calls
    let textoRespuesta: string | null = aiMessage.content ?? null;
    let newCtx = { ...ctx };
    let intencionData: any = null;
    let shouldHandoff  = false;
    let handoffColaName = "";
    let handoffMsg      = "";

    for (const toolCall of (aiMessage.tool_calls ?? [])) {
      const fn   = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments ?? "{}");

      if (fn === "identificar_cliente") {
        newCtx.nombre = args.nombre_completo;
        newCtx.fase   = "necesidad";

        const { data: existing } = await supabase.from("clientes")
          .select("id, nombre_completo").ilike("nombre_completo", `%${args.nombre_completo}%`).limit(1).maybeSingle();

        if (existing) {
          newCtx.cliente_id = existing.id;
          await updateConversacion(conversacion_id, { cliente_id: existing.id, cliente_nombre: existing.nombre_completo });
        } else {
          const clean = (conv.telefono ?? telefono).replace(/\D/g, "");
          const { data: nuevo } = await supabase.from("clientes").insert({
            nombre_completo: args.nombre_completo,
            telefono:        clean,
            canal_contacto:  "whatsapp",
            tipo:            "natural",
          }).select("id").single();
          if (nuevo?.id) {
            newCtx.cliente_id = nuevo.id;
            await updateConversacion(conversacion_id, { cliente_id: nuevo.id, cliente_nombre: args.nombre_completo });
          }
        }
        textoRespuesta = null; // el AI ya genera el texto en su respuesta
      }

      if (fn === "detectar_intencion") {
        intencionData = args;
        await updateConversacion(conversacion_id, {
          intencion_detectada: args.categoria,
          urgencia_detectada:  args.urgencia,
          resumen_ia:          args.descripcion,
        });
      }

      if (fn === "asignar_cola") {
        shouldHandoff   = true;
        handoffColaName = args.cola_nombre;
        handoffMsg      = args.mensaje_despedida;
      }
    }

    // 8. Si detectó intención pero no asignó cola → segunda llamada forzada
    if (intencionData && !shouldHandoff) {
      const forced = await callOpenAI(
        systemPrompt + "\n\nYa detectaste la intención. DEBES llamar a asignar_cola() AHORA.",
        mensajes, contenido,
      );
      for (const toolCall of (forced?.tool_calls ?? [])) {
        const fn   = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments ?? "{}");
        if (fn === "asignar_cola") {
          shouldHandoff   = true;
          handoffColaName = args.cola_nombre;
          handoffMsg      = args.mensaje_despedida;
        }
      }
    }

    const telefDest = conv.telefono ?? telefono;

    // 9. Enviar texto si no hay handoff
    if (textoRespuesta && !shouldHandoff) {
      await sendWhatsApp(telefDest, textoRespuesta, conversacion_id);
    }

    // 10. Ejecutar handoff
    if (shouldHandoff) {
      const { data: cola } = await supabase.from("lat_colas")
        .select("id").ilike("nombre", `%${handoffColaName}%`).eq("activa", true).limit(1).maybeSingle();

      const finalCtx = { ...newCtx, fase: "finalizado" as const };
      await updateConversacion(conversacion_id, {
        bot_estado: "handed_off", bot_contexto: finalCtx, bot_turnos: turno + 1,
        cola_id: cola?.id ?? null, estado: "en_cola", estado_asignacion: "en_cola",
        ts_cola_asignada: new Date().toISOString(),
      });

      await crearGestion(
        { ...conv, cliente_id: newCtx.cliente_id ?? conv.cliente_id },
        { ...finalCtx, intencion: intencionData?.categoria, urgencia: intencionData?.urgencia, descripcion: intencionData?.descripcion },
        cfg,
      );
      await sendWhatsApp(telefDest, handoffMsg || "Te conecto con un asesor ahora. ¡Gracias! 🌍", conversacion_id);
      if (cola?.id) triggerAssignEngine(conversacion_id);
    } else {
      await updateConversacion(conversacion_id, { bot_contexto: newCtx, bot_turnos: turno + 1 });
    }

    return new Response(JSON.stringify({ ok: true, turno: turno + 1, fase: newCtx.fase }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[lat-bot-agent] error:", err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
});

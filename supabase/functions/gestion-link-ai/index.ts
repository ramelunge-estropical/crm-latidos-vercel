// Edge function: gestion-link-ai
// Operaciones IA para Bandeja LAT (copiloto del asesor) + integración Bandeja <-> Mis Gestiones.
//
// Operaciones soportadas:
//   - summarize:     resumen breve de la conversación
//   - suggest:       sugiere tipificación para crear una gestión (tipo, prioridad, fecha, siguiente paso)
//   - decide:        sugiere si conviene crear gestión nueva o reactivar conversación
//   - reply:         redacta una respuesta sugerida para enviar al cliente
//   - intent:        detecta la intención principal del cliente
//   - objections:    detecta objeciones / bloqueos / dudas
//   - next_step:     sugiere el siguiente paso operativo del asesor
//   - internal_note: genera una nota interna para registrar el estado del caso
//   - extract_data:  extrae datos relevantes (fechas, destinos, montos, pax, contactos)
//   - derive:        sugiere si conviene derivar y a qué área / rol

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const MODEL = "google/gemini-2.5-flash";

type Operation =
  | "summarize"
  | "suggest"
  | "decide"
  | "reply"
  | "intent"
  | "objections"
  | "next_step"
  | "internal_note"
  | "extract_data"
  | "derive";

interface Body {
  operation: Operation;
  conversation: {
    canal?: string;
    asunto?: string;
    cliente_nombre?: string;
    mensajes?: Array<{ tipo: string; contenido: string; created_at?: string }>;
    ultimo_mensaje?: string;
    en_ventana?: boolean;
  };
  context?: {
    gestion_existente?: { title?: string; type?: string; description?: string };
    tono?: string;             // p.ej. "cordial rioplatense", "formal"
    instrucciones?: string;    // instrucción libre del asesor (opcional)
  };
}

const SYSTEM = `Eres el copiloto operativo de un asesor de viajes en un CRM (LAT > Bandeja).
Hablas SIEMPRE en español rioplatense, breve, claro, sin floreo y sin emojis innecesarios.
NUNCA inventes nombres propios, precios, fechas exactas, tarifas o datos del cliente que no figuren en la conversación.
Devuelves SIEMPRE JSON válido sin markdown ni texto adicional.`;

function buildPrompt(body: Body): string {
  const conv = body.conversation || {};
  const ctx = body.context || {};
  const transcript = (conv.mensajes || [])
    .slice(-30)
    .map((m) => `[${m.tipo}] ${m.contenido}`)
    .join("\n");

  const base = `Canal: ${conv.canal || "?"} | Cliente: ${conv.cliente_nombre || "?"} | Asunto: ${conv.asunto || "?"} | EnVentana: ${conv.en_ventana === false ? "no" : "sí"}
Conversación (últimos mensajes):
${transcript || conv.ultimo_mensaje || "(sin mensajes)"}`;

  const tonoLine = ctx.tono ? `Tono: ${ctx.tono}.` : `Tono: cordial rioplatense, profesional, directo.`;
  const instrLine = ctx.instrucciones ? `Instrucción extra del asesor: ${ctx.instrucciones}` : "";

  switch (body.operation) {
    case "summarize":
      return `${base}

Tarea: Resume el caso en 2-3 frases. Indica el pedido del cliente, el estado actual y lo pendiente.
Responde JSON: { "resumen": "...", "siguiente_paso": "..." }`;

    case "suggest":
      return `${base}

Tarea: Sugiere tipificación para crear una gestión estructurada.
Responde JSON: {
  "tipo": "comercial" | "proyecto" | "operativa" | "caso",
  "prioridad": "low" | "medium" | "high" | "urgent",
  "titulo_sugerido": "...",
  "fecha_compromiso_dias": <número de días desde hoy, 0-30>,
  "siguiente_paso": "..."
}`;

    case "decide":
      return `${base}

Contexto: ${JSON.stringify(ctx)}
Tarea: Decide si conviene CREAR una gestión nueva, VINCULAR a una existente, o REACTIVAR una conversación.
Responde JSON: {
  "accion": "crear_gestion" | "vincular_existente" | "reactivar_conversacion" | "ninguna",
  "razon": "..."
}`;

    case "reply":
      return `${base}

${tonoLine} ${instrLine}
Tarea: Redactá UNA respuesta breve (2-5 frases) que el asesor pueda enviar tal cual al cliente.
- No saludes si la conversación ya está abierta.
- Avanzá el caso: respondé lo planteado o pedí lo que falta.
- No inventes precios ni fechas exactas que no estén en el hilo.
- Sin emojis salvo que el cliente los esté usando.
Responde JSON: {
  "respuesta": "...",
  "tono_detectado": "...",
  "alternativa_corta": "..."
}`;

    case "intent":
      return `${base}

Tarea: Detectá la intención principal del cliente en este momento.
Responde JSON: {
  "intencion": "consulta" | "cotizacion" | "reserva" | "reclamo" | "soporte" | "seguimiento" | "cancelacion" | "otra",
  "detalle": "...",
  "confianza": "alta" | "media" | "baja"
}`;

    case "objections":
      return `${base}

Tarea: Detectá objeciones, bloqueos, dudas o frenos del cliente.
Responde JSON: {
  "objeciones": [
    { "tipo": "precio" | "tiempo" | "confianza" | "competencia" | "destino" | "operativa" | "otra", "detalle": "...", "respuesta_sugerida": "..." }
  ],
  "riesgo_perdida": "alto" | "medio" | "bajo"
}`;

    case "next_step":
      return `${base}

Tarea: Sugerí el siguiente paso OPERATIVO concreto que debe hacer el asesor.
Responde JSON: {
  "siguiente_paso": "...",
  "responsable_sugerido": "asesor" | "operaciones" | "ventas" | "soporte" | "gerencia",
  "vencimiento_dias": <0-14>,
  "prioridad": "low" | "medium" | "high" | "urgent"
}`;

    case "internal_note":
      return `${base}

Tarea: Generá una nota interna (no se envía al cliente) para que cualquier asesor entienda en 10 segundos en qué está el caso.
Responde JSON: {
  "nota_interna": "...",
  "etiquetas": ["...", "..."]
}`;

    case "extract_data":
      return `${base}

Tarea: Extraé datos relevantes mencionados en la conversación (no inventes lo que no esté).
Responde JSON: {
  "destinos": ["..."],
  "fechas": ["..."],
  "pax": { "adultos": <n|null>, "menores": <n|null> },
  "presupuesto": { "monto": <n|null>, "moneda": "USD"|"ARS"|"EUR"|"BRL"|"otra"|null },
  "contactos_alternativos": ["..."],
  "preferencias": ["..."],
  "datos_clave": ["..."]
}`;

    case "derive":
      return `${base}

Tarea: ¿Conviene derivar este caso? ¿A quién?
Responde JSON: {
  "derivar": true | false,
  "area_sugerida": "ventas" | "operaciones" | "soporte" | "cobranzas" | "gerencia" | "otra" | null,
  "razon": "...",
  "urgencia": "low" | "medium" | "high" | "urgent"
}`;

    default:
      return `${base}

Tarea: Resumí el caso en una frase.
Responde JSON: { "resumen": "..." }`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY no configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    if (!body?.operation || !body?.conversation) {
      return new Response(JSON.stringify({ error: "operation y conversation son requeridos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = buildPrompt(body);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit excedido, probá en unos segundos" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos de IA agotados" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return new Response(JSON.stringify({ error: `AI error: ${txt}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const raw = data?.choices?.[0]?.message?.content || "{}";
    // limpiar fences markdown si vinieran
    const cleaned = raw.replace(/```json\s*|```/g, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { raw: cleaned };
    }

    return new Response(JSON.stringify({ ok: true, result: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

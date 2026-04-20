// Edge function: gestion-link-ai
// Soporta operaciones IA para integración Bandeja <-> Mis Gestiones:
//   - summarize: resumen de conversación
//   - suggest:   sugiere tipo, prioridad, fecha compromiso, siguiente paso
//   - decide:    sugiere si conviene crear gestión nueva o reactivar conversación

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const MODEL = "google/gemini-2.5-flash";

interface Body {
  operation: "summarize" | "suggest" | "decide";
  conversation: {
    canal?: string;
    asunto?: string;
    cliente_nombre?: string;
    mensajes?: Array<{ tipo: string; contenido: string; created_at?: string }>;
    ultimo_mensaje?: string;
  };
  context?: { gestion_existente?: { title?: string; type?: string; description?: string } };
}

const SYSTEM = `Eres un asistente operativo de un CRM. Respondes SIEMPRE en español rioplatense, breve, sin floreo.
Devuelves SOLO JSON válido sin markdown ni texto adicional.`;

function buildPrompt(body: Body): string {
  const conv = body.conversation || {};
  const transcript = (conv.mensajes || [])
    .slice(-30)
    .map((m) => `[${m.tipo}] ${m.contenido}`)
    .join("\n");

  const base = `Canal: ${conv.canal || "?"} | Cliente: ${conv.cliente_nombre || "?"} | Asunto: ${conv.asunto || "?"}
Conversación:
${transcript || conv.ultimo_mensaje || "(sin mensajes)"}`;

  if (body.operation === "summarize") {
    return `${base}

Tarea: Resume el caso en 2-3 frases. Indica el pedido del cliente, el estado actual y lo pendiente.
Responde JSON: { "resumen": "...", "siguiente_paso": "..." }`;
  }

  if (body.operation === "suggest") {
    return `${base}

Tarea: Sugiere tipificación para crear una gestión estructurada.
Responde JSON: {
  "tipo": "comercial" | "proyecto" | "operativa" | "caso",
  "prioridad": "low" | "medium" | "high" | "urgent",
  "titulo_sugerido": "...",
  "fecha_compromiso_dias": <número de días desde hoy, 0-30>,
  "siguiente_paso": "..."
}`;
  }

  // decide
  return `${base}

Contexto: ${JSON.stringify(body.context || {})}
Tarea: Decide si conviene CREAR una gestión nueva, VINCULAR a una existente, o REACTIVAR una conversación.
Responde JSON: {
  "accion": "crear_gestion" | "vincular_existente" | "reactivar_conversacion" | "ninguna",
  "razon": "..."
}`;
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

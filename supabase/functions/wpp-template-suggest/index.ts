/**
 * wpp-template-suggest — IA sugiere la mejor plantilla aprobada según la conversación.
 *
 * Body: { conversacion_id: string, templates: Array<{name, body, variables, category, language}> }
 *
 * Usa Lovable AI Gateway (LOVABLE_API_KEY) con tool calling para devolver:
 *   { suggested_name, reason, variables: { "1": "...", "2": "..." } }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { conversacion_id, templates } = await req.json();
    if (!conversacion_id || !Array.isArray(templates) || templates.length === 0) {
      return new Response(
        JSON.stringify({ error: "conversacion_id y templates son requeridos" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY no configurada" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Cargar últimos 12 mensajes + datos del cliente
    const { data: conv } = await supabase
      .from("lat_conversaciones")
      .select("cliente_nombre, asunto, ventana_whatsapp, telefono")
      .eq("id", conversacion_id)
      .single();

    const { data: msgs } = await supabase
      .from("lat_mensajes")
      .select("tipo, contenido, created_at")
      .eq("conversacion_id", conversacion_id)
      .order("created_at", { ascending: false })
      .limit(12);

    const transcript = (msgs ?? [])
      .reverse()
      .map((m: any) => `${m.tipo === "inbound" ? "Cliente" : "Asesor"}: ${m.contenido}`)
      .join("\n");

    const templatesList = templates
      .map((t: any) =>
        `- ${t.name} (${t.category ?? "general"}, ${t.language ?? "es"}): "${t.body}" [vars: ${(t.variables ?? []).length}]`
      )
      .join("\n");

    const systemPrompt = `Sos un asistente que ayuda a un asesor de viajes a elegir la mejor plantilla de WhatsApp aprobada para responder a un cliente.
Responde en español rioplatense, breve y profesional.
Solo podés sugerir una plantilla del listado proporcionado.`;

    const userPrompt = `CONVERSACIÓN (cliente: ${conv?.cliente_nombre ?? "—"}, asunto: ${conv?.asunto ?? "—"}):
${transcript || "(sin mensajes previos)"}

PLANTILLAS DISPONIBLES:
${templatesList}

Elegí la plantilla más adecuada para retomar el contacto y completá las variables si las hay (con datos del contexto, sin inventar nombres ni precios).`;

    const aiBody = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "suggest_template",
          description: "Sugiere una plantilla y completa sus variables.",
          parameters: {
            type: "object",
            properties: {
              suggested_name: { type: "string", description: "Nombre exacto de la plantilla elegida" },
              reason:         { type: "string", description: "Por qué encaja (1-2 frases)" },
              variables: {
                type: "object",
                description: "Pares { '1': 'valor', '2': 'valor' } para reemplazar {{1}}, {{2}}",
                additionalProperties: { type: "string" },
              },
            },
            required: ["suggested_name", "reason"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "suggest_template" } },
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(aiBody),
    });

    if (aiRes.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit alcanzado. Probá nuevamente en unos minutos." }),
        { status: 429, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }
    if (aiRes.status === 402) {
      return new Response(
        JSON.stringify({ error: "Sin créditos en Lovable AI. Agregá fondos en Workspace > Usage." }),
        { status: 402, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }
    if (!aiRes.ok) {
      const detail = await aiRes.text();
      return new Response(JSON.stringify({ error: `AI error ${aiRes.status}`, detail }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const data = await aiRes.json();
    const tool = data?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = null;
    try {
      parsed = tool ? JSON.parse(tool.function.arguments) : null;
    } catch { /* */ }

    return new Response(JSON.stringify({ suggestion: parsed }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("wpp-template-suggest error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

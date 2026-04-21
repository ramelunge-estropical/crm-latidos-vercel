/**
 * wpp-send — Supabase Edge Function
 * Envía mensajes salientes via Gupshup WhatsApp API y los persiste en lat_mensajes.
 *
 * Secrets requeridos:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GUPSHUP_API_KEY      → API key de cuenta (Profile tab en Gupshup)
 *   GUPSHUP_NUMBER       → Número origen registrado en Gupshup (ej: 59175001199)
 *   GUPSHUP_APP_NAME     → Nombre del app en Gupshup (ej: outletaiagent)
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = await req.json();
    const {
      conversacion_id,
      contenido,
      autor_nombre,
      // Soporte para plantilla aprobada Gupshup:
      template_name,           // string
      template_language,       // string (ej: "es")
      template_variables,      // string[] en orden {{1}} {{2}} ...
      template_body_preview,   // string para guardar como contenido legible
    } = body;

    const isTemplate = !!template_name;
    const messageContent = isTemplate ? (template_body_preview ?? contenido ?? template_name) : contenido;

    if (!conversacion_id || (!isTemplate && !contenido)) {
      return new Response(
        JSON.stringify({ error: "conversacion_id y contenido (o template_name) son requeridos" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Obtener el teléfono destino de la conversación
    const { data: conv, error: convErr } = await supabase
      .from("lat_conversaciones")
      .select("telefono, canal")
      .eq("id", conversacion_id)
      .single();

    if (convErr || !conv) {
      console.error("Conversación no encontrada:", convErr);
      return new Response(
        JSON.stringify({ error: "Conversación no encontrada" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    if (conv.canal !== "whatsapp") {
      return new Response(
        JSON.stringify({ error: `Canal ${conv.canal} no soportado para envío externo` }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const destination = conv.telefono?.replace(/\D/g, "") ?? "";
    if (!destination) {
      return new Response(
        JSON.stringify({ error: "La conversación no tiene número de teléfono" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const apiKey  = Deno.env.get("GUPSHUP_API_KEY")  ?? "";
    const source  = Deno.env.get("GUPSHUP_NUMBER")   ?? "";
    const appName = Deno.env.get("GUPSHUP_APP_NAME") ?? "";

    console.log("wpp-send: enviando a", destination, "desde", source, "app", appName, "template?", isTemplate);

    console.log("wpp-send: apiKey (primeros 8 chars):", apiKey.slice(0, 8));

    // ── Llamada a Gupshup (texto libre OR plantilla) ──────────────────────────
    let formBody: URLSearchParams;
    let gupshupUrl: string;

    if (isTemplate) {
      // Endpoint de plantilla: /wa/api/v1/template/msg
      formBody = new URLSearchParams({
        source:      source,
        destination: destination,
        "src.name":  appName,
        template:    JSON.stringify({
          id:     template_name,                          // Gupshup acepta name como id
          params: Array.isArray(template_variables) ? template_variables : [],
        }),
      });
      gupshupUrl = "https://api.gupshup.io/wa/api/v1/template/msg";
    } else {
      formBody = new URLSearchParams({
        channel:     "whatsapp",
        source:      source,
        destination: destination,
        message:     JSON.stringify({ type: "text", text: contenido }),
        "src.name":  appName,
      });
      gupshupUrl = "https://api.gupshup.io/wa/api/v1/msg";
    }

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 8000);

    let gupshupRes: Response;
    try {
      gupshupRes = await fetch(gupshupUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "apikey": apiKey,
        },
        body: formBody.toString(),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      const msg = fetchErr?.name === "AbortError"
        ? "Timeout: Gupshup no respondió en 8 segundos"
        : `Error de red al llamar Gupshup: ${fetchErr?.message}`;
      console.error(msg);
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }
    clearTimeout(timeoutId);

    const gupshupText = await gupshupRes.text();
    console.log("Gupshup status:", gupshupRes.status);
    console.log("Gupshup response:", gupshupText);

    if (!gupshupRes.ok) {
      return new Response(
        JSON.stringify({
          error: `Gupshup error ${gupshupRes.status}`,
          detail: gupshupText,
        }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── Guardar mensaje en BD ─────────────────────────────────────────────────
    let gupshupData: any = {};
    try { gupshupData = JSON.parse(gupshupText); } catch { /* no JSON */ }

    const { error: insertErr } = await supabase.from("lat_mensajes").insert({
      conversacion_id,
      tipo:           "outbound",
      contenido:      messageContent,
      estado:         "enviado",
      autor_nombre:   autor_nombre ?? null,
      wpp_message_id: gupshupData?.messageId ?? null,
    });

    if (insertErr) {
      console.error("Error insertando mensaje:", insertErr);
    }

    // Actualizar última interacción y reabrir si estaba liberada/cerrada
    await supabase
      .from("lat_conversaciones")
      .update({
        ultimo_mensaje:     (messageContent ?? "").slice(0, 100),
        ultima_interaccion: new Date().toISOString(),
        en_foco:            true,
      })
      .eq("id", conversacion_id);


    return new Response(
      JSON.stringify({ ok: true, messageId: gupshupData?.messageId }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("wpp-send error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});

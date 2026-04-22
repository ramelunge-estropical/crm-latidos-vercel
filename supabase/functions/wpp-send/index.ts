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
      template_id,             // string (UUID Gupshup) — preferido
      template_name,           // string (elementName) — fallback
      template_language,       // string (ej: "es")
      template_variables,      // string[] en orden {{1}} {{2}} ...
      template_body_preview,   // string para guardar como contenido legible
    } = body;

    const isTemplate = !!(template_id || template_name);
    const messageContent = isTemplate
      ? (template_body_preview ?? contenido ?? template_name ?? "[plantilla]")
      : contenido;

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
      // Gupshup REQUIERE el UUID de la plantilla en `id`. El `elementName` NO funciona.
      const tplParams = (Array.isArray(template_variables) ? template_variables : []).map(v => String(v ?? ""));
      const tplPayload: Record<string, unknown> = {
        id:     template_id ?? template_name,   // preferimos UUID; fallback a name
        params: tplParams,
      };
      formBody = new URLSearchParams({
        channel:     "whatsapp",
        source:      source,
        destination: destination,
        "src.name":  appName,
        template:    JSON.stringify(tplPayload),
      });
      // También incluimos `message` con el preview por compatibilidad con cuentas que
      // requieren el cuerpo renderizado.
      if (template_body_preview) {
        formBody.append("message", JSON.stringify({ type: "text", text: template_body_preview }));
      }
      console.log("wpp-send template payload:", { id: tplPayload.id, params: tplParams });
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

    let gupshupData: any = {};
    try { gupshupData = JSON.parse(gupshupText); } catch { /* no JSON */ }

    // Gupshup devuelve 200 con `status:"submitted"` cuando acepta el envío.
    // Cualquier otra cosa = fallo real (no marcamos como enviado).
    const gupshupOk =
      gupshupRes.ok &&
      (gupshupData?.status === "submitted" || !!gupshupData?.messageId);

    if (!gupshupOk) {
      const detailMsg =
        gupshupData?.message ||
        gupshupData?.error   ||
        gupshupText           ||
        `HTTP ${gupshupRes.status}`;
      return new Response(
        JSON.stringify({
          error:  `Gupshup rechazó el envío: ${detailMsg}`,
          detail: gupshupData ?? gupshupText,
          status: gupshupRes.status,
        }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

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

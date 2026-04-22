/**
 * wpp-send-media — Supabase Edge Function
 *
 * Recibe un adjunto del asesor (multipart/form-data o JSON con base64),
 * lo sube al bucket lat-adjuntos y lo envía por Gupshup WhatsApp API.
 * Persiste el mensaje outbound en lat_mensajes con la URL pública del adjunto.
 *
 * Body (JSON):
 *   {
 *     conversacion_id: uuid,
 *     file_name: string,
 *     mime_type: string,
 *     file_base64: string,         // dataURL o base64 puro
 *     caption?: string,
 *     autor_nombre?: string
 *   }
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

const BUCKET = "lat-adjuntos";

function categoryFromMime(mime: string): "image" | "video" | "audio" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function extFromMime(mime: string, fallback?: string): string {
  if (fallback?.includes(".")) return fallback.split(".").pop()!.toLowerCase();
  if (mime.includes("/")) return mime.split("/")[1].split(";")[0];
  return "bin";
}

function decodeBase64(input: string): Uint8Array {
  const clean = input.includes(",") ? input.split(",")[1] : input;
  const bin = atob(clean);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { conversacion_id, file_name, mime_type, file_base64, caption, autor_nombre } = body ?? {};

    if (!conversacion_id || !file_name || !mime_type || !file_base64) {
      return new Response(
        JSON.stringify({ error: "conversacion_id, file_name, mime_type y file_base64 son requeridos" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // 1) Subir al bucket
    const bytes = decodeBase64(file_base64);
    const ext   = extFromMime(mime_type, file_name);
    const path  = `outbound/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime_type,
      upsert: false,
    });
    if (upErr) {
      console.error("upload error:", upErr);
      return new Response(
        JSON.stringify({ error: `Error subiendo adjunto: ${upErr.message}` }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    // 2) Obtener teléfono destino
    const { data: conv, error: convErr } = await supabase
      .from("lat_conversaciones")
      .select("telefono, canal")
      .eq("id", conversacion_id)
      .single();
    if (convErr || !conv) {
      return new Response(JSON.stringify({ error: "Conversación no encontrada" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (conv.canal !== "whatsapp") {
      return new Response(JSON.stringify({ error: `Canal ${conv.canal} no soporta adjuntos` }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const destination = (conv.telefono ?? "").replace(/\D/g, "");
    const apiKey      = Deno.env.get("GUPSHUP_API_KEY")  ?? "";
    const source      = Deno.env.get("GUPSHUP_NUMBER")   ?? "";
    const appName     = Deno.env.get("GUPSHUP_APP_NAME") ?? "";

    // 3) Enviar a Gupshup con tipo según MIME
    const cat = categoryFromMime(mime_type);
    const messagePayload: Record<string, unknown> = (() => {
      if (cat === "image") return { type: "image", originalUrl: publicUrl, previewUrl: publicUrl, caption: caption ?? "" };
      if (cat === "audio") return { type: "audio", url: publicUrl };
      if (cat === "video") return { type: "video", url: publicUrl, caption: caption ?? "" };
      return { type: "file", url: publicUrl, filename: file_name, caption: caption ?? "" };
    })();

    const formBody = new URLSearchParams({
      channel:     "whatsapp",
      source:      source,
      destination: destination,
      "src.name":  appName,
      message:     JSON.stringify(messagePayload),
    });

    let gupshupRes: Response;
    let gupshupText = "";
    try {
      gupshupRes = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "apikey": apiKey },
        body: formBody.toString(),
      });
      gupshupText = await gupshupRes.text();
    } catch (e: any) {
      return new Response(JSON.stringify({ error: `Error de red Gupshup: ${e?.message ?? e}` }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    let gupshupData: any = {};
    try { gupshupData = JSON.parse(gupshupText); } catch { /* */ }

    const ok = gupshupRes.ok && (gupshupData?.status === "submitted" || !!gupshupData?.messageId);
    if (!ok) {
      return new Response(JSON.stringify({
        error:  `Gupshup rechazó el adjunto: ${gupshupData?.message ?? gupshupText ?? gupshupRes.status}`,
        detail: gupshupData,
      }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // 4) Persistir en lat_mensajes
    const labelMap: Record<string,string> = { image:"📷 Imagen", audio:"🎤 Nota de voz", video:"🎥 Video", file:"📎 "+file_name };
    await supabase.from("lat_mensajes").insert({
      conversacion_id,
      tipo:           "outbound",
      contenido:      caption?.trim() || labelMap[cat] || `📎 ${file_name}`,
      estado:         "enviado",
      autor_nombre:   autor_nombre ?? null,
      wpp_message_id: gupshupData?.messageId ?? null,
      adjunto_url:    publicUrl,
      adjunto_nombre: file_name,
      adjunto_tipo:   mime_type,
    });

    await supabase.from("lat_conversaciones").update({
      ultimo_mensaje:     (caption?.trim() || labelMap[cat] || `📎 ${file_name}`).slice(0, 100),
      ultima_interaccion: new Date().toISOString(),
      en_foco:            true,
    }).eq("id", conversacion_id);

    return new Response(
      JSON.stringify({ ok: true, url: publicUrl, messageId: gupshupData?.messageId }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );

  } catch (err: any) {
    console.error("wpp-send-media error:", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});

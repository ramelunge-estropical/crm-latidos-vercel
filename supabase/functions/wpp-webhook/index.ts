/**
 * wpp-webhook — Supabase Edge Function
 *
 * Recibe mensajes entrantes de WhatsApp Business API y los persiste
 * en las tablas lat_conversaciones + lat_mensajes.
 *
 * Soporta:
 *  - Mensajes de texto, imagen, documento, audio (notas de voz)
 *  - Estados de entrega: sent / delivered / read / failed
 *  - Descarga + persistencia de adjuntos en bucket lat-adjuntos
 *
 * Compatible con: Meta Cloud API, Gupshup, WATI, 360dialog
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN          = Deno.env.get("WPP_VERIFY_TOKEN") ?? "latidos_wpp_2026";
const GUPSHUP_API_KEY       = Deno.env.get("GUPSHUP_API_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BUCKET = "lat-adjuntos";

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

function extFromMime(mime?: string | null, fallbackName?: string | null): string {
  if (mime?.startsWith("image/")) return mime.split("/")[1].split(";")[0] || "jpg";
  if (mime?.startsWith("audio/")) {
    const sub = mime.split("/")[1].split(";")[0];
    if (sub === "ogg" || sub === "opus") return "ogg";
    if (sub === "mpeg") return "mp3";
    return sub || "ogg";
  }
  if (mime?.startsWith("video/")) return mime.split("/")[1].split(";")[0] || "mp4";
  if (fallbackName?.includes(".")) return fallbackName.split(".").pop()!.toLowerCase();
  return "bin";
}

function categoryFromMime(mime?: string | null): "image" | "audio" | "video" | "document" {
  if (!mime) return "document";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

function guessMimeFromType(kind?: string | null, fallbackName?: string | null): string {
  const rawKind = (kind ?? "").toLowerCase();
  if (rawKind === "image") return "image/jpeg";
  if (rawKind === "audio" || rawKind === "voice") return "audio/ogg";
  if (rawKind === "video") return "video/mp4";
  if (rawKind === "document" || rawKind === "file") {
    const ext = extFromMime(undefined, fallbackName);
    if (ext === "pdf") return "application/pdf";
    return "application/octet-stream";
  }
  return "application/octet-stream";
}

function fileNameFromUrl(url?: string | null, fallbackName?: string | null) {
  if (fallbackName) return fallbackName;
  if (!url) return null;
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").pop();
    return last ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function extractMediaInfo(kind: string, payload: Record<string, any>, inner: Record<string, any>) {
  const branch = inner?.[kind] ?? payload?.[kind] ?? {};
  const urls = [
    branch?.url,
    branch?.link,
    branch?.originalUrl,
    branch?.previewUrl,
    branch?.downloadUrl,
    branch?.fileUrl,
    inner?.url,
    inner?.link,
    inner?.originalUrl,
    inner?.previewUrl,
    inner?.mediaUrl,
    inner?.fileUrl,
    inner?.urls?.original,
    inner?.urls?.preview,
    payload?.url,
    payload?.link,
    payload?.originalUrl,
    payload?.previewUrl,
    payload?.mediaUrl,
  ];

  const mimeType = pickFirstString(
    branch?.contentType,
    branch?.mime_type,
    branch?.mimeType,
    inner?.contentType,
    inner?.mime_type,
    inner?.mimeType,
    payload?.contentType,
    payload?.mime_type,
    payload?.mimeType,
  ) ?? guessMimeFromType(kind, pickFirstString(branch?.name, branch?.filename, inner?.name, inner?.filename));

  const fileName = pickFirstString(branch?.name, branch?.filename, inner?.name, inner?.filename) ?? fileNameFromUrl(pickFirstString(...urls));

  return {
    url: pickFirstString(...urls),
    mimeType,
    fileName,
  };
}

/** Sube binario al bucket y devuelve la public URL */
async function uploadBinary(buf: ArrayBuffer, mime: string, originalName?: string | null): Promise<{ url: string; path: string } | null> {
  try {
    const ext  = extFromMime(mime, originalName);
    const path = `inbound/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, new Uint8Array(buf), {
      contentType: mime || "application/octet-stream",
      upsert: false,
    });
    if (error) { console.error("upload error:", error); return null; }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
  } catch (e) {
    console.error("uploadBinary error:", e);
    return null;
  }
}

/** Descarga y persiste un media de Gupshup (URL directa) */
async function downloadAndStoreMedia(url: string, mimeHint?: string | null, fileName?: string | null) {
  try {
    const res = await fetch(url, { headers: { "apikey": GUPSHUP_API_KEY } });
    if (!res.ok) {
      console.error("media download failed", res.status, url);
      return null;
    }
    const mime = res.headers.get("content-type") ?? mimeHint ?? "application/octet-stream";
    const buf  = await res.arrayBuffer();
    return await uploadBinary(buf, mime, fileName);
  } catch (e) {
    console.error("downloadAndStoreMedia error:", e);
    return null;
  }
}

/** Descarga media de Meta Cloud API (requiere 2 calls + bearer token) */
async function downloadMetaMedia(mediaId: string, accessToken: string, mimeHint?: string | null) {
  try {
    const meta = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meta.ok) return null;
    const { url, mime_type } = await meta.json();
    const file = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!file.ok) return null;
    const buf  = await file.arrayBuffer();
    const mime = file.headers.get("content-type") ?? mime_type ?? mimeHint ?? "application/octet-stream";
    return await uploadBinary(buf, mime);
  } catch (e) {
    console.error("downloadMetaMedia error:", e);
    return null;
  }
}

/** Busca conversación activa por teléfono o crea una nueva */
async function findOrCreateConversacion(telefono: string, clienteNombre: string | null): Promise<string> {
  const phone = normalizePhone(telefono);

  const { data: existing } = await supabase
    .from("lat_conversaciones")
    .select("id")
    .eq("telefono", phone)
    .neq("estado", "finalizado")
    .order("ultima_interaccion", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre_completo")
    .or(`telefono.eq.${phone},telefono.eq.+${phone}`)
    .limit(1)
    .maybeSingle();

  const { data: conv, error } = await supabase
    .from("lat_conversaciones")
    .insert({
      telefono:         phone,
      canal:            "whatsapp",
      estado:           "nuevo",
      prioridad:        "media",
      cliente_id:       cliente?.id ?? null,
      cliente_nombre:   cliente?.nombre_completo ?? clienteNombre ?? `+${phone}`,
      ventana_whatsapp: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error) throw error;
  return conv!.id;
}

/** Actualiza estado de un mensaje outbound por wpp_message_id */
async function updateMessageStatus(wppId: string, newStatus: string) {
  // status priority: enviado < entregado < leido < fallido (no degradar)
  const order: Record<string, number> = { enviado: 1, entregado: 2, leido: 3, fallido: 4 };

  const { data: msg } = await supabase
    .from("lat_mensajes")
    .select("id, estado")
    .eq("wpp_message_id", wppId)
    .maybeSingle();

  if (!msg) return;
  const cur = (order[msg.estado ?? "enviado"] ?? 0);
  const nxt = (order[newStatus] ?? 0);
  if (nxt < cur && newStatus !== "fallido") return;

  await supabase.from("lat_mensajes").update({ estado: newStatus }).eq("id", msg.id);
}

async function updateMessageStatusByCandidates(ids: Array<string | null | undefined>, newStatus: string) {
  for (const id of ids) {
    if (!id) continue;
    await updateMessageStatus(id, newStatus);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // GET: verificación Meta
  if (req.method === "GET") {
    const url        = new URL(req.url);
    const mode       = url.searchParams.get("hub.mode");
    const token      = url.searchParams.get("hub.verify_token");
    const challenge  = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

  try {
    // ── Gupshup format ─────────────────────────────────────────────────────
    // Body: { app, type: "message"|"message-event", payload: {...} }
    if (body?.app !== undefined || body?.payload?.source) {
      const type    = body.type ?? body.payload?.type ?? "";
      const payload = body.payload ?? {};

      // Eventos de estado: enqueued/sent/delivered/read/failed
        if (type === "message-event" || ["enqueued","sent","delivered","read","failed"].includes(payload?.type)) {
        const evType = payload.type ?? type;
          const map: Record<string, string> = {
            enqueued: "pendiente",
            sent: "enviado",
            delivered: "entregado",
            read: "leido",
            failed: "fallido",
          };
          await updateMessageStatusByCandidates([
            payload.id,
            payload.gsId,
            payload.messageId,
            payload.whatsappMessageId,
            payload.payload?.id,
            payload.payload?.gsId,
            payload.payload?.messageId,
            payload.payload?.whatsappMessageId,
          ], map[evType] ?? "enviado");
        return new Response("OK", { status: 200 });
      }

      // Mensajes entrantes
      const telefono = payload.source ?? payload.sender?.phone ?? "";
      const nombre   = payload.sender?.name ?? null;
      const wppId    = payload.id ?? null;
      const inner    = payload.payload ?? {};
      const innerTyp = (inner.type ?? payload.type ?? "text") as string;

      if (!telefono) return new Response("OK", { status: 200 });

      const convId = await findOrCreateConversacion(telefono, nombre);

      let contenido = inner.text ?? inner.caption ?? "";
      let adjUrl: string | null = null;
      let adjNom: string | null = null;
      let adjTipo: string | null = null;

      if (innerTyp === "text") {
        contenido = inner.text ?? "[mensaje vacío]";
      } else if (["image","audio","voice","video","file","document","sticker"].includes(innerTyp)) {
        const media = extractMediaInfo(innerTyp, payload, inner);
        const mediaUrl = media.url;
        const mimeType = media.mimeType;
        const fileName = media.fileName;
        if (mediaUrl) {
          const stored = await downloadAndStoreMedia(mediaUrl, mimeType, fileName);
          adjUrl  = stored?.url ?? mediaUrl;
          adjNom  = fileName ?? `${innerTyp}.${extFromMime(mimeType, fileName)}`;
          adjTipo = mimeType ?? guessMimeFromType(innerTyp, fileName);
        }
        if (!contenido) {
          const labelMap: Record<string,string> = { image:"📷 Imagen", audio:"🎤 Nota de voz", voice:"🎤 Nota de voz", video:"🎥 Video", document:"📎 Documento", file:"📎 Archivo", sticker:"😀 Sticker" };
          contenido = labelMap[innerTyp] ?? `[${innerTyp}]`;
        }
      } else {
        contenido = `[${innerTyp}]`;
      }

      await supabase.from("lat_mensajes").insert({
        conversacion_id: convId,
        tipo:            "inbound",
        contenido,
        estado:          "entregado",
        wpp_message_id:  wppId,
        adjunto_url:     adjUrl,
        adjunto_nombre:  adjNom,
        adjunto_tipo:    adjTipo,
      });

      return new Response("OK", { status: 200 });
    }

    // ── Meta Cloud API format ──────────────────────────────────────────────
    if (body?.object === "whatsapp_business_account" || body?.entry) {
      const metaToken = Deno.env.get("META_WPP_ACCESS_TOKEN") ?? "";
      for (const entry of (body.entry ?? [])) {
        for (const change of (entry.changes ?? [])) {
          // Status updates
          for (const st of (change.value?.statuses ?? [])) {
            const map: Record<string,string> = { sent:"enviado", delivered:"entregado", read:"leido", failed:"fallido" };
            await updateMessageStatus(st.id, map[st.status] ?? "enviado");
          }

          const messages = change.value?.messages ?? [];
          const contacts = change.value?.contacts ?? [];

          for (const msg of messages) {
            const telefono    = msg.from;
            const contactName = contacts.find((c: any) => c.wa_id === msg.from)?.profile?.name ?? null;
            const wppId       = msg.id;
            const convId      = await findOrCreateConversacion(telefono, contactName);

            let contenido = "";
            let adjUrl: string | null = null;
            let adjNom: string | null = null;
            let adjTipo: string | null = null;

            if (msg.type === "text") {
              contenido = msg.text?.body ?? "";
            } else if (["image","audio","voice","video","document","sticker"].includes(msg.type)) {
              const mediaObj = msg[msg.type] ?? {};
              const mimeType = mediaObj.mime_type ?? guessMimeFromType(msg.type, mediaObj.filename ?? null);
              const fileName = mediaObj.filename ?? fileNameFromUrl(mediaObj.link ?? mediaObj.url ?? null);
              if (mediaObj.id && metaToken) {
                const stored = await downloadMetaMedia(mediaObj.id, metaToken, mimeType);
                if (stored) {
                  adjUrl  = stored.url;
                  adjNom  = fileName ?? `${msg.type}.${extFromMime(mimeType, fileName)}`;
                  adjTipo = mimeType;
                }
              } else if (mediaObj.link || mediaObj.url) {
                adjUrl = mediaObj.link ?? mediaObj.url;
                adjNom = fileName ?? `${msg.type}.${extFromMime(mimeType, fileName)}`;
                adjTipo = mimeType;
              }
              const labelMap: Record<string,string> = { image:"📷 Imagen", audio:"🎤 Nota de voz", voice:"🎤 Nota de voz", video:"🎥 Video", document:"📎 Documento", sticker:"😀 Sticker" };
              contenido = mediaObj.caption ?? labelMap[msg.type] ?? `[${msg.type}]`;
            } else {
              contenido = `[${msg.type}]`;
            }

            await supabase.from("lat_mensajes").insert({
              conversacion_id: convId,
              tipo:            "inbound",
              contenido,
              estado:          "entregado",
              wpp_message_id:  wppId,
              adjunto_url:     adjUrl,
              adjunto_nombre:  adjNom,
              adjunto_tipo:    adjTipo,
            });
          }
        }
      }
      return new Response("OK", { status: 200 });
    }

    // ── WATI format ────────────────────────────────────────────────────────
    if (body?.waId || body?.senderName) {
      const telefono = body.waId ?? body.from;
      const nombre   = body.senderName ?? null;
      const convId   = await findOrCreateConversacion(telefono, nombre);
      const mediaUrl = body.data ?? body.fileUrl ?? null;
      const mime     = body.mimeType ?? null;
      let adjUrl: string | null = null;
      let adjNom: string | null = null;
      let adjTipo: string | null = null;
      if (mediaUrl) {
        const stored = await downloadAndStoreMedia(mediaUrl, mime, body.fileName);
        if (stored) { adjUrl = stored.url; adjNom = body.fileName ?? null; adjTipo = mime; }
      }
      await supabase.from("lat_mensajes").insert({
        conversacion_id: convId,
        tipo:            "inbound",
        contenido:       body.text ?? body.caption ?? body.fileName ?? "[adjunto]",
        estado:          "entregado",
        wpp_message_id:  body.id ?? null,
        adjunto_url:     adjUrl,
        adjunto_nombre:  adjNom,
        adjunto_tipo:    adjTipo,
      });
      return new Response("OK", { status: 200 });
    }

    console.warn("wpp-webhook: formato desconocido", JSON.stringify(body).slice(0, 300));
    return new Response("OK", { status: 200 });

  } catch (err) {
    console.error("wpp-webhook error:", err);
    return new Response("Internal error", { status: 500 });
  }
});

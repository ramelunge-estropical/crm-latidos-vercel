/**
 * wpp-webhook — Supabase Edge Function
 *
 * Recibe mensajes entrantes de WhatsApp Business API y los persiste
 * en las tablas lat_conversaciones + lat_mensajes.
 *
 * Compatible con:
 *  - Meta Cloud API (oficial)
 *  - WATI
 *  - Gupshup
 *  - 360dialog
 *
 * URL del webhook: https://<project>.supabase.co/functions/v1/wpp-webhook
 *
 * Variables de entorno requeridas (Supabase → Project → Edge Functions → Secrets):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   WPP_VERIFY_TOKEN   → token que vos elegís para verificar el webhook con Meta
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const VERIFY_TOKEN = Deno.env.get("WPP_VERIFY_TOKEN") ?? "latidos_wpp_2026";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normaliza número de teléfono: quita + y espacios */
function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

/** Busca conversación activa por teléfono (últimas 24h) */
async function findOrCreateConversacion(telefono: string, clienteNombre: string | null): Promise<string> {
  const phone = normalizePhone(telefono);

  // Buscar conversación reciente (< 24h)
  const { data: existing } = await supabase
    .from("lat_conversaciones")
    .select("id")
    .eq("telefono", phone)
    .neq("estado", "finalizado")
    .order("ultima_interaccion", { ascending: false })
    .limit(1)
    .single();

  if (existing) return existing.id;

  // Buscar si el teléfono pertenece a un cliente registrado
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre_completo")
    .or(`telefono.eq.${phone},telefono.eq.+${phone}`)
    .limit(1)
    .single();

  // Crear nueva conversación
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

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // ── GET: verificación del webhook (Meta / WhatsApp Cloud API) ─────────────
  if (req.method === "GET") {
    const url    = new URL(req.url);
    const mode   = url.searchParams.get("hub.mode");
    const token  = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ── POST: mensaje entrante ────────────────────────────────────────────────
  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    try {
      // ── Meta Cloud API format ──
      if (body?.object === "whatsapp_business_account" || body?.entry) {
        for (const entry of (body.entry ?? [])) {
          for (const change of (entry.changes ?? [])) {
            const messages = change.value?.messages ?? [];
            const contacts = change.value?.contacts ?? [];

            for (const msg of messages) {
              if (msg.type !== "text" && msg.type !== "image" && msg.type !== "document") continue;

              const telefono     = msg.from;
              const contactName  = contacts.find((c: any) => c.wa_id === msg.from)?.profile?.name ?? null;
              const contenido    = msg.text?.body ?? msg.image?.caption ?? msg.document?.filename ?? "[adjunto]";
              const wppMessageId = msg.id;

              const convId = await findOrCreateConversacion(telefono, contactName);

              await supabase.from("lat_mensajes").insert({
                conversacion_id: convId,
                tipo:            "inbound",
                contenido,
                estado:          "leido",
                wpp_message_id:  wppMessageId,
              });
            }
          }
        }
        return new Response("OK", { status: 200 });
      }

      // ── WATI format ──
      if (body?.waId || body?.senderName) {
        const telefono  = body.waId ?? body.from;
        const nombre    = body.senderName ?? null;
        const contenido = body.text ?? body.caption ?? body.fileName ?? "[adjunto]";
        const wppId     = body.id ?? null;

        const convId = await findOrCreateConversacion(telefono, nombre);
        await supabase.from("lat_mensajes").insert({
          conversacion_id: convId,
          tipo:            "inbound",
          contenido,
          estado:          "leido",
          wpp_message_id:  wppId,
        });
        return new Response("OK", { status: 200 });
      }

      // ── Gupshup format ──
      if (body?.app || body?.payload?.source) {
        const payload  = body.payload ?? {};
        const telefono = payload.source ?? payload.sender?.phone ?? "";
        const nombre   = payload.sender?.name ?? null;
        const contenido = payload.payload?.text ?? payload.payload?.url ?? "[adjunto]";
        const wppId     = payload.id ?? null;

        if (telefono) {
          const convId = await findOrCreateConversacion(telefono, nombre);
          await supabase.from("lat_mensajes").insert({
            conversacion_id: convId,
            tipo:            "inbound",
            contenido,
            estado:          "leido",
            wpp_message_id:  wppId,
          });
        }
        return new Response("OK", { status: 200 });
      }

      // Formato desconocido — loguear y retornar OK (para no reintentos)
      console.warn("wpp-webhook: formato desconocido", JSON.stringify(body).slice(0, 300));
      return new Response("OK", { status: 200 });

    } catch (err) {
      console.error("wpp-webhook error:", err);
      return new Response("Internal error", { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});

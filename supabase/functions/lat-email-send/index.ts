/**
 * lat-email-send — Envío de correos vía Gmail API (OAuth2)
 * Usa los mismos tokens OAuth que lat-email-agent (lat_bot_config canal=email).
 * No requiere credenciales SMTP.
 *
 * Body:
 *   { conversacion_id, to, cc?, bcc?, subject, body_html?, body_text?,
 *     in_reply_to?, references?, thread_id?, autor_nombre?,
 *     attachments?: [{ name, mime, base64 }] }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GMAIL_API        = "https://gmail.googleapis.com/gmail/v1/users/me";
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID")!;
const GOOGLE_SECRET    = Deno.env.get("GMAIL_CLIENT_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── OAuth token helper (igual que lat-email-agent) ────────────────────────────

async function getAccessToken(): Promise<string> {
  const { data } = await supabase
    .from("lat_bot_config")
    .select("gmail_access_token, gmail_refresh_token, gmail_token_expiry")
    .eq("canal", "email")
    .maybeSingle();

  if (!data?.gmail_refresh_token) {
    throw new Error("Gmail no autorizado. Ejecuta el flujo OAuth primero desde Configuración.");
  }

  // Return cached token if still valid (60s buffer)
  if (
    data.gmail_access_token && data.gmail_token_expiry &&
    new Date(data.gmail_token_expiry).getTime() > Date.now() + 60_000
  ) {
    return data.gmail_access_token;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_SECRET,
      refresh_token: data.gmail_refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh falló: ${await res.text()}`);

  const tokens = await res.json();
  const expiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
  await supabase.from("lat_bot_config").update({
    gmail_access_token: tokens.access_token,
    gmail_token_expiry: expiry,
    updated_at: new Date().toISOString(),
  }).eq("canal", "email");

  return tokens.access_token;
}

// ── MIME builder ──────────────────────────────────────────────────────────────

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  const bytes = new TextEncoder().encode(subject);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

/** String → base64 (handles UTF-8 safely) */
function strToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** base64url encode for Gmail API `raw` field */
function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildMime(opts: {
  from: string;
  fromName?: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  messageId: string;
  inReplyTo?: string | null;
  references?: string | null;
  attachments: { name: string; mime: string; base64: string }[];
}): string {
  const from = opts.fromName ? `"${opts.fromName}" <${opts.from}>` : opts.from;
  const boundary = `----=_Part_${crypto.randomUUID().replace(/-/g, "")}`;

  const headers = [
    `From: ${from}`,
    `To: ${opts.to.join(", ")}`,
    opts.cc.length  ? `Cc: ${opts.cc.join(", ")}`  : "",
    opts.bcc.length ? `Bcc: ${opts.bcc.join(", ")}` : "",
    `Subject: ${encodeSubject(opts.subject)}`,
    `MIME-Version: 1.0`,
    `Message-ID: ${opts.messageId}`,
    opts.inReplyTo  ? `In-Reply-To: ${opts.inReplyTo}`   : "",
    opts.references ? `References: ${opts.references}` : "",
  ].filter(Boolean).join("\r\n");

  const htmlBase64 = strToBase64(opts.html);

  // Simple message (no attachments)
  if (opts.attachments.length === 0) {
    return [
      headers,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      htmlBase64,
    ].join("\r\n");
  }

  // Multipart/mixed with HTML + attachments
  const parts: string[] = [
    headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    htmlBase64,
  ];

  for (const att of opts.attachments) {
    const data = att.base64.replace(/^data:[^;]+;base64,/, "");
    const safeName = encodeSubject(att.name); // RFC 2047 for non-ASCII filenames
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.mime}; name="${safeName}"`,
      `Content-Disposition: attachment; filename="${safeName}"`,
      "Content-Transfer-Encoding: base64",
      "",
      data,
    );
  }

  parts.push(`--${boundary}--`);
  return parts.join("\r\n");
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const {
      conversacion_id, to = [], cc = [], bcc = [],
      subject = "(sin asunto)", body_html, body_text,
      in_reply_to, references, thread_id,
      autor_nombre, attachments = [],
    } = body;

    if (!conversacion_id || !Array.isArray(to) || to.length === 0) {
      return new Response(JSON.stringify({ error: "conversacion_id y to son requeridos" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken();

    // Get sender's Gmail address from profile
    const profileRes = await fetch(`${GMAIL_API}/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = profileRes.ok ? await profileRes.json() : {};
    const fromEmail: string = profile.emailAddress ?? "microvoz@estropical.com";

    const html = body_html ?? (body_text ? `<pre style="font-family:inherit">${body_text}</pre>` : "<p></p>");
    const text = body_text ?? htmlToText(html);
    const messageId = `<${crypto.randomUUID()}@estropical.com>`;

    const mime = buildMime({
      from: fromEmail,
      fromName: autor_nombre ?? null,
      to, cc, bcc, subject, html, messageId,
      inReplyTo: in_reply_to ?? null,
      references: references ?? null,
      attachments,
    });

    // Send via Gmail API
    const sendPayload: Record<string, unknown> = { raw: toBase64Url(mime) };
    if (thread_id) sendPayload.threadId = thread_id;

    const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendPayload),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      throw new Error(`Gmail API ${sendRes.status}: ${errText}`);
    }

    const gmailMsg = await sendRes.json();

    // Persist outbound message in lat_mensajes
    const { data: msg, error: insErr } = await supabase
      .from("lat_mensajes")
      .insert({
        conversacion_id,
        tipo:              "outbound",
        contenido:         subject,
        estado:            "enviado",
        autor_nombre,
        email_subject:     subject,
        email_from_name:   autor_nombre,
        email_from_email:  fromEmail,
        email_to:          to,
        email_cc:          cc,
        email_bcc:         bcc,
        email_body_html:   html,
        email_body_text:   text,
        email_message_id:  messageId,
        email_thread_id:   thread_id ?? gmailMsg.threadId ?? null,
        email_in_reply_to: in_reply_to ?? null,
        email_references:  references ?? null,
        email_has_attachments: attachments.length > 0,
      })
      .select()
      .single();

    if (insErr) throw insErr;

    // Update conversation timestamp
    await supabase.from("lat_conversaciones").update({
      ultima_interaccion: new Date().toISOString(),
      ultimo_mensaje:     subject,
    }).eq("id", conversacion_id);

    return new Response(
      JSON.stringify({ ok: true, message_id: messageId, gmail_id: gmailMsg.id, mensaje: msg }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[lat-email-send] error:", err);
    return new Response(
      JSON.stringify({ error: err.message ?? String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});

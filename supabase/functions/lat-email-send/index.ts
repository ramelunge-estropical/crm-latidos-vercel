/**
 * lat-email-send — Envío de correos vía SMTP para LAT.
 *
 * Secrets:
 *   EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_USER, EMAIL_PASSWORD
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Body:
 *   {
 *     conversacion_id: string,
 *     to: string[], cc?: string[], bcc?: string[],
 *     subject: string,
 *     body_html?: string, body_text?: string,
 *     in_reply_to?: string, references?: string,
 *     thread_id?: string,
 *     autor_nombre?: string,
 *     attachments?: { name: string, mime: string, base64: string }[]
 *   }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

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

    const host = Deno.env.get("EMAIL_SMTP_HOST")!;
    const port = Number(Deno.env.get("EMAIL_SMTP_PORT") ?? "465");
    const user = Deno.env.get("EMAIL_USER")!;
    const pass = Deno.env.get("EMAIL_PASSWORD")!;

    const client = new SMTPClient({
      connection: {
        hostname: host,
        port,
        tls: port === 465,
        auth: { username: user, password: pass },
      },
    });

    const html = body_html ?? (body_text ? `<pre>${body_text}</pre>` : "");
    const text = body_text ?? htmlToText(html);

    const messageId = `<${crypto.randomUUID()}@${host}>`;
    const headers: Record<string, string> = {};
    if (in_reply_to) headers["In-Reply-To"] = in_reply_to;
    if (references) headers["References"] = references;
    headers["Message-ID"] = messageId;

    const sendOpts: any = {
      from: autor_nombre ? `${autor_nombre} <${user}>` : user,
      to, cc, bcc,
      subject,
      content: text || " ",
      html,
      headers,
    };

    if (attachments.length > 0) {
      sendOpts.attachments = attachments.map((a: any) => ({
        filename: a.name,
        contentType: a.mime,
        encoding: "base64",
        content: a.base64.replace(/^data:[^;]+;base64,/, ""),
      }));
    }

    await client.send(sendOpts);
    await client.close();

    // Persist outbound message
    const { data: msg, error } = await supabase
      .from("lat_mensajes")
      .insert({
        conversacion_id,
        tipo: "outbound",
        contenido: subject,
        estado: "enviado",
        autor_nombre,
        email_subject: subject,
        email_from_name: autor_nombre,
        email_from_email: user,
        email_to: to,
        email_cc: cc,
        email_bcc: bcc,
        email_body_html: html,
        email_body_text: text,
        email_message_id: messageId,
        email_thread_id: thread_id ?? null,
        email_in_reply_to: in_reply_to ?? null,
        email_references: references ?? null,
        email_has_attachments: attachments.length > 0,
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, message_id: messageId, mensaje: msg }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("lat-email-send error:", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

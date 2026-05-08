/**
 * lat-email-agent — Agente IA de email para Estropical
 *
 * Flujo:
 *   1. Conecta a aplataformas@estropical.com via IMAP (monitorea alias microvoz@estropical.com)
 *   2. Descarga emails no leídos no procesados
 *   3. Por cada email: parsea MIME completo (HTML + texto + adjuntos)
 *   4. Analiza con GPT, guarda en lat_conversaciones + lat_mensajes con todos los campos email_*
 *   5. Si puede responder solo → responde y deriva; si no → solo deriva al asesor
 *
 * Secrets requeridos:
 *   EMAIL_USER, EMAIL_PASSWORD, EMAIL_IMAP_HOST, EMAIL_IMAP_PORT
 *   EMAIL_SMTP_HOST, EMAIL_SMTP_PORT
 *   OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMAIL_USER   = Deno.env.get("EMAIL_USER")!;
const EMAIL_PASS   = Deno.env.get("EMAIL_PASSWORD")!;
const EMAIL_INBOX  = Deno.env.get("EMAIL_INBOX") ?? "microvoz@estropical.com";
const SMTP_HOST    = Deno.env.get("EMAIL_SMTP_HOST") ?? "smtp.gmail.com";

// Gmail API (OAuth2) — replaces IMAP
const GMAIL_API          = "https://gmail.googleapis.com/gmail/v1/users/me";
const GOOGLE_CLIENT_ID_G = Deno.env.get("GMAIL_CLIENT_ID")!;
const GOOGLE_SECRET      = Deno.env.get("GMAIL_CLIENT_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const MODEL    = "gpt-4o-mini";
const MAX_EMAIL_BODY = 3000;
const BUCKET   = "lat-adjuntos";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailAttachmentData {
  filename: string;
  mimeType: string;
  data: Uint8Array;
  inline: boolean;
  contentId?: string;
}

interface ParsedEmail {
  messageId:   string;
  from:        string;
  fromName:    string | null;
  to:          string;
  subject:     string;
  bodyText:    string | null;
  bodyHtml:    string | null;
  date:        Date;
  replyTo:     string | null;
  inlineImages: { contentId: string; mimeType: string; data: Uint8Array }[];
  attachments: EmailAttachmentData[];
}

interface ExtractedParts {
  bodyHtml:     string | null;
  bodyText:     string | null;
  inlineImages: { contentId: string; mimeType: string; data: Uint8Array }[];
  attachments:  EmailAttachmentData[];
}

// ─── IMAP client ──────────────────────────────────────────────────────────────

async function imapConnect(): Promise<Deno.TlsConn> {
  return await Deno.connectTls({ hostname: IMAP_HOST, port: IMAP_PORT });
}

async function imapReadLine(conn: Deno.TlsConn): Promise<string> {
  const buf = new Uint8Array(1);
  let line = "";
  while (true) {
    const n = await conn.read(buf);
    if (n === null) break;
    const ch = new TextDecoder().decode(buf.subarray(0, n));
    line += ch;
    if (line.endsWith("\r\n")) return line.trimEnd();
  }
  return line;
}

async function imapReadBytes(conn: Deno.TlsConn, count: number): Promise<string> {
  const chunks: Uint8Array[] = [];
  let remaining = count;
  while (remaining > 0) {
    const buf = new Uint8Array(Math.min(remaining, 4096));
    const n = await conn.read(buf);
    if (n === null) break;
    chunks.push(buf.subarray(0, n));
    remaining -= n;
  }
  return new TextDecoder().decode(
    chunks.reduce((a, b) => { const c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c; }, new Uint8Array(0))
  );
}

async function imapSend(conn: Deno.TlsConn, cmd: string): Promise<void> {
  await conn.write(new TextEncoder().encode(cmd + "\r\n"));
}

async function imapCommand(conn: Deno.TlsConn, tag: string, cmd: string): Promise<string[]> {
  await imapSend(conn, `${tag} ${cmd}`);
  const lines: string[] = [];
  while (true) {
    const line = await imapReadLine(conn);
    lines.push(line);
    if (line.startsWith(`${tag} OK`) || line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) break;
  }
  return lines;
}

// ─── Header decode helpers ────────────────────────────────────────────────────

function decodeBase64(str: string): string {
  try { return atob(str.replace(/\s/g, "")); } catch { return str; }
}

function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=\r?\n/g, "")
    .replace(/=([A-Fa-f0-9]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function decodeMimeWord(word: string): string {
  const m = word.match(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/);
  if (!m) return word;
  const [, charset, enc, val] = m;
  let decoded: string;
  if (enc.toUpperCase() === "B") {
    try {
      const bytes = Uint8Array.from(atob(val), c => c.charCodeAt(0));
      decoded = new TextDecoder(charset, { fatal: false }).decode(bytes);
    } catch { decoded = decodeBase64(val); }
  } else {
    decoded = decodeQuotedPrintable(val.replace(/_/g, " "));
  }
  return decoded;
}

function decodeMimeHeader(header: string): string {
  return header.replace(/=\?[^?]+\?[BbQq]\?[^?]*\?=/g, decodeMimeWord).trim();
}

function extractEmailAddress(from: string): { email: string; name: string | null } {
  const m = from.match(/^(.*?)\s*<([^>]+)>/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, "") || null, email: m[2].trim() };
  return { email: from.trim(), name: null };
}

// ─── MIME Parser ──────────────────────────────────────────────────────────────

function mimeParseHeaders(section: string): Record<string, string> {
  const h: Record<string, string> = {};
  const lines = section.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/);
  for (const l of lines) {
    const i = l.indexOf(":");
    if (i < 0) continue;
    h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
  }
  return h;
}

function mimeGetParam(header: string, param: string): string | null {
  const re = new RegExp(`${param}\\s*=\\s*["']?([^"'\\s;]+)["']?`, "i");
  const m = header.match(re);
  return m ? m[1] : null;
}

function mimeDecodeBodyText(body: string, cte: string, charset: string): string {
  const enc = cte.toLowerCase().trim();
  const cs  = charset || "utf-8";

  // Helper: convert a "binary string" (char codes = byte values) to proper Unicode
  const bytesToString = (s: string): string => {
    try {
      const bytes = Uint8Array.from(s, c => c.charCodeAt(0));
      return new TextDecoder(cs, { fatal: false }).decode(bytes);
    } catch { return s; }
  };

  if (enc === "base64") {
    try {
      const bytes = Uint8Array.from(atob(body.replace(/\s/g, "")), c => c.charCodeAt(0));
      return new TextDecoder(cs, { fatal: false }).decode(bytes);
    } catch { return body; }
  }
  if (enc === "quoted-printable") {
    // QP decoding yields a "binary string"; re-interpret with the declared charset
    return bytesToString(decodeQuotedPrintable(body));
  }
  // 7bit / 8bit: body was decoded from raw bytes — apply charset if not plain ASCII
  if (cs !== "us-ascii" && cs !== "ascii") {
    return bytesToString(body);
  }
  return body;
}

function mimeDecodeBinary(body: string, cte: string): Uint8Array {
  if (cte.toLowerCase().trim() === "base64") {
    try { return Uint8Array.from(atob(body.replace(/\s/g, "")), c => c.charCodeAt(0)); } catch {}
  }
  return new TextEncoder().encode(body);
}

function mimeSplitParts(body: string, boundary: string): string[] {
  const delim = "--" + boundary;
  const parts: string[] = [];
  // Normalize line endings
  const normalized = body.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  let inPart = false;
  let current: string[] = [];

  for (const line of lines) {
    const stripped = line.trimEnd();
    if (stripped === delim || stripped === delim + " ") {
      if (inPart && current.length > 0) {
        parts.push(current.join("\n"));
        current = [];
      }
      inPart = true;
    } else if (stripped === delim + "--") {
      if (inPart && current.length > 0) {
        parts.push(current.join("\n"));
      }
      break;
    } else if (inPart) {
      current.push(line);
    }
  }

  return parts.filter(p => p.trim());
}

function mimeExtractParts(raw: string, result: ExtractedParts): void {
  // Find header/body separator
  const normalized = raw.replace(/\r\n/g, "\n");
  const sepIdx = normalized.indexOf("\n\n");
  if (sepIdx === -1) return;

  const headerSection = normalized.slice(0, sepIdx);
  const bodySection   = normalized.slice(sepIdx + 2);
  const hdrs = mimeParseHeaders(headerSection);

  const ct       = hdrs["content-type"] ?? "text/plain";
  const cte      = hdrs["content-transfer-encoding"] ?? "7bit";
  const mainType = ct.split(";")[0].trim().toLowerCase();
  const charset  = mimeGetParam(ct, "charset") ?? "utf-8";
  const boundary = mimeGetParam(ct, "boundary");
  const cidRaw   = hdrs["content-id"] ?? "";
  const contentId = cidRaw.replace(/[<>]/g, "").trim() || undefined;
  const disp      = hdrs["content-disposition"] ?? "";
  const dispType  = disp.split(";")[0].trim().toLowerCase();

  // Filename: prefer content-disposition, fallback to content-type name
  const rawFilename = mimeGetParam(disp, "filename\\*?") ?? mimeGetParam(ct, "name\\*?");
  const filename = rawFilename ? decodeMimeHeader(rawFilename) : null;

  // Recurse into multipart
  if (mainType.startsWith("multipart/") && boundary) {
    for (const part of mimeSplitParts(bodySection, boundary)) {
      mimeExtractParts(part, result);
    }
    return;
  }

  // text/html — use first found
  if (mainType === "text/html" && !result.bodyHtml) {
    result.bodyHtml = mimeDecodeBodyText(bodySection, cte, charset);
    return;
  }

  // text/plain — use first found
  if (mainType === "text/plain" && !result.bodyText) {
    result.bodyText = mimeDecodeBodyText(bodySection, cte, charset);
    return;
  }

  // Inline image with Content-ID
  if (mainType.startsWith("image/") && contentId) {
    result.inlineImages.push({
      contentId,
      mimeType: mainType,
      data: mimeDecodeBinary(bodySection, cte),
    });
    return;
  }

  // Regular attachment (has filename or explicit attachment disposition)
  if (filename || dispType === "attachment") {
    const isInline = dispType === "inline" || (!!contentId && dispType !== "attachment");
    result.attachments.push({
      filename: filename ?? `attachment.${mainType.split("/")[1] ?? "bin"}`,
      mimeType: mainType,
      data: mimeDecodeBinary(bodySection, cte),
      inline: isInline,
      contentId,
    });
  }
}

// ─── Parse full RFC822 email ──────────────────────────────────────────────────

function parseRawEmail(raw: string): Partial<ParsedEmail> {
  const normalized = raw.replace(/\r\n/g, "\n");
  const sepIdx = normalized.indexOf("\n\n");
  if (sepIdx === -1) return {};

  const headerSection = normalized.slice(0, sepIdx);
  const headers = mimeParseHeaders(headerSection);

  const fromRaw  = decodeMimeHeader(headers["from"] ?? "");
  const { email: fromEmail, name: fromName } = extractEmailAddress(fromRaw);
  const subject  = decodeMimeHeader(headers["subject"] ?? "(sin asunto)");
  const msgId    = headers["message-id"]?.replace(/[<>]/g, "").trim() ?? crypto.randomUUID();
  const replyTo  = headers["reply-to"] ? extractEmailAddress(decodeMimeHeader(headers["reply-to"])).email : null;

  // Parse original date from email header
  let date = new Date();
  if (headers["date"]) {
    const parsed = new Date(headers["date"]);
    if (!isNaN(parsed.getTime())) date = parsed;
  }

  // Extract all MIME parts
  const extracted: ExtractedParts = {
    bodyHtml: null, bodyText: null, inlineImages: [], attachments: [],
  };
  mimeExtractParts(normalized, extracted);

  // Fallback: if no parts found, treat body as flat text/html
  if (!extracted.bodyHtml && !extracted.bodyText) {
    const ct       = headers["content-type"] ?? "text/plain";
    const cte      = headers["content-transfer-encoding"] ?? "7bit";
    const charset  = mimeGetParam(ct, "charset") ?? "utf-8";
    const mainType = ct.split(";")[0].trim().toLowerCase();
    const bodyRaw  = normalized.slice(sepIdx + 2);
    const decoded  = mimeDecodeBodyText(bodyRaw, cte, charset);
    if (mainType.includes("html")) {
      extracted.bodyHtml = decoded;
    } else {
      extracted.bodyText = decoded;
    }
  }

  // Strip quoted reply lines from plain text
  const bodyText = extracted.bodyText
    ? extracted.bodyText.split("\n").filter(l => !l.trimStart().startsWith(">")).join("\n").trim()
    : null;

  return {
    messageId:    msgId,
    from:         fromEmail,
    fromName:     fromName ?? null,
    to:           EMAIL_USER,
    subject,
    bodyText:     bodyText?.slice(0, MAX_EMAIL_BODY) ?? null,
    bodyHtml:     extracted.bodyHtml ?? null,
    date,
    replyTo,
    inlineImages: extracted.inlineImages,
    attachments:  extracted.attachments,
  };
}

// ─── Gmail API helpers ────────────────────────────────────────────────────────

async function getGmailAccessToken(): Promise<string | null> {
  const { data } = await supabase
    .from("lat_bot_config")
    .select("gmail_access_token, gmail_refresh_token, gmail_token_expiry")
    .eq("canal", "email")
    .maybeSingle();

  if (!data?.gmail_refresh_token) {
    console.error("[gmail] No refresh token found — run Gmail OAuth first");
    return null;
  }

  // Return cached token if still valid (with 60s buffer)
  if (data.gmail_access_token && data.gmail_token_expiry &&
      new Date(data.gmail_token_expiry).getTime() > Date.now() + 60_000) {
    return data.gmail_access_token;
  }

  // Refresh
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID_G,
      client_secret: GOOGLE_SECRET,
      refresh_token: data.gmail_refresh_token,
      grant_type:    "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("[gmail] Token refresh failed:", await res.text());
    return null;
  }

  const tokens = await res.json();
  const expiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
  await supabase.from("lat_bot_config").update({
    gmail_access_token: tokens.access_token,
    gmail_token_expiry: expiry,
    updated_at:         new Date().toISOString(),
  }).eq("canal", "email");

  return tokens.access_token;
}

async function fetchUnreadEmailsGmail(): Promise<ParsedEmail[]> {
  const accessToken = await getGmailAccessToken();
  if (!accessToken) return [];

  // after:2026/04/24 catches last-week-of-April catch-up + all new emails going forward
  // No is:unread — picks up manually-read emails too; isProcessed() handles deduplication
  const query = `to:${EMAIL_INBOX} after:2026/04/24`;
  const listRes = await fetch(
    `${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!listRes.ok) {
    console.error("[gmail] List failed:", await listRes.text());
    return [];
  }

  const listData = await listRes.json();
  const messages: { id: string }[] = listData.messages ?? [];
  if (messages.length === 0) { console.log("[gmail] No candidate emails"); return []; }
  console.log(`[gmail] Found ${messages.length} candidate emails`);

  const emails: ParsedEmail[] = [];
  for (const { id } of messages) {
    const msgRes = await fetch(
      `${GMAIL_API}/messages/${id}?format=raw`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!msgRes.ok) continue;

    const msgData = await msgRes.json();
    if (!msgData.raw) continue;

    // Gmail returns base64url — convert to standard base64 then decode
    const raw = new TextDecoder().decode(
      Uint8Array.from(atob(msgData.raw.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)),
    );
    const parsed = parseRawEmail(raw) as ParsedEmail;
    if (parsed?.from) emails.push(parsed);
  }

  return emails;
}

// ─── Fetch unread emails via IMAP (legacy — kept for reference) ───────────────

async function fetchUnreadEmails(): Promise<ParsedEmail[]> {
  const conn = await imapConnect();
  try {
    await imapReadLine(conn); // greeting
    const loginResp = await imapCommand(conn, "a1", `LOGIN "${EMAIL_USER}" "${EMAIL_PASS}"`);
    if (!loginResp.some(l => l.startsWith("a1 OK"))) {
      console.error("[email] IMAP login failed:", loginResp.join("|"));
      return [];
    }
    await imapCommand(conn, "a2", "SELECT INBOX");
    const searchResp = await imapCommand(conn, "a3", `SEARCH UNSEEN SINCE 1-Apr-2026 TO "${EMAIL_INBOX}"`);
    const searchLine = searchResp.find(l => l.startsWith("* SEARCH")) ?? "";
    const uids = searchLine.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean);
    conn.close();

    if (uids.length === 0) {
      console.log("[email] No unread emails");
      return [];
    }
    console.log(`[email] Found ${uids.length} unread emails`);

    const emails: ParsedEmail[] = [];
    for (const uid of uids.slice(0, 10)) {
      const c2 = await imapConnect();
      try {
        await imapReadLine(c2);
        const lr = await imapCommand(c2, "b1", `LOGIN "${EMAIL_USER}" "${EMAIL_PASS}"`);
        if (!lr.some(l => l.startsWith("b1 OK"))) { c2.close(); continue; }
        await imapCommand(c2, "b2", "SELECT INBOX");
        await imapSend(c2, `b3 FETCH ${uid} RFC822`);
        let raw = "", done = false, octets = 0;
        while (!done) {
          const line = await imapReadLine(c2);
          if (line.includes("{") && line.includes("}")) {
            const m = line.match(/\{(\d+)\}/);
            if (m) { octets = parseInt(m[1]); raw = await imapReadBytes(c2, octets); }
          }
          if (line.startsWith("b3 OK") || line.startsWith("b3 NO") || line.startsWith("b3 BAD")) done = true;
          if (octets > 0 && raw.length >= octets) done = true;
        }
        if (raw) emails.push(parseRawEmail(raw) as ParsedEmail);
        c2.close();
      } catch (e) {
        console.error("[email] fetch uid error:", e);
        try { c2.close(); } catch { /* ignore */ }
      }
    }
    return emails;
  } catch (e) {
    console.error("[email] IMAP error:", e);
    try { conn.close(); } catch { /* ignore */ }
    return [];
  }
}

// ─── Supabase Storage upload ──────────────────────────────────────────────────

async function uploadEmailFile(
  data: Uint8Array,
  mimeType: string,
  filename: string,
  convId: string,
): Promise<string | null> {
  if (!data || data.length === 0) return null;
  try {
    const ext  = mimeType.split("/")[1]?.split(";")[0] ?? "bin";
    const path = `email/${convId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, data, {
      contentType: mimeType,
      upsert: false,
    });
    if (error) { console.error("upload error:", error); return null; }
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.error("uploadEmailFile error:", e);
    return null;
  }
}

// ─── SMTP send reply ──────────────────────────────────────────────────────────

async function sendEmailReply(to: string, subject: string, body: string, inReplyTo?: string): Promise<boolean> {
  try {
    const conn = await Deno.connectTls({ hostname: SMTP_HOST, port: 465 });
    const enc  = new TextEncoder();
    const dec  = new TextDecoder();
    const readLine = async () => { const buf = new Uint8Array(4096); const n = await conn.read(buf); return n ? dec.decode(buf.subarray(0, n)) : ""; };
    const send = async (cmd: string) => { await conn.write(enc.encode(cmd + "\r\n")); };
    await readLine();
    await send("EHLO crm.estropical.com");
    await readLine();
    await send("AUTH LOGIN");
    await readLine();
    await send(btoa(EMAIL_USER));
    await readLine();
    await send(btoa(EMAIL_PASS));
    const authResp = await readLine();
    if (!authResp.includes("235")) { conn.close(); return false; }
    await send(`MAIL FROM:<${EMAIL_USER}>`);
    await readLine();
    await send(`RCPT TO:<${to}>`);
    await readLine();
    await send("DATA");
    await readLine();
    const headers = [
      `From: Estropical <${EMAIL_USER}>`,
      `To: ${to}`,
      `Subject: ${subject.startsWith("Re:") ? subject : "Re: " + subject}`,
      `Content-Type: text/plain; charset=UTF-8`,
      inReplyTo ? `In-Reply-To: <${inReplyTo}>` : "",
      "",
    ].filter(Boolean).join("\r\n");
    await send(headers + "\r\n" + body + "\r\n.");
    await readLine();
    await send("QUIT");
    conn.close();
    return true;
  } catch (e) {
    console.error("[email] SMTP error:", e);
    return false;
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function isProcessed(messageId: string): Promise<boolean> {
  const { data } = await supabase
    .from("lat_email_procesados")
    .select("id")
    .eq("message_id", messageId)
    .maybeSingle();
  return !!data;
}

async function markProcessed(messageId: string, convId: string) {
  await supabase.from("lat_email_procesados").insert({ message_id: messageId, conversacion_id: convId });
}

// ── Routing engine ────────────────────────────────────────────────────────────
// Delega a lat-routing-engine el flujo completo: canal → reglas → cola → agente.

async function callRoutingEngine(
  convId:          string,
  subject:         string,
  bodyText:        string | null,
  remitente:       string,
  attachmentNames: string[],
): Promise<void> {
  try {
    const { data: canal } = await supabase
      .from("lat_canales")
      .select("id")
      .eq("tipo", "email")
      .eq("estado", "conectado")
      .order("ultima_actividad", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const res = await fetch(`${SUPABASE_URL}/functions/v1/lat-routing-engine`, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: convId,
        channel_id:      (canal as any)?.id ?? undefined,
        channel_type:    "email",
        message_content: subject,
        metadata: {
          remitente:          remitente,
          destinatario:       EMAIL_INBOX,
          alias_destinatario: EMAIL_INBOX,
          asunto:             subject,
          cuerpo:             (bodyText ?? "").slice(0, 500),
          nombre_adjunto:     attachmentNames.join(" "),
          mensaje_inicial:    subject,
          canal_tipo:         "email",
        },
      }),
    });
    const txt = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[email-agent] routing-engine failed:", res.status, txt);
    } else {
      console.log("[email-agent] routing-engine result:", txt);
    }
  } catch (err) {
    console.error("[email-agent] routing-engine error:", err);
  }
}

async function findOrCreateConvEmail(email: string, nombre: string | null, subject: string): Promise<string> {
  const { data: existing } = await supabase
    .from("lat_conversaciones")
    .select("id")
    .eq("telefono", email)
    .eq("canal", "email")
    .neq("estado", "finalizada")
    .order("ultima_interaccion", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre_completo")
    .or(`email.eq.${email}`)
    .limit(1)
    .maybeSingle();

  const { data: conv, error } = await supabase
    .from("lat_conversaciones")
    .insert({
      telefono:       email,
      canal:          "email",
      estado:         "abierta",
      prioridad:      "media",
      asunto:         subject,
      cliente_id:     cliente?.id ?? null,
      cliente_nombre: cliente?.nombre_completo ?? nombre ?? email,
    })
    .select("id")
    .single();
  if (error) throw error;
  return conv!.id;
}

async function getBotConfig() {
  const { data } = await supabase
    .from("lat_bot_config")
    .select("activo, auto_reply, prompt_identidad, prompt_reglas, prompt_categorias, prompt_calificacion, crear_gestion_auto, gestion_process_id, gestion_stage_id, gmail_refresh_token")
    .eq("canal", "email")
    .maybeSingle();
  return data as any;
}

async function crearGestion(convId: string, clienteId: string | null, clienteNombre: string, categoria: string, urgencia: string, resumen: string, cfg: any) {
  if (!cfg?.crear_gestion_auto || !cfg?.gestion_process_id) return;
  const PRIORIDAD_MAP: Record<string, string> = { critica: "urgent", alta: "high", media: "medium", baja: "low" };
  const TYPE_MAP: Record<string, string> = { vacacional: "consulta", visa: "consulta", grupos: "consulta", corporativo: "consulta", soporte: "soporte", emergencia: "soporte", cobranzas: "cobro", otro: "consulta" };
  await supabase.from("gestiones").insert({
    title: `${categoria.charAt(0).toUpperCase() + categoria.slice(1)} — ${clienteNombre} (Email)`,
    description: resumen,
    process_id: cfg.gestion_process_id,
    stage_id: cfg.gestion_stage_id ?? null,
    cliente_id: clienteId,
    cliente_nombre: clienteNombre,
    priority: PRIORIDAD_MAP[urgencia] ?? "medium",
    type: TYPE_MAP[categoria] ?? "consulta",
    subtype: categoria,
    canal_origen: "email",
    conversacion_id_origen: convId,
  });
}

// ─── OpenAI analysis ──────────────────────────────────────────────────────────

async function analyzeEmail(email: ParsedEmail, clienteInfo: string, cfg: any): Promise<{
  categoria: string; urgencia: string; resumen: string;
  puede_responder: boolean; respuesta: string | null;
}> {
  const identidad  = cfg?.prompt_identidad  ?? "Sos el asistente de Estropical Bolivia.";
  const reglas     = cfg?.prompt_reglas     ?? "Respondé en español latinoamericano, cálido y profesional.";
  const categorias = cfg?.prompt_categorias ?? "vacacional, visa, grupos, corporativo, soporte, emergencia, cobranzas, otro";

  // Use plain text for GPT, fallback to stripped HTML
  const bodyForGpt = email.bodyText
    ?? email.bodyHtml?.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                      .replace(/<[^>]+>/g, " ")
                      .replace(/&nbsp;/g, " ")
                      .replace(/\s{3,}/g, "\n\n")
                      .trim()
                      .slice(0, MAX_EMAIL_BODY)
    ?? "";

  const system = `${identidad}
Analizás emails entrantes de clientes de Estropical Bolivia.
Tu tarea:
1. Clasificar el email en una categoría: ${categorias}
2. Determinar urgencia: baja, media, alta, critica
3. Hacer un resumen en 2-3 líneas
4. Decidir si podés responder directamente o si necesita asesor
5. Si podés responder: redactar respuesta breve, cálida y profesional
Podés responder directamente si el cliente pide información general, saluda o agradece.
NO respondas directamente si pide cotización, tiene queja o requiere información del asesor.
${reglas}
Información del cliente:
${clienteInfo}
Respondé SIEMPRE con este JSON exacto:
{"categoria":"...","urgencia":"...","resumen":"...","puede_responder":true/false,"respuesta":"texto o null"}`;

  const user = `De: ${email.fromName ?? email.from} <${email.from}>
Asunto: ${email.subject}
Fecha: ${email.date.toISOString()}

${bodyForGpt}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.3,
      max_tokens: 600,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data   = await res.json();
  const text   = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(text);
  return {
    categoria:       parsed.categoria       ?? "otro",
    urgencia:        parsed.urgencia        ?? "media",
    resumen:         parsed.resumen         ?? "",
    puede_responder: parsed.puede_responder ?? false,
    respuesta:       parsed.respuesta       ?? null,
  };
}

// ─── Backfill: parse existing messages stored as raw MIME in contenido ─────────

function parseContenidoAsMime(
  contenido: string,
  messageId: string,
  fromEmail: string,
  fromName: string | null,
  createdAt: string,
): ParsedEmail | null {
  try {
    // Old agent stored: "**{subject}**\n\n{mime_body_parts}"
    const subjectMatch = contenido.match(/^\*\*(.+?)\*\*/);
    const subject = subjectMatch ? subjectMatch[1] : "(sin asunto)";

    // Strip the **subject**\n\n prefix
    const sepIdx = contenido.indexOf("\n\n");
    const mimeBody = sepIdx >= 0 ? contenido.slice(sepIdx + 2) : contenido;

    // Normalize all line endings to CRLF — the MIME parser requires \r\n\r\n
    // as the header/body separator and stored contenido often has bare \n
    const normalizedBody = mimeBody.replace(/\r?\n/g, "\r\n");

    // Detect boundary from first "--boundary" line
    const boundaryMatch = normalizedBody.match(/^--([^\r\n]+)/m);
    const boundary = boundaryMatch?.[1]?.trim();

    let ctHeader: string;
    if (boundary) {
      ctHeader = `Content-Type: multipart/mixed; boundary="${boundary}"`;
    } else if (/<[^>]+>/.test(normalizedBody)) {
      ctHeader = 'Content-Type: text/html; charset="UTF-8"';
    } else {
      ctHeader = 'Content-Type: text/plain; charset="UTF-8"';
    }

    const cleanMsgId = messageId.replace(/^<|>$/g, "");
    const fromHdr = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

    const syntheticRfc822 = [
      `Message-ID: <${cleanMsgId}>`,
      `From: ${fromHdr}`,
      `To: ${EMAIL_USER}`,
      `Subject: ${subject}`,
      `Date: ${new Date(createdAt).toUTCString()}`,
      `MIME-Version: 1.0`,
      ctHeader,
      ``,
      normalizedBody,
    ].join("\r\n");

    return parseRawEmail(syntheticRfc822) as ParsedEmail;
  } catch (e) {
    console.error("[backfill] parseContenidoAsMime error:", e);
    return null;
  }
}

async function handleBackfill(): Promise<Response> {
  // Get all email conversation IDs
  const { data: convRows } = await supabase
    .from("lat_conversaciones")
    .select("id, telefono")
    .eq("canal", "email");
  if (!convRows || convRows.length === 0) {
    return new Response(JSON.stringify({ ok: true, updated: 0, reason: "no email conversations" }), { status: 200 });
  }
  const convMap: Record<string, string> = {};
  for (const c of convRows as any[]) convMap[c.id] = c.telefono ?? "";
  const convIds = Object.keys(convMap);

  // Find inbound messages with missing email fields but with stored MIME in contenido
  const { data: msgs } = await supabase
    .from("lat_mensajes")
    .select("id, contenido, wpp_message_id, conversacion_id, autor_nombre, created_at")
    .in("conversacion_id", convIds)
    .is("email_subject", null)
    .not("contenido", "is", null)
    .eq("tipo", "inbound")
    .limit(50);

  if (!msgs || msgs.length === 0) {
    return new Response(JSON.stringify({ ok: true, updated: 0, reason: "nothing to backfill" }), { status: 200 });
  }

  let updated = 0, failed = 0;

  for (const msg of msgs as any[]) {
    try {
      const fromEmail = convMap[msg.conversacion_id] ?? "desconocido@email.com";
      const email = parseContenidoAsMime(
        msg.contenido ?? "",
        msg.wpp_message_id ?? crypto.randomUUID(),
        fromEmail,
        msg.autor_nombre ?? null,
        msg.created_at,
      );
      if (!email) { failed++; continue; }

      // Inline images (quoted-printable usually; unlikely to have base64 binaries here)
      let finalBodyHtml = email.bodyHtml;
      if (finalBodyHtml) {
        for (const img of email.inlineImages) {
          if (!img.contentId || img.data.length === 0 || img.data.length > 5 * 1024 * 1024) continue;
          const url = await uploadEmailFile(img.data, img.mimeType, `inline-${img.contentId}`, msg.conversacion_id);
          if (url) {
            const esc = img.contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            finalBodyHtml = finalBodyHtml!
              .replace(new RegExp(`src=["']cid:${esc}["']`, "gi"), `src="${url}"`)
              .replace(new RegExp(`src=["']cid:${esc.replace("@", "%40")}["']`, "gi"), `src="${url}"`);
          }
        }
      }

      const regularAtts = email.attachments.filter(a => !a.inline);
      let adjUrl: string | null = null, adjNom: string | null = null, adjTipo: string | null = null;
      if (regularAtts.length > 0 && regularAtts[0].data.length > 0) {
        adjUrl = await uploadEmailFile(regularAtts[0].data, regularAtts[0].mimeType, regularAtts[0].filename, msg.conversacion_id);
        if (adjUrl) { adjNom = regularAtts[0].filename; adjTipo = regularAtts[0].mimeType; }
      }

      const patch: Record<string, unknown> = {
        contenido:             email.subject,
        email_subject:         email.subject,
        email_from_name:       email.fromName,
        email_from_email:      email.from,
        email_to:              [email.to],
        email_body_html:       finalBodyHtml,
        email_body_text:       email.bodyText?.slice(0, MAX_EMAIL_BODY) ?? null,
        email_message_id:      email.messageId,
        email_has_attachments: regularAtts.length > 0,
      };
      if (msg.wpp_message_id) patch.email_message_id = msg.wpp_message_id;
      if (adjUrl) { patch.adjunto_url = adjUrl; patch.adjunto_nombre = adjNom; patch.adjunto_tipo = adjTipo; }

      const { error: updErr } = await supabase.from("lat_mensajes").update(patch).eq("id", msg.id);
      if (updErr) { console.error("[backfill] update error:", updErr); failed++; }
      else updated++;
    } catch (e: any) {
      console.error("[backfill] error for msg", msg.id, ":", e?.message);
      failed++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, updated, failed, total: msgs.length }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Re-backfill: fix messages where email_body_text has raw MIME (line-ending bug) ─

async function handleReBackfill(): Promise<Response> {
  const { data: convRows } = await supabase
    .from("lat_conversaciones")
    .select("id, telefono")
    .eq("canal", "email");
  if (!convRows || convRows.length === 0) {
    return new Response(JSON.stringify({ ok: true, updated: 0, reason: "no email conversations" }), { status: 200 });
  }
  const convMap: Record<string, string> = {};
  for (const c of convRows as any[]) convMap[c.id] = c.telefono ?? "";
  const convIds = Object.keys(convMap);

  // Target: backfilled messages where email_body_text has raw MIME (starts with "--")
  const { data: msgs } = await supabase
    .from("lat_mensajes")
    .select("id, email_subject, email_body_text, email_from_email, email_from_name, wpp_message_id, conversacion_id, created_at, autor_nombre")
    .in("conversacion_id", convIds)
    .is("email_body_html", null)
    .not("email_subject", "is", null)
    .like("email_body_text", "--%")
    .eq("tipo", "inbound")
    .limit(50);

  if (!msgs || msgs.length === 0) {
    return new Response(JSON.stringify({ ok: true, updated: 0, reason: "nothing to re-backfill" }), { status: 200 });
  }

  let updated = 0, skipped = 0, failed = 0;

  for (const msg of msgs as any[]) {
    const mimeRaw: string = msg.email_body_text ?? "";
    // Only re-process if email_body_text looks like raw MIME (starts with boundary)
    if (!mimeRaw.trimStart().startsWith("--")) { skipped++; continue; }

    try {
      const fromEmail = msg.email_from_email ?? convMap[msg.conversacion_id] ?? "desconocido@email.com";
      const fromName  = msg.email_from_name ?? msg.autor_nombre ?? null;
      const subject   = msg.email_subject ?? "(sin asunto)";
      const msgId     = msg.wpp_message_id ?? crypto.randomUUID();

      // Detect boundary from the raw MIME body
      const boundaryMatch = mimeRaw.match(/^--([^\r\n]+)/m);
      const boundary = boundaryMatch?.[1]?.trim();
      const ctHeader = boundary
        ? `Content-Type: multipart/mixed; boundary="${boundary}"`
        : 'Content-Type: text/plain; charset="UTF-8"';

      // Normalize to CRLF before parsing
      const normalizedBody = mimeRaw.replace(/\r?\n/g, "\r\n");
      const cleanMsgId = msgId.replace(/^<|>$/g, "");
      const fromHdr = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

      const syntheticRfc822 = [
        `Message-ID: <${cleanMsgId}>`,
        `From: ${fromHdr}`,
        `To: ${EMAIL_USER}`,
        `Subject: ${subject}`,
        `Date: ${new Date(msg.created_at).toUTCString()}`,
        `MIME-Version: 1.0`,
        ctHeader,
        ``,
        normalizedBody,
      ].join("\r\n");

      const email = parseRawEmail(syntheticRfc822) as ParsedEmail;
      if (!email?.from) { failed++; continue; }

      // Resolve inline images
      let finalBodyHtml = email.bodyHtml;
      if (finalBodyHtml) {
        for (const img of email.inlineImages) {
          if (!img.contentId || img.data.length === 0 || img.data.length > 5 * 1024 * 1024) continue;
          const url = await uploadEmailFile(img.data, img.mimeType, `inline-${img.contentId}`, msg.conversacion_id);
          if (url) {
            const esc = img.contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            finalBodyHtml = finalBodyHtml!
              .replace(new RegExp(`src=["']cid:${esc}["']`, "gi"), `src="${url}"`)
              .replace(new RegExp(`src=["']cid:${esc.replace("@", "%40")}["']`, "gi"), `src="${url}"`);
          }
        }
      }

      // Only update if we actually extracted HTML
      if (!finalBodyHtml) { skipped++; continue; }

      const patch: Record<string, unknown> = {
        email_body_html: finalBodyHtml,
        email_body_text: email.bodyText?.slice(0, MAX_EMAIL_BODY) ?? null,
      };

      const regularAtts = email.attachments.filter(a => !a.inline);
      if (regularAtts.length > 0 && regularAtts[0].data.length > 0 && !msg.adjunto_url) {
        const adjUrl = await uploadEmailFile(regularAtts[0].data, regularAtts[0].mimeType, regularAtts[0].filename, msg.conversacion_id);
        if (adjUrl) {
          patch.adjunto_url = adjUrl;
          patch.adjunto_nombre = regularAtts[0].filename;
          patch.adjunto_tipo = regularAtts[0].mimeType;
          patch.email_has_attachments = true;
        }
      }

      const { error: updErr } = await supabase.from("lat_mensajes").update(patch).eq("id", msg.id);
      if (updErr) { console.error("[re-backfill] update error:", updErr); failed++; }
      else updated++;
    } catch (e: any) {
      console.error("[re-backfill] error for msg", msg.id, ":", e?.message);
      failed++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, updated, skipped, failed, total: msgs.length }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const body = await req.json().catch(() => ({}));
  if ((body as any)?.action === "debug-gmail") {
    const token = await getGmailAccessToken();
    if (!token) return new Response(JSON.stringify({ error: "no token" }), { status: 200 });
    const queries = [
      `to:${EMAIL_INBOX} after:2026/04/24`,
      `after:2026/04/24`,
      `is:unread`,
    ];
    const results: any[] = [];
    for (const q of queries) {
      const r = await fetch(`${GMAIL_API}/messages?q=${encodeURIComponent(q)}&maxResults=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      results.push({ query: q, status: r.status, count: d.messages?.length ?? 0, resultSizeEstimate: d.resultSizeEstimate });
    }
    return new Response(JSON.stringify({ ok: true, results }), { status: 200 });
  }

  if ((body as any)?.action === "backfill") {
    console.log("[email-agent] Backfill mode");
    return handleBackfill();
  }
  if ((body as any)?.action === "re-backfill") {
    console.log("[email-agent] Re-backfill mode");
    return handleReBackfill();
  }

  console.log("[email-agent] Starting email poll");

  try {
    const cfg = await getBotConfig();
    // gmail_refresh_token es necesario para conectarse a Gmail — sin él no hay nada que hacer.
    // cfg.activo controla solo si el bot IA responde automáticamente, no la ingesta de emails.
    if (!cfg?.gmail_refresh_token) {
      console.log("[email-agent] Gmail no configurado — ejecute el flujo OAuth primero");
      return new Response(JSON.stringify({ ok: true, skipped: "gmail not configured" }), { status: 200 });
    }

    const emails = await fetchUnreadEmailsGmail();
    let processed = 0, skipped = 0;

    for (const email of emails) {
      if (await isProcessed(email.messageId)) {
        console.log(`[email-agent] Skipping already processed: ${email.messageId} subject="${email.subject}" from=${email.from}`);
        skipped++;
        continue;
      }
      const selfAddrs = [EMAIL_USER.toLowerCase(), EMAIL_INBOX.toLowerCase()];
      if (selfAddrs.includes(email.from.toLowerCase())) {
        console.log(`[email-agent] Skipping self email: subject="${email.subject}" from=${email.from}`);
        skipped++;
        continue;
      }

      console.log(`[email] Processing: ${email.subject} from ${email.from}`);

      const { data: cliente } = await supabase
        .from("clientes")
        .select("id, nombre_completo")
        .ilike("email", email.from)
        .limit(1)
        .maybeSingle();

      const clienteInfo = cliente
        ? `Nombre: ${cliente.nombre_completo}\nEmail: ${email.from}\n✅ Registrado en BD.`
        : `Email: ${email.from}\nNombre: ${email.fromName ?? "desconocido"}\nNo está registrado en la BD.`;

      const analysis = await analyzeEmail(email, clienteInfo, cfg);
      const convId   = await findOrCreateConvEmail(email.from, email.fromName, email.subject);

      // ── Upload inline images and resolve CID references ──
      let finalBodyHtml = email.bodyHtml;
      if (finalBodyHtml) {
        for (const img of email.inlineImages) {
          if (!img.contentId || img.data.length === 0 || img.data.length > 5 * 1024 * 1024) continue;
          const url = await uploadEmailFile(img.data, img.mimeType, `inline-${img.contentId}`, convId);
          if (url) {
            const escaped = img.contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            finalBodyHtml = finalBodyHtml!
              .replace(new RegExp(`src=["']cid:${escaped}["']`, "gi"), `src="${url}"`)
              .replace(new RegExp(`src=["']cid:${escaped.replace("@", "%40")}["']`, "gi"), `src="${url}"`);
          }
        }
      }

      // ── Upload ALL regular attachments ──
      const regularAtts = email.attachments.filter(a => !a.inline);
      let adjUrl: string | null = null, adjNom: string | null = null, adjTipo: string | null = null;
      const allAttachments: { url: string; nombre: string; tipo: string; size_bytes: number }[] = [];
      for (const att of regularAtts) {
        if (!att.data.length || att.data.length > 20 * 1024 * 1024) continue;
        const url = await uploadEmailFile(att.data, att.mimeType, att.filename, convId);
        if (url) {
          allAttachments.push({ url, nombre: att.filename, tipo: att.mimeType, size_bytes: att.data.length });
          if (!adjUrl) { adjUrl = url; adjNom = att.filename; adjTipo = att.mimeType; }
        }
      }

      // ── Save inbound email with all metadata ──
      const { error: insErr } = await supabase.from("lat_mensajes").insert({
        conversacion_id:  convId,
        tipo:             "inbound",
        contenido:        email.subject,
        estado:           "entregado",
        autor_nombre:     email.fromName ?? email.from,
        wpp_message_id:   email.messageId,
        email_subject:    email.subject,
        email_from_name:  email.fromName,
        email_from_email: email.from,
        email_to:         [email.to],
        email_body_html:  finalBodyHtml,
        email_body_text:  email.bodyText?.slice(0, MAX_EMAIL_BODY) ?? null,
        email_message_id: email.messageId,
        email_has_attachments: regularAtts.length > 0,
        email_attachments: allAttachments.length > 0 ? allAttachments : [],
        adjunto_url:      adjUrl,
        adjunto_nombre:   adjNom,
        adjunto_tipo:     adjTipo,
      });
      if (insErr) console.error("lat_mensajes insert error:", insErr);

      // ── Update conversation ──
      await supabase.from("lat_conversaciones").update({
        ultima_interaccion:  new Date().toISOString(),
        ultimo_mensaje:      email.subject,
        intencion_detectada: analysis.categoria,
        urgencia_detectada:  analysis.urgencia,
        resumen_ia:          analysis.resumen,
        estado:              "en_cola",
        no_leidos:           1,
      }).eq("id", convId);

      await callRoutingEngine(
        convId,
        email.subject,
        email.bodyText ?? null,
        email.from,
        regularAtts.map(a => a.filename),
      );

      await crearGestion(convId, cliente?.id ?? null, cliente?.nombre_completo ?? email.fromName ?? email.from, analysis.categoria, analysis.urgencia, analysis.resumen, cfg);

      if (cfg?.auto_reply === true && analysis.puede_responder && analysis.respuesta) {
        const sent = await sendEmailReply(
          email.replyTo ?? email.from,
          email.subject,
          analysis.respuesta + "\n\n— Lati 🌍\nEquipo Estropical Bolivia",
          email.messageId,
        );
        if (sent) {
          await supabase.from("lat_mensajes").insert({
            conversacion_id:  convId,
            tipo:             "outbound",
            contenido:        analysis.respuesta,
            estado:           "enviado",
            autor_nombre:     "Lati",
            email_subject:    `Re: ${email.subject}`,
            email_from_email: EMAIL_USER,
            email_to:         [email.replyTo ?? email.from],
            email_body_text:  analysis.respuesta,
          });
        }
      } else {
        await supabase.from("lat_mensajes").insert({
          conversacion_id: convId,
          tipo:            "nota_interna",
          contenido:       `🤖 **Análisis Lati**: ${analysis.resumen}\n📂 Categoría: ${analysis.categoria} | Urgencia: ${analysis.urgencia}`,
          estado:          "enviado",
          autor_nombre:    "Lati",
        });
      }

      await markProcessed(email.messageId, convId);
      processed++;
    }

    console.log(`[email-agent] Done. Processed: ${processed}, Skipped: ${skipped}`);
    return new Response(JSON.stringify({ ok: true, processed, skipped }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[email-agent] Fatal error:", err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
});

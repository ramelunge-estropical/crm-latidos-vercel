/**
 * lat-email-agent — Agente IA de email para Estropical
 *
 * Flujo:
 *   1. Conecta a total@estropical.com via IMAP
 *   2. Descarga emails no leídos no procesados
 *   3. Por cada email: identifica cliente, analiza necesidad con GPT
 *   4. Guarda en lat_conversaciones (canal=email) + lat_mensajes
 *   5. Si puede responder solo → responde y deriva; si no → solo deriva al asesor
 *
 * Triggereado cada 2 minutos via pg_cron → wpp-webhook no aplica aquí,
 * llamado por HTTP POST desde cron job.
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
const IMAP_HOST    = Deno.env.get("EMAIL_IMAP_HOST") ?? "imap.gmail.com";
const IMAP_PORT    = parseInt(Deno.env.get("EMAIL_IMAP_PORT") ?? "993");
const SMTP_HOST    = Deno.env.get("EMAIL_SMTP_HOST") ?? "smtp.gmail.com";
const SMTP_PORT    = parseInt(Deno.env.get("EMAIL_SMTP_PORT") ?? "587");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const MODEL    = "gpt-4o-mini";
const MAX_EMAIL_BODY = 3000; // chars to send to GPT

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedEmail {
  messageId:  string;
  from:       string;
  fromName:   string | null;
  to:         string;
  subject:    string;
  body:       string;
  date:       Date;
  replyTo:    string | null;
}

// ─── IMAP client (manual TCP via Deno.connectTls) ────────────────────────────

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

// ─── Parse email helpers ──────────────────────────────────────────────────────

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
  const [, , enc, val] = m;
  if (enc.toUpperCase() === "B") return decodeBase64(val);
  if (enc.toUpperCase() === "Q") return decodeQuotedPrintable(val.replace(/_/g, " "));
  return val;
}

function decodeMimeHeader(header: string): string {
  return header.replace(/=\?[^?]+\?[BbQq]\?[^?]*\?=/g, decodeMimeWord);
}

function extractEmailAddress(from: string): { email: string; name: string | null } {
  const m = from.match(/^(.*?)\s*<([^>]+)>/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, "") || null, email: m[2].trim() };
  const plain = from.trim();
  return { email: plain, name: null };
}

function parseRawEmail(raw: string): Partial<ParsedEmail> {
  const [headerSection, ...bodyParts] = raw.split(/\r?\n\r?\n/);
  const headers: Record<string, string> = {};

  // Parse headers (handle folded headers)
  const headerLines = headerSection.replace(/\r?\n\s+/g, " ").split(/\r?\n/);
  for (const line of headerLines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key   = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers[key] = value;
  }

  const fromRaw  = decodeMimeHeader(headers["from"] ?? "");
  const { email: fromEmail, name: fromName } = extractEmailAddress(fromRaw);
  const subject  = decodeMimeHeader(headers["subject"] ?? "(sin asunto)");
  const msgId    = headers["message-id"]?.replace(/[<>]/g, "").trim() ?? crypto.randomUUID();
  const replyTo  = headers["reply-to"] ? extractEmailAddress(decodeMimeHeader(headers["reply-to"])).email : null;

  // Extract plain text body
  let body = bodyParts.join("\n\n");

  // Handle Content-Transfer-Encoding
  const cte = headers["content-transfer-encoding"]?.toLowerCase() ?? "";
  if (cte === "base64") {
    try { body = new TextDecoder("utf-8", { fatal: false }).decode(Uint8Array.from(atob(body.replace(/\s/g, "")), c => c.charCodeAt(0))); } catch { /* keep raw */ }
  } else if (cte === "quoted-printable") {
    body = decodeQuotedPrintable(body);
  }

  // Strip HTML tags if multipart
  if (body.includes("<html") || body.includes("<HTML")) {
    body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
               .replace(/<[^>]+>/g, " ")
               .replace(/&nbsp;/g, " ")
               .replace(/&lt;/g, "<")
               .replace(/&gt;/g, ">")
               .replace(/&amp;/g, "&")
               .replace(/\s{3,}/g, "\n\n")
               .trim();
  }

  // Strip quoted reply (lines starting with >)
  body = body.split("\n").filter(l => !l.trimStart().startsWith(">")).join("\n").trim();

  return {
    messageId: msgId,
    from:      fromEmail,
    fromName:  fromName || null,
    to:        EMAIL_USER,
    subject,
    body:      body.slice(0, MAX_EMAIL_BODY),
    date:      new Date(),
    replyTo:   replyTo,
  };
}

// ─── Fetch unread emails via IMAP ─────────────────────────────────────────────

async function fetchUnreadEmails(): Promise<ParsedEmail[]> {
  const conn = await imapConnect();
  try {
    await imapReadLine(conn); // greeting

    // LOGIN
    const loginResp = await imapCommand(conn, "a1", `LOGIN "${EMAIL_USER}" "${EMAIL_PASS}"`);
    if (!loginResp.some(l => l.startsWith("a1 OK"))) {
      console.error("[email] IMAP login failed:", loginResp.join("|"));
      return [];
    }

    // SELECT INBOX
    await imapCommand(conn, "a2", "SELECT INBOX");

    // SEARCH UNSEEN
    const searchResp = await imapCommand(conn, "a3", "SEARCH UNSEEN");
    const searchLine = searchResp.find(l => l.startsWith("* SEARCH")) ?? "";
    const uids = searchLine.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean);

    if (uids.length === 0) {
      console.log("[email] No unread emails");
      conn.close();
      return [];
    }

    console.log(`[email] Found ${uids.length} unread emails: ${uids.join(",")}`);

    const emails: ParsedEmail[] = [];
    const uidList = uids.slice(0, 10).join(","); // max 10 per run

    // FETCH all at once
    await imapSend(conn, `a4 FETCH ${uidList} (RFC822)`);

    let current: string[] = [];
    let inBody = false;
    let bodySize = 0;
    let bytesLeft = 0;

    // Simple sequential fetch per UID
    conn.close();

    // Re-connect and fetch individually (simpler/more reliable)
    for (const uid of uids.slice(0, 10)) {
      const c2 = await imapConnect();
      try {
        await imapReadLine(c2);
        const lr = await imapCommand(c2, "b1", `LOGIN "${EMAIL_USER}" "${EMAIL_PASS}"`);
        if (!lr.some(l => l.startsWith("b1 OK"))) { c2.close(); continue; }
        await imapCommand(c2, "b2", "SELECT INBOX");

        // FETCH single message
        await imapSend(c2, `b3 FETCH ${uid} RFC822`);
        let raw = "";
        let done = false;
        let octets = 0;
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

// ─── SMTP send reply ───────────────────────────────────────────────────────────

async function sendEmailReply(to: string, subject: string, body: string, inReplyTo?: string): Promise<boolean> {
  try {
    const conn = await Deno.connectTls({ hostname: SMTP_HOST, port: 465 });
    const enc  = new TextEncoder();
    const dec  = new TextDecoder();

    const readLine = async () => {
      const buf = new Uint8Array(4096);
      const n = await conn.read(buf);
      return n ? dec.decode(buf.subarray(0, n)) : "";
    };
    const send = async (cmd: string) => { await conn.write(enc.encode(cmd + "\r\n")); };

    await readLine(); // greeting
    await send("EHLO crm.estropical.com");
    await readLine();

    // AUTH LOGIN
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
    // Fallback: try port 587 with STARTTLS (not implemented here, log only)
    return false;
  }
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

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
    .select("prompt_identidad, prompt_reglas, prompt_categorias, prompt_calificacion, crear_gestion_auto, gestion_process_id, gestion_stage_id")
    .eq("activo", true)
    .single();
  return data as any;
}

async function crearGestion(convId: string, clienteId: string | null, clienteNombre: string, categoria: string, urgencia: string, resumen: string, cfg: any) {
  if (!cfg?.crear_gestion_auto || !cfg?.gestion_process_id) return;

  const PRIORIDAD_MAP: Record<string, string> = { critica: "urgent", alta: "high", media: "medium", baja: "low" };
  const TYPE_MAP: Record<string, string> = { vacacional: "consulta", visa: "consulta", grupos: "consulta", corporativo: "consulta", soporte: "soporte", emergencia: "soporte", cobranzas: "cobro", otro: "consulta" };

  await supabase.from("gestiones").insert({
    title:                  `${categoria.charAt(0).toUpperCase() + categoria.slice(1)} — ${clienteNombre} (Email)`,
    description:            resumen,
    process_id:             cfg.gestion_process_id,
    stage_id:               cfg.gestion_stage_id ?? null,
    cliente_id:             clienteId,
    cliente_nombre:         clienteNombre,
    priority:               PRIORIDAD_MAP[urgencia] ?? "medium",
    type:                   TYPE_MAP[categoria] ?? "consulta",
    subtype:                categoria,
    canal_origen:           "email",
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

  const system = `${identidad}
Analizás emails entrantes de clientes de Estropical Bolivia.

Tu tarea:
1. Clasificar el email en una categoría: ${categorias}
2. Determinar urgencia: baja, media, alta, critica
3. Hacer un resumen en 2-3 líneas
4. Decidir si podés responder directamente o si necesita asesor
5. Si podés responder: redactar respuesta breve, cálida y profesional

Podés responder directamente si:
- El cliente pide información general (destinos populares, requisitos generales, horarios de oficina)
- Es una consulta simple de estado de reserva que podés responder con "nuestro equipo te contactará"
- Es un saludo o agradecimiento

NO respondas directamente si:
- Pide cotización específica (precios, paquetes concretos)
- Tiene una queja o problema con una reserva existente
- Requiere información que solo tiene el asesor
En esos casos: respuesta breve diciendo que un asesor lo contactará pronto.

Información del cliente:
${clienteInfo}

Respondé SIEMPRE con este JSON exacto:
{
  "categoria": "...",
  "urgencia": "...",
  "resumen": "...",
  "puede_responder": true/false,
  "respuesta": "texto del email de respuesta o null"
}`;

  const user = `De: ${email.fromName ?? email.from} <${email.from}>
Asunto: ${email.subject}
Fecha: ${email.date.toISOString()}

${email.body}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model:       MODEL,
      messages:    [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.3,
      max_tokens:  600,
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

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  console.log("[email-agent] Starting email poll");

  try {
    const cfg    = await getBotConfig();
    const emails = await fetchUnreadEmails();

    let processed = 0;
    let skipped   = 0;

    for (const email of emails) {
      // Skip already processed
      if (await isProcessed(email.messageId)) { skipped++; continue; }

      // Skip emails sent by ourselves
      if (email.from.toLowerCase() === EMAIL_USER.toLowerCase()) { skipped++; continue; }

      console.log(`[email] Processing: ${email.subject} from ${email.from}`);

      // Find/create client
      const { data: cliente } = await supabase
        .from("clientes")
        .select("id, nombre_completo")
        .ilike("email", email.from)
        .limit(1)
        .maybeSingle();

      const clienteInfo = cliente
        ? `Nombre: ${cliente.nombre_completo}\nEmail: ${email.from}\n✅ Registrado en BD.`
        : `Email: ${email.from}\nNombre: ${email.fromName ?? "desconocido"}\nNo está registrado en la BD.`;

      // Analyze with GPT
      const analysis = await analyzeEmail(email, clienteInfo, cfg);

      // Create/find conversation
      const convId = await findOrCreateConvEmail(email.from, email.fromName, email.subject);

      // Save inbound email as message
      await supabase.from("lat_mensajes").insert({
        conversacion_id: convId,
        tipo:            "inbound",
        contenido:       `**${email.subject}**\n\n${email.body}`,
        estado:          "entregado",
        autor_nombre:    email.fromName ?? email.from,
        wpp_message_id:  email.messageId,
      });

      // Update conversation with AI analysis
      await supabase.from("lat_conversaciones").update({
        ultima_interaccion:  new Date().toISOString(),
        ultimo_mensaje:      email.body.slice(0, 120),
        intencion_detectada: analysis.categoria,
        urgencia_detectada:  analysis.urgencia,
        resumen_ia:          analysis.resumen,
        estado:              "en_cola",
        no_leidos:           supabase.rpc ? 1 : 1,
      }).eq("id", convId);

      // Auto-create gestión
      await crearGestion(convId, cliente?.id ?? null, cliente?.nombre_completo ?? email.fromName ?? email.from, analysis.categoria, analysis.urgencia, analysis.resumen, cfg);

      // Send reply if GPT can handle it
      if (analysis.puede_responder && analysis.respuesta) {
        const sent = await sendEmailReply(
          email.replyTo ?? email.from,
          email.subject,
          analysis.respuesta + "\n\n— Lati 🌍\nEquipo Estropical Bolivia",
          email.messageId,
        );
        if (sent) {
          await supabase.from("lat_mensajes").insert({
            conversacion_id: convId,
            tipo:            "outbound",
            contenido:       analysis.respuesta,
            estado:          "enviado",
            autor_nombre:    "Lati",
          });
        }
      } else {
        // Save nota interna con el análisis para el asesor
        await supabase.from("lat_mensajes").insert({
          conversacion_id: convId,
          tipo:            "nota_interna",
          contenido:       `🤖 **Análisis Lati**: ${analysis.resumen}\n📂 Categoría: ${analysis.categoria} | Urgencia: ${analysis.urgencia}`,
          estado:          "enviado",
          autor_nombre:    "Lati",
        });
      }

      // Mark as processed
      await markProcessed(email.messageId, convId);
      processed++;
    }

    console.log(`[email-agent] Done. Processed: ${processed}, Skipped: ${skipped}`);
    return new Response(JSON.stringify({ ok: true, processed, skipped }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[email-agent] Fatal error:", err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
});

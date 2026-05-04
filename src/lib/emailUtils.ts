/**
 * Utilidades para limpiar y procesar contenido de correos.
 */

import DOMPurify from "dompurify";

/** Decodifica quoted-printable (=C3=A1, =\n etc) a UTF-8 */
export function decodeQuotedPrintable(str: string): string {
  if (!str) return "";
  // Soft line breaks
  let s = str.replace(/=\r?\n/g, "");
  // =XX → byte
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /[0-9A-Fa-f]{2}/.test(s.substr(i + 1, 2))) {
      bytes.push(parseInt(s.substr(i + 1, 2), 16));
      i += 2;
    } else {
      bytes.push(s.charCodeAt(i));
    }
  }
  try {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  } catch {
    return s;
  }
}

/** Detecta si el contenido tiene apariencia MIME crudo y lo limpia */
export function stripMimeHeaders(raw: string): string {
  if (!raw) return "";
  let s = raw;

  // Remover bloques de cabecera tipo "Content-Type: ...\nContent-Transfer-Encoding: ..."
  s = s.replace(/^(?:Content-(?:Type|Transfer-Encoding|Disposition|ID)|MIME-Version|boundary)[^\n]*\n/gim, "");
  // Remover boundary markers
  s = s.replace(/^--[=_a-zA-Z0-9-]+(?:--)?\s*$/gm, "");

  // Quoted-printable — solo si no parece HTML ya decodificado (URLs con =XX corrompen Unicode)
  if (!/<[a-z]/i.test(s) && (/=[0-9A-F]{2}/.test(s) || /=\r?\n/.test(s))) {
    s = decodeQuotedPrintable(s);
  }

  return s.trim();
}

/** Sanea HTML usando DOMPurify, permite tags estándar de email.
 *  Fuerza target=_blank y rel=noopener noreferrer en todos los links.
 *  NO llama stripMimeHeaders: email_body_html ya viene decodificado del backend.
 *  Llamar decodeQuotedPrintable sobre HTML decoded corrompe caracteres Unicode
 *  porque toma charCodes >127 (ej. ñ=241) como bytes UTF-8 inválidos. */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return "";
  const cleaned = html;

  // Hook: forzar apertura segura en nueva pestaña para todos los <a>
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if ("target" in node) {
      (node as Element).setAttribute("target", "_blank");
      (node as Element).setAttribute("rel", "noopener noreferrer");
    }
  });

  const result = DOMPurify.sanitize(cleaned, {
    ALLOWED_TAGS: [
      "a", "b", "br", "div", "em", "i", "img", "li", "ol", "p", "span",
      "strong", "table", "tbody", "td", "th", "thead", "tfoot", "tr", "u", "ul",
      "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
      "hr", "small", "sub", "sup", "font", "center", "colgroup", "col", "caption",
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "target", "rel",
      "style", "color", "bgcolor", "width", "height", "align", "valign",
      "border", "cellpadding", "cellspacing", "class",
      "colspan", "rowspan", "scope",
    ],
    // cid: se resuelve en el backend antes de guardar — no necesario en frontend
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel|data):/i,
    ADD_ATTR: ["target"],
  });

  DOMPurify.removeHook("afterSanitizeAttributes");
  return result;
}

/** Convierte texto plano a HTML preservando saltos y autodetectando links */
export function plainTextToHtml(text: string): string {
  if (!text) return "";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return linked.replace(/\n/g, "<br>");
}

export interface EmailAddress {
  name?: string;
  email: string;
}

/** Parsea "Nombre <correo@x.com>" o "correo@x.com" */
export function parseAddress(raw: string): EmailAddress {
  if (!raw) return { email: "" };
  // "Display Name" <email@domain.com> — solo separa nombre si hay brackets
  const withBrackets = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (withBrackets) return { name: withBrackets[1].trim() || undefined, email: withBrackets[2].trim() };
  // Plain: email@domain.com (no tocar — regex anterior robaba chars del local)
  return { email: raw.trim() };
}

export function parseAddressList(raw: any): EmailAddress[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((r) => (typeof r === "string" ? parseAddress(r) : r));
  if (typeof raw === "string") return raw.split(/[,;]/).map(parseAddress).filter((a) => a.email);
  return [];
}

export function formatAddress(a: EmailAddress): string {
  if (a.name) return `${a.name} <${a.email}>`;
  return a.email;
}

/** Heurística: ¿el contenido parece HTML? */
export function isHtml(content: string): boolean {
  return /<\/?(?:html|body|div|p|span|table|br|img|a|h[1-6]|ul|ol|li|strong|em|b|i)\b/i.test(content);
}

/** Quita firma típica para preview de hilo */
export function trimQuotedReply(html: string): string {
  if (!html) return "";
  // Cortar en "On ... wrote:" o ">"-blockquotes
  return html
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/(El\s+\d+|On\s+\w+).*?escribió:[\s\S]*$/i, "")
    .trim();
}

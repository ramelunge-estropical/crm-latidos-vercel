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

  // Quoted-printable
  if (/=[0-9A-F]{2}/.test(s) || /=\r?\n/.test(s)) {
    s = decodeQuotedPrintable(s);
  }

  return s.trim();
}

/** Sanea HTML usando DOMPurify, permite tags estándar de email */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return "";
  const cleaned = stripMimeHeaders(html);
  return DOMPurify.sanitize(cleaned, {
    ALLOWED_TAGS: [
      "a", "b", "br", "div", "em", "i", "img", "li", "ol", "p", "span",
      "strong", "table", "tbody", "td", "th", "thead", "tr", "u", "ul",
      "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
      "hr", "small", "sub", "sup", "font", "center",
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "target", "rel",
      "style", "color", "bgcolor", "width", "height", "align",
      "border", "cellpadding", "cellspacing", "class",
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid|data):)/i,
    ADD_ATTR: ["target"],
  });
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
  const m = raw.match(/^\s*(?:"?([^"<]*)"?\s*)?<?([^>\s]+@[^>\s]+)>?\s*$/);
  if (m) return { name: m[1]?.trim() || undefined, email: m[2].trim() };
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

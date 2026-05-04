import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronRight, Reply, ReplyAll, Forward, Paperclip, Bot, User as UserIcon, Mail } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  sanitizeEmailHtml, plainTextToHtml, stripMimeHeaders,
  parseAddressList, formatAddress, trimQuotedReply,
} from "@/lib/emailUtils";
import type { LatMensaje } from "@/hooks/useLatData";
import { openAttachment } from "@/components/lat/AttachmentViewer";

interface Props {
  mensajes: LatMensaje[];
  onReply: (msg: LatMensaje) => void;
  onReplyAll: (msg: LatMensaje) => void;
  onForward: (msg: LatMensaje) => void;
  /** false = no pone overflow-y-auto propio (el padre maneja el scroll) */
  scrollable?: boolean;
}

interface NormalizedEmail {
  id: string;
  subject: string;
  fromName?: string;
  fromEmail?: string;
  to: { name?: string; email: string }[];
  cc: { name?: string; email: string }[];
  date: Date;
  bodyHtml: string;
  bodyPreview: string;
  direction: "inbound" | "outbound" | "ai" | "forward" | "internal";
  hasAttachment: boolean;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  raw: LatMensaje;
}

function normalize(m: LatMensaje): NormalizedEmail {
  const html = m.email_body_html;
  const text = m.email_body_text ?? m.contenido;
  const cleanedHtml = html
    ? sanitizeEmailHtml(html)
    : plainTextToHtml(stripMimeHeaders(text ?? ""));

  const direction: NormalizedEmail["direction"] =
    m.tipo === "inbound" ? "inbound"
    : m.tipo === "nota_interna" ? "internal"
    : (m.autor_nombre?.toLowerCase().includes("lati") || m.autor_nombre?.toLowerCase().includes("ia"))
      ? "ai"
      : "outbound";

  return {
    id: m.id,
    subject: m.email_subject ?? m.contenido?.slice(0, 80) ?? "(sin asunto)",
    fromName: m.email_from_name ?? m.autor_nombre ?? undefined,
    fromEmail: m.email_from_email ?? undefined,
    to: parseAddressList(m.email_to),
    cc: parseAddressList(m.email_cc),
    date: m.email_date ? new Date(m.email_date) : new Date(m.created_at),
    bodyHtml: cleanedHtml,
    bodyPreview: trimQuotedReply(cleanedHtml).replace(/<[^>]+>/g, " ").slice(0, 140).trim(),
    direction,
    hasAttachment: !!m.adjunto_url || m.email_has_attachments === true,
    attachmentUrl: m.adjunto_url,
    attachmentName: m.adjunto_nombre,
    attachmentType: m.adjunto_tipo,
    raw: m,
  };
}

const dirMeta: Record<NormalizedEmail["direction"], { label: string; cls: string; Icon: any }> = {
  inbound:  { label: "Entrante",       cls: "bg-blue-50 text-blue-700 border-blue-200",   Icon: Mail },
  outbound: { label: "Respuesta",      cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: UserIcon },
  ai:       { label: "LATI IA",        cls: "bg-purple-50 text-purple-700 border-purple-200",   Icon: Bot },
  forward:  { label: "Reenviado",      cls: "bg-amber-50 text-amber-700 border-amber-200",       Icon: Forward },
  internal: { label: "Nota interna",   cls: "bg-yellow-50 text-yellow-700 border-yellow-200",    Icon: UserIcon },
};

export function EmailThreadView({ mensajes, onReply, onReplyAll, onForward, scrollable = true }: Props) {
  const emails = useMemo(() => mensajes.map(normalize).sort((a, b) => a.date.getTime() - b.date.getTime()), [mensajes]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    if (emails.length === 0) return {};
    return { [emails[emails.length - 1].id]: true };
  });

  if (emails.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Sin mensajes en este hilo</p>
        </div>
      </div>
    );
  }

  // Título = asunto del primer correo real (ignora notas internas)
  const subject =
    (emails.find(e => e.direction !== "internal") ?? emails[emails.length - 1]).subject;

  return (
    <div className={`bg-muted/30 px-4 sm:px-6 py-5 space-y-3${scrollable ? " flex-1 overflow-y-auto" : ""}`}>
      {/* Header del hilo */}
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-foreground leading-tight">{subject}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Hilo de correo · {emails.length} mensaje{emails.length !== 1 ? "s" : ""}
        </p>
      </div>

      {emails.map((email) => {
        const isOpen = expanded[email.id] ?? false;
        const meta = dirMeta[email.direction];
        const Icon = meta.Icon;

        return (
          <Card key={email.id} className="overflow-hidden border-border bg-background shadow-sm">
            {/* Encabezado del mensaje */}
            <button
              type="button"
              onClick={() => setExpanded((s) => ({ ...s, [email.id]: !isOpen }))}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition text-left"
            >
              <div className={`shrink-0 w-9 h-9 rounded-full border flex items-center justify-center ${meta.cls}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-foreground truncate">
                    {email.fromName ?? email.fromEmail ?? "Desconocido"}
                  </span>
                  {email.fromEmail && (
                    <span className="text-xs text-muted-foreground truncate">&lt;{email.fromEmail}&gt;</span>
                  )}
                  <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                  {email.hasAttachment && <Paperclip className="w-3 h-3 text-muted-foreground" />}
                </div>
                {!isOpen ? (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{email.bodyPreview || "(vacío)"}</p>
                ) : (
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    {email.to.length > 0 && (
                      <div><span className="font-medium">Para:</span> {email.to.map(formatAddress).join(", ")}</div>
                    )}
                    {email.cc.length > 0 && (
                      <div><span className="font-medium">Cc:</span> {email.cc.map(formatAddress).join(", ")}</div>
                    )}
                    {parseAddressList(email.raw.email_bcc).length > 0 && (
                      <div><span className="font-medium">Bcc:</span> {parseAddressList(email.raw.email_bcc).map(formatAddress).join(", ")}</div>
                    )}
                    <div><span className="font-medium">Fecha:</span> {format(email.date, "EEEE d 'de' MMMM yyyy, HH:mm", { locale: es })}</div>
                  </div>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {format(email.date, "d MMM, HH:mm", { locale: es })}
                </span>
                {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>

            {isOpen && (
              <>
                <Separator />
                <div className="px-4 py-4">
                  <div
                    className="email-body [&_table]:border-collapse [&_table]:max-w-full [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_img]:max-w-full [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: email.bodyHtml || "<em>(sin contenido)</em>" }}
                  />

                  {/* Adjuntos: usa email_attachments[] si existe, o el campo legado adjunto_url */}
                  {(() => {
                    const attList: { url: string; nombre: string; tipo?: string | null }[] =
                      email.raw.email_attachments?.length
                        ? email.raw.email_attachments.map(a => ({ url: a.url, nombre: a.nombre, tipo: a.tipo }))
                        : email.attachmentUrl
                          ? [{ url: email.attachmentUrl, nombre: email.attachmentName ?? "Adjunto", tipo: email.attachmentType }]
                          : [];
                    if (attList.length === 0) return null;
                    return (
                      <div className="mt-4 pt-3 border-t">
                        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Paperclip className="w-3 h-3" /> Adjuntos · {attList.length}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {attList.map((a, i) => (
                            <div key={i} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30 text-sm">
                              <Paperclip className="w-4 h-4 text-muted-foreground" />
                              <span className="truncate max-w-[200px]">{a.nombre}</span>
                              <button
                                onClick={() => openAttachment({ url: a.url, name: a.nombre, type: a.tipo ?? undefined })}
                                className="text-xs text-primary hover:underline ml-1"
                              >Ver</button>
                              <a href={a.url} download={a.nombre} className="text-xs text-primary hover:underline">Descargar</a>
                              <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Abrir</a>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {email.direction !== "internal" && (
                    <div className="mt-4 pt-3 border-t flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => onReply(email.raw)}>
                        <Reply className="w-3.5 h-3.5 mr-1.5" /> Responder
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onReplyAll(email.raw)}>
                        <ReplyAll className="w-3.5 h-3.5 mr-1.5" /> Responder a todos
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onForward(email.raw)}>
                        <Forward className="w-3.5 h-3.5 mr-1.5" /> Reenviar
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}

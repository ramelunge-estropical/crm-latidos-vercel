import { useState } from 'react';
import {
  Send, Paperclip, FileText, StickyNote, AlertTriangle,
  Check, CheckCheck, Clock, XCircle, MessageSquare, Phone, Mail, Info
} from 'lucide-react';
import { Conversacion, getMensajes, getCliente, Mensaje, plantillas } from '@/data/latMockData';
import type { Canal, EstadoMensaje } from '@/data/latMockData';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const canalMeta: Record<Canal, { icon: typeof MessageSquare; label: string; color: string }> = {
  whatsapp: { icon: MessageSquare, label: 'WhatsApp', color: 'text-whatsapp' },
  phone: { icon: Phone, label: 'Llamada', color: 'text-phone' },
  email: { icon: Mail, label: 'Correo', color: 'text-email' },
};

const estadoIconMap: Record<EstadoMensaje, { icon: typeof Check; className: string }> = {
  enviado: { icon: Check, className: 'text-muted-foreground' },
  entregado: { icon: CheckCheck, className: 'text-muted-foreground' },
  leido: { icon: CheckCheck, className: 'text-primary' },
  fallido: { icon: XCircle, className: 'text-destructive' },
  pendiente: { icon: Clock, className: 'text-warning' },
};

interface ConversacionPanelProps {
  conversacion: Conversacion;
}

export function ConversacionPanel({ conversacion }: ConversacionPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [showNota, setShowNota] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'templates'>('chat');

  const mensajes = getMensajes(conversacion.id);
  const cliente = getCliente(conversacion.clienteId);
  const canal = canalMeta[conversacion.canal];
  const CanalIcon = canal.icon;

  const isOutOfWindow = conversacion.estado === 'fuera_ventana' ||
    (conversacion.ventanaWhatsapp && conversacion.ventanaWhatsapp.getTime() < Date.now());
  const isWhatsapp = conversacion.canal === 'whatsapp';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <CanalIcon className={`w-4 h-4 shrink-0 ${canal.color}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{cliente?.nombre}</p>
            <p className="text-[10px] text-muted-foreground truncate">{conversacion.asunto}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isWhatsapp && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
              isOutOfWindow ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
            }`}>
              {isOutOfWindow ? 'Fuera de ventana' : 'Ventana activa'}
            </span>
          )}
          <button
            onClick={() => setActiveTab(activeTab === 'templates' ? 'chat' : 'templates')}
            className="p-1.5 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Plantillas"
          >
            <FileText className="w-4 h-4" />
          </button>
        </div>
      </div>

      {activeTab === 'chat' ? (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3">
            {mensajes.map(msg => (
              <MessageBubble key={msg.id} mensaje={msg} />
            ))}
          </div>

          {/* Warning bar */}
          {isWhatsapp && isOutOfWindow && (
            <div className="px-4 py-2 bg-warning/10 border-t border-warning/20 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
              <span className="text-[11px] text-warning">
                Ventana de 24h expirada. Solo puedes enviar plantillas aprobadas.
              </span>
              <button
                onClick={() => setActiveTab('templates')}
                className="text-[11px] font-medium text-warning underline ml-auto"
              >
                Ver plantillas
              </button>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border px-4 py-3">
            {showNota && (
              <div className="mb-2 flex items-center gap-1.5 text-[10px] text-warning bg-warning/10 px-2 py-1 rounded">
                <StickyNote className="w-3 h-3" /> Escribiendo nota interna
                <button onClick={() => setShowNota(false)} className="ml-auto text-warning font-medium">Cancelar</button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="flex gap-1">
                <button className="p-1.5 rounded-md hover:bg-accent/50 text-muted-foreground" title="Adjuntar">
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowNota(!showNota)}
                  className={`p-1.5 rounded-md hover:bg-accent/50 ${showNota ? 'text-warning' : 'text-muted-foreground'}`}
                  title="Nota interna"
                >
                  <StickyNote className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 relative">
                <textarea
                  rows={1}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder={
                    isWhatsapp && isOutOfWindow
                      ? 'Texto libre no disponible. Usa una plantilla.'
                      : showNota
                      ? 'Escribe una nota interna...'
                      : 'Escribe un mensaje...'
                  }
                  disabled={isWhatsapp && isOutOfWindow && !showNota}
                  className="w-full bg-muted/50 text-sm rounded-lg px-3 py-2 border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <button
                className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                disabled={!inputValue.trim() || (isWhatsapp && isOutOfWindow && !showNota)}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <TemplatesPanel canal={conversacion.canal} onBack={() => setActiveTab('chat')} />
      )}
    </div>
  );
}

function MessageBubble({ mensaje }: { mensaje: Mensaje }) {
  const isOutbound = mensaje.tipo === 'outbound';
  const isNota = mensaje.tipo === 'nota_interna';
  const isSistema = mensaje.tipo === 'sistema';
  const estadoIcon = isOutbound ? estadoIconMap[mensaje.estado] : null;
  const StatusIcon = estadoIcon?.icon;

  if (isSistema) {
    return (
      <div className="flex justify-center">
        <div className="bg-muted/50 text-[10px] text-muted-foreground px-3 py-1 rounded-full flex items-center gap-1.5">
          <Info className="w-3 h-3" />
          {mensaje.contenido}
        </div>
      </div>
    );
  }

  if (isNota) {
    return (
      <div className="flex justify-center">
        <div className="bg-warning/10 border border-warning/20 text-[11px] text-warning px-3 py-2 rounded-lg max-w-md">
          <div className="flex items-center gap-1.5 mb-1">
            <StickyNote className="w-3 h-3" />
            <span className="font-medium">Nota interna</span>
            <span className="text-[9px] ml-auto opacity-70">
              {format(mensaje.timestamp, 'HH:mm', { locale: es })}
            </span>
          </div>
          {mensaje.contenido}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[70%] rounded-2xl px-3.5 py-2 ${
          isOutbound
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted text-foreground rounded-bl-md'
        }`}
      >
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{mensaje.contenido}</p>
        {mensaje.adjunto && (
          <div className={`mt-1.5 flex items-center gap-1.5 text-[10px] ${isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground'} bg-black/5 rounded px-2 py-1`}>
            <Paperclip className="w-3 h-3" />
            {mensaje.adjunto.nombre}
          </div>
        )}
        {mensaje.error && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-destructive">
            <XCircle className="w-3 h-3" /> {mensaje.error}
          </div>
        )}
        <div className={`flex items-center justify-end gap-1 mt-1 ${isOutbound ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
          <span className="text-[9px]">{format(mensaje.timestamp, 'HH:mm', { locale: es })}</span>
          {StatusIcon && <StatusIcon className={`w-3 h-3 ${isOutbound ? 'text-primary-foreground/60' : estadoIcon.className}`} />}
        </div>
      </div>
    </div>
  );
}

function TemplatesPanel({ canal, onBack }: { canal: Canal; onBack: () => void }) {
  const [search, setSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const filtered = plantillas.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      return p.nombre.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q);
    }
    return true;
  });

  const selected = plantillas.find(p => p.id === selectedTemplate);

  // suppress unused variable warning for canal (available for future filtering)
  void canal;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Plantillas</h3>
          <button onClick={onBack} className="text-[11px] text-primary font-medium">Volver al chat</button>
        </div>
        <input
          type="text"
          placeholder="Buscar plantilla..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-muted/50 text-xs rounded-md px-3 py-1.5 border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
        {filtered.map(pl => (
          <button
            key={pl.id}
            onClick={() => setSelectedTemplate(pl.id)}
            className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
              selectedTemplate === pl.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{pl.nombre}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                pl.estado === 'aprobada' ? 'bg-success/10 text-success' : pl.estado === 'pendiente' ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive'
              }`}>
                {pl.estado}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{pl.contenido}</p>
          </button>
        ))}
      </div>
      {selected && (
        <div className="border-t border-border p-3 space-y-2">
          <p className="text-[11px] font-medium">Preview</p>
          <div className="bg-muted/50 rounded-lg p-2.5 text-xs text-foreground">{selected.contenido}</div>
          {selected.variables.length > 0 && (
            <div className="space-y-1.5">
              {selected.variables.map(v => (
                <div key={v}>
                  <label className="text-[10px] text-muted-foreground">{`{{${v}}}`}</label>
                  <input className="w-full bg-background text-xs rounded px-2 py-1 border border-border mt-0.5" placeholder={v} />
                </div>
              ))}
            </div>
          )}
          <button
            className="w-full py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
            disabled={selected.estado !== 'aprobada'}
          >
            {selected.estado === 'aprobada' ? 'Enviar plantilla' : 'Plantilla no aprobada'}
          </button>
        </div>
      )}
    </div>
  );
}

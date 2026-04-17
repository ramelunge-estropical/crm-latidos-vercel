import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Send, Paperclip, StickyNote, AlertTriangle,
  Check, CheckCheck, Clock, XCircle, MessageSquare, Phone, Mail, Info,
  ClipboardList, Plus, ChevronRight, User, Building2, Loader2,
} from 'lucide-react';
import { getCliente } from '@/data/latMockData';
import { useLatMensajes, useSendMensaje, LatConversacion, LatMensaje } from '@/hooks/useLatData';
import { GestionDialog } from '@/components/GestionDialog';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// ── Configs ───────────────────────────────────────────────────────────────────

const canalMeta: Record<string, { icon: typeof MessageSquare; label: string; color: string }> = {
  whatsapp: { icon: MessageSquare, label: 'WhatsApp', color: 'text-whatsapp' },
  phone:    { icon: Phone,         label: 'Llamada',  color: 'text-phone'    },
  email:    { icon: Mail,          label: 'Correo',   color: 'text-email'    },
};

const estadoIconMap: Record<string, { icon: typeof Check; className: string }> = {
  enviado:   { icon: Check,      className: 'text-muted-foreground' },
  entregado: { icon: CheckCheck, className: 'text-muted-foreground' },
  leido:     { icon: CheckCheck, className: 'text-primary'          },
  fallido:   { icon: XCircle,    className: 'text-destructive'      },
  pendiente: { icon: Clock,      className: 'text-warning'          },
};

const priorityCfg: Record<string, { label: string; className: string }> = {
  urgent: { label: 'Urgente', className: 'bg-red-500/15 text-red-600'       },
  high:   { label: 'Alta',    className: 'bg-orange-500/15 text-orange-600' },
  medium: { label: 'Media',   className: 'bg-primary/10 text-primary'       },
  low:    { label: 'Baja',    className: 'bg-muted text-muted-foreground'    },
};

const statusDot: Record<string, string> = {
  to_do:  'bg-status-todo',
  doing:  'bg-status-doing',
  review: 'bg-status-review',
  done:   'bg-status-done',
};

type ActiveTab = 'chat' | 'gestiones' | 'templates';

interface ConversacionPanelProps {
  conversacion: LatConversacion;
}

export function ConversacionPanel({ conversacion }: ConversacionPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [showNota, setShowNota]     = useState(false);
  const [activeTab, setActiveTab]   = useState<ActiveTab>('chat');
  const [showCreateGestion, setShowCreateGestion] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isMock = conversacion._source === 'mock';

  // Para mock: buscar cliente del mock data por clienteId (la conv.id es el clienteId en mock)
  const mockCliente = isMock ? getCliente(conversacion.id) : null;
  const clienteNombre = conversacion.cliente_nombre ?? mockCliente?.nombre ?? 'Cliente';
  const clienteId     = conversacion.cliente_id ?? null;

  const canal = canalMeta[conversacion.canal] ?? canalMeta.whatsapp;
  const CanalIcon = canal.icon;

  const isOutOfWindow = conversacion.estado === 'fuera_ventana' ||
    (conversacion.ventana_whatsapp && new Date(conversacion.ventana_whatsapp).getTime() < Date.now());
  const isWhatsapp = conversacion.canal === 'whatsapp';

  // ── Mensajes ──────────────────────────────────────────────────────────────
  const { data: mensajes, isLoading: loadingMsgs } = useLatMensajes(conversacion.id, isMock);
  const { send, loading: sendingMsg } = useSendMensaje();

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mensajes, activeTab]);

  // ── Gestiones del cliente ─────────────────────────────────────────────────
  const { data: gestiones = [], isLoading: loadingGest } = useQuery<any[]>({
    queryKey: ['lat-gestiones-cliente', clienteId, clienteNombre],
    queryFn: async () => {
      try {
        let q = (supabase as any)
          .from('gestiones')
          .select('id, title, priority, type, updated_at, pipeline_stages(name, global_status), processes(name)');
        if (clienteId) {
          q = q.eq('cliente_id', clienteId);
        } else if (clienteNombre) {
          q = q.ilike('cliente_nombre', `%${clienteNombre}%`);
        } else {
          return [];
        }
        const { data, error } = await q.order('updated_at', { ascending: false }).limit(30);
        if (error) return [];
        return data ?? [];
      } catch { return []; }
    },
    enabled: !!(clienteId || clienteNombre),
  });

  const activeGestiones = gestiones.filter(g => g.pipeline_stages?.global_status !== 'done');

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!inputValue.trim()) return;
    const tipo = showNota ? 'nota_interna' : 'outbound';
    const result = await send(conversacion.id, inputValue, tipo, isMock);
    if (result.ok) {
      setInputValue('');
      setShowNota(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <CanalIcon className={`w-4 h-4 shrink-0 ${canal.color}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{clienteNombre}</p>
            <p className="text-[10px] text-muted-foreground truncate">{conversacion.asunto}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isWhatsapp && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
              isOutOfWindow ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
            }`}>
              {isOutOfWindow ? 'Fuera de ventana' : 'Ventana activa'}
            </span>
          )}
          {/* Tab buttons */}
          <button
            onClick={() => setActiveTab('chat')}
            title="Chat"
            className={`p-1.5 rounded-md transition-colors ${activeTab === 'chat' ? 'bg-primary/10 text-primary' : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'}`}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveTab('gestiones')}
            title="Gestiones"
            className={`p-1.5 rounded-md transition-colors relative ${activeTab === 'gestiones' ? 'bg-primary/10 text-primary' : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'}`}
          >
            <ClipboardList className="w-4 h-4" />
            {activeGestiones.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center">
                {activeGestiones.length > 9 ? '9+' : activeGestiones.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Tab: CHAT ── */}
      {activeTab === 'chat' && (
        <>
          <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3">
            {loadingMsgs ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : mensajes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Sin mensajes aún</p>
              </div>
            ) : (
              mensajes.map(msg => <MessageBubble key={msg.id} mensaje={msg} />)
            )}
            <div ref={messagesEndRef} />
          </div>

          {isWhatsapp && isOutOfWindow && (
            <div className="px-4 py-2 bg-warning/10 border-t border-warning/20 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
              <span className="text-[11px] text-warning">Ventana de 24h expirada. Solo podés enviar plantillas aprobadas.</span>
            </div>
          )}

          <div className="border-t border-border px-4 py-3">
            {showNota && (
              <div className="mb-2 flex items-center gap-1.5 text-[10px] text-warning bg-warning/10 px-2 py-1 rounded">
                <StickyNote className="w-3 h-3" /> Nota interna
                <button onClick={() => setShowNota(false)} className="ml-auto font-medium">Cancelar</button>
              </div>
            )}
            {isMock && (
              <div className="mb-2 text-[10px] text-muted-foreground bg-muted/30 px-2 py-1 rounded text-center">
                Modo demo — los mensajes no se guardan. Conectá WhatsApp para activar el chat real.
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="flex gap-1">
                <button className="p-1.5 rounded-md hover:bg-accent/50 text-muted-foreground" title="Adjuntar (próximamente)">
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
              <textarea
                rows={1}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={(isWhatsapp && isOutOfWindow && !showNota) || sendingMsg}
                placeholder={
                  isWhatsapp && isOutOfWindow && !showNota
                    ? 'Ventana expirada. Usá una plantilla.'
                    : showNota
                    ? 'Nota interna...'
                    : 'Escribí un mensaje... (Enter para enviar)'
                }
                className="flex-1 bg-muted/50 text-sm rounded-lg px-3 py-2 border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || (isWhatsapp && isOutOfWindow && !showNota) || sendingMsg}
                className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                {sendingMsg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Tab: GESTIONES ── */}
      {activeTab === 'gestiones' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Subheader */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Gestiones</p>
              <p className="text-[10px] text-muted-foreground">
                {activeGestiones.length} activa{activeGestiones.length !== 1 ? 's' : ''} · {gestiones.length} total
              </p>
            </div>
            <button
              onClick={() => setShowCreateGestion(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva gestión
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
            {loadingGest ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : gestiones.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ClipboardList className="w-8 h-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-foreground">Sin gestiones</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  {clienteNombre !== 'Cliente'
                    ? `No hay gestiones asociadas a ${clienteNombre}.`
                    : 'No hay cliente vinculado a esta conversación.'}
                </p>
                <button
                  onClick={() => setShowCreateGestion(true)}
                  className="mt-3 flex items-center gap-1.5 px-3 py-1.5 border border-primary text-primary rounded-lg text-xs font-medium hover:bg-primary/5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Crear primera gestión
                </button>
              </div>
            ) : (
              gestiones.map((g: any) => {
                const pCfg   = priorityCfg[g.priority] || priorityCfg.medium;
                const status = g.pipeline_stages?.global_status || 'to_do';
                const isDone = status === 'done';
                return (
                  <div
                    key={g.id}
                    className={`flex items-start gap-2.5 rounded-xl p-3 border transition-colors ${
                      isDone ? 'bg-muted/20 border-border/50 opacity-60' : 'bg-card border-border hover:border-primary/30'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${statusDot[status] || 'bg-muted'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-snug truncate">{g.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {g.processes?.name}
                        {g.pipeline_stages?.name && ` · ${g.pipeline_stages.name}`}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${pCfg.className}`}>
                          {pCfg.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(g.updated_at), 'dd MMM', { locale: es })}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── GestionDialog (nueva gestión desde chat) ── */}
      <GestionDialog
        open={showCreateGestion}
        onOpenChange={setShowCreateGestion}
        defaultClienteId={clienteId}
        defaultClienteNombre={clienteNombre !== 'Cliente' ? clienteNombre : undefined}
      />
    </div>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({ mensaje }: { mensaje: LatMensaje }) {
  const isOutbound = mensaje.tipo === 'outbound';
  const isNota     = mensaje.tipo === 'nota_interna';
  const isSistema  = mensaje.tipo === 'sistema';
  const estadoIcon = isOutbound ? estadoIconMap[mensaje.estado] : null;
  const StatusIcon = estadoIcon?.icon;
  const ts         = new Date(mensaje.created_at);

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
            {mensaje.autor_nombre && <span className="opacity-70">· {mensaje.autor_nombre}</span>}
            <span className="text-[9px] ml-auto opacity-70">{format(ts, 'HH:mm', { locale: es })}</span>
          </div>
          {mensaje.contenido}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[70%] rounded-2xl px-3.5 py-2 ${
        isOutbound
          ? 'bg-primary text-primary-foreground rounded-br-md'
          : 'bg-muted text-foreground rounded-bl-md'
      }`}>
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{mensaje.contenido}</p>
        {mensaje.adjunto_nombre && (
          <div className={`mt-1.5 flex items-center gap-1.5 text-[10px] ${isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground'} bg-black/5 rounded px-2 py-1`}>
            <Paperclip className="w-3 h-3" />
            {mensaje.adjunto_nombre}
          </div>
        )}
        <div className={`flex items-center justify-end gap-1 mt-1 ${isOutbound ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
          <span className="text-[9px]">{format(ts, 'HH:mm', { locale: es })}</span>
          {StatusIcon && <StatusIcon className={`w-3 h-3 ${isOutbound ? 'text-primary-foreground/60' : estadoIcon!.className}`} />}
        </div>
      </div>
    </div>
  );
}

// Suppress unused import warnings
void User; void Building2;

import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Send, Paperclip, StickyNote, AlertTriangle,
  Check, CheckCheck, Clock, XCircle, MessageSquare, Phone, Mail, Info,
  ClipboardList, Plus, ChevronRight, User, Building2, Loader2, Search, X,
} from 'lucide-react';
import { getCliente } from '@/data/latMockData';
import { useLatMensajes, useSendMensaje, LatConversacion, LatMensaje } from '@/hooks/useLatData';
import { GestionDialog } from '@/components/GestionDialog';
import { GestionDetailView } from '@/components/GestionDetailView';
import { CreateClienteDialog } from '@/components/CreateClienteDialog';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useClientes } from '@/hooks/useSharedQueries';
import { toast } from 'sonner';

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

const statusLabel: Record<string, { label: string; className: string }> = {
  to_do:  { label: 'Pendiente',   className: 'bg-muted text-muted-foreground'   },
  doing:  { label: 'En curso',    className: 'bg-blue-500/15 text-blue-600'     },
  review: { label: 'En revisión', className: 'bg-yellow-500/15 text-yellow-600' },
  done:   { label: 'Finalizado',  className: 'bg-green-500/15 text-green-700'   },
};

type ActiveTab = 'chat' | 'gestiones' | 'cliente';

interface ConversacionPanelProps {
  conversacion: LatConversacion;
}

export function ConversacionPanel({ conversacion }: ConversacionPanelProps) {
  const [inputValue, setInputValue]               = useState('');
  const [showNota, setShowNota]                   = useState(false);
  const [activeTab, setActiveTab]                 = useState<ActiveTab>('cliente');
  const [showCreateGestion, setShowCreateGestion] = useState(false);
  const [vincularSearch, setVincularSearch]       = useState('');
  const [showVincular, setShowVincular]           = useState(false);
  const [showCrearCliente, setShowCrearCliente]   = useState(false);
  const [selectedGestionId, setSelectedGestionId] = useState<string | null>(null);
  const [mostrarTodasGest, setMostrarTodasGest]   = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const isMock = conversacion._source === 'mock';

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

  // ── Cliente desde BD ──────────────────────────────────────────────────────
  const telefono = conversacion.telefono ?? '';

  const { data: clienteDBResult } = useQuery<any[]>({
    queryKey: ['lat-cliente-db', clienteId, telefono],
    queryFn: async () => {
      if (clienteId) {
        const { data } = await (supabase as any)
          .from('clientes')
          .select('id, nombre_completo, razon_social, email, telefono, tipo_cliente, documento_numero, nit')
          .eq('id', clienteId);
        return data ?? [];
      }
      if (!telefono) return [];
      const phone = telefono.replace(/\D/g, '');
      const { data } = await (supabase as any)
        .from('clientes')
        .select('id, nombre_completo, razon_social, email, telefono, tipo_cliente, documento_numero, nit')
        .or(`telefono.eq.${phone},telefono.eq.+${phone},telefono.ilike.%${phone}%`);
      return data ?? [];
    },
    enabled: !isMock && (!!clienteId || !!telefono),
  });

  const clientesEncontrados = clienteDBResult ?? [];
  const clienteDB           = clientesEncontrados[0] ?? null;
  const hayDuplicados       = clientesEncontrados.length > 1;

  const { data: todosClientes = [] } = useClientes();

  const clientesFiltrados = vincularSearch.length >= 2
    ? todosClientes.filter(c => {
        const q = vincularSearch.toLowerCase();
        return (
          c.nombre_completo?.toLowerCase().includes(q) ||
          c.razon_social?.toLowerCase().includes(q) ||
          c.telefono?.includes(vincularSearch) ||
          c.documento_numero?.includes(vincularSearch) ||
          c.nit?.includes(vincularSearch)
        );
      }).slice(0, 8)
    : [];

  const handleVincularCliente = async (cId: string, cNombre: string) => {
    await (supabase as any)
      .from('lat_conversaciones')
      .update({ cliente_id: cId, cliente_nombre: cNombre })
      .eq('id', conversacion.id);
    queryClient.invalidateQueries({ queryKey: ['lat-conversaciones'] });
    queryClient.invalidateQueries({ queryKey: ['lat-cliente-db', cId, telefono] });
    setShowVincular(false);
    setVincularSearch('');
  };

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!inputValue.trim()) return;
    const tipo = showNota ? 'nota_interna' : 'outbound';
    const result = await send(conversacion.id, inputValue, tipo, isMock);
    if (result.ok) {
      setInputValue('');
      setShowNota(false);
    } else {
      toast.error(result.error ?? 'Error al enviar el mensaje');
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
          <button
            onClick={() => setActiveTab('cliente')}
            title="Cliente"
            className={`p-1.5 rounded-md transition-colors relative ${activeTab === 'cliente' ? 'bg-primary/10 text-primary' : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'}`}
          >
            <User className="w-4 h-4" />
            {!clienteId && !isMock && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-warning" />
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
              <div className="flex items-center gap-1 mt-1.5">
                <button
                  onClick={() => setMostrarTodasGest(false)}
                  className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${!mostrarTodasGest ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >Activas</button>
                <button
                  onClick={() => setMostrarTodasGest(true)}
                  className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${mostrarTodasGest ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >Todas</button>
              </div>
            </div>
            {clienteId ? (
              <button
                onClick={() => setShowCreateGestion(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Nueva gestión
              </button>
            ) : (
              <button
                onClick={() => setActiveTab('cliente')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-warning/10 text-warning border border-warning/30 rounded-lg text-xs font-medium hover:bg-warning/20 transition-colors shrink-0"
              >
                <User className="w-3.5 h-3.5" />
                Registrar cliente
              </button>
            )}
          </div>

          {!clienteId && !isMock && (
            <div className="mx-4 mt-3 flex items-start gap-2 bg-warning/10 border border-warning/20 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
              <p className="text-[11px] text-warning leading-snug">
                Para crear gestiones, primero registrá o vinculá al cliente en el tab <strong>Cliente</strong>.
              </p>
            </div>
          )}

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
                {clienteId ? (
                  <button
                    onClick={() => setShowCreateGestion(true)}
                    className="mt-3 flex items-center gap-1.5 px-3 py-1.5 border border-primary text-primary rounded-lg text-xs font-medium hover:bg-primary/5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Crear primera gestión
                  </button>
                ) : (
                  <button
                    onClick={() => setActiveTab('cliente')}
                    className="mt-3 flex items-center gap-1.5 px-3 py-1.5 border border-warning/40 text-warning rounded-lg text-xs font-medium hover:bg-warning/10 transition-colors"
                  >
                    <User className="w-3.5 h-3.5" /> Registrar cliente primero
                  </button>
                )}
              </div>
            ) : (
              (mostrarTodasGest ? gestiones : activeGestiones).map((g: any) => {
                const pCfg   = priorityCfg[g.priority] || priorityCfg.medium;
                const status = g.pipeline_stages?.global_status || 'to_do';
                const isDone = status === 'done';
                const sLabel = statusLabel[status] || statusLabel.to_do;
                return (
                  <div
                    key={g.id}
                    onClick={() => setSelectedGestionId(g.id)}
                    className={`flex items-start gap-2.5 rounded-xl p-3 border transition-colors cursor-pointer ${
                      isDone ? 'bg-muted/20 border-border/50 opacity-70 hover:opacity-90' : 'bg-card border-border hover:border-primary/30 hover:bg-accent/30'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${statusDot[status] || 'bg-muted'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-snug truncate">{g.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {g.processes?.name}
                        {g.pipeline_stages?.name && ` · ${g.pipeline_stages.name}`}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sLabel.className}`}>
                          {sLabel.label}
                        </span>
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

      {/* ── Tab: CLIENTE ── */}
      {activeTab === 'cliente' && (
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
          {isMock ? (
            <div className="text-center py-8 text-muted-foreground text-xs">Disponible solo en modo real.</div>
          ) : clienteDB ? (
            <>
              {hayDuplicados && (
                <div className="flex items-center gap-2 bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                  <p className="text-[11px] text-warning">
                    Se encontraron {clientesEncontrados.length} clientes con este número. Mostrando el primero.
                  </p>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {clienteDB.nombre_completo ?? clienteDB.razon_social ?? '—'}
                  </p>
                  <p className="text-[10px] text-muted-foreground capitalize">{clienteDB.tipo_cliente ?? 'cliente'}</p>
                </div>
              </div>
              <div className="space-y-2">
                {(clienteDB.documento_numero || clienteDB.nit) && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-16 shrink-0">CI / NIT</span>
                    <span className="text-foreground">{clienteDB.documento_numero ?? clienteDB.nit}</span>
                  </div>
                )}
                {clienteDB.telefono && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-16 shrink-0">Teléfono</span>
                    <span className="text-foreground">{clienteDB.telefono}</span>
                  </div>
                )}
                {clienteDB.email && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-16 shrink-0">Email</span>
                    <span className="text-foreground truncate">{clienteDB.email}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  const event = new CustomEvent('navigate-to-cliente360', { detail: { clienteId: clienteDB.id } });
                  window.dispatchEvent(event);
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-border text-muted-foreground rounded-lg text-xs hover:bg-accent/50 transition-colors mt-2"
              >
                <ChevronRight className="w-3.5 h-3.5" /> Ver perfil completo en Cliente 360
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
                <User className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Cliente no registrado</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {conversacion.telefono ? `Número: ${conversacion.telefono}` : 'Sin número asociado'}
                </p>
                <p className="text-[11px] text-muted-foreground/70 mt-1">
                  Creá el cliente para poder gestionar sus datos y vincular gestiones.
                </p>
              </div>
              {!showVincular ? (
                <div className="flex flex-col gap-2 w-full">
                  <button
                    onClick={() => setShowCrearCliente(true)}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Crear cliente
                  </button>
                  <button
                    onClick={() => setShowVincular(true)}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-border text-muted-foreground rounded-lg text-xs font-medium hover:bg-accent/50 transition-colors"
                  >
                    <Search className="w-3.5 h-3.5" /> Ya existe, vincular
                  </button>
                </div>
              ) : (
                <div className="w-full space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Nombre, CI, NIT o teléfono..."
                      value={vincularSearch}
                      onChange={e => setVincularSearch(e.target.value)}
                      className="w-full bg-muted/50 text-xs rounded-lg pl-8 pr-8 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <button onClick={() => { setShowVincular(false); setVincularSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  {clientesFiltrados.length > 0 && (
                    <div className="border border-border rounded-lg overflow-hidden bg-card">
                      {clientesFiltrados.map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleVincularCliente(c.id, c.nombre_completo ?? c.razon_social ?? '')}
                          className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors border-b border-border/50 last:border-0"
                        >
                          <p className="text-xs font-medium truncate">{c.nombre_completo ?? c.razon_social}</p>
                          <p className="text-[10px] text-muted-foreground">{c.telefono ?? c.email ?? (c.documento_numero ? `CI: ${c.documento_numero}` : '')}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {vincularSearch.length >= 2 && clientesFiltrados.length === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center py-2">Sin resultados</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <GestionDialog
        open={showCreateGestion}
        onOpenChange={setShowCreateGestion}
        defaultClienteId={clienteId}
        defaultClienteNombre={clienteNombre !== 'Cliente' ? clienteNombre : undefined}
      />

      <GestionDetailView
        open={!!selectedGestionId}
        onOpenChange={(o) => { if (!o) setSelectedGestionId(null); }}
        gestionId={selectedGestionId ?? ''}
      />

      <CreateClienteDialog
        open={showCrearCliente}
        onOpenChange={(open) => {
          setShowCrearCliente(open);
          if (!open) {
            queryClient.invalidateQueries({ queryKey: ['lat-conversaciones'] });
            queryClient.invalidateQueries({ queryKey: ['lat-cliente-db', clienteId, telefono] });
          }
        }}
        initialTelefono={conversacion.telefono ?? ''}
        initialNombre={conversacion.cliente_nombre ?? ''}
        initialCanal="WhatsApp"
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
        <div className="bg-warning/10 border border-warning/20 text-[11px] text-warning px-3 py-2 rounded-lg max-md">
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

void Building2;

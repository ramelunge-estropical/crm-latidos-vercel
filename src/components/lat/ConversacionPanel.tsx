import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Send, Paperclip, StickyNote, AlertTriangle,
  Check, CheckCheck, Clock, XCircle, MessageSquare, Phone, Mail, Info,
  ClipboardList, Plus, ChevronRight, User, Building2, Loader2, Search, X,
  Unlink, FileText, Sparkles, Image as ImageIcon, Download, Play,
  Activity, Zap, TrendingUp, ArrowRight, Bot,
} from 'lucide-react';
import { getCliente } from '@/data/latMockData';
import { useLatMensajes, useSendMensaje, useSendAdjunto, LatConversacion, LatMensaje } from '@/hooks/useLatData';
import { GestionDialog } from '@/components/GestionDialog';
import { GestionDetailView } from '@/components/GestionDetailView';
import { CreateClienteDialog } from '@/components/CreateClienteDialog';
import { WppTemplatePicker, WppTemplate } from '@/components/lat/WppTemplatePicker';
import { AiAsesorPopover } from '@/components/lat/AiAsesorPopover';
import { DerivarChatDialog } from '@/components/lat/DerivarChatDialog';
import { AttachmentViewer, openAttachment } from '@/components/lat/AttachmentViewer';
import { EmailThreadView } from '@/components/lat/EmailThreadView';
import { EmailComposer, type ComposerInitial } from '@/components/lat/EmailComposer';
import { useEmailDraft } from '@/hooks/useEmailDraft';
import { GitBranch, Hand, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCurrentUserRol, useClientes } from '@/hooks/useSharedQueries';
import { Button } from '@/components/ui/button';
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

const estadoLabelMap: Record<string, string> = {
  enviado: 'Enviado',
  entregado: 'Entregado',
  leido: 'Leído',
  fallido: 'Fallido',
  pendiente: 'Pendiente',
};

const estadoAliasMap: Record<string, keyof typeof estadoIconMap> = {
  submitted: 'enviado',
  sent: 'enviado',
  enviado: 'enviado',
  delivered: 'entregado',
  received: 'entregado',
  entregado: 'entregado',
  read: 'leido',
  seen: 'leido',
  leido: 'leido',
  leído: 'leido',
  failed: 'fallido',
  error: 'fallido',
  rejected: 'fallido',
  fallido: 'fallido',
  pending: 'pendiente',
  enqueued: 'pendiente',
  queued: 'pendiente',
  pendiente: 'pendiente',
};

const genericMediaPlaceholderPattern = /^(?:\[(?:adjunto|image|audio|video|file|document|sticker)(?:[^\]]*)\]|(?:📷\s*Imagen|🎤\s*Nota de voz|🎥\s*Video|📎\s*(?:Documento|Archivo)|😀\s*Sticker)|(?:imagen|audio|video|archivo|documento|sticker))$/i;
const inlineLinkPattern = /\[([^,\]]+),(https?:\/\/[^\]\s]+)\]|((?:https?:\/\/|www\.)[^\s<]+)/gi;

function normalizeMensajeEstado(estado?: string | null): keyof typeof estadoIconMap {
  const raw = String(estado ?? '').trim().toLowerCase();
  const normalized = estadoAliasMap[raw] ?? (raw as keyof typeof estadoIconMap);
  return normalized in estadoIconMap ? normalized : 'pendiente';
}

function normalizeHref(url: string) {
  return url.startsWith('www.') ? `https://${url}` : url;
}

function renderMessageContent(content: string, linkClassName: string) {
  const fragments: JSX.Element[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(inlineLinkPattern)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      fragments.push(<span key={`text-${start}`}>{content.slice(lastIndex, start)}</span>);
    }

    const bracketLabel = match[1];
    const bracketUrl = match[2];
    const plainUrl = match[3];
    const href = normalizeHref(bracketUrl ?? plainUrl ?? '');
    const label = bracketLabel ?? plainUrl ?? href;

    fragments.push(
      <a
        key={`link-${start}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        {label}
      </a>
    );

    lastIndex = start + match[0].length;
  }

  if (lastIndex < content.length) {
    fragments.push(<span key={`text-${lastIndex}`}>{content.slice(lastIndex)}</span>);
  }

  return fragments.length > 0 ? fragments : [<span key="text-full">{content}</span>];
}

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

type ActiveTab = 'chat' | 'gestiones' | 'cliente' | 'trazabilidad';

// ─── EVENTO_LABELS ────────────────────────────────────────────────────────────

const EVENTO_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  ingreso:               { label: 'Ingreso',              color: 'text-blue-500',    icon: ArrowRight },
  asignacion_automatica: { label: 'Asig. automática',     color: 'text-purple-500',  icon: Bot },
  asignacion_manual:     { label: 'Asig. manual',         color: 'text-indigo-500',  icon: User },
  derivacion:            { label: 'Derivación',           color: 'text-amber-500',   icon: ArrowRight },
  cambio_estado:         { label: 'Cambio estado',        color: 'text-cyan-500',    icon: Activity },
  cambio_cola:           { label: 'Cambio de cola',       color: 'text-violet-500',  icon: Activity },
  mensaje_entrante:      { label: 'Msg entrante',         color: 'text-green-500',   icon: MessageSquare },
  mensaje_saliente:      { label: 'Msg saliente',         color: 'text-teal-500',    icon: Send },
  nota_interna:          { label: 'Nota interna',         color: 'text-yellow-500',  icon: StickyNote },
  ia_sugerencia:         { label: 'IA · Sugerencia',      color: 'text-fuchsia-500', icon: Zap },
  ia_aplicada:           { label: 'IA · Aplicada',        color: 'text-fuchsia-600', icon: Sparkles },
  cierre:                { label: 'Cierre',               color: 'text-red-500',     icon: XCircle },
  reapertura:            { label: 'Reapertura',           color: 'text-emerald-500', icon: Activity },
  bot_activado:          { label: 'Bot activado',         color: 'text-sky-500',     icon: Bot },
  bot_desactivado:       { label: 'Bot desactivado',      color: 'text-slate-500',   icon: Bot },
};

function TrazabilidadTab({ conversacionId }: { conversacionId: string }) {
  const { data: eventos = [], isLoading } = useQuery<any[]>({
    queryKey: ['lat_trazabilidad', conversacionId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('lat_trazabilidad')
        .select('*, colaboradores(nombre, color), cola_anterior:cola_anterior_id(nombre, color), cola_nueva:cola_nueva_id(nombre, color)')
        .eq('conversacion_id', conversacionId)
        .order('created_at', { ascending: true });
      return data || [];
    },
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (eventos.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-6">
        <Activity className="w-8 h-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Sin eventos registrados</p>
        <p className="text-xs text-muted-foreground/60">Los eventos aparecerán aquí a medida que ocurran.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3">
      <div className="relative">
        <div className="absolute left-3.5 top-0 bottom-0 w-px bg-border" />
        <div className="space-y-3">
          {eventos.map((ev: any) => {
            const cfg = EVENTO_CONFIG[ev.tipo_evento] ?? { label: ev.tipo_evento, color: 'text-muted-foreground', icon: Activity };
            const Icon = cfg.icon;
            const hora = ev.created_at ? format(new Date(ev.created_at), 'dd/MM HH:mm', { locale: es }) : '';
            return (
              <div key={ev.id} className="flex gap-3 items-start">
                <div className={`w-7 h-7 rounded-full border-2 border-background bg-card flex items-center justify-center shrink-0 z-10 ${cfg.color}`}>
                  <Icon className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                    {ev.estado_anterior && ev.estado_nuevo && (
                      <span className="text-[10px] text-muted-foreground">
                        {ev.estado_anterior} → {ev.estado_nuevo}
                      </span>
                    )}
                    {ev.cola_anterior && ev.cola_nueva && (
                      <span className="text-[10px] text-muted-foreground">
                        {ev.cola_anterior.nombre} → {ev.cola_nueva.nombre}
                      </span>
                    )}
                  </div>
                  {ev.descripcion && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{ev.descripcion}</p>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground/60">{hora}</span>
                    {ev.colaboradores && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium"
                        style={{ backgroundColor: ev.colaboradores.color || '#6366f1' }}
                      >
                        {ev.colaboradores.nombre}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface ConversacionPanelProps {
  conversacion: LatConversacion;
}

export function ConversacionPanel({ conversacion }: ConversacionPanelProps) {
  const [inputValue, setInputValue]               = useState('');
  const [showNota, setShowNota]                   = useState(false);
  // Por defecto la primera vista activa es el chat (consola de atención).
  const [activeTab, setActiveTab]                 = useState<ActiveTab>('chat');
  const [showCreateGestion, setShowCreateGestion] = useState(false);
  const [vincularSearch, setVincularSearch]       = useState('');
  const [showVincular, setShowVincular]           = useState(false);
  const [showCrearCliente, setShowCrearCliente]   = useState(false);
  const [selectedGestionId, setSelectedGestionId] = useState<string | null>(null);
  const [mostrarTodasGest, setMostrarTodasGest]   = useState(true);
  const [showTemplates, setShowTemplates]         = useState(false);
  const [showAi, setShowAi]                       = useState(false);
  const [showDerivar, setShowDerivar]             = useState(false);
  const [tomandoCola, setTomandoCola]             = useState(false);
  const [liberando, setLiberando]                 = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['lat_conversaciones'] });
    queryClient.invalidateQueries({ queryKey: ['lat-conversaciones'] });
    queryClient.invalidateQueries({ queryKey: ['lat-cliente-db'] });
    queryClient.invalidateQueries({ queryKey: ['lat-gestiones-cliente'] });
    queryClient.invalidateQueries({ queryKey: ['cliente-db-panel'] });
    queryClient.invalidateQueries({ queryKey: ['gestiones-panel'] });
    queryClient.invalidateQueries({ queryKey: ['clientes'] });
  };

  const isMock = conversacion._source === 'mock';

  const { user: currentUser } = useCurrentUserRol();
  const autorNombre = currentUser?.nombre ?? undefined;

  const mockCliente = isMock ? getCliente(conversacion.id) : null;
  const clienteNombre = conversacion.cliente_nombre ?? conversacion.telefono ?? mockCliente?.nombre ?? 'Sin nombre';
  const clienteId     = conversacion.cliente_id ?? null;

  const canal = canalMeta[conversacion.canal] ?? canalMeta.whatsapp;
  const CanalIcon = canal.icon;

  const isOutOfWindow = conversacion.estado === 'fuera_ventana' ||
    (conversacion.ventana_whatsapp && new Date(conversacion.ventana_whatsapp).getTime() < Date.now());
  const isWhatsapp = conversacion.canal === 'whatsapp';
  const isEmail = conversacion.canal === 'email';

  // ── Mensajes ──────────────────────────────────────────────────────────────
  const { data: mensajes, isLoading: loadingMsgs } = useLatMensajes(conversacion.id, isMock);
  const { send, loading: sendingMsg } = useSendMensaje();
  const { sendAdjunto, loading: sendingAdj } = useSendAdjunto();
  const fileInputRef = useRef<HTMLInputElement>(null);
  type PendingItem = { id: string; file: File; preview: string | null };
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const MAX_FILE_SIZE = 16 * 1024 * 1024;
  const MAX_QUEUE = 10;

  useEffect(() => {
    if (activeTab === 'chat' && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [mensajes, activeTab]);

  // Marcar como leído al abrir la conversación (real)
  useEffect(() => {
    if (isMock) return;
    if ((conversacion.no_leidos ?? 0) > 0) {
      (supabase as any)
        .from('lat_conversaciones')
        .update({ no_leidos: 0 })
        .eq('id', conversacion.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['lat_conversaciones'] });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacion.id]);

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
    invalidateAll();
    toast.success('Cliente vinculado');
    setShowVincular(false);
    setVincularSearch('');
    setActiveTab('gestiones');
  };

  const handleAutoVincularCreado = async (cId: string, cNombre: string, tel?: string | null, email?: string | null) => {
    // Si la conversación no tiene cliente, lo vinculamos automáticamente
    if (!isMock && !clienteId) {
      const update: any = { cliente_id: cId, cliente_nombre: cNombre };
      if (!conversacion.telefono && tel) update.telefono = tel;
      await (supabase as any).from('lat_conversaciones').update(update).eq('id', conversacion.id);
      toast.success('Cliente creado y vinculado');
    }
    invalidateAll();
    setActiveTab('gestiones');
  };

  // ── Liberar chat ──────────────────────────────────────────────────────────
  const conversacionEstaLiberada = conversacion.estado === 'liberado' || !conversacion.en_foco;
  const tieneVinculoGestion = !!(conversacion.gestion_id || activeGestiones.length > 0);

  const handleLiberarChat = async () => {
    if (isMock) { toast.info('Disponible solo en modo real'); return; }
    setLiberando(true);
    try {
      await (supabase as any)
        .from('lat_conversaciones')
        .update({ en_foco: false, estado: 'resuelta', estado_asignacion: 'cerrada' })
        .eq('id', conversacion.id);
      await (supabase as any).from('lat_mensajes').insert({
        conversacion_id: conversacion.id,
        tipo: 'sistema',
        contenido: 'Chat marcado como atendido.',
        estado: 'enviado',
      });
      invalidateAll();
      toast.success('Chat marcado como atendido');
    } catch (e: any) {
      toast.error(e.message ?? 'Error al liberar chat');
    } finally {
      setLiberando(false);
    }
  };

  const handleReactivarChat = async () => {
    if (isMock) return;
    await (supabase as any)
      .from('lat_conversaciones')
      .update({ en_foco: true, estado: 'abierto' })
      .eq('id', conversacion.id);
    invalidateAll();
    toast.success('Chat reactivado al foco');
  };

  // ── Tomar conversación desde cola ────────────────────────────────────────
  // Cuando una conversación está en cola del equipo, cualquier agente puede
  // tomarla. En ese momento pasa a ser responsable efectivo y desde ahí
  // corren sus métricas personales.
  const handleTomarDeCola = async () => {
    if (isMock) return;
    setTomandoCola(true);
    try {
      // Buscamos un colaborador para identificar al "tomador". Si no podemos
      // resolverlo (no auth) usamos la etiqueta "Agente" — la trazabilidad
      // queda igual visible en el hilo.
      let tomadorId: string | null = null;
      let tomadorNombre = 'Agente';
      try {
        const { data: { user } } = await (supabase as any).auth.getUser();
        if (user?.id) {
          const { data: col } = await (supabase as any)
            .from('colaboradores')
            .select('id, nombre, area_id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (col) {
            tomadorId = col.id;
            tomadorNombre = col.nombre;
          }
        }
      } catch { /* ignore */ }

      // Actualizar conversación: sale de cola, queda asignada al tomador
      const colaArea = conversacion.cola_area_nombre;
      await (supabase as any)
        .from('lat_conversaciones')
        .update({
          en_cola: false,
          cola_area_id: null,
          cola_area_nombre: null,
          responsable_id: tomadorId,
          responsable_nombre: tomadorNombre,
          en_foco: true,
          estado: 'abierto',
        })
        .eq('id', conversacion.id);

      // Mensaje de sistema visible en el hilo
      await (supabase as any).from('lat_mensajes').insert({
        conversacion_id: conversacion.id,
        tipo: 'sistema',
        contenido: `🙋 Conversación tomada desde la cola${colaArea ? ` de ${colaArea}` : ''} por ${tomadorNombre}.`,
        estado: 'enviado',
      });

      // Bitácora
      await (supabase as any).from('chat_derivaciones').insert({
        conversacion_id: conversacion.id,
        derivado_por_id: tomadorId,
        derivado_por_nombre: tomadorNombre,
        destino_tipo: 'usuario',
        destino_usuario_id: tomadorId,
        destino_usuario_nombre: tomadorNombre,
        efectivo_tipo: 'usuario',
        efectivo_usuario_id: tomadorId,
        efectivo_usuario_nombre: tomadorNombre,
        hubo_fallback: false,
        nota: `Tomada desde cola${colaArea ? ` de ${colaArea}` : ''}`,
      });

      invalidateAll();
      toast.success(`Conversación asignada a ${tomadorNombre}`);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al tomar la conversación');
    } finally {
      setTomandoCola(false);
    }
  };

  // ── Adjuntos ──────────────────────────────────────────────────────────────
  const addFilesToQueue = (files: File[]) => {
    if (!files.length) return;
    if (isMock) { toast.info('Disponible solo en modo real'); return; }
    if (!isWhatsapp) { toast.error('Adjuntos solo disponibles en WhatsApp'); return; }

    setPendingItems(prev => {
      const next = [...prev];
      let rejectedSize = 0;
      let rejectedQueue = 0;
      for (const file of files) {
        if (next.length >= MAX_QUEUE) { rejectedQueue++; continue; }
        if (file.size > MAX_FILE_SIZE) { rejectedSize++; continue; }
        const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          preview,
        });
      }
      if (rejectedSize > 0) toast.error(`${rejectedSize} archivo(s) superan 16 MB`);
      if (rejectedQueue > 0) toast.error(`Máximo ${MAX_QUEUE} adjuntos por envío`);
      return next;
    });
  };

  const removePendingItem = (id: string) => {
    setPendingItems(prev => {
      const item = prev.find(p => p.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter(p => p.id !== id);
    });
  };

  const clearPending = () => {
    setPendingItems(prev => {
      prev.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview); });
      return [];
    });
  };

  // Limpiar object URLs al desmontar
  useEffect(() => {
    return () => {
      pendingItems.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePaste = (e: React.ClipboardEvent) => {
    if (isMock || !isWhatsapp) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addFilesToQueue(files);
    }
  };

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const dropzoneEnabled = !isMock && isWhatsapp;

  const handleDragEnter = (e: React.DragEvent) => {
    if (!dropzoneEnabled) return;
    if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!dropzoneEnabled) return;
    if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!dropzoneEnabled) return;
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!dropzoneEnabled) return;
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) addFilesToQueue(files);
  };

  const handleSendQueue = async (): Promise<boolean> => {
    if (pendingItems.length === 0) return false;
    if (isMock) { toast.info('Disponible solo en modo real'); return false; }

    const caption = inputValue.trim();
    let okCount = 0;
    let failCount = 0;
    const failures: string[] = [];

    // Snapshot de la cola — enviamos secuencialmente y aplicamos el caption sólo al primero
    const queue = [...pendingItems];
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      const cap = i === 0 ? caption : '';
      const result = await sendAdjunto(conversacion.id, item.file, cap, isMock, autorNombre);
      if (result.ok) {
        okCount++;
        // Quitar el item enviado de la cola para feedback progresivo
        setPendingItems(prev => {
          const found = prev.find(p => p.id === item.id);
          if (found?.preview) URL.revokeObjectURL(found.preview);
          return prev.filter(p => p.id !== item.id);
        });
      } else {
        failCount++;
        failures.push(`${item.file.name}: ${result.error ?? 'error'}`);
      }
    }

    if (okCount > 0) {
      setInputValue('');
      toast.success(`${okCount} adjunto${okCount > 1 ? 's enviados' : ' enviado'}`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} fallido(s)\n${failures.slice(0, 3).join('\n')}`, { duration: 7000 });
    }
    return failCount === 0;
  };

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (pendingItems.length > 0) { await handleSendQueue(); return; }
    if (!inputValue.trim()) return;
    const tipo = showNota ? 'nota_interna' : 'outbound';
    const result = await send(conversacion.id, inputValue, tipo, isMock, autorNombre);
    if (result.ok) {
      setInputValue('');
      setShowNota(false);
    } else {
      toast.error(result.error ?? 'Error al enviar el mensaje');
    }
  };

  const handleSendTemplate = async ({ template, variables, bodyPreview }: { template: WppTemplate; variables: string[]; bodyPreview: string }): Promise<boolean> => {
    if (isMock) { toast.info('Disponible solo en modo real'); return false; }
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/wpp-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          conversacion_id: conversacion.id,
          template_id: template.id,
          template_name: template.name,
          template_language: template.language,
          template_variables: variables,
          template_body_preview: bodyPreview,
          autor_nombre: autorNombre ?? null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error ?? `Error ${res.status} al enviar plantilla`;
        queryClient.invalidateQueries({ queryKey: ['lat_mensajes', conversacion.id] });
        queryClient.invalidateQueries({ queryKey: ['lat_conversaciones'] });
        toast.error(msg, { duration: 6000 });
        console.error('wpp-send error:', json);
        return false;
      }
      queryClient.invalidateQueries({ queryKey: ['lat_mensajes', conversacion.id] });
      queryClient.invalidateQueries({ queryKey: ['lat_conversaciones'] });
      toast.success('Plantilla enviada al cliente');
      return true;
    } catch (e: any) {
      toast.error(e.message ?? 'Error al enviar plantilla');
      return false;
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
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

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
          {!isMock && (
            <button
              onClick={() => setShowDerivar(true)}
              title="Derivar conversación a un usuario o cola de equipo"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border border-border hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              <GitBranch className="w-3 h-3" />
              Derivar
            </button>
          )}
          {!isMock && tieneVinculoGestion && !conversacionEstaLiberada && (
            <button
              onClick={handleLiberarChat}
              disabled={liberando}
              title="Liberar chat del foco (queda vinculado a la gestión y vuelve al foco si llega un mensaje)"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border border-border hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              {liberando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
              Liberar
            </button>
          )}
          {!isMock && conversacionEstaLiberada && (
            <button
              onClick={handleReactivarChat}
              title="Reactivar al foco de Bandeja"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              En foco
            </button>
          )}
        </div>
      </div>

      {/* ── Banner: bot activo ── */}
      {!isMock && (conversacion as any).bot_estado === 'activo' && (
        <div className="px-4 py-2 bg-fuchsia-500/10 border-b border-fuchsia-500/20 flex items-center gap-2 shrink-0">
          <Bot className="w-3.5 h-3.5 text-fuchsia-500 shrink-0" />
          <span className="text-[11px] text-fuchsia-600 flex-1 font-medium">
            Lati IA está atendiendo esta conversación
          </span>
          <button
            onClick={async () => {
              await (supabase as any).from('lat_conversaciones').update({ bot_estado: 'handed_off' }).eq('id', conversacion.id);
              invalidateAll();
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-fuchsia-500/20 text-fuchsia-700 hover:bg-fuchsia-500/30 transition-colors"
          >
            <Hand className="w-3 h-3" />
            Tomar del bot
          </button>
        </div>
      )}

      {/* ── Banner: conversación en cola del equipo ── */}
      {!isMock && conversacion.en_cola && (
        <div className="px-4 py-2 bg-warning/10 border-b border-warning/20 flex items-center gap-2 shrink-0">
          <Users className="w-3.5 h-3.5 text-warning shrink-0" />
          <span className="text-[11px] text-warning flex-1">
            En cola del equipo {conversacion.cola_area_nombre ?? ''}. Sin responsable asignado.
          </span>
          <button
            onClick={handleTomarDeCola}
            disabled={tomandoCola}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-warning text-warning-foreground hover:bg-warning/90 transition-colors disabled:opacity-60"
          >
            {tomandoCola ? <Loader2 className="w-3 h-3 animate-spin" /> : <Hand className="w-3 h-3" />}
            Tomar conversación
          </button>
        </div>
      )}

      {/* ── Tab: CHAT (email) ── */}
      {activeTab === 'chat' && isEmail && (
        <EmailPanel
          conversacionId={conversacion.id}
          mensajes={mensajes ?? []}
          loading={loadingMsgs}
          autorNombre={conversacion.responsable_nombre ?? undefined}
        />
      )}

      {/* ── Tab: CHAT (no-email) ── */}
      {activeTab === 'chat' && !isEmail && (
        <>
          {/* IA Compact Block */}
          {!isMock && (conversacion.intencion_detectada || conversacion.urgencia_detectada || conversacion.cola_sugerida_id) && (
            <div className="px-4 py-2 bg-fuchsia-500/5 border-b border-fuchsia-500/15 flex items-center gap-2 flex-wrap shrink-0">
              <Zap className="w-3.5 h-3.5 text-fuchsia-500 shrink-0" />
              {conversacion.intencion_detectada && (
                <span className="text-[10px] bg-fuchsia-500/10 text-fuchsia-600 px-2 py-0.5 rounded-full font-medium">
                  {conversacion.intencion_detectada}
                </span>
              )}
              {conversacion.urgencia_detectada && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  conversacion.urgencia_detectada === 'critica' ? 'bg-red-500/15 text-red-600' :
                  conversacion.urgencia_detectada === 'alta'    ? 'bg-orange-500/15 text-orange-600' :
                  conversacion.urgencia_detectada === 'media'   ? 'bg-yellow-500/15 text-yellow-600' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {conversacion.urgencia_detectada === 'critica' ? '🔴' : conversacion.urgencia_detectada === 'alta' ? '🟠' : conversacion.urgencia_detectada === 'media' ? '🟡' : '🟢'} {conversacion.urgencia_detectada}
                </span>
              )}
              {conversacion.resumen_ia && (
                <span className="text-[10px] text-muted-foreground truncate max-w-xs">{conversacion.resumen_ia}</span>
              )}
            </div>
          )}
          <div
            ref={messagesContainerRef}
            className="flex-1 min-h-0 overflow-y-auto scrollbar-thin relative flex flex-col"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Spacer que empuja los mensajes hacia abajo cuando son pocos */}
            <div className="flex-1" />
            <div className="px-4 py-3 space-y-3">
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

            {isDragging && dropzoneEnabled && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-md pointer-events-none">
                <div className="flex flex-col items-center gap-2 text-primary">
                  <Paperclip className="w-8 h-8" />
                  <p className="text-sm font-medium">Soltá los archivos para adjuntarlos</p>
                  <p className="text-[11px] text-primary/70">Imágenes, PDFs, audios, videos y documentos</p>
                </div>
              </div>
            )}
          </div>

          {isWhatsapp && isOutOfWindow && (
            <div className="px-4 py-2 bg-warning/10 border-t border-warning/20 flex items-center gap-2 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
              <span className="text-[11px] text-warning">Ventana de 24h expirada. Solo podés enviar plantillas aprobadas.</span>
            </div>
          )}

          <div className="border-t border-border px-4 py-3 shrink-0">
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

            {/* Cola de adjuntos pendientes */}
            {pendingItems.length > 0 && (
              <div className="mb-2 p-2 rounded-lg border border-border bg-muted/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    {pendingItems.length} adjunto{pendingItems.length > 1 ? 's' : ''} pendiente{pendingItems.length > 1 ? 's' : ''}
                  </p>
                  <button
                    onClick={clearPending}
                    className="text-[10px] text-muted-foreground hover:text-destructive font-medium"
                    disabled={sendingAdj}
                  >
                    Quitar todos
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto scrollbar-thin">
                  {pendingItems.map(item => {
                    const isImage = item.file.type.startsWith('image/');
                    const isAudio = item.file.type.startsWith('audio/');
                    const isVideo = item.file.type.startsWith('video/');
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 p-1.5 pr-1 rounded-md border border-border bg-background min-w-[160px] max-w-[220px]"
                      >
                        {isImage && item.preview ? (
                          <img src={item.preview} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            {isAudio || isVideo ? <Play className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium truncate" title={item.file.name}>{item.file.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {(item.file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          onClick={() => removePendingItem(item.id)}
                          className="p-0.5 hover:bg-accent/50 rounded text-muted-foreground hover:text-destructive shrink-0"
                          title="Quitar"
                          disabled={sendingAdj}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              hidden
              multiple
              accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                addFilesToQueue(files);
                e.target.value = '';
              }}
            />

            <div className="flex items-end gap-2">
              <div className="flex gap-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isMock || !isWhatsapp || sendingAdj}
                  className="p-1.5 rounded-md hover:bg-accent/50 text-muted-foreground disabled:opacity-40"
                  title={isWhatsapp ? "Adjuntar imagen, audio o documento (también podés arrastrar al chat)" : "Solo disponible en WhatsApp"}
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowNota(!showNota)}
                  className={`p-1.5 rounded-md hover:bg-accent/50 ${showNota ? 'text-warning' : 'text-muted-foreground'}`}
                  title="Nota interna"
                >
                  <StickyNote className="w-4 h-4" />
                </button>
                {/* Copiloto IA: copiloto estratégico del asesor (responder mejor, resumir, intención, etc.) */}
                {!isMock && (
                  <button
                    onClick={() => setShowAi(true)}
                    className="p-1.5 rounded-md hover:bg-primary/10 text-primary"
                    title="Copiloto IA: sugerir respuesta, resumir, detectar intención/objeciones, generar nota interna…"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                )}
                {/* Plantillas Gupshup: SOLO para reabrir conversaciones de WhatsApp fuera de ventana */}
                {isWhatsapp && !isMock && (
                  <button
                    onClick={() => setShowTemplates(true)}
                    className={`p-1.5 rounded-md hover:bg-accent/50 ${isOutOfWindow ? 'text-primary' : 'text-muted-foreground'}`}
                    title={
                      isOutOfWindow
                        ? "Plantillas WhatsApp aprobadas (Gupshup) — usalas para reabrir esta conversación"
                        : "Plantillas WhatsApp aprobadas — solo para reactivar fuera de ventana de 24 h"
                    }
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                )}
              </div>
              <textarea
                rows={1}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                disabled={(isWhatsapp && isOutOfWindow && !showNota && pendingItems.length === 0) || sendingMsg || sendingAdj}
                placeholder={
                  pendingItems.length > 0
                    ? 'Comentario opcional (se enviará con el primer adjunto)...'
                    : isWhatsapp && isOutOfWindow && !showNota
                    ? 'Ventana expirada. Usá una plantilla aprobada →'
                    : showNota
                    ? 'Nota interna...'
                    : 'Escribí un mensaje, pegá o arrastrá archivos al chat...'
                }
                className="flex-1 bg-muted/50 text-sm rounded-lg px-3 py-2 border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none disabled:opacity-50"
              />
              {isWhatsapp && isOutOfWindow && !isMock && !showNota && pendingItems.length === 0 ? (
                <button
                  onClick={() => setShowTemplates(true)}
                  className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 text-xs font-medium"
                  title="Enviar plantilla aprobada para reabrir la conversación"
                >
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">Reabrir con plantilla</span>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={
                    (!inputValue.trim() && pendingItems.length === 0) ||
                    (isWhatsapp && isOutOfWindow && !showNota && pendingItems.length === 0) ||
                    sendingMsg || sendingAdj
                  }
                  className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
                  title={pendingItems.length > 1 ? `Enviar ${pendingItems.length} adjuntos` : 'Enviar'}
                >
                  {(sendingMsg || sendingAdj) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              )}
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

      {/* ── Tab: TRAZABILIDAD ── */}
      {activeTab === 'trazabilidad' && (
        <TrazabilidadTab conversacionId={conversacion.id} />
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
          if (!open) invalidateAll();
        }}
        initialTelefono={conversacion.telefono ?? ''}
        initialNombre={conversacion.cliente_nombre ?? ''}
        initialCanal={conversacion.canal === 'whatsapp' ? 'WhatsApp' : conversacion.canal === 'phone' ? 'Telefonía' : 'Correo'}
        onCreated={handleAutoVincularCreado}
      />

      {isWhatsapp && !isMock && (
        <WppTemplatePicker
          open={showTemplates}
          onOpenChange={setShowTemplates}
          conversacionId={conversacion.id}
          clienteNombre={clienteNombre}
          onSend={handleSendTemplate}
        />
      )}

      {!isMock && (
        <AiAsesorPopover
          open={showAi}
          onOpenChange={setShowAi}
          conversacionId={conversacion.id}
          conversacion={{
            canal: conversacion.canal,
            asunto: conversacion.asunto,
            cliente_nombre: clienteNombre,
            ultimo_mensaje: conversacion.ultimo_mensaje,
            en_ventana: !isOutOfWindow,
          }}
          onInsertReply={(text) => {
            setShowNota(false);
            setInputValue((prev) => (prev ? `${prev}\n${text}` : text));
            toast.success('Respuesta insertada en el composer. Revisala antes de enviar.');
          }}
          onInsertNote={(text) => {
            setShowNota(true);
            setInputValue((prev) => (prev ? `${prev}\n${text}` : text));
            toast.success('Nota insertada. Revisala antes de guardar.');
          }}
        />
      )}

      {!isMock && (
        <DerivarChatDialog
          open={showDerivar}
          onOpenChange={setShowDerivar}
          conversacionId={conversacion.id}
          conversacionAsunto={conversacion.asunto}
          clienteNombre={clienteNombre}
        />
      )}

      {/* Visor global de adjuntos del chat */}
      <AttachmentViewer />
    </div>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({ mensaje }: { mensaje: LatMensaje }) {
  const [imgError, setImgError]     = useState(false);
  const [audioError, setAudioError] = useState(false);
  const isOutbound = mensaje.tipo === 'outbound';
  const isNota     = mensaje.tipo === 'nota_interna';
  const isSistema  = mensaje.tipo === 'sistema';
  const normalizedStatus = normalizeMensajeEstado(mensaje.estado);
  const estadoIcon = isOutbound ? estadoIconMap[normalizedStatus] : null;
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

  // Categoría del adjunto (si existe)
  const adjUrl   = mensaje.adjunto_url;
  const adjTipo  = mensaje.adjunto_tipo ?? '';
  const isImage  = !!adjUrl && (adjTipo.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(mensaje.adjunto_nombre ?? ''));
  const isAudio  = !!adjUrl && (adjTipo.startsWith('audio/') || /\.(ogg|mp3|m4a|wav|opus)$/i.test(mensaje.adjunto_nombre ?? ''));
  const isVideo  = !!adjUrl && (adjTipo.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(mensaje.adjunto_nombre ?? ''));
  const isFile   = !!adjUrl && !isImage && !isAudio && !isVideo;
  const trimmedContent = mensaje.contenido?.trim() ?? '';
  // Mensajes donde el media existía pero no se pudo guardar la URL (descarga falló en webhook)
  const isNoUrlMedia = !adjUrl && genericMediaPlaceholderPattern.test(trimmedContent);
  const noUrlMediaKind: 'image' | 'audio' | 'video' | 'document' =
    trimmedContent.match(/📷|imagen/i) ? 'image' :
    trimmedContent.match(/🎤|voz|audio/i) ? 'audio' :
    trimmedContent.match(/🎥|video/i) ? 'video' : 'document';
  const hasMedia = isImage || isAudio || isVideo || isFile || isNoUrlMedia;
  const showText = !!trimmedContent && !(hasMedia && genericMediaPlaceholderPattern.test(trimmedContent));
  const linkClassName = isOutbound
    ? 'underline underline-offset-2 decoration-primary-foreground/60 font-medium break-all hover:opacity-80'
    : 'underline underline-offset-2 decoration-primary/60 text-primary font-medium break-all hover:opacity-80';
  const statusTextClassName = normalizedStatus === 'fallido'
    ? 'text-destructive'
    : normalizedStatus === 'leido'
    ? (isOutbound ? 'text-primary-foreground' : 'text-primary')
    : isOutbound
    ? 'text-primary-foreground/80'
    : (estadoIcon?.className ?? 'text-muted-foreground');

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] rounded-2xl ${hasMedia ? 'p-1.5' : 'px-3.5 py-2'} ${
        isOutbound
          ? 'bg-primary text-primary-foreground rounded-br-md'
          : 'bg-muted text-foreground rounded-bl-md'
      }`}>
        {/* Imagen */}
        {isImage && (
          imgError ? (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] ${isOutbound ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
              <ImageIcon className="w-4 h-4 shrink-0" />
              Imagen no disponible
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openAttachment({ url: adjUrl!, name: mensaje.adjunto_nombre, type: adjTipo })}
              className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
              title="Abrir imagen"
            >
              <img
                src={adjUrl!}
                alt={mensaje.adjunto_nombre ?? 'Imagen'}
                className="rounded-xl max-h-72 w-auto object-cover bg-black/5 cursor-zoom-in group-hover:opacity-95 transition-opacity"
                loading="lazy"
                onError={() => setImgError(true)}
              />
            </button>
          )
        )}

        {/* Audio / nota de voz */}
        {isAudio && (
          <div className={`px-2 py-1.5 ${isOutbound ? 'bg-primary-foreground/10' : 'bg-background/40'} rounded-xl flex items-center gap-2 min-w-[220px]`}>
            <Play className={`w-4 h-4 ${isOutbound ? 'text-primary-foreground/80' : 'text-primary'}`} />
            {audioError ? (
              <span className={`flex-1 text-[11px] ${isOutbound ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                Audio no disponible
              </span>
            ) : (
              <audio
                controls
                preload="metadata"
                src={adjUrl!}
                className="flex-1 h-7 max-w-[260px]"
                onError={() => setAudioError(true)}
              />
            )}
          </div>
        )}

        {/* Video */}
        {isVideo && (
          <button
            type="button"
            onClick={() => openAttachment({ url: adjUrl!, name: mensaje.adjunto_nombre, type: adjTipo })}
            className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
            title="Abrir video"
          >
            <video
              preload="metadata"
              src={adjUrl!}
              className="rounded-xl max-h-72 w-auto bg-black/10 pointer-events-none"
            />
          </button>
        )}

        {/* Documento / archivo genérico */}
        {isFile && (
          <button
            type="button"
            onClick={() => openAttachment({ url: adjUrl!, name: mensaje.adjunto_nombre, type: adjTipo })}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left ${isOutbound ? 'bg-primary-foreground/10 hover:bg-primary-foreground/20' : 'bg-background/40 hover:bg-background/60'} transition-colors min-w-[200px]`}
            title="Previsualizar archivo"
          >
            <FileText className={`w-5 h-5 shrink-0 ${isOutbound ? 'text-primary-foreground/80' : 'text-primary'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium truncate">{mensaje.adjunto_nombre ?? 'Archivo'}</p>
              <p className={`text-[10px] ${isOutbound ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>{adjTipo || 'documento'}</p>
            </div>
            <Download className={`w-3.5 h-3.5 ${isOutbound ? 'text-primary-foreground/60' : 'text-muted-foreground'}`} />
          </button>
        )}

        {/* Media sin URL (descarga falló en recepción o función no redespllegada) */}
        {isNoUrlMedia && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] ${
            isOutbound ? 'text-primary-foreground/60' : 'text-muted-foreground'
          }`}>
            {noUrlMediaKind === 'image'    && <ImageIcon className="w-4 h-4 shrink-0" />}
            {noUrlMediaKind === 'audio'    && <Play className="w-4 h-4 shrink-0" />}
            {noUrlMediaKind === 'video'    && <Play className="w-4 h-4 shrink-0" />}
            {noUrlMediaKind === 'document' && <FileText className="w-4 h-4 shrink-0" />}
            <span>
              {noUrlMediaKind === 'image'    ? 'Imagen no disponible' :
               noUrlMediaKind === 'audio'    ? 'Audio no disponible'  :
               noUrlMediaKind === 'video'    ? 'Video no disponible'  :
               'Archivo no disponible'}
            </span>
          </div>
        )}

        {/* Texto / caption */}
        {showText && (
          <div className={`text-[13px] leading-relaxed whitespace-pre-wrap break-words ${hasMedia ? 'px-2 pt-1.5' : ''}`}>
            {renderMessageContent(trimmedContent, linkClassName)}
          </div>
        )}

        {/* Footer: hora + tickets */}
        <div className={`flex items-center justify-end gap-1 ${hasMedia ? 'px-2 pb-1' : 'mt-1'} ${isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
          {isOutbound && mensaje.autor_nombre && (
            <span className="text-[9px] opacity-75">{mensaje.autor_nombre}</span>
          )}
          <span className="text-[9px]">{format(ts, 'HH:mm', { locale: es })}</span>
          {StatusIcon && (
            <span title={`Estado: ${estadoLabelMap[normalizedStatus]}`} className={`inline-flex items-center gap-1 text-[9px] font-medium ${statusTextClassName}`}>
              <span>{estadoLabelMap[normalizedStatus]}</span>
              <StatusIcon className={`w-3.5 h-3.5 ${statusTextClassName}`} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

void Building2;
void ImageIcon;


// ─── EmailPanel: visor + composer para conversaciones de correo ────────────────
interface EmailPanelProps {
  conversacionId: string;
  mensajes: LatMensaje[];
  loading: boolean;
  autorNombre?: string;
}

function EmailPanel({ conversacionId, mensajes, loading, autorNombre }: EmailPanelProps) {
  const { draft, saveDebounced, cancelSave, remove } = useEmailDraft(conversacionId);
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen]     = useState(false);
  const [composerInitial, setComposerInitial] = useState<ComposerInitial | null>(null);
  // pendingDraft: draft found in DB but not yet opened. Shown as a banner instead of auto-opening.
  const [pendingDraft, setPendingDraft]     = useState<typeof draft>(null);
  const scrollRef     = useRef<HTMLDivElement>(null);
  const justClosedRef = useRef(false);

  // When a saved draft is found, show banner — don't auto-open the composer
  useEffect(() => {
    if (draft && !composerOpen && !justClosedRef.current) {
      setPendingDraft(draft);
    }
  }, [draft?.id]); // eslint-disable-line

  const buildReply = (msg: LatMensaje, type: 'reply' | 'reply_all' | 'forward'): ComposerInitial => {
    const ownAccounts = new Set<string>(
      mensajes
        .filter(m => m.tipo === 'outbound' && (m as any).email_from_email)
        .map(m => String((m as any).email_from_email).toLowerCase())
        .concat(['microvoz@estropical.com', 'aplataforma@estropical.com',
                 'info@estropical.com.bo', 'reservas@estropical.com.bo'])
    );

    // Extract only the email address from various formats
    const toEmail = (v: any): string => {
      if (!v) return '';
      if (typeof v === 'string') {
        const m = v.match(/<([^>]+)>/);
        return (m ? m[1] : v).trim().toLowerCase();
      }
      if (typeof v === 'object' && v.email) return String(v.email).trim().toLowerCase();
      return '';
    };

    // Build "Name <email>" string (preserves display name for chips)
    const toNameEmail = (name: string | null | undefined, email: string): string => {
      const e = email.trim().toLowerCase();
      const n = name?.trim();
      return (n && n !== e) ? `${n} <${e}>` : e;
    };

    const listToNameEmails = (rawAddrs: any, rawNames?: any): string[] => {
      if (!rawAddrs) return [];
      const addrs = Array.isArray(rawAddrs) ? rawAddrs : String(rawAddrs).split(/[,;]/);
      const names = Array.isArray(rawNames) ? rawNames : [];
      return addrs.map((v: any, i: number) => {
        const email = toEmail(v);
        if (!email) return '';
        // If the address already has a name embedded, keep it; otherwise use rawNames if provided
        if (typeof v === 'string' && v.includes('<')) return v.trim();
        return names[i] ? toNameEmail(names[i], email) : email;
      }).filter(Boolean);
    };

    const fromEmail = toEmail((msg as any).email_from_email ?? '');
    const fromName  = (msg as any).email_from_name as string | null | undefined;

    // Reply-To header takes precedence over From for the reply destination
    const replyToRaw  = (msg as any).email_reply_to as string | null | undefined;
    const replyTarget = replyToRaw
      ? toNameEmail(null, toEmail(replyToRaw))
      : (fromEmail ? toNameEmail(fromName, fromEmail) : '');

    const to: string[] = type === 'forward' ? [] : (replyTarget ? [replyTarget] : []);

    let cc: string[] = [];
    if (type === 'reply_all') {
      const orig   = listToNameEmails((msg as any).email_to);
      const origCc = listToNameEmails((msg as any).email_cc);
      const seen   = new Set<string>([toEmail(replyTarget), ...ownAccounts]);
      cc = [...orig, ...origCc].filter((entry) => {
        const e = toEmail(entry);
        if (!e || seen.has(e)) return false;
        seen.add(e);
        return true;
      });
    }

    const subj     = (msg as any).email_subject ?? '';
    const prefix   = type === 'forward' ? 'Fwd: ' : 'Re: ';
    const cleanSubj = subj.replace(/^(Re:|Fwd:)\s*/i, '');
    const subject  = prefix + cleanSubj;

    const origBody = (msg as any).email_body_html ?? msg.contenido ?? '';
    const quoted   = type === 'forward'
      ? `<br><br><div style="border-left:3px solid #ccc;padding-left:8px;color:#666"><b>--- Mensaje reenviado ---</b><br>De: ${fromName ?? fromEmail}<br>Asunto: ${subj}<br><br>${origBody}</div>`
      : '';

    return {
      reply_type: type,
      to, cc, bcc: [],
      subject,
      body_html: quoted,
      in_reply_to_message_id: msg.id,
      in_reply_to_email_id: (msg as any).email_message_id ?? null,
      references: (msg as any).email_message_id ?? null,
      thread_id: (msg as any).email_thread_id ?? null,
    };
  };

  const openCompose = async (msg: LatMensaje, type: 'reply' | 'reply_all' | 'forward') => {
    cancelSave();
    setPendingDraft(null);
    // If a draft already exists for THIS exact reply, restore it instead of deleting
    if (draft && draft.in_reply_to_message_id === msg.id && draft.reply_type === type) {
      justClosedRef.current = false;
      setComposerInitial({
        reply_type: (draft.reply_type as any) ?? type,
        to:  draft.email_to  ?? [],
        cc:  draft.email_cc  ?? [],
        bcc: draft.email_bcc ?? [],
        subject:  draft.subject  ?? '',
        body_html: draft.body_html ?? '',
        in_reply_to_message_id: draft.in_reply_to_message_id,
        isDraft: true,
      });
      setComposerOpen(true);
      return;
    }
    // Otherwise start fresh: delete old draft and build new initial state
    await remove();
    justClosedRef.current = false;
    setComposerInitial(buildReply(msg, type));
    setComposerOpen(true);
  };

  const restorePendingDraft = () => {
    if (!pendingDraft) return;
    setComposerInitial({
      reply_type: (pendingDraft.reply_type as any) ?? 'reply',
      to:  pendingDraft.email_to  ?? [],
      cc:  pendingDraft.email_cc  ?? [],
      bcc: pendingDraft.email_bcc ?? [],
      subject:   pendingDraft.subject   ?? '',
      body_html: pendingDraft.body_html ?? '',
      in_reply_to_message_id: pendingDraft.in_reply_to_message_id,
      isDraft: true,
    });
    setPendingDraft(null);
    justClosedRef.current = false;
    setComposerOpen(true);
  };

  const discardPendingDraft = async () => {
    cancelSave();
    await remove();
    setPendingDraft(null);
  };

  const handleSent = async () => {
    justClosedRef.current = true;
    cancelSave();
    await remove();
    setComposerOpen(false);
    setComposerInitial(null);
    setPendingDraft(null);
    queryClient.invalidateQueries({ queryKey: ['lat_mensajes', conversacionId] });
    queryClient.invalidateQueries({ queryKey: ['lat_conversaciones'] });
    setTimeout(() => { justClosedRef.current = false; }, 2000);
  };

  const handleDiscard = async () => {
    justClosedRef.current = true;
    cancelSave();
    await remove();
    setComposerOpen(false);
    setComposerInitial(null);
    setTimeout(() => { justClosedRef.current = false; }, 2000);
  };

  // Auto-scroll al fondo cuando se abre el composer
  useEffect(() => {
    if (!composerOpen || !scrollRef.current) return;
    const el = scrollRef.current;
    setTimeout(() => { el.scrollTop = el.scrollHeight; }, 80);
  }, [composerOpen]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {loading ? (
        <div className="flex-1 flex justify-center items-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        /* ── Scroll único: hilo + composer al fondo (experiencia Gmail) ── */
        <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col">
          <EmailThreadView
            mensajes={mensajes}
            onReply={(m) => openCompose(m, 'reply')}
            onReplyAll={(m) => openCompose(m, 'reply_all')}
            onForward={(m) => openCompose(m, 'forward')}
            scrollable={false}
          />

          {/* Banner: borrador pendiente — no abre el compositor automáticamente */}
          {pendingDraft && !composerOpen && (
            <div className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm">
              <span className="text-amber-800 font-medium">Tienes un borrador guardado para este hilo</span>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={restorePendingDraft}>
                  Continuar borrador
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={discardPendingDraft}>
                  Descartar
                </Button>
              </div>
            </div>
          )}

          {/* Composer embebido al fondo del hilo (se abre solo desde los botones del mensaje) */}
          {composerOpen && composerInitial && (
            <div className="border-t bg-background">
              <EmailComposer
                conversacionId={conversacionId}
                initial={composerInitial}
                autorNombre={autorNombre}
                onSent={handleSent}
                onDiscard={handleDiscard}
                onChange={(s) => saveDebounced({
                  reply_type: s.reply_type,
                  email_to: s.to, email_cc: s.cc, email_bcc: s.bcc,
                  subject: s.subject, body_html: s.body_html,
                  in_reply_to_message_id: s.in_reply_to_message_id ?? null,
                  created_by: autorNombre,
                })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}


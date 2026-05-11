import { MessageSquare, Phone, Mail, Search, Instagram, Facebook, Globe, Layers } from 'lucide-react';
import { getCliente } from '@/data/latMockData';
import { LatConversacion } from '@/hooks/useLatData';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { getFunnelStage, getFlags, FUNNEL_STAGES } from '@/lib/latFunnel';

const canalIcons: Record<string, { icon: typeof MessageSquare; color: string }> = {
  whatsapp:  { icon: MessageSquare, color: 'text-whatsapp'         },
  phone:     { icon: Phone,         color: 'text-phone'            },
  email:     { icon: Mail,          color: 'text-email'            },
  instagram: { icon: Instagram,     color: 'text-purple-500'       },
  facebook:  { icon: Facebook,      color: 'text-blue-500'         },
  web:       { icon: Globe,         color: 'text-cyan-500'         },
  interno:   { icon: Layers,        color: 'text-slate-500'        },
};

const estadoBadge: Record<string, { label: string; className: string }> = {
  en_cola:              { label: 'En cola',        className: 'bg-amber-500/10 text-amber-600'   },
  asignada:             { label: 'Asignada',       className: 'bg-blue-500/10 text-blue-600'     },
  en_atencion:          { label: 'En atención',    className: 'bg-green-500/10 text-green-600'   },
  en_espera_cliente:    { label: 'Esp. cliente',   className: 'bg-cyan-500/10 text-cyan-600'     },
  en_espera_interna:    { label: 'Esp. interna',   className: 'bg-indigo-500/10 text-indigo-600' },
  derivada:             { label: 'Derivada',       className: 'bg-violet-500/10 text-violet-600' },
  resuelta:             { label: 'Resuelta',       className: 'bg-emerald-500/10 text-emerald-600'},
  cerrada:              { label: 'Cerrada',        className: 'bg-muted text-muted-foreground'   },
  reabierta:            { label: 'Reabierta',      className: 'bg-warning/10 text-warning'       },
  pendiente:            { label: 'Pendiente',      className: 'bg-orange-500/10 text-orange-600' },
  abierta:              { label: 'Abierta',        className: 'bg-primary/10 text-primary'       },
};

const stageBadgeMap = Object.fromEntries(
  FUNNEL_STAGES.map(s => [s.key, { label: s.label, className: `${s.bg} ${s.text}` }])
);

const prioridadDot: Record<string, string> = {
  urgente: 'bg-urgent',
  alta:    'bg-warning',
  media:   'bg-primary',
  baja:    'bg-muted-foreground',
};

interface ConversacionListProps {
  conversaciones: LatConversacion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filtroCanal: string;
  onFiltroCanal: (v: string) => void;
  filtroEstado: string;
  onFiltroEstado: (v: string) => void;
  busqueda: string;
  onBusqueda: (v: string) => void;
}

export function ConversacionList({
  conversaciones, selectedId, onSelect,
  filtroCanal, onFiltroCanal, busqueda, onBusqueda,
}: ConversacionListProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Bandeja</h2>
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {conversaciones.length}
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar cliente, teléfono o asunto..."
            value={busqueda}
            onChange={e => onBusqueda(e.target.value)}
            className="w-full bg-muted/50 text-xs rounded-md pl-7 pr-3 py-1.5 border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Canal filters */}
        <div className="flex gap-1 flex-wrap">
          {[
            { key: 'todos',     label: 'Todos' },
            { key: 'whatsapp',  icon: MessageSquare, color: 'text-whatsapp'   },
            { key: 'phone',     icon: Phone,         color: 'text-phone'      },
            { key: 'email',     icon: Mail,          color: 'text-email'      },
            { key: 'instagram', icon: Instagram,     color: 'text-purple-500' },
            { key: 'facebook',  icon: Facebook,      color: 'text-blue-500'   },
            { key: 'web',       icon: Globe,         color: 'text-cyan-500'   },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => onFiltroCanal(f.key)}
              title={f.key !== 'todos' ? f.key : undefined}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                filtroCanal === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent/50'
              }`}
            >
              {'icon' in f && f.icon
                ? <f.icon className={`w-3 h-3 ${filtroCanal === f.key ? '' : f.color}`} />
                : f.label
              }
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {conversaciones.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <MessageSquare className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Sin conversaciones</p>
          </div>
        )}
        {conversaciones.map(conv => {
          // Para mock data: obtener nombre del mock; para real: usar campo
          const mockCliente = conv._source === 'mock' ? getCliente(conv.id) : null;
          const nombre = conv.cliente_nombre ?? mockCliente?.nombre ?? conv.telefono ?? 'Número desconocido';

          const canal      = canalIcons[conv.canal] ?? canalIcons.whatsapp;
          const CanalIcon  = canal.icon;
          const stage      = getFunnelStage(conv);
          const stageBadge = stageBadgeMap[stage];
          const flags      = getFlags(conv);
          const isSelected = conv.id === selectedId;
          const hasUnread  = conv.no_leidos > 0;
          const timeAgo    = formatDistanceToNow(new Date(conv.ultima_interaccion), { addSuffix: false, locale: es });

          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`w-full text-left p-3 border-b border-border/50 hover:bg-accent/50 transition-colors ${
                isSelected ? 'bg-accent/70' : hasUnread ? 'bg-primary/5' : ''
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 shrink-0 relative">
                  <CanalIcon className={`w-4 h-4 ${canal.color}`} />
                  {hasUnread && !isSelected && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${prioridadDot[conv.prioridad] ?? 'bg-muted-foreground'}`} />
                      <span className={`text-xs truncate ${hasUnread ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>{nombre}</span>
                    </div>
                    <span className={`text-[10px] shrink-0 ${hasUnread ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{timeAgo}</span>
                  </div>

                  {conv.asunto && (
                    <p className="text-[11px] text-foreground/80 truncate mt-0.5">{conv.asunto}</p>
                  )}
                  {conv.ultimo_mensaje && (
                    <p className={`text-[10px] truncate mt-0.5 ${hasUnread ? 'text-foreground/70 font-medium' : 'text-muted-foreground'}`}>{conv.ultimo_mensaje}</p>
                  )}
                  {conv.telefono && conv._source === 'db' && (
                    <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{conv.telefono}</p>
                  )}

                  {/* Etapa funnel + flags operativos */}
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${stageBadge.className}`}>
                      {stageBadge.label}
                    </span>
                    {conv.estado && estadoBadge[conv.estado] && (
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${estadoBadge[conv.estado].className}`}>
                        {estadoBadge[conv.estado].label}
                      </span>
                    )}
                    {flags.urgente && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-urgent/10 text-urgent">urgente</span>
                    )}
                    {flags.nuevo && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-info/10 text-info">nuevo</span>
                    )}
                    {flags.sin_leer && !flags.nuevo && (
                      <span className="bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                        {conv.no_leidos > 9 ? '9+' : conv.no_leidos}
                      </span>
                    )}
                    {flags.fuera_ventana && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">fuera ventana</span>
                    )}
                    {flags.reabierto && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">reabierto</span>
                    )}
                    {flags.sla_vencido && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-urgent/10 text-urgent">SLA</span>
                    )}
                    {flags.con_gestion && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-accent/30 text-accent-foreground">gestión</span>
                    )}
                    {/* Cola asignada — muestra nombre si existe, evita duplicar badge de estado */}
                    {(conv.cola_area_nombre) && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 truncate max-w-[110px]" title={conv.cola_area_nombre}>
                        📋 {conv.cola_area_nombre}
                      </span>
                    )}
                    {conv.proxima_accion && (
                      <span className="text-[9px] text-muted-foreground truncate">
                        → {conv.proxima_accion}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

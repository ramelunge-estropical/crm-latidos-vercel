import { useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Activity, GitBranch, Users, Inbox, Bot, AlertTriangle,
  ArrowRightLeft, ShieldAlert, CheckCircle2, Clock, Info,
  Hash, Radio,
} from 'lucide-react';
import { useLatTrazabilidad, LatConversacion } from '@/hooks/useLatData';
import { useColaboradores } from '@/hooks/useSharedQueries';

// ── Config ────────────────────────────────────────────────────────────────────

const EVENTO_CONFIG: Record<string, {
  label: string;
  icon: typeof Activity;
  color: string;
  bg: string;
}> = {
  canal_asignado:        { label: 'Canal asignado',       icon: Radio,          color: 'text-blue-600',    bg: 'bg-blue-50'    },
  regla_aplicada:        { label: 'Regla aplicada',       icon: GitBranch,      color: 'text-violet-600',  bg: 'bg-violet-50'  },
  cola_asignada:         { label: 'Cola asignada',        icon: Inbox,          color: 'text-primary',     bg: 'bg-primary/10' },
  agente_asignado:       { label: 'Agente asignado',      icon: Users,          color: 'text-emerald-600', bg: 'bg-emerald-50' },
  owner_asignado:        { label: 'Owner asignado',       icon: Users,          color: 'text-emerald-600', bg: 'bg-emerald-50' },
  agente_no_disponible:  { label: 'Sin agente disponible',icon: AlertTriangle,  color: 'text-amber-600',   bg: 'bg-amber-50'   },
  desborde_activado:     { label: 'Desborde activado',    icon: AlertTriangle,  color: 'text-orange-600',  bg: 'bg-orange-50'  },
  reasignacion_manual:   { label: 'Reasignación manual',  icon: ArrowRightLeft, color: 'text-rose-600',    bg: 'bg-rose-50'    },
  intervencion_supervisor: { label: 'Intervención supervisor', icon: ShieldAlert, color: 'text-rose-700', bg: 'bg-rose-50'  },
};

const ROUTING_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  success:  { label: 'Asignado',         color: 'text-emerald-600' },
  fallback: { label: 'Fallback',         color: 'text-amber-600'   },
  desborde: { label: 'Desborde',         color: 'text-orange-600'  },
  bot:      { label: 'Bot delegado',     color: 'text-blue-600'    },
  error:    { label: 'Error de routing', color: 'text-destructive' },
  pending:  { label: 'Pendiente',        color: 'text-muted-foreground' },
};

const ESTADO_ASIG_LABEL: Record<string, { label: string; color: string }> = {
  pendiente:  { label: 'Pendiente',   color: 'text-muted-foreground' },
  en_cola:    { label: 'En cola',     color: 'text-amber-600'        },
  asignada:   { label: 'Asignada',    color: 'text-primary'          },
  en_gestion: { label: 'En gestión',  color: 'text-emerald-600'      },
  en_espera:  { label: 'En espera',   color: 'text-blue-600'         },
  desborde:   { label: 'Desborde',    color: 'text-orange-600'       },
  ignorada:   { label: 'Ignorada',    color: 'text-muted-foreground' },
  cerrada:    { label: 'Cerrada',     color: 'text-muted-foreground' },
};

// ── Componente ────────────────────────────────────────────────────────────────

interface TrazabilidadPanelProps {
  conversacion: LatConversacion;
}

export function TrazabilidadPanel({ conversacion }: TrazabilidadPanelProps) {
  const { data: eventos = [], isLoading } = useLatTrazabilidad(conversacion.id);
  const { data: colaboradores = [] } = useColaboradores();

  const colabMap = useMemo(() => {
    const m: Record<string, string> = {};
    colaboradores.forEach(c => { m[c.id] = c.nombre; });
    return m;
  }, [colaboradores]);

  const estadoAsig  = conversacion.estado_asignacion ?? '';
  const estadoCfg   = ESTADO_ASIG_LABEL[estadoAsig];
  const routingCfg  = ROUTING_STATUS_CONFIG[conversacion.routing_status ?? ''];

  const resumen = useMemo(() => {
    const canal   = eventos.find(e => e.tipo_evento === 'canal_asignado');
    const regla   = eventos.find(e => e.tipo_evento === 'regla_aplicada');
    const cola    = eventos.find(e => e.tipo_evento === 'cola_asignada');
    const agente  = [...eventos].reverse().find(e =>
      e.tipo_evento === 'agente_asignado' || e.tipo_evento === 'owner_asignado');
    const desborde = eventos.find(e => e.tipo_evento === 'desborde_activado');
    const bot     = eventos.find(e => (e.detalle as any)?.bot_id);
    return { canal, regla, cola, agente, desborde, bot };
  }, [eventos]);

  return (
    <div className="flex flex-col gap-0 text-xs">

      {/* ── Encabezado ─────────────────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 border-b border-border/50">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground mb-2">
          <Activity className="w-3.5 h-3.5 text-primary" />
          Trazabilidad de enrutamiento
        </div>

        {/* Estado actual */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-muted-foreground">Estado</span>
          <span className={`font-medium ${estadoCfg?.color ?? 'text-foreground'}`}>
            {estadoCfg?.label ?? estadoAsig || '—'}
          </span>
        </div>

        {/* Routing result */}
        {(conversacion.routing_status || conversacion.routing_reason) && (
          <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/50 mb-1">
            {conversacion.routing_status && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Resultado motor</span>
                <span className={`font-medium ${routingCfg?.color ?? 'text-foreground'}`}>
                  {routingCfg?.label ?? conversacion.routing_status}
                </span>
              </div>
            )}
            {conversacion.routing_reason && (
              <p className="text-muted-foreground leading-tight mt-0.5">
                {conversacion.routing_reason}
              </p>
            )}
          </div>
        )}

        {/* Resumen rápido de asignación */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <ResumenFila
            icon={<Hash className="w-3 h-3 shrink-0" />}
            label="Canal"
            value={conversacion.canal ?? (resumen.canal ? conversacion.channel_type : null)}
          />
          <ResumenFila
            icon={<Inbox className="w-3 h-3 shrink-0" />}
            label="Cola"
            value={resumen.cola ? (resumen.cola.detalle as any)?.cola_nombre ?? 'Asignada' : null}
          />
          <ResumenFila
            icon={<Users className="w-3 h-3 shrink-0" />}
            label="Asesor"
            value={
              conversacion.responsable_id
                ? (colabMap[conversacion.responsable_id] ?? conversacion.responsable_nombre)
                : null
            }
          />
          {resumen.desborde && (
            <ResumenFila
              icon={<AlertTriangle className="w-3 h-3 shrink-0 text-orange-500" />}
              label="Desborde"
              value="Activado"
              valueClass="text-orange-600"
            />
          )}
          {resumen.bot && (
            <ResumenFila
              icon={<Bot className="w-3 h-3 shrink-0 text-blue-500" />}
              label="Bot"
              value="Delegado"
              valueClass="text-blue-600"
            />
          )}
        </div>

        {/* Timestamps clave */}
        {(conversacion.ts_cola_asignada || conversacion.ts_agente_asignado) && (
          <div className="mt-2 flex flex-col gap-0.5">
            {conversacion.ts_cola_asignada && (
              <TimestampFila
                label="Cola"
                ts={conversacion.ts_cola_asignada}
              />
            )}
            {conversacion.ts_agente_asignado && (
              <TimestampFila
                label="Asesor"
                ts={conversacion.ts_agente_asignado}
              />
            )}
            {conversacion.ts_desborde && (
              <TimestampFila
                label="Desborde"
                ts={conversacion.ts_desborde}
                className="text-orange-600"
              />
            )}
          </div>
        )}
      </div>

      {/* ── Historial de eventos ────────────────────────────────────────────── */}
      <div className="px-3 py-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
          Historial
        </p>

        {isLoading && (
          <p className="text-muted-foreground text-[11px] py-2">Cargando...</p>
        )}

        {!isLoading && eventos.length === 0 && (
          <p className="text-muted-foreground text-[11px] py-2 flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            Sin eventos registrados
          </p>
        )}

        <div className="flex flex-col">
          {eventos.map((ev, idx) => {
            const cfg = EVENTO_CONFIG[ev.tipo_evento] ?? {
              label: ev.tipo_evento,
              icon:  Activity,
              color: 'text-muted-foreground',
              bg:    'bg-muted',
            };
            const Icon = cfg.icon;
            const isLast = idx === eventos.length - 1;

            return (
              <div key={ev.id} className="flex gap-2">
                {/* Timeline connector */}
                <div className="flex flex-col items-center w-5 shrink-0">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${cfg.bg} shrink-0`}>
                    <Icon className={`w-2.5 h-2.5 ${cfg.color}`} />
                  </div>
                  {!isLast && <div className="w-px flex-1 bg-border/60 my-0.5" />}
                </div>

                {/* Contenido del evento */}
                <div className="pb-3 min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1">
                    <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {format(new Date(ev.created_at), 'HH:mm', { locale: es })}
                    </span>
                  </div>

                  {/* Detalle del evento */}
                  {ev.tipo_evento === 'reasignacion_manual' && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {ev.owner_original_id && (
                        <span>De: {colabMap[ev.owner_original_id] ?? 'Asesor anterior'}</span>
                      )}
                      {ev.owner_nuevo_id && (
                        <span> → {colabMap[ev.owner_nuevo_id] ?? 'Nuevo asesor'}</span>
                      )}
                      {ev.motivo && (
                        <p className="mt-0.5 italic">"{ev.motivo}"</p>
                      )}
                      {(ev.detalle as any)?.intervenido_por && (
                        <p className="text-[10px]">
                          Por: {colabMap[(ev.detalle as any).intervenido_por] ?? 'Supervisor'}
                        </p>
                      )}
                    </div>
                  )}

                  {ev.tipo_evento === 'agente_asignado' && ev.owner_nuevo_id && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {colabMap[ev.owner_nuevo_id] ?? ev.owner_nuevo_id}
                    </p>
                  )}

                  {ev.motivo && ev.tipo_evento !== 'reasignacion_manual' && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 italic">
                      {ev.motivo}
                    </p>
                  )}

                  {ev.routing_status && (
                    <span className={`text-[10px] ${ROUTING_STATUS_CONFIG[ev.routing_status]?.color ?? 'text-muted-foreground'}`}>
                      {ROUTING_STATUS_CONFIG[ev.routing_status]?.label ?? ev.routing_status}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ResumenFila({
  icon, label, value, valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  valueClass?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1 text-[11px]">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className={`truncate font-medium ${valueClass ?? 'text-foreground'}`}>{value}</span>
    </div>
  );
}

function TimestampFila({
  label, ts, className,
}: {
  label: string;
  ts: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 text-[11px] ${className ?? 'text-muted-foreground'}`}>
      <Clock className="w-3 h-3 shrink-0" />
      <span>{label}:</span>
      <span>{format(new Date(ts), 'dd/MM HH:mm', { locale: es })}</span>
    </div>
  );
}

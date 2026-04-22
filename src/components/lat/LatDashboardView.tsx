import { TrendingUp, AlertTriangle, Clock, CheckCircle2, Inbox, Users, Activity, Timer, RefreshCw, GitBranch } from 'lucide-react';
import { useLatConversaciones } from '@/hooks/useLatData';
import { FUNNEL_STAGES, getFunnelStage, getFlags, groupByStage, isFinalizadaHoy, countFlag } from '@/lib/latFunnel';
import { getCliente } from '@/data/latMockData';

export function LatDashboardView() {
  const { data: conversaciones } = useLatConversaciones();

  const groups = groupByStage(conversaciones);

  // ── Mi foco hoy ───────────────────────────────────────────────────────────
  const focoHoy = {
    porAtender:    groups.por_atender.length,
    enGestion:     groups.en_gestion.length,
    enEspera:      groups.en_espera.length,
    finalizadasHoy: conversaciones.filter(isFinalizadaHoy).length,
    urgentes:      countFlag(conversaciones, 'urgente'),
    slaRiesgo:     countFlag(conversaciones, 'sla_vencido'),
    seguimientos:  conversaciones.filter(c => {
      if (getFunnelStage(c) !== 'en_espera') return false;
      const ult = new Date(c.ultima_interaccion).getTime();
      const horas = (Date.now() - ult) / 3600000;
      return horas > 24;
    }).length,
  };

  // ── Mi rendimiento operativo ──────────────────────────────────────────────
  const rendimiento = {
    primeraRespuesta: '—',
    cerradasHoy:      focoHoy.finalizadasHoy,
    reactivadas:      conversaciones.filter(c => c.estado === 'reabierto').length,
    derivaciones:     0,
    cumplimientoSLA:  conversaciones.length > 0
      ? Math.round((1 - focoHoy.slaRiesgo / conversaciones.length) * 100)
      : 100,
    cargaActual:      groups.por_atender.length + groups.en_gestion.length,
  };

  // ── Equipo ahora (placeholder hasta integrar colaborador_presencia) ───────
  // Mock simple basado en datos disponibles
  const equipo = {
    conectados: 3,
    disponibles: 2,
    pausa: 1,
    capacidadTotal: 15,
    cargaTotal: rendimiento.cargaActual,
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="px-4 sm:px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h1 className="text-base sm:text-lg font-semibold text-foreground">Dashboard LAT</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Resumen unificado · misma lógica que Bandeja y Funnel
        </p>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-6">
        {/* ── MI FOCO HOY ─────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Inbox className="w-3.5 h-3.5 text-primary" />
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Mi foco hoy</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {FUNNEL_STAGES.map(s => {
              const count = groups[s.key].length;
              return (
                <div key={s.key} className="bg-card rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className={`w-2 h-2 rounded-full ${s.color}`} />
                    <span className="text-xl font-bold text-foreground">{count}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">{s.label}</p>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            <div className="bg-card rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="text-xl font-bold text-foreground">{focoHoy.finalizadasHoy}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Finalizadas hoy</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <AlertTriangle className="w-4 h-4 text-urgent" />
                <span className="text-xl font-bold text-foreground">{focoHoy.urgentes}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Urgentes</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <Timer className="w-4 h-4 text-warning" />
                <span className="text-xl font-bold text-foreground">{focoHoy.slaRiesgo}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">SLA en riesgo</p>
            </div>
          </div>
        </section>

        {/* ── MI RENDIMIENTO ──────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Mi rendimiento operativo</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi icon={Clock}        label="1ª respuesta"   value={rendimiento.primeraRespuesta} />
            <Kpi icon={CheckCircle2} label="Cerradas hoy"   value={rendimiento.cerradasHoy} />
            <Kpi icon={RefreshCw}    label="Reactivadas"    value={rendimiento.reactivadas} />
            <Kpi icon={GitBranch}    label="Derivaciones"   value={rendimiento.derivaciones} />
            <Kpi icon={Timer}        label="Cumple SLA"     value={`${rendimiento.cumplimientoSLA}%`} />
            <Kpi icon={Inbox}        label="Carga actual"   value={rendimiento.cargaActual} />
          </div>
        </section>

        {/* ── EQUIPO AHORA ────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-3.5 h-3.5 text-primary" />
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Equipo ahora</h2>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] text-muted-foreground">Conectados</p>
                <p className="text-lg font-bold text-foreground mt-1">{equipo.conectados}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Disponibles</p>
                <p className="text-lg font-bold text-success mt-1">{equipo.disponibles}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">En pausa</p>
                <p className="text-lg font-bold text-warning mt-1">{equipo.pausa}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Carga / capacidad</p>
                <p className="text-lg font-bold text-foreground mt-1">{equipo.cargaTotal}/{equipo.capacidadTotal}</p>
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min((equipo.cargaTotal / equipo.capacidadTotal) * 100, 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              {equipo.disponibles > 0 ? `${equipo.disponibles} elegibles para derivación` : 'Sin agentes disponibles · derivar a cola'}
            </p>
          </div>
        </section>

        {/* ── ACTIVIDAD RECIENTE ──────────────────────────────────── */}
        <section>
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-xs font-semibold text-foreground mb-3">Actividad reciente</h3>
            <div className="space-y-2">
              {conversaciones.slice(0, 5).map(conv => {
                const mockCl = conv._source === 'mock' ? getCliente(conv.id) : null;
                const nombre = conv.cliente_nombre ?? mockCl?.nombre ?? conv.telefono ?? 'Sin nombre';
                const stage = getFunnelStage(conv);
                const stageInfo = FUNNEL_STAGES.find(s => s.key === stage)!;
                return (
                  <div key={conv.id} className="flex items-center gap-3 py-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${stageInfo.color}`} />
                    <span className="text-[11px] text-foreground flex-1 truncate">{nombre} — {conv.asunto ?? conv.ultimo_mensaje}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${stageInfo.bg} ${stageInfo.text}`}>{stageInfo.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <div className="flex items-center justify-between">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-base font-bold text-foreground">{value}</span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">{label}</p>
    </div>
  );
}

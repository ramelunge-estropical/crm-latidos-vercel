import { useMemo, useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, AlertTriangle, Clock, CheckCircle2, Inbox, Activity,
  Timer, RefreshCw, GitBranch, ArrowUpRight, MessageSquare, Phone, Mail,
  Zap, Gauge, ChevronRight, Circle, AlertOctagon, PauseCircle, PlayCircle, Network,
} from 'lucide-react';
import { useLatConversaciones, LatConversacion } from '@/hooks/useLatData';
import { FUNNEL_STAGES, getFunnelStage, getFlags, groupByStage, isFinalizadaHoy, countFlag } from '@/lib/latFunnel';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Periodo = 'hoy' | 'semana' | 'mes';

// Dispara cambio de vista + filtro a Bandeja vía evento global
function goBandeja(filter: { stage?: string; flag?: string; canal?: string }) {
  window.dispatchEvent(new CustomEvent('lat-go-bandeja', { detail: filter }));
}

export function LatDashboardView() {
  const { data: conversaciones } = useLatConversaciones();
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // ── Filtrado por período (sobre updated_at / ultima_interaccion) ────────────
  const periodoMs = periodo === 'hoy' ? 86_400_000 : periodo === 'semana' ? 7 * 86_400_000 : 30 * 86_400_000;
  const periodoAnteriorRange = useMemo(() => {
    const end = Date.now() - periodoMs;
    const start = end - periodoMs;
    return { start, end };
  }, [periodoMs]);

  const enPeriodo = useMemo(
    () => conversaciones.filter(c => {
      const t = new Date(c.updated_at ?? c.ultima_interaccion).getTime();
      return Date.now() - t <= periodoMs;
    }),
    [conversaciones, periodoMs],
  );
  const enPeriodoAnterior = useMemo(
    () => conversaciones.filter(c => {
      const t = new Date(c.updated_at ?? c.ultima_interaccion).getTime();
      return t >= periodoAnteriorRange.start && t < periodoAnteriorRange.end;
    }),
    [conversaciones, periodoAnteriorRange],
  );

  const groups = groupByStage(conversaciones);

  // ── Resumen del día ───────────────────────────────────────────────────────
  const resumen = {
    porAtender: groups.por_atender.length,
    enGestion:  groups.en_gestion.length,
    enEspera:   groups.en_espera.length,
    finalizadas: conversaciones.filter(isFinalizadaHoy).length,
    slaRiesgo:  countFlag(conversaciones, 'sla_vencido'),
    activas:    groups.por_atender.length + groups.en_gestion.length + groups.en_espera.length,
  };

  // ── Rendimiento ──────────────────────────────────────────────────────────
  const cumplimientoSLA = conversaciones.length > 0
    ? Math.round((1 - resumen.slaRiesgo / conversaciones.length) * 100)
    : 100;

  const reactivadas = conversaciones.filter(c => c.estado === 'reabierto').length;
  // Mock simple primera respuesta: promedio horas desde creación a últ. interacción para outbound atendidas
  const tiempoCierreProm = useMemo(() => {
    const cerradas = conversaciones.filter(c => getFunnelStage(c) === 'finalizado');
    if (!cerradas.length) return '—';
    const totalH = cerradas.reduce((acc, c) => {
      const a = new Date(c.created_at).getTime();
      const b = new Date(c.updated_at ?? c.ultima_interaccion).getTime();
      return acc + Math.max(0, (b - a) / 3600000);
    }, 0);
    const h = totalH / cerradas.length;
    return h < 24 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`;
  }, [conversaciones]);

  const primeraRespuestaProm = useMemo(() => {
    // Aproximación: para conversaciones con respuesta (no por_atender), tiempo desde creación a última interacción / N
    const atendidas = conversaciones.filter(c => getFunnelStage(c) !== 'por_atender');
    if (!atendidas.length) return '—';
    const totalMin = atendidas.reduce((acc, c) => {
      const a = new Date(c.created_at).getTime();
      const b = new Date(c.ultima_interaccion).getTime();
      return acc + Math.max(0, (b - a) / 60000);
    }, 0);
    const m = totalMin / atendidas.length;
    return m < 60 ? `${Math.round(m)}m` : `${(m / 60).toFixed(1)}h`;
  }, [conversaciones]);

  // ── Carga / productividad (con tendencia vs período anterior) ────────────
  const recibidas = enPeriodo.length;
  const recibidasPrev = enPeriodoAnterior.length;
  const resueltas = enPeriodo.filter(c => getFunnelStage(c) === 'finalizado').length;
  const resueltasPrev = enPeriodoAnterior.filter(c => getFunnelStage(c) === 'finalizado').length;
  const balance = resueltas - recibidas;
  const backlog = resumen.activas;

  const capacidadMax = 15;
  const cargaUsada = Math.min(Math.round((resumen.activas / capacidadMax) * 100), 100);

  // ── Por canal ────────────────────────────────────────────────────────────
  const canalStats = useMemo(() => {
    const canales: Array<{ key: string; label: string; icon: any }> = [
      { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
      { key: 'phone', label: 'Llamadas', icon: Phone },
      { key: 'email', label: 'Correo', icon: Mail },
    ];
    return canales.map(c => {
      const list = conversaciones.filter(x => x.canal === c.key);
      const cierres = list.filter(x => getFunnelStage(x) === 'finalizado').length;
      const sla = list.filter(x => getFlags(x).sla_vencido).length;
      // 1ª respuesta promedio aproximada
      const atend = list.filter(x => getFunnelStage(x) !== 'por_atender');
      let pr = '—';
      if (atend.length) {
        const min = atend.reduce((a, x) => a + Math.max(0, (new Date(x.ultima_interaccion).getTime() - new Date(x.created_at).getTime()) / 60000), 0) / atend.length;
        pr = min < 60 ? `${Math.round(min)}m` : `${(min / 60).toFixed(1)}h`;
      }
      return { ...c, volumen: list.length, cierres, sla, primeraResp: pr };
    });
  }, [conversaciones]);

  // ── Funnel data con tiempo promedio en cada etapa ────────────────────────
  const funnelData = useMemo(() => {
    return FUNNEL_STAGES.map(s => {
      const list = groups[s.key];
      const tiemposH = list.map(c => (Date.now() - new Date(c.updated_at ?? c.created_at).getTime()) / 3600000);
      const promH = tiemposH.length ? tiemposH.reduce((a, b) => a + b, 0) / tiemposH.length : 0;
      const promLabel = promH < 24 ? `${promH.toFixed(1)}h` : `${(promH / 24).toFixed(1)}d`;
      return { ...s, count: list.length, prom: list.length ? promLabel : '—' };
    });
  }, [groups]);

  const totalFunnel = funnelData.reduce((a, b) => a + b.count, 0) || 1;

  // ── Alertas ──────────────────────────────────────────────────────────────
  const alertas = useMemo(() => {
    const out: Array<{ id: string; tipo: 'critical' | 'warning' | 'info'; titulo: string; count: number; cta: () => void }> = [];

    if (resumen.slaRiesgo > 0) {
      out.push({
        id: 'sla', tipo: 'critical',
        titulo: 'Conversaciones en riesgo SLA',
        count: resumen.slaRiesgo,
        cta: () => goBandeja({ flag: 'sla_vencido' }),
      });
    }

    const estancadas = conversaciones.filter(c => {
      if (getFunnelStage(c) !== 'en_gestion') return false;
      const h = (Date.now() - new Date(c.ultima_interaccion).getTime()) / 3600000;
      return h > 24;
    }).length;
    if (estancadas > 0) {
      out.push({
        id: 'estancadas', tipo: 'warning',
        titulo: 'Conversaciones estancadas (+24h)',
        count: estancadas,
        cta: () => goBandeja({ stage: 'en_gestion' }),
      });
    }

    const reactSinAtender = conversaciones.filter(c => c.estado === 'reabierto' && getFunnelStage(c) === 'por_atender').length;
    if (reactSinAtender > 0) {
      out.push({
        id: 'react', tipo: 'warning',
        titulo: 'Reactivadas sin atención',
        count: reactSinAtender,
        cta: () => goBandeja({ flag: 'reabierto' }),
      });
    }

    if (cargaUsada >= 85) {
      out.push({
        id: 'carga', tipo: 'critical',
        titulo: 'Sobrecarga operativa',
        count: cargaUsada,
        cta: () => goBandeja({ stage: 'en_gestion' }),
      });
    }
    return out;
  }, [conversaciones, resumen.slaRiesgo, cargaUsada]);

  // ── GTR: conversaciones activas con estado de asignación ────────────────
  const gtrData = useMemo(
    () => conversaciones.filter(c => c.estado_asignacion && c.estado_asignacion !== 'cerrada' && c.estado_asignacion !== 'ignorada'),
    [conversaciones],
  );

  // Estado del asesor (mock simple)
  const asesorEstado: 'disponible' | 'en_gestion' | 'pausa' = resumen.enGestion > 0 ? 'en_gestion' : 'disponible';

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-full overflow-y-auto scrollbar-thin bg-background">
        {/* ── HEADER OPERATIVO ──────────────────────────────────────────── */}
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
          <div className="px-4 sm:px-6 py-3">
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h1 className="text-base sm:text-lg font-semibold text-foreground">Dashboard LAT</h1>
                  <AsesorBadge estado={asesorEstado} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Rendimiento conectado a Bandeja · actualizado {now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Selector período */}
                <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
                  {(['hoy', 'semana', 'mes'] as Periodo[]).map(p => (
                    <button
                      key={p}
                      onClick={() => setPeriodo(p)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors capitalize ${
                        periodo === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {/* Carga capacidad */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-border">
                      <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground leading-none">Carga</span>
                        <span className={`text-xs font-semibold leading-tight ${cargaUsada >= 85 ? 'text-destructive' : cargaUsada >= 60 ? 'text-warning' : 'text-foreground'}`}>
                          {resumen.activas}/{capacidadMax} · {cargaUsada}%
                        </span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Conversaciones activas vs capacidad máxima</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </header>

        <div className="px-4 sm:px-6 py-5 space-y-6 max-w-[1400px] mx-auto">

          {/* ── ALERTAS OPERATIVAS (prioridad visual: riesgo primero) ──── */}
          {alertas.length > 0 && (
            <section>
              <SectionHead icon={AlertOctagon} label="Alertas operativas" iconClass="text-destructive" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {alertas.map(a => (
                  <AlertCard key={a.id} {...a} />
                ))}
              </div>
            </section>
          )}

          {/* ── RESUMEN DEL DÍA ──────────────────────────────────────── */}
          <section>
            <SectionHead icon={Inbox} label="Resumen del día" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <SummaryCard label="Por atender" value={resumen.porAtender} dot="bg-info" tooltip="Conversaciones que requieren acción inmediata" onClick={() => goBandeja({ stage: 'por_atender' })} />
              <SummaryCard label="En gestión" value={resumen.enGestion} dot="bg-primary" tooltip="Activas, bajo control del asesor" onClick={() => goBandeja({ stage: 'en_gestion' })} />
              <SummaryCard label="En espera" value={resumen.enEspera} dot="bg-warning" tooltip="Esperando respuesta del cliente" onClick={() => goBandeja({ stage: 'en_espera' })} />
              <SummaryCard label="Finalizadas" value={resumen.finalizadas} dot="bg-success" tooltip="Cerradas hoy" onClick={() => goBandeja({ stage: 'finalizado' })} />
              <SummaryCard label="SLA en riesgo" value={resumen.slaRiesgo} dot="bg-destructive" tooltip="Pendiente >4h sin respuesta" onClick={() => goBandeja({ flag: 'sla_vencido' })} accent="destructive" />
              <SummaryCard label="Activas" value={resumen.activas} dot="bg-foreground" tooltip="Total no finalizadas" onClick={() => goBandeja({})} />
            </div>
          </section>

          {/* ── RENDIMIENTO DEL ASESOR ───────────────────────────────── */}
          <section>
            <SectionHead icon={Activity} label="Rendimiento del asesor" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <Kpi icon={Clock} label="1ª respuesta" value={primeraRespuestaProm} tooltip="Tiempo promedio hasta la primera respuesta" />
              <Kpi icon={Timer} label="Tiempo cierre" value={tiempoCierreProm} tooltip="Tiempo promedio de cierre" />
              <Kpi icon={Zap} label="Cumple SLA" value={`${cumplimientoSLA}%`} tooltip="% de conversaciones dentro de SLA" tone={cumplimientoSLA >= 90 ? 'success' : cumplimientoSLA >= 70 ? 'warning' : 'destructive'} />
              <Kpi icon={CheckCircle2} label="Cerradas" value={resumen.finalizadas} tooltip="Cerradas hoy" tone="success" />
              <Kpi icon={RefreshCw} label="Reactivadas" value={reactivadas} tooltip="Conversaciones reabiertas" />
              <Kpi icon={GitBranch} label="Derivadas" value={0} tooltip="Derivaciones realizadas" />
            </div>
          </section>

          {/* ── CARGA Y PRODUCTIVIDAD ────────────────────────────────── */}
          <section>
            <SectionHead icon={Gauge} label="Carga y productividad" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {/* Balance entrada/salida */}
              <div className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Balance · {periodo}</span>
                  <Trend current={recibidas} prev={recibidasPrev} />
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Recibidas</p>
                    <p className="text-2xl font-bold text-foreground leading-tight">{recibidas}</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground rotate-90" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Resueltas</p>
                    <p className="text-2xl font-bold text-success leading-tight">{resueltas}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Balance</p>
                    <p className={`text-2xl font-bold leading-tight ${balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {balance >= 0 ? '+' : ''}{balance}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>vs período anterior:</span>
                  <span>recibidas {recibidasPrev}</span>·<span>resueltas {resueltasPrev}</span>
                </div>
              </div>

              {/* Backlog */}
              <div className="bg-card rounded-xl border border-border p-4">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Backlog</span>
                <p className="text-2xl font-bold text-foreground mt-2 leading-tight">{backlog}</p>
                <p className="text-[10px] text-muted-foreground mt-1">conversaciones activas pendientes</p>
                <button onClick={() => goBandeja({})} className="mt-3 text-[10px] text-primary hover:underline inline-flex items-center gap-1">
                  Ver en Bandeja <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              {/* Capacidad usada */}
              <div className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Capacidad usada</span>
                  <span className={`text-xs font-semibold ${cargaUsada >= 85 ? 'text-destructive' : cargaUsada >= 60 ? 'text-warning' : 'text-success'}`}>
                    {cargaUsada}%
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground mt-2 leading-tight">{resumen.activas}<span className="text-sm text-muted-foreground font-normal">/{capacidadMax}</span></p>
                <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${cargaUsada >= 85 ? 'bg-destructive' : cargaUsada >= 60 ? 'bg-warning' : 'bg-success'}`}
                    style={{ width: `${cargaUsada}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  {cargaUsada >= 85 ? 'Sobrecarga · derivar a cola' : cargaUsada >= 60 ? 'Carga alta' : 'Carga saludable'}
                </p>
              </div>
            </div>
          </section>

          {/* ── RENDIMIENTO POR CANAL ────────────────────────────────── */}
          <section>
            <SectionHead icon={MessageSquare} label="Rendimiento por canal" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {canalStats.map(c => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    onClick={() => goBandeja({ canal: c.key })}
                    className="text-left bg-card rounded-xl border border-border p-4 hover:border-primary/40 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-sm font-semibold text-foreground">{c.label}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <CanalMetric label="Vol." value={c.volumen} />
                      <CanalMetric label="1ª resp." value={c.primeraResp} />
                      <CanalMetric label="Cierres" value={c.cierres} tone="success" />
                      <CanalMetric label="SLA" value={c.sla} tone={c.sla > 0 ? 'destructive' : 'muted'} />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── PANEL GTR ────────────────────────────────────────────── */}
          <section>
            <SectionHead icon={Network} label="Gestión de trazabilidad y routing (GTR)" hint={`${gtrData.length} activas`} />
            <GtrPanel data={gtrData} />
          </section>

          {/* ── FUNNEL OPERATIVO (ejecutivo, no listado) ─────────────── */}
          <section>
            <SectionHead icon={GitBranch} label="Funnel operativo" hint={`${totalFunnel} conversaciones`} />
            <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
              {/* Barra apilada horizontal con proporciones */}
              <div className="flex h-3 rounded-full overflow-hidden bg-muted mb-4">
                {funnelData.map(s => {
                  const pct = (s.count / totalFunnel) * 100;
                  if (pct === 0) return null;
                  return (
                    <Tooltip key={s.key}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => goBandeja({ stage: s.key })}
                          className={`${s.color} hover:opacity-80 transition-opacity`}
                          style={{ width: `${pct}%` }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>{s.label}: {s.count} ({pct.toFixed(0)}%)</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

              {/* 4 columnas con métricas por etapa */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {funnelData.map(s => {
                  const pct = totalFunnel > 0 ? (s.count / totalFunnel) * 100 : 0;
                  return (
                    <button
                      key={s.key}
                      onClick={() => goBandeja({ stage: s.key })}
                      className="text-left p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/30 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${s.color}`} />
                          <span className="text-[11px] font-medium text-foreground">{s.label}</span>
                        </div>
                        <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-xl font-bold text-foreground leading-tight">{s.count}</p>
                      <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
                        <span>{pct.toFixed(0)}%</span>
                        <span>prom. {s.prom}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

function SectionHead({ icon: Icon, label, hint, iconClass = 'text-primary' }: { icon: any; label: string; hint?: string; iconClass?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
      <h2 className="text-[11px] font-semibold text-foreground uppercase tracking-wide">{label}</h2>
      {hint && <span className="text-[10px] text-muted-foreground">· {hint}</span>}
    </div>
  );
}

function SummaryCard({ label, value, dot, tooltip, onClick, accent }: { label: string; value: number; dot: string; tooltip: string; onClick: () => void; accent?: 'destructive' }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={`text-left bg-card rounded-xl border p-3 hover:border-primary/40 hover:shadow-sm transition-all group ${
            accent === 'destructive' && value > 0 ? 'border-destructive/30 bg-destructive/5' : 'border-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`w-2 h-2 rounded-full ${dot}`} />
            <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className={`text-xl font-bold mt-2 leading-tight ${accent === 'destructive' && value > 0 ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function Kpi({ icon: Icon, label, value, tooltip, tone }: { icon: any; label: string; value: string | number; tooltip?: string; tone?: 'success' | 'warning' | 'destructive' }) {
  const valueColor = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'destructive' ? 'text-destructive' : 'text-foreground';
  const card = (
    <div className="bg-card rounded-xl border border-border p-3">
      <div className="flex items-center justify-between">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className={`text-base font-bold ${valueColor}`}>{value}</span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">{label}</p>
    </div>
  );
  if (!tooltip) return card;
  return (
    <Tooltip>
      <TooltipTrigger asChild><div>{card}</div></TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function CanalMetric({ label, value, tone }: { label: string; value: string | number; tone?: 'success' | 'destructive' | 'muted' }) {
  const c = tone === 'success' ? 'text-success' : tone === 'destructive' ? 'text-destructive' : tone === 'muted' ? 'text-muted-foreground' : 'text-foreground';
  return (
    <div>
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-semibold ${c} leading-tight`}>{value}</p>
    </div>
  );
}

function Trend({ current, prev }: { current: number; prev: number }) {
  if (prev === 0 && current === 0) return <span className="text-[10px] text-muted-foreground">—</span>;
  const diff = current - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : 100;
  const up = diff >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = up ? 'text-success' : 'text-destructive';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {up ? '+' : ''}{pct}%
    </span>
  );
}

function AlertCard({ tipo, titulo, count, cta }: { tipo: 'critical' | 'warning' | 'info'; titulo: string; count: number; cta: () => void }) {
  const styles = tipo === 'critical'
    ? { border: 'border-destructive/30', bg: 'bg-destructive/5', dot: 'bg-destructive', text: 'text-destructive' }
    : tipo === 'warning'
    ? { border: 'border-warning/30', bg: 'bg-warning/5', dot: 'bg-warning', text: 'text-warning' }
    : { border: 'border-info/30', bg: 'bg-info/5', dot: 'bg-info', text: 'text-info' };
  return (
    <div className={`rounded-xl border ${styles.border} ${styles.bg} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
            <p className="text-[11px] font-medium text-foreground truncate">{titulo}</p>
          </div>
          <p className={`text-2xl font-bold mt-1 leading-tight ${styles.text}`}>{count}</p>
        </div>
      </div>
      <button
        onClick={cta}
        className="mt-2 text-[10px] font-medium text-primary hover:underline inline-flex items-center gap-1"
      >
        Ver en Bandeja <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
}

const CANAL_LABEL: Record<string, string> = {
  whatsapp: 'WA', phone: 'Tel', email: 'Email', instagram: 'IG', facebook: 'FB', web: 'Web', interno: 'Int',
};

const GTR_ESTADO: Record<string, { dot: string; label: string }> = {
  en_cola:    { dot: 'bg-amber-400',        label: 'En cola'    },
  asignada:   { dot: 'bg-primary',          label: 'Asignada'   },
  en_gestion: { dot: 'bg-emerald-500',      label: 'En gestión' },
  en_espera:  { dot: 'bg-blue-400',         label: 'En espera'  },
  desborde:   { dot: 'bg-orange-500',       label: 'Desborde'   },
  pendiente:  { dot: 'bg-muted-foreground', label: 'Pendiente'  },
};

function GtrPanel({ data }: { data: LatConversacion[] }) {
  if (data.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border px-4 py-8 text-center">
        <p className="text-xs text-muted-foreground">Sin conversaciones activas en el enrutador</p>
      </div>
    );
  }
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="grid grid-cols-[3.5rem_1fr_7rem_1fr_1fr] gap-3 px-4 py-2 border-b border-border/50 bg-muted/30">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Canal</span>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Cliente</span>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Estado</span>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Responsable</span>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Cola / Área</span>
      </div>
      <div className="divide-y divide-border/50 max-h-72 overflow-y-auto scrollbar-thin">
        {data.map(c => {
          const estado = c.estado_asignacion ?? 'pendiente';
          const cfg = GTR_ESTADO[estado] ?? { dot: 'bg-muted-foreground', label: estado };
          return (
            <button
              key={c.id}
              onClick={() => goBandeja({})}
              className="w-full grid grid-cols-[3.5rem_1fr_7rem_1fr_1fr] gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors text-left"
            >
              <span className="text-[10px] font-medium text-muted-foreground">{CANAL_LABEL[c.canal] ?? c.canal}</span>
              <span className="text-xs text-foreground truncate">{c.cliente_nombre ?? c.telefono ?? '—'}</span>
              <span className="inline-flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                <span className="text-[10px] text-foreground truncate">{cfg.label}</span>
              </span>
              <span className="text-[10px] text-muted-foreground truncate">{c.responsable_nombre ?? '—'}</span>
              <span className="text-[10px] text-muted-foreground truncate">{c.cola_area_nombre ?? '—'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AsesorBadge({ estado }: { estado: 'disponible' | 'en_gestion' | 'pausa' }) {
  const map = {
    disponible: { Icon: PlayCircle, label: 'Disponible', cls: 'bg-success/10 text-success border-success/20' },
    en_gestion: { Icon: Activity, label: 'En gestión', cls: 'bg-primary/10 text-primary border-primary/20' },
    pausa: { Icon: PauseCircle, label: 'En pausa', cls: 'bg-warning/10 text-warning border-warning/20' },
  } as const;
  const { Icon, label, cls } = map[estado];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

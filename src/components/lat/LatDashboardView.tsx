import { MessageSquare, Phone, Mail, Clock, AlertTriangle, Users, TrendingUp } from 'lucide-react';
import { conversaciones, tareas, clientes } from '@/data/latMockData';

const stats = [
  { label: 'Conversaciones activas', value: conversaciones.filter(c => c.estado !== 'finalizado').length, icon: MessageSquare, color: 'text-primary' },
  { label: 'Tareas pendientes', value: tareas.filter(t => t.estado !== 'completada').length, icon: Clock, color: 'text-warning' },
  { label: 'Urgentes', value: conversaciones.filter(c => c.prioridad === 'urgente').length, icon: AlertTriangle, color: 'text-urgent' },
  { label: 'Clientes activos', value: clientes.filter(c => c.estadoCliente === 'Activo').length, icon: Users, color: 'text-success' },
];

const canalStats = [
  { canal: 'WhatsApp', icon: MessageSquare, color: 'bg-whatsapp', count: conversaciones.filter(c => c.canal === 'whatsapp').length },
  { canal: 'Teléfono', icon: Phone, color: 'bg-phone', count: conversaciones.filter(c => c.canal === 'phone').length },
  { canal: 'Correo', icon: Mail, color: 'bg-email', count: conversaciones.filter(c => c.canal === 'email').length },
];

const prioridadStats = [
  { label: 'Urgente', count: conversaciones.filter(c => c.prioridad === 'urgente').length, color: 'bg-urgent' },
  { label: 'Alta', count: conversaciones.filter(c => c.prioridad === 'alta').length, color: 'bg-warning' },
  { label: 'Media', count: conversaciones.filter(c => c.prioridad === 'media').length, color: 'bg-primary' },
  { label: 'Baja', count: conversaciones.filter(c => c.prioridad === 'baja').length, color: 'bg-muted-foreground' },
];

export function LatDashboardView() {
  const total = conversaciones.length;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="px-4 sm:px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h1 className="text-base sm:text-lg font-semibold text-foreground">Dashboard LAT</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">Resumen de actividad de la línea de atención</p>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {stats.map(s => (
            <div key={s.label} className="bg-card rounded-xl border border-border p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <s.icon className={`w-5 h-5 ${s.color}`} />
                <span className="text-xl sm:text-2xl font-bold text-foreground">{s.value}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Canales */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-xs font-semibold text-foreground mb-3">Distribución por canal</h3>
            <div className="space-y-3">
              {canalStats.map(cs => (
                <div key={cs.canal} className="flex items-center gap-3">
                  <cs.icon className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-foreground">{cs.canal}</span>
                      <span className="text-[11px] font-medium text-foreground">{cs.count}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${cs.color}`} style={{ width: `${(cs.count / total) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Prioridad */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-xs font-semibold text-foreground mb-3">Distribución por prioridad</h3>
            <div className="space-y-3">
              {prioridadStats.map(ps => (
                <div key={ps.label} className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${ps.color}`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-foreground">{ps.label}</span>
                      <span className="text-[11px] font-medium text-foreground">{ps.count}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${ps.color}`} style={{ width: `${(ps.count / total) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-xs font-semibold text-foreground mb-3">Actividad reciente</h3>
          <div className="space-y-2">
            {conversaciones.slice(0, 5).map(conv => {
              const cl = clientes.find(c => c.id === conv.clienteId);
              return (
                <div key={conv.id} className="flex items-center gap-3 py-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    conv.prioridad === 'urgente' ? 'bg-urgent' : conv.prioridad === 'alta' ? 'bg-warning' : 'bg-primary'
                  }`} />
                  <span className="text-[11px] text-foreground flex-1 truncate">{cl?.nombre} — {conv.asunto}</span>
                  <span className="text-[10px] text-muted-foreground">{conv.estado.replace('_', ' ')}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

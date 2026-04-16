import { ChevronRight, GitBranch } from 'lucide-react';
import { conversaciones, clientes } from '@/data/latMockData';

type FunnelStage = { label: string; estados: string[]; color: string };

const funnelStages: FunnelStage[] = [
  { label: 'Nuevo', estados: ['nuevo'], color: 'bg-info' },
  { label: 'Pendiente respuesta', estados: ['pendiente_respuesta'], color: 'bg-warning' },
  { label: 'En seguimiento', estados: ['en_seguimiento', 'con_tarea'], color: 'bg-primary' },
  { label: 'Urgente', estados: ['urgente'], color: 'bg-urgent' },
  { label: 'Finalizado', estados: ['finalizado'], color: 'bg-success' },
];

export function LatFunnelView() {
  const stageData = funnelStages.map(stage => ({
    ...stage,
    conversaciones: conversaciones.filter(c => stage.estados.includes(c.estado)),
  }));

  const maxCount = Math.max(...stageData.map(s => s.conversaciones.length), 1);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="px-4 sm:px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          <h1 className="text-base sm:text-lg font-semibold text-foreground">Funnel LAT</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">Distribución de conversaciones por etapa</p>
      </div>

      <div className="px-4 sm:px-6 py-6 space-y-6">
        {/* Funnel visual */}
        <div className="bg-card rounded-xl border border-border p-4 sm:p-6">
          <h3 className="text-xs font-semibold text-foreground mb-4">Funnel de conversaciones</h3>
          <div className="flex items-end gap-2 sm:gap-3 h-40 sm:h-48">
            {stageData.map(stage => {
              const height = (stage.conversaciones.length / maxCount) * 100;
              return (
                <div key={stage.label} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-base sm:text-lg font-bold text-foreground">{stage.conversaciones.length}</span>
                  <div className="w-full rounded-t-lg relative" style={{ height: `${Math.max(height, 10)}%` }}>
                    <div className={`absolute inset-0 rounded-t-lg ${stage.color} opacity-80`} />
                  </div>
                  <span className="text-[9px] sm:text-[10px] text-muted-foreground text-center leading-tight">{stage.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail by stage */}
        <div className="space-y-4">
          {stageData.map(stage => (
            <div key={stage.label} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                <h3 className="text-xs font-semibold text-foreground">{stage.label}</h3>
                <span className="text-[10px] text-muted-foreground ml-auto">{stage.conversaciones.length} conversaciones</span>
              </div>
              {stage.conversaciones.length > 0 ? (
                <div className="space-y-1.5">
                  {stage.conversaciones.map(conv => {
                    const cl = clientes.find(c => c.id === conv.clienteId);
                    return (
                      <div key={conv.id} className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-accent/30">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          conv.prioridad === 'urgente' ? 'bg-urgent' : conv.prioridad === 'alta' ? 'bg-warning' : 'bg-primary'
                        }`} />
                        <span className="text-[11px] text-foreground flex-1 truncate">{cl?.nombre}</span>
                        <span className="text-[10px] text-muted-foreground truncate max-w-[140px] sm:max-w-[200px]">{conv.asunto}</span>
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">Sin conversaciones en esta etapa</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

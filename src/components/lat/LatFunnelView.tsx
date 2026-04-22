import { ChevronRight, GitBranch } from 'lucide-react';
import { useLatConversaciones } from '@/hooks/useLatData';
import { FUNNEL_STAGES, getFunnelStage, getFlags, groupByStage } from '@/lib/latFunnel';
import { getCliente } from '@/data/latMockData';

export function LatFunnelView() {
  const { data: conversaciones } = useLatConversaciones();

  const groups = groupByStage(conversaciones);
  const stageData = FUNNEL_STAGES.map(stage => ({
    ...stage,
    conversaciones: groups[stage.key],
  }));

  const maxCount = Math.max(...stageData.map(s => s.conversaciones.length), 1);
  const total = conversaciones.length;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="px-4 sm:px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          <h1 className="text-base sm:text-lg font-semibold text-foreground">Funnel LAT</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Distribución operativa por etapa · {total} conversaciones
        </p>
      </div>

      <div className="px-4 sm:px-6 py-6 space-y-6">
        {/* Funnel visual */}
        <div className="bg-card rounded-xl border border-border p-4 sm:p-6">
          <h3 className="text-xs font-semibold text-foreground mb-4">Flujo operativo</h3>
          <div className="flex items-end gap-2 sm:gap-3 h-40 sm:h-48">
            {stageData.map(stage => {
              const height = (stage.conversaciones.length / maxCount) * 100;
              return (
                <div key={stage.key} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-base sm:text-lg font-bold text-foreground">{stage.conversaciones.length}</span>
                  <div className="w-full rounded-t-lg relative" style={{ height: `${Math.max(height, 10)}%` }}>
                    <div className={`absolute inset-0 rounded-t-lg ${stage.color} opacity-80`} />
                  </div>
                  <span className="text-[10px] sm:text-xs font-medium text-foreground text-center leading-tight">{stage.label}</span>
                  <span className="text-[9px] text-muted-foreground text-center leading-tight hidden sm:block">{stage.description}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detalle por etapa */}
        <div className="space-y-4">
          {stageData.map(stage => (
            <div key={stage.key} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                <h3 className="text-xs font-semibold text-foreground">{stage.label}</h3>
                <span className="text-[10px] text-muted-foreground">· {stage.description}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{stage.conversaciones.length} conversaciones</span>
              </div>
              {stage.conversaciones.length > 0 ? (
                <div className="space-y-1.5">
                  {stage.conversaciones.slice(0, 8).map(conv => {
                    const mockCl = conv._source === 'mock' ? getCliente(conv.id) : null;
                    const nombre = conv.cliente_nombre ?? mockCl?.nombre ?? conv.telefono ?? 'Sin nombre';
                    const flags = getFlags(conv);
                    return (
                      <div key={conv.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent/30">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          flags.urgente ? 'bg-urgent' : conv.prioridad === 'alta' ? 'bg-warning' : 'bg-primary'
                        }`} />
                        <span className="text-[11px] text-foreground flex-1 truncate">{nombre}</span>
                        <span className="text-[10px] text-muted-foreground truncate max-w-[140px] sm:max-w-[200px]">{conv.asunto ?? conv.ultimo_mensaje}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {flags.urgente && <span className="text-[8px] px-1 rounded bg-urgent/10 text-urgent">urg</span>}
                          {flags.sin_leer && <span className="text-[8px] px-1 rounded bg-primary/10 text-primary">{conv.no_leidos}</span>}
                          {flags.fuera_ventana && <span className="text-[8px] px-1 rounded bg-muted text-muted-foreground">fv</span>}
                          {flags.con_gestion && <span className="text-[8px] px-1 rounded bg-accent/30 text-accent-foreground">G</span>}
                        </div>
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      </div>
                    );
                  })}
                  {stage.conversaciones.length > 8 && (
                    <p className="text-[10px] text-muted-foreground text-center pt-1">
                      +{stage.conversaciones.length - 8} más
                    </p>
                  )}
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

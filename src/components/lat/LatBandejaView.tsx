import { useState, useMemo } from 'react';
import { ConversacionList } from './ConversacionList';
import { ConversacionPanel } from './ConversacionPanel';
import { Cliente360Panel } from './Cliente360Panel';
import { SoftphoneWidget } from './SoftphoneWidget';
import { conversaciones, getCliente } from '@/data/latMockData';

export function LatBandejaView() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [filtroCanal, setFiltroCanal] = useState<string>('todos');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');

  const filteredConvs = useMemo(() => {
    let result = [...conversaciones];
    if (filtroCanal !== 'todos') result = result.filter(c => c.canal === filtroCanal);
    if (filtroEstado !== 'todos') result = result.filter(c => c.estado === filtroEstado);
    if (busqueda) {
      const q = busqueda.toLowerCase();
      result = result.filter(c => {
        const cliente = getCliente(c.clienteId);
        return (
          cliente?.nombre.toLowerCase().includes(q) ||
          c.asunto.toLowerCase().includes(q) ||
          c.ultimoMensaje.toLowerCase().includes(q)
        );
      });
    }
    // Sort: urgente first, then by prioridad, then by time
    const prioMap: Record<string, number> = { urgente: 0, alta: 1, media: 2, baja: 3 };
    result.sort((a, b) => {
      const ea = a.estado === 'urgente' ? -1 : 0;
      const eb = b.estado === 'urgente' ? -1 : 0;
      if (ea !== eb) return ea - eb;
      const pa = prioMap[a.prioridad] ?? 2;
      const pb = prioMap[b.prioridad] ?? 2;
      if (pa !== pb) return pa - pb;
      return b.ultimaInteraccion.getTime() - a.ultimaInteraccion.getTime();
    });
    return result;
  }, [filtroCanal, filtroEstado, busqueda]);

  const selectedConv = conversaciones.find(c => c.id === selectedConvId);
  const selectedCliente = selectedConv ? getCliente(selectedConv.clienteId) : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Conversation List */}
      <div className="w-72 sm:w-80 border-r border-border flex flex-col shrink-0 bg-card">
        <ConversacionList
          conversaciones={filteredConvs}
          selectedId={selectedConvId}
          onSelect={setSelectedConvId}
          filtroCanal={filtroCanal}
          onFiltroCanal={setFiltroCanal}
          filtroEstado={filtroEstado}
          onFiltroEstado={setFiltroEstado}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
        />
      </div>

      {/* Center: Conversation */}
      <div className="flex-1 min-w-0 flex flex-col bg-background">
        {selectedConv ? (
          <ConversacionPanel conversacion={selectedConv} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-sm font-medium">Selecciona una conversación</p>
              <p className="text-xs mt-1 text-muted-foreground">Elige una conversación del panel izquierdo para comenzar</p>
            </div>
          </div>
        )}
      </div>

      {/* Right: Cliente 360 */}
      {selectedConv && selectedCliente && (
        <div className="hidden lg:block w-80 xl:w-96 border-l border-border shrink-0 bg-card overflow-y-auto scrollbar-thin">
          <Cliente360Panel
            cliente={selectedCliente}
            conversacion={selectedConv}
          />
        </div>
      )}

      {/* Softphone */}
      <SoftphoneWidget />
    </div>
  );
}

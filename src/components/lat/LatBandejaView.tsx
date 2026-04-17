import { useState, useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { ConversacionList } from './ConversacionList';
import { ConversacionPanel } from './ConversacionPanel';
import { Cliente360Panel } from './Cliente360Panel';
import { SoftphoneWidget } from './SoftphoneWidget';
import { getCliente } from '@/data/latMockData';
import { useLatConversaciones } from '@/hooks/useLatData';

type MobileView = 'list' | 'chat';

export function LatBandejaView() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [mobileView, setMobileView]         = useState<MobileView>('list');
  const [filtroCanal, setFiltroCanal]       = useState<string>('todos');
  const [filtroEstado, setFiltroEstado]     = useState<string>('todos');
  const [busqueda, setBusqueda]             = useState('');

  // Datos reales desde Supabase (con fallback a mock si la tabla está vacía)
  const { data: todasConversaciones } = useLatConversaciones();

  const filteredConvs = useMemo(() => {
    let result = [...todasConversaciones];
    if (filtroCanal  !== 'todos') result = result.filter(c => c.canal   === filtroCanal);
    if (filtroEstado !== 'todos') result = result.filter(c => c.estado  === filtroEstado);
    if (busqueda) {
      const q = busqueda.toLowerCase();
      result = result.filter(c => {
        const nombre = c.cliente_nombre ?? getCliente(c.id)?.nombre ?? '';
        return (
          nombre.toLowerCase().includes(q) ||
          c.asunto?.toLowerCase().includes(q) ||
          c.ultimo_mensaje?.toLowerCase().includes(q) ||
          c.telefono?.includes(busqueda)
        );
      });
    }
    const prioMap: Record<string, number> = { urgente: 0, alta: 1, media: 2, baja: 3 };
    result.sort((a, b) => {
      const ea = a.estado === 'urgente' ? -1 : 0;
      const eb = b.estado === 'urgente' ? -1 : 0;
      if (ea !== eb) return ea - eb;
      return (prioMap[a.prioridad] ?? 2) - (prioMap[b.prioridad] ?? 2) ||
        new Date(b.ultima_interaccion).getTime() - new Date(a.ultima_interaccion).getTime();
    });
    return result;
  }, [todasConversaciones, filtroCanal, filtroEstado, busqueda]);

  const selectedConv    = todasConversaciones.find(c => c.id === selectedConvId) ?? null;

  // Para el panel Cliente360 (sigue usando mock data para los que vienen de ahí)
  const mockCliente = selectedConv?._source === 'mock'
    ? getCliente(selectedConv.id) ?? null
    : null;

  const handleSelect = (id: string) => {
    setSelectedConvId(id);
    setMobileView('chat');
  };

  const handleBack = () => {
    setMobileView('list');
  };

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Lista de conversaciones ─────────────────────────────────────
          Mobile:  visible solo cuando mobileView==='list'
          md+:     siempre visible, ancho fijo  */}
      <div className={[
        'border-r border-border flex flex-col shrink-0 bg-card',
        'w-full md:w-72 lg:w-80',
        mobileView === 'list' ? 'flex' : 'hidden md:flex',
      ].join(' ')}>
        <ConversacionList
          conversaciones={filteredConvs}
          selectedId={selectedConvId}
          onSelect={handleSelect}
          filtroCanal={filtroCanal}
          onFiltroCanal={setFiltroCanal}
          filtroEstado={filtroEstado}
          onFiltroEstado={setFiltroEstado}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
        />
      </div>

      {/* ── Panel de conversación ────────────────────────────────────────
          Mobile:  visible solo cuando mobileView==='chat'
          md+:     siempre visible, toma el espacio restante  */}
      <div className={[
        'flex-1 min-w-0 flex flex-col bg-background',
        mobileView === 'chat' ? 'flex' : 'hidden md:flex',
      ].join(' ')}>

        {/* Botón "Volver" solo en mobile cuando hay conversación abierta */}
        {selectedConv && (
          <button
            onClick={handleBack}
            className="md:hidden flex items-center gap-1.5 px-3 py-2 text-xs text-primary font-medium border-b border-border bg-card shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            Bandeja
          </button>
        )}

        {selectedConv ? (
          <ConversacionPanel conversacion={selectedConv} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center px-6">
              <p className="text-sm font-medium">Seleccioná una conversación</p>
              <p className="text-xs mt-1 text-muted-foreground">
                Elegí una del panel izquierdo para comenzar
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Panel Cliente 360 ────────────────────────────────────────────
          Solo en lg+ y solo si viene de mock data (tiene el modelo Cliente)  */}
      {selectedConv && mockCliente && (
        <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-border shrink-0 bg-card overflow-y-auto scrollbar-thin">
          <Cliente360Panel
            cliente={mockCliente}
            conversacion={selectedConv as any}
          />
        </div>
      )}

      <SoftphoneWidget />
    </div>
  );
}

import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, Plus, Focus, Inbox } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ConversacionList } from './ConversacionList';
import { ConversacionPanel } from './ConversacionPanel';
import { Cliente360Panel } from './Cliente360Panel';
import { ClienteDBPanel } from './ClienteDBPanel';
import { SoftphoneWidget } from './SoftphoneWidget';
import { NuevaConversacionDialog } from './NuevaConversacionDialog';
import { getCliente } from '@/data/latMockData';
import { useLatConversaciones } from '@/hooks/useLatData';

type MobileView = 'list' | 'chat';
type FocusFilter = 'foco' | 'todos';

export function LatBandejaView() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [mobileView, setMobileView]         = useState<MobileView>('list');
  const [filtroCanal, setFiltroCanal]       = useState<string>('todos');
  const [filtroEstado, setFiltroEstado]     = useState<string>('todos');
  const [busqueda, setBusqueda]             = useState('');
  const [focusFilter, setFocusFilter]       = useState<FocusFilter>('foco');
  const [showNuevaConv, setShowNuevaConv]   = useState(false);
  const [stageFilter, setStageFilter]       = useState<string>('todos');
  const [flagFilter, setFlagFilter]         = useState<string>('todos');

  // Escuchar navegación desde Dashboard con filtro inicial
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {};
      setFocusFilter('todos');
      setStageFilter(detail.stage ?? 'todos');
      setFlagFilter(detail.flag ?? 'todos');
      setFiltroCanal(detail.canal ?? 'todos');
      setFiltroEstado('todos');
      setBusqueda('');
      setSelectedConvId(null);
      setMobileView('list');
    };
    window.addEventListener('lat-go-bandeja', handler as EventListener);
    return () => window.removeEventListener('lat-go-bandeja', handler as EventListener);
  }, []);

  // Datos reales desde Supabase (con fallback a mock si la tabla está vacía)
  const { data: todasConversaciones } = useLatConversaciones();

  const filteredConvs = useMemo(() => {
    let result = [...todasConversaciones];
    // Filtro Mi foco: oculta conversaciones liberadas / fuera de foco
    if (focusFilter === 'foco') {
      result = result.filter(c => c.en_foco !== false && c.estado !== 'liberado');
    }
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
  }, [todasConversaciones, filtroCanal, filtroEstado, busqueda, focusFilter]);

  const totalEnFoco   = todasConversaciones.filter(c => c.en_foco !== false && c.estado !== 'liberado').length;
  const totalLiberados = todasConversaciones.length - totalEnFoco;

  const selectedConv    = todasConversaciones.find(c => c.id === selectedConvId) ?? null;

  // Para el panel Cliente360 (sigue usando mock data para los que vienen de ahí)
  const mockCliente = selectedConv?._source === 'mock'
    ? getCliente(selectedConv.id) ?? null
    : null;

  const handleSelect = (id: string) => {
    setSelectedConvId(id);
    setMobileView('chat');
    // Marcar como leída
    const conv = todasConversaciones.find(c => c.id === id);
    if (conv?._source === 'db' && conv.no_leidos > 0) {
      (supabase as any).from('lat_conversaciones').update({ no_leidos: 0 }).eq('id', id);
    }
  };

  const handleBack = () => {
    setMobileView('list');
  };

  const handleConvCreated = (convId: string) => {
    setSelectedConvId(convId);
    setMobileView('chat');
    setFocusFilter('foco');
  };

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Lista de conversaciones ───────────────────────────────────────── */}
      <div className={[
        'border-r border-border flex flex-col shrink-0 bg-card',
        'w-full md:w-72 lg:w-80',
        mobileView === 'list' ? 'flex' : 'hidden md:flex',
      ].join(' ')}>

        {/* Toolbar superior: Mi foco / Todos + Nueva conversación */}
        <div className="px-3 pt-3 pb-1 flex items-center gap-1.5 shrink-0 border-b border-border/50">
          <button
            onClick={() => setFocusFilter('foco')}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
              focusFilter === 'foco'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent/50'
            }`}
            title="Solo conversaciones activas en foco"
          >
            <Focus className="w-3 h-3" />
            Mi foco
            <span className={`text-[9px] px-1 rounded ${focusFilter === 'foco' ? 'bg-primary-foreground/20' : 'bg-background/50'}`}>
              {totalEnFoco}
            </span>
          </button>
          <button
            onClick={() => setFocusFilter('todos')}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
              focusFilter === 'todos'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent/50'
            }`}
            title="Todas, incluyendo chats liberados"
          >
            <Inbox className="w-3 h-3" />
            Todas
            {totalLiberados > 0 && (
              <span className={`text-[9px] px-1 rounded ${focusFilter === 'todos' ? 'bg-primary-foreground/20' : 'bg-background/50'}`}>
                +{totalLiberados}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowNuevaConv(true)}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            title="Nueva conversación outbound (WhatsApp / llamada / correo)"
          >
            <Plus className="w-3 h-3" />
            Nueva
          </button>
        </div>

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

      {/* ── Panel de conversación ──────────────────────────────────────────── */}
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
          <ConversacionPanel key={selectedConv.id} conversacion={selectedConv} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center px-6">
              <p className="text-sm font-medium">Seleccioná una conversación</p>
              <p className="text-xs mt-1 text-muted-foreground">
                Elegí una del panel izquierdo o iniciá una nueva
              </p>
              <button
                onClick={() => setShowNuevaConv(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
              >
                <Plus className="w-3.5 h-3.5" />
                Nueva conversación
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Panel Cliente 360 ── */}
      {selectedConv && mockCliente && (
        <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-border shrink-0 bg-card overflow-y-auto scrollbar-thin">
          <Cliente360Panel cliente={mockCliente} conversacion={selectedConv as any} />
        </div>
      )}
      {selectedConv && !mockCliente && selectedConv.cliente_id && (
        <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-border shrink-0 bg-card">
          <ClienteDBPanel
            clienteId={selectedConv.cliente_id}
            conversacion={selectedConv}
          />
        </div>
      )}

      <NuevaConversacionDialog
        open={showNuevaConv}
        onOpenChange={setShowNuevaConv}
        onConversacionCreated={handleConvCreated}
      />

      <SoftphoneWidget />
    </div>
  );
}

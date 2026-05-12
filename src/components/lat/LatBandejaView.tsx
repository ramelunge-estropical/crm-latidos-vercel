import { useState, useMemo, useEffect } from 'react';
import {
  ChevronLeft, Plus, Focus, Inbox, Users, ShieldCheck,
  ArrowRightLeft, AlertCircle, Search, User, X
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ConversacionList } from './ConversacionList';
import { ConversacionPanel } from './ConversacionPanel';
import { Cliente360Panel } from './Cliente360Panel';
import { ClienteDBPanel } from './ClienteDBPanel';
import { SoftphoneWidget } from './SoftphoneWidget';
import { NuevaConversacionDialog } from './NuevaConversacionDialog';
import { ReasignacionDialog } from './ReasignacionDialog';
import { getCliente } from '@/data/latMockData';
import { useLatBandeja } from '@/hooks/useLatData';
import { useCurrentUserRol, useClientes } from '@/hooks/useSharedQueries';
import { getFunnelStage, getFlags } from '@/lib/latFunnel';
import { CreateClienteDialog } from '@/components/CreateClienteDialog';

type MobileView = 'list' | 'chat';
type FocusFilter = 'foco' | 'todos';

// ── Etiquetas de estado de asignación para la bandeja supervisor ──────────────
const ESTADO_ASIG_LABEL: Record<string, { label: string; dot: string }> = {
  en_cola:    { label: 'En cola',     dot: 'bg-amber-400'    },
  asignada:   { label: 'Asignada',    dot: 'bg-primary'      },
  en_gestion: { label: 'En gestión',  dot: 'bg-emerald-500'  },
  en_espera:  { label: 'En espera',   dot: 'bg-blue-400'     },
  desborde:   { label: 'Desborde',    dot: 'bg-orange-500'   },
  pendiente:  { label: 'Pendiente',   dot: 'bg-muted-foreground' },
};

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
  const [showReasignacion, setShowReasignacion] = useState(false);
  const [showVincular, setShowVincular]         = useState(false);
  const [vincularSearch, setVincularSearch]     = useState('');
  const [showCrearCliente, setShowCrearCliente] = useState(false);

  const queryClient = useQueryClient();

  // ── Usuario logueado y su rol ─────────────────────────────────────────────
  const { rol, user, isSadmin, isSupervisor, colaboradorId } = useCurrentUserRol();

  // ── Datos reales desde Supabase (filtrados por rol en la query) ───────────
  const { data: todasConversaciones } = useLatBandeja(colaboradorId, rol);
  const { data: todosClientes = [] }  = useClientes();

  // Detectar si estamos en modo mock (tabla vacía)
  const isMockMode = useMemo(
    () => todasConversaciones.every(c => c._source === 'mock'),
    [todasConversaciones],
  );

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

  // ── Filtros de conversaciones ──────────────────────────────────────────────
  // El hook ya devuelve SOLO las conversaciones del usuario autenticado.
  // Aquí aplicamos únicamente los filtros de UI (canal, estado, búsqueda, etc.).
  const filteredConvs = useMemo(() => {
    let result = [...todasConversaciones];

    if (focusFilter === 'foco') {
      result = result.filter(c => c.en_foco !== false && c.estado !== 'liberado');
    }
    if (filtroCanal  !== 'todos') result = result.filter(c => c.canal   === filtroCanal);
    if (filtroEstado !== 'todos') result = result.filter(c => c.estado  === filtroEstado);

    if (stageFilter !== 'todos') {
      result = result.filter(c => getFunnelStage(c) === stageFilter);
    }
    if (flagFilter !== 'todos') {
      result = result.filter(c => {
        const f = getFlags(c);
        return (f as any)[flagFilter] === true;
      });
    }
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
  }, [
    todasConversaciones, filtroCanal, filtroEstado, busqueda, focusFilter,
    stageFilter, flagFilter,
  ]);

  // Contadores para la toolbar — basados en la bandeja personal del usuario
  const totalEnFoco = useMemo(
    () => todasConversaciones.filter(c => c.en_foco !== false && c.estado !== 'liberado').length,
    [todasConversaciones],
  );

  const totalLiberados = useMemo(
    () => todasConversaciones.length -
          todasConversaciones.filter(c => c.en_foco !== false && c.estado !== 'liberado').length,
    [todasConversaciones],
  );

  // Contadores supervisor: siempre 0 — la bandeja es personal.
  // Los supervisores usan el Dashboard para ver la cola global.
  const enColaCount    = 0;
  const sinAsignarCount = 0;

  const selectedConv = todasConversaciones.find(c => c.id === selectedConvId) ?? null;

  const mockCliente = selectedConv?._source === 'mock'
    ? getCliente(selectedConv.id) ?? null
    : null;

  const handleSelect = (id: string) => {
    setSelectedConvId(id);
    setMobileView('chat');
    const conv = todasConversaciones.find(c => c.id === id);
    if (conv?._source === 'db' && conv.no_leidos > 0) {
      (supabase as any).from('lat_conversaciones').update({ no_leidos: 0 }).eq('id', id);
    }
  };

  const handleConvCreated = (convId: string) => {
    setSelectedConvId(convId);
    setMobileView('chat');
    setFocusFilter('foco');
  };

  // ── Estado de asignación del chat seleccionado (para badge) ───────────────
  const selectedEstadoAsig = selectedConv?.estado_asignacion;
  const estadoAsigCfg = selectedEstadoAsig ? ESTADO_ASIG_LABEL[selectedEstadoAsig] : null;

  const clientesFiltrados = vincularSearch.length >= 2
    ? todosClientes.filter(c => {
        const q = vincularSearch.toLowerCase();
        return (
          c.nombre_completo?.toLowerCase().includes(q) ||
          c.razon_social?.toLowerCase().includes(q) ||
          c.telefono?.includes(vincularSearch) ||
          c.documento_numero?.includes(vincularSearch) ||
          c.nit?.includes(vincularSearch)
        );
      }).slice(0, 8)
    : [];

  const handleVincularCliente = async (cId: string, cNombre: string) => {
    if (!selectedConv) return;
    await (supabase as any)
      .from('lat_conversaciones')
      .update({ cliente_id: cId, cliente_nombre: cNombre })
      .eq('id', selectedConv.id);
    
    queryClient.invalidateQueries({ queryKey: ['lat_conversaciones'] });
    queryClient.invalidateQueries({ queryKey: ['lat-conversaciones'] });
    queryClient.invalidateQueries({ queryKey: ['lat-cliente-db'] });
    toast.success('Cliente vinculado');
    setShowVincular(false);
    setVincularSearch('');
  };

  const handleAutoVincularCreado = async (cId: string, cNombre: string, tel?: string | null, email?: string | null) => {
    if (!selectedConv) return;
    if (!isMockMode && !selectedConv.cliente_id) {
      const update: any = { cliente_id: cId, cliente_nombre: cNombre };
      if (!selectedConv.telefono && tel) update.telefono = tel;
      await (supabase as any).from('lat_conversaciones').update(update).eq('id', selectedConv.id);
      toast.success('Cliente creado y vinculado');
    }
    queryClient.invalidateQueries({ queryKey: ['lat_conversaciones'] });
    queryClient.invalidateQueries({ queryKey: ['lat-conversaciones'] });
    queryClient.invalidateQueries({ queryKey: ['lat-cliente-db'] });
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ── Lista de conversaciones ──────────────────────────────────────── */}
      <div className={[
        'border-r border-border flex flex-col shrink-0 bg-card',
        'w-full md:w-72 lg:w-80',
        mobileView === 'list' ? 'flex' : 'hidden md:flex',
      ].join(' ')}>

        {/* Toolbar superior */}
        <div className="px-3 pt-3 pb-1 flex flex-col gap-1.5 shrink-0 border-b border-border/50">

          {/* Identificador de rol */}
          <div className="flex items-center gap-1.5">
            {isSadmin ? (
              <span className="flex items-center gap-1 text-[10px] text-rose-600 font-semibold">
                <ShieldCheck className="w-3 h-3" />
                Super Admin · vista total
              </span>
            ) : isSupervisor ? (
              <span className="flex items-center gap-1 text-[10px] text-violet-600 font-medium">
                <ShieldCheck className="w-3 h-3" />
                {rol === 'admin' ? 'Admin' : 'Supervisor'}
                {(enColaCount > 0 || sinAsignarCount > 0) && (
                  <span className="ml-1 flex items-center gap-1">
                    {enColaCount > 0 && (
                      <span className="px-1 rounded bg-amber-100 text-amber-700">
                        {enColaCount} en cola
                      </span>
                    )}
                    {sinAsignarCount > 0 && (
                      <span className="px-1 rounded bg-destructive/10 text-destructive">
                        {sinAsignarCount} sin asignar
                      </span>
                    )}
                  </span>
                )}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Users className="w-3 h-3" />
                {user?.nombre ?? 'Colaborador'}
              </span>
            )}
          </div>

          {/* Botones foco / todos / nueva */}
          <div className="flex items-center gap-1.5">
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
              title={isSupervisor ? 'Todas las conversaciones activas' : 'Todas tus conversaciones'}
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
              title="Nueva conversación outbound"
            >
              <Plus className="w-3 h-3" />
              Nueva
            </button>
          </div>
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

      {/* ── Panel de conversación ────────────────────────────────────────── */}
      <div className={[
        'flex-1 min-w-0 min-h-0 flex flex-col bg-background overflow-hidden',
        mobileView === 'chat' ? 'flex' : 'hidden md:flex',
      ].join(' ')}>

        {selectedConv && (
          <button
            onClick={() => setMobileView('list')}
            className="md:hidden flex items-center gap-1.5 px-3 py-2 text-xs text-primary font-medium border-b border-border bg-card shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            Bandeja
          </button>
        )}

        {/* Sub-header: estado de asignación + acciones supervisor */}
        {selectedConv && (estadoAsigCfg || isSupervisor) && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 bg-card/50 shrink-0">
            {estadoAsigCfg && (
              <span className="flex items-center gap-1.5 text-[11px]">
                <span className={`w-2 h-2 rounded-full ${estadoAsigCfg.dot}`} />
                <span className="text-muted-foreground">{estadoAsigCfg.label}</span>
              </span>
            )}
            {selectedConv.routing_status && (
              <span className="text-[10px] text-muted-foreground">
                · motor: {selectedConv.routing_status}
              </span>
            )}
            {/* Botón reasignar: solo para supervisors/admin */}
            {isSupervisor && selectedConv._source === 'db' && (
              <button
                onClick={() => setShowReasignacion(true)}
                className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="Reasignar conversación"
              >
                <ArrowRightLeft className="w-3 h-3" />
                Reasignar
              </button>
            )}
          </div>
        )}

        {selectedConv ? (
          <ConversacionPanel key={selectedConv.id} conversacion={selectedConv} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center px-6">
              {!isMockMode && !isSupervisor && (
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
              )}
              <p className="text-sm font-medium">Seleccioná una conversación</p>
              <p className="text-xs mt-1 text-muted-foreground">
                {!isMockMode && !isSupervisor
                  ? `Mostrando conversaciones asignadas a ${user?.nombre ?? 'vos'}`
                  : 'Elegí una del panel izquierdo o iniciá una nueva'}
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

      {/* ── Panel lateral: Cliente 360 ──────────────────────────────────── */}
      {selectedConv && (
        <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-border shrink-0 bg-card min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <>
                {mockCliente ? (
                  <Cliente360Panel cliente={mockCliente} conversacion={selectedConv as any} />
                ) : selectedConv.cliente_id ? (
                  <ClienteDBPanel
                    clienteId={selectedConv.cliente_id}
                    conversacion={selectedConv}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-warning" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Cliente no registrado</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {selectedConv.telefono ? `Número: ${selectedConv.telefono}` : 'Sin número asociado'}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70 mt-1">
                        Creá el cliente para poder gestionar sus datos y vincular gestiones.
                      </p>
                    </div>
                    {!showVincular ? (
                      <div className="flex flex-col gap-2 w-full mt-2">
                        <button
                          onClick={() => setShowCrearCliente(true)}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" /> Crear contacto
                        </button>
                        <button
                          onClick={() => setShowVincular(true)}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-border text-muted-foreground rounded-lg text-xs font-medium hover:bg-accent/50 transition-colors"
                        >
                          <Search className="w-3.5 h-3.5" /> Vincular manualmente
                        </button>
                      </div>
                    ) : (
                      <div className="w-full space-y-2 mt-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input
                            autoFocus
                            type="text"
                            placeholder="Nombre, CI, NIT o teléfono..."
                            value={vincularSearch}
                            onChange={e => setVincularSearch(e.target.value)}
                            className="w-full bg-muted/50 text-xs rounded-lg pl-8 pr-8 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <button onClick={() => { setShowVincular(false); setVincularSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                            <X className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </div>
                        {clientesFiltrados.length > 0 && (
                          <div className="border border-border rounded-lg overflow-hidden bg-card">
                            {clientesFiltrados.map(c => (
                              <button
                                key={c.id}
                                onClick={() => handleVincularCliente(c.id, c.nombre_completo ?? c.razon_social ?? '')}
                                className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors border-b border-border/50 last:border-0"
                              >
                                <p className="text-xs font-medium truncate">{c.nombre_completo ?? c.razon_social}</p>
                                <p className="text-[10px] text-muted-foreground">{c.telefono ?? c.email ?? (c.documento_numero ? `CI: ${c.documento_numero}` : '')}</p>
                              </button>
                            ))}
                          </div>
                        )}
                        {vincularSearch.length >= 2 && clientesFiltrados.length === 0 && (
                          <p className="text-[11px] text-muted-foreground text-center py-2">Sin resultados</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
            </>
          </div>
        </div>
      )}

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      <NuevaConversacionDialog
        open={showNuevaConv}
        onOpenChange={setShowNuevaConv}
        onConversacionCreated={handleConvCreated}
      />

      {selectedConv && isSupervisor && (
        <ReasignacionDialog
          open={showReasignacion}
          onOpenChange={setShowReasignacion}
          conversacion={selectedConv}
          intervenidoPorId={colaboradorId}
        />
      )}

      {selectedConv && (
        <CreateClienteDialog
          open={showCrearCliente}
          onOpenChange={setShowCrearCliente}
          initialTelefono={selectedConv.telefono ?? ''}
          initialNombre={selectedConv.cliente_nombre ?? ''}
          initialCanal={selectedConv.canal === 'whatsapp' ? 'WhatsApp' : selectedConv.canal === 'phone' ? 'Telefonía' : 'Correo'}
          onCreated={handleAutoVincularCreado}
        />
      )}

      <SoftphoneWidget />
    </div>
  );
}

import { useState, useMemo, useEffect } from 'react';
import {
  ChevronLeft, Plus, Focus, Inbox, Users, ShieldCheck,
  Activity, ArrowRightLeft, AlertCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ConversacionList } from './ConversacionList';
import { ConversacionPanel } from './ConversacionPanel';
import { Cliente360Panel } from './Cliente360Panel';
import { ClienteDBPanel } from './ClienteDBPanel';
import { SoftphoneWidget } from './SoftphoneWidget';
import { NuevaConversacionDialog } from './NuevaConversacionDialog';
import { TrazabilidadPanel } from './TrazabilidadPanel';
import { ReasignacionDialog } from './ReasignacionDialog';
import { getCliente } from '@/data/latMockData';
import { useLatConversaciones } from '@/hooks/useLatData';
import { useCurrentUserRol } from '@/hooks/useSharedQueries';
import { getFunnelStage, getFlags } from '@/lib/latFunnel';

type MobileView = 'list' | 'chat';
type FocusFilter = 'foco' | 'todos';
type SideTab = 'cliente' | 'trazabilidad';

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
  const [sideTab, setSideTab]               = useState<SideTab>('cliente');
  const [showReasignacion, setShowReasignacion] = useState(false);

  // ── Usuario logueado y su rol ─────────────────────────────────────────────
  const { rol, user, isSupervisor, colaboradorId } = useCurrentUserRol();

  // ── Datos reales desde Supabase ────────────────────────────────────────────
  const { data: todasConversaciones } = useLatConversaciones();

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
  const filteredConvs = useMemo(() => {
    let result = [...todasConversaciones];

    // ── Filtro principal por rol ─────────────────────────────────────────────
    // Colaborador solo ve sus conversaciones asignadas (excepto en modo mock/demo).
    if (!isSupervisor && !isMockMode && colaboradorId) {
      result = result.filter(c =>
        c.responsable_id === colaboradorId &&
        c.estado_asignacion !== 'cerrada' &&
        c.estado_asignacion !== 'ignorada',
      );
    }

    // ── Filtros de UI ────────────────────────────────────────────────────────
    if (focusFilter === 'foco') {
      result = result.filter(c => c.en_foco !== false && c.estado !== 'liberado');
    }
    if (filtroCanal  !== 'todos') result = result.filter(c => c.canal   === filtroCanal);
    if (filtroEstado !== 'todos') result = result.filter(c => c.estado  === filtroEstado);

    // Filtros desde Dashboard
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
    todasConversaciones, isSupervisor, isMockMode, colaboradorId,
    filtroCanal, filtroEstado, busqueda, focusFilter,
    stageFilter, flagFilter,
  ]);

  // Contadores para la toolbar
  const totalEnFoco = useMemo(() => {
    let base = isSupervisor || isMockMode
      ? todasConversaciones
      : todasConversaciones.filter(c =>
          c.responsable_id === colaboradorId &&
          c.estado_asignacion !== 'cerrada' &&
          c.estado_asignacion !== 'ignorada',
        );
    return base.filter(c => c.en_foco !== false && c.estado !== 'liberado').length;
  }, [todasConversaciones, isSupervisor, isMockMode, colaboradorId]);

  const totalLiberados = useMemo(() => {
    let base = isSupervisor || isMockMode
      ? todasConversaciones
      : todasConversaciones.filter(c =>
          c.responsable_id === colaboradorId &&
          c.estado_asignacion !== 'cerrada' &&
          c.estado_asignacion !== 'ignorada',
        );
    return base.length - base.filter(c => c.en_foco !== false && c.estado !== 'liberado').length;
  }, [todasConversaciones, isSupervisor, isMockMode, colaboradorId]);

  // Contadores para el badge supervisor
  const enColaCount = useMemo(
    () => isSupervisor
      ? todasConversaciones.filter(c => c.estado_asignacion === 'en_cola').length
      : 0,
    [todasConversaciones, isSupervisor],
  );
  const sinAsignarCount = useMemo(
    () => isSupervisor
      ? todasConversaciones.filter(c =>
          !c.responsable_id &&
          c.estado_asignacion !== 'cerrada' &&
          c.estado_asignacion !== 'ignorada',
        ).length
      : 0,
    [todasConversaciones, isSupervisor],
  );

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
            {isSupervisor ? (
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

      {/* ── Panel lateral: Cliente 360 / Trazabilidad ────────────────────── */}
      {selectedConv && (
        <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-border shrink-0 bg-card min-h-0 overflow-hidden">

          {/* Tabs del panel lateral */}
          <div className="flex border-b border-border/50 shrink-0">
            <button
              onClick={() => setSideTab('cliente')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors border-b-2 ${
                sideTab === 'cliente'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="w-3 h-3" />
              Cliente 360
            </button>
            <button
              onClick={() => setSideTab('trazabilidad')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors border-b-2 ${
                sideTab === 'trazabilidad'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Activity className="w-3 h-3" />
              Trazabilidad
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {sideTab === 'cliente' ? (
              <>
                {mockCliente ? (
                  <Cliente360Panel cliente={mockCliente} conversacion={selectedConv as any} />
                ) : selectedConv.cliente_id ? (
                  <ClienteDBPanel
                    clienteId={selectedConv.cliente_id}
                    conversacion={selectedConv}
                  />
                ) : (
                  <div className="p-4 text-xs text-muted-foreground text-center mt-6">
                    Sin cliente relacionado
                  </div>
                )}
              </>
            ) : (
              <TrazabilidadPanel conversacion={selectedConv} />
            )}
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

      <SoftphoneWidget />
    </div>
  );
}

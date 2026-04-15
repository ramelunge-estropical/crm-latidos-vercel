import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useColaboradores, useProcesses, useAllStages, useCurrentUserRol } from "@/hooks/useSharedQueries";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { GestionDetailView } from "./GestionDetailView";
import { GestionDialog } from "./GestionDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Plus, Briefcase, FolderKanban, Cog, AlertCircle,
  Calendar, LayoutGrid, List, Kanban, Hash, Tag, Users, Search, X,
  Clock, Filter
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

// ── Configuración de tipos ──────────────────────────────
const typeConfig = {
  comercial: { label: "Comercial",        icon: Briefcase,    color: "text-blue-500"   },
  proyecto:  { label: "Proyectos",         icon: FolderKanban, color: "text-violet-500" },
  operativa: { label: "Tareas Operativas", icon: Cog,          color: "text-amber-500"  },
  caso:      { label: "Casos",             icon: AlertCircle,  color: "text-rose-500"   },
} as const;

const COLUMNS = [
  { id: "to_do",  label: "To Do",  dot: "bg-status-todo"   },
  { id: "doing",  label: "Doing",  dot: "bg-status-doing"  },
  { id: "review", label: "Review", dot: "bg-status-review" },
  { id: "done",   label: "Done",   dot: "bg-status-done"   },
];

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgente", className: "bg-red-500/15 text-red-600"      },
  high:   { label: "Alta",    className: "bg-orange-500/15 text-orange-600" },
  medium: { label: "Media",   className: "bg-primary/10 text-primary"       },
  low:    { label: "Baja",    className: "bg-muted text-muted-foreground"   },
};

// ── Helpers de badge ────────────────────────────────────
function PriorityBadge({ priority }: { priority: string }) {
  const c = priorityConfig[priority] || priorityConfig.medium;
  return <Badge variant="outline" className={`text-[10px] ${c.className}`}>{c.label}</Badge>;
}

function StatusBadge({ globalStatus, stageName }: { globalStatus: string; stageName: string }) {
  const colors: Record<string, string> = {
    to_do:  "bg-muted text-muted-foreground",
    doing:  "bg-amber-500/10 text-amber-600",
    review: "bg-violet-500/10 text-violet-600",
    done:   "bg-emerald-500/10 text-emerald-600",
  };
  return <Badge variant="outline" className={`text-[10px] ${colors[globalStatus] || ""}`}>{stageName}</Badge>;
}

// ── Props ───────────────────────────────────────────────
interface SpecializedViewProps {
  type: "comercial" | "proyecto" | "operativa" | "caso";
}

type ViewMode = "grid" | "list" | "kanban";

// ── Componente principal ────────────────────────────────
export function SpecializedView({ type }: SpecializedViewProps) {
  const queryClient = useQueryClient();
  const { isAdmin } = useCurrentUserRol();
  const config = typeConfig[type];
  const Icon = config.icon;

  const [detailGestionId, setDetailGestionId] = useState<string | null>(null);
  const [filterPriority, setFilterPriority]   = useState("all");
  const [filterStatus,   setFilterStatus]     = useState("all");
  const [filterFecha,    setFilterFecha]       = useState("all");
  const [filterResponsable, setFilterResponsable] = useState("all");
  const [searchQuery, setSearchQuery]         = useState("");
  const [showCreate, setShowCreate]           = useState(false);
  const [viewMode, setViewMode]               = useState<ViewMode>("kanban");
  const [showFilters, setShowFilters]         = useState(false);
  // "mine" = solo del colaborador actual | "all" = todos (futuro: solo admin/gerente)
  const [scope, setScope]                     = useState<"mine" | "all">("mine");

  const colaboradorId = localStorage.getItem("mis_gestiones_colaborador") || "";

  // ── Queries ──────────────────────────────────────────
  const { data: gestiones = [] } = useQuery({
    queryKey: ["gestiones-type", type, scope, colaboradorId],
    queryFn: async () => {
      let q = (supabase as any)
        .from("gestiones")
        .select("*, pipeline_stages(id, name, global_status, order, process_id)")
        .eq("type", type)
        .order("updated_at", { ascending: false });

      // TODO(roles): cuando haya auth, aplicar filtros por rol/área aquí
      if (scope === "mine" && colaboradorId) {
        q = q.eq("responsable_id", colaboradorId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: processes  = [] } = useProcesses();
  const { data: allStages  = [] } = useAllStages();
  const { data: colaboradores = [] } = useColaboradores();

  const processMap = useMemo(() => Object.fromEntries(processes.map(p => [p.id, p])), [processes]);

  const activeFilterCount = [
    filterPriority !== "all",
    filterStatus   !== "all",
    filterFecha    !== "all",
    filterResponsable !== "all",
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearchQuery(""); setFilterPriority("all");
    setFilterStatus("all"); setFilterFecha("all"); setFilterResponsable("all");
  };

  const statusLabels: Record<string, string> = {
    to_do: "Por hacer", doing: "En proceso", review: "En revisión", done: "Finalizado",
  };
  const fechaLabels: Record<string, string> = {
    overdue: "Vencidas", due_soon: "Próximos 7 días", no_date: "Sin fecha",
  };

  const filtered = useMemo(() => {
    const q   = searchQuery.toLowerCase().trim();
    const now = Date.now();
    return gestiones.filter(g => {
      if (filterPriority !== "all" && g.priority !== filterPriority) return false;
      if (filterStatus   !== "all" && g.pipeline_stages?.global_status !== filterStatus) return false;
      if (filterResponsable !== "all" && g.responsable_id !== filterResponsable) return false;
      if (filterFecha !== "all") {
        const due = g.due_date ? new Date(g.due_date).getTime() : null;
        const isDone = g.pipeline_stages?.global_status === "done";
        if (filterFecha === "overdue"  && !(due && due < now && !isDone)) return false;
        if (filterFecha === "due_soon" && !(due && due >= now && due <= now + 7 * 86400000)) return false;
        if (filterFecha === "no_date"  && due !== null) return false;
      }
      if (!q) return true;
      return (
        g.title?.toLowerCase().includes(q) ||
        g.codigo?.toLowerCase().includes(q) ||
        g.cliente_nombre?.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q) ||
        g.responsable_nombre?.toLowerCase().includes(q) ||
        g.subtype?.toLowerCase().includes(q)
      );
    });
  }, [gestiones, filterPriority, filterStatus, filterFecha, filterResponsable, searchQuery]);

  // Agrupado por global_status para el kanban
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = { to_do: [], doing: [], review: [], done: [] };
    for (const g of filtered) {
      const status = g.pipeline_stages?.global_status || "to_do";
      if (map[status]) map[status].push(g);
    }
    return map;
  }, [filtered]);

  // ── Drag & drop (kanban) ─────────────────────────────
  const onDragEnd = async (result: DropResult) => {
    if (!isAdmin) return;
    const { draggableId, destination } = result;
    if (!destination) return;
    const newStatus = destination.droppableId;
    const gestion = gestiones.find(g => g.id === draggableId);
    if (!gestion || gestion.pipeline_stages?.global_status === newStatus) return;

    const targetStage = allStages
      .filter(s => s.process_id === gestion.process_id && s.global_status === newStatus)
      .sort((a: any, b: any) => a.order - b.order)[0];

    if (!targetStage) {
      toast.error("Este proceso no tiene una etapa para ese estado");
      return;
    }

    queryClient.setQueryData(["gestiones-type", type, scope, colaboradorId], (old: any[]) =>
      old?.map(g => g.id === draggableId
        ? { ...g, stage_id: targetStage.id, pipeline_stages: { ...g.pipeline_stages, global_status: newStatus, id: targetStage.id } }
        : g
      )
    );

    const { error } = await (supabase as any)
      .from("gestiones")
      .update({ stage_id: targetStage.id, entered_stage_at: new Date().toISOString() })
      .eq("id", draggableId);

    if (error) {
      toast.error("Error al mover");
      queryClient.invalidateQueries({ queryKey: ["gestiones-type", type, scope, colaboradorId] });
    } else {
      await (supabase as any).from("stage_history").insert({
        gestion_id: draggableId,
        from_stage_id: gestion.stage_id,
        to_stage_id: targetStage.id,
      });
    }
  };

  // Para crear: primer proceso del tipo
  const defaultProcess = processes[0];
  const defaultStage   = allStages.find(s => defaultProcess && s.process_id === defaultProcess.id);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-3 border-b border-border bg-card space-y-3">
        {/* Fila 1: título + acciones */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center ${config.color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">{config.label}</h2>
              <p className="text-xs text-muted-foreground">
                {filtered.length} de {gestiones.length} gestiones
                {scope === "mine" ? " · asignadas a mí" : " · todo el equipo"}
                {searchQuery && ` · "${searchQuery}"`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Scope: mío / equipo — TODO(roles): auto con auth */}
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              <button onClick={() => setScope("mine")}
                className={`px-2.5 py-1.5 text-xs transition-colors ${scope === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
                Mis
              </button>
              <button onClick={() => setScope("all")}
                className={`px-2.5 py-1.5 text-xs transition-colors flex items-center gap-1 ${scope === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
                <Users className="w-3 h-3" />Equipo
              </button>
            </div>

            {/* Vista */}
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              {(["grid", "list", "kanban"] as ViewMode[]).map(m => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`p-1.5 transition-colors ${viewMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
                  {m === "grid"   && <LayoutGrid className="w-3.5 h-3.5" />}
                  {m === "list"   && <List       className="w-3.5 h-3.5" />}
                  {m === "kanban" && <Kanban     className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>

            {isAdmin && defaultProcess && defaultStage && (
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowCreate(true)}>
                <Plus className="w-3.5 h-3.5" /> Nueva
              </Button>
            )}
          </div>
        </div>

        {/* Fila 2: buscador + filtros */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar por título, código, cliente, responsable..."
                className="pl-8 pr-8 h-8 text-xs"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Toggle filtros avanzados */}
            <button
              onClick={() => setShowFilters(f => !f)}
              className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border text-xs transition-colors ${
                showFilters || activeFilterCount > 0
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="bg-primary-foreground text-primary rounded-full px-1.5 py-0 text-[10px] font-bold leading-4">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {(searchQuery || activeFilterCount > 0) && (
              <button onClick={clearAllFilters} className="text-xs text-primary hover:underline whitespace-nowrap">
                Limpiar todo
              </button>
            )}
          </div>

          {/* Panel de filtros avanzados */}
          {showFilters && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {/* Prioridad */}
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="h-7 w-[130px] text-xs">
                  <SelectValue placeholder="Prioridad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Todas las prioridades</SelectItem>
                  <SelectItem value="urgent" className="text-xs">Urgente</SelectItem>
                  <SelectItem value="high"   className="text-xs">Alta</SelectItem>
                  <SelectItem value="medium" className="text-xs">Media</SelectItem>
                  <SelectItem value="low"    className="text-xs">Baja</SelectItem>
                </SelectContent>
              </Select>

              {/* Estado global */}
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-7 w-[140px] text-xs">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all"    className="text-xs">Todos los estados</SelectItem>
                  <SelectItem value="to_do"  className="text-xs">Por hacer</SelectItem>
                  <SelectItem value="doing"  className="text-xs">En proceso</SelectItem>
                  <SelectItem value="review" className="text-xs">En revisión</SelectItem>
                  <SelectItem value="done"   className="text-xs">Finalizado</SelectItem>
                </SelectContent>
              </Select>

              {/* Fecha */}
              <Select value={filterFecha} onValueChange={setFilterFecha}>
                <SelectTrigger className="h-7 w-[150px] text-xs">
                  <Clock className="w-3 h-3 mr-1" /><SelectValue placeholder="Fecha" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all"      className="text-xs">Todas las fechas</SelectItem>
                  <SelectItem value="overdue"  className="text-xs">Vencidas</SelectItem>
                  <SelectItem value="due_soon" className="text-xs">Próximos 7 días</SelectItem>
                  <SelectItem value="no_date"  className="text-xs">Sin fecha</SelectItem>
                </SelectContent>
              </Select>

              {/* Responsable (solo scope=all) */}
              {scope === "all" && colaboradores.length > 0 && (
                <Select value={filterResponsable} onValueChange={setFilterResponsable}>
                  <SelectTrigger className="h-7 w-[150px] text-xs">
                    <SelectValue placeholder="Responsable" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Todos los responsables</SelectItem>
                    {colaboradores.map((c: any) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Chips de filtros activos */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {filterPriority !== "all" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                  {priorityConfig[filterPriority]?.label}
                  <button onClick={() => setFilterPriority("all")}><X className="w-3 h-3" /></button>
                </span>
              )}
              {filterStatus !== "all" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                  {statusLabels[filterStatus]}
                  <button onClick={() => setFilterStatus("all")}><X className="w-3 h-3" /></button>
                </span>
              )}
              {filterFecha !== "all" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                  {fechaLabels[filterFecha]}
                  <button onClick={() => setFilterFecha("all")}><X className="w-3 h-3" /></button>
                </span>
              )}
              {filterResponsable !== "all" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                  {colaboradores.find((c: any) => c.id === filterResponsable)?.nombre || "Responsable"}
                  <button onClick={() => setFilterResponsable("all")}><X className="w-3 h-3" /></button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Icon className={`w-12 h-12 ${config.color} opacity-30 mb-3`} />
            <p className="text-sm text-muted-foreground">
              {scope === "mine" ? "No tenés gestiones asignadas de este tipo" : `No hay gestiones de tipo ${config.label.toLowerCase()}`}
            </p>
          </div>
        ) : viewMode === "kanban" ? (
          /* ── KANBAN ─────────────────────────────────── */
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-4 h-full p-4 min-w-max">
              {COLUMNS.map(col => (
                <div key={col.id} className="flex flex-col w-72 flex-shrink-0 bg-muted/40 rounded-xl">
                  <div className="flex items-center gap-2 px-3 py-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                    <h3 className="text-sm font-semibold">{col.label}</h3>
                    <span className="ml-auto text-xs font-medium text-muted-foreground bg-background rounded-full px-2 py-0.5">
                      {grouped[col.id].length}
                    </span>
                  </div>
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div ref={provided.innerRef} {...provided.droppableProps}
                        className={`flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[120px] rounded-lg mx-1 transition-colors ${
                          snapshot.isDraggingOver ? "bg-primary/5" : ""
                        }`}
                      >
                        {grouped[col.id].map((g, i) => {
                          const pConfig = priorityConfig[g.priority] || priorityConfig.medium;
                          const isOverdue = g.due_date && new Date(g.due_date) < new Date() && col.id !== "done";
                          return (
                            <Draggable key={g.id} draggableId={g.id} index={i}>
                              {(provided, snapshot) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                  onClick={() => setDetailGestionId(g.id)}
                                  className={`bg-card rounded-lg border p-3 shadow-sm cursor-pointer transition-all ${
                                    snapshot.isDragging ? "shadow-lg border-primary/40 rotate-[1deg]" : "border-border hover:shadow-md hover:border-primary/30"
                                  }`}
                                >
                                  {g.codigo && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground mb-1">
                                      <Hash className="w-2.5 h-2.5" />{g.codigo}
                                    </span>
                                  )}
                                  <p className="text-sm font-medium leading-snug line-clamp-2 mb-1">{g.title}</p>
                                  {g.cliente_nombre && <p className="text-[11px] text-muted-foreground mb-1">{g.cliente_nombre}</p>}
                                  {g.pipeline_stages?.name && (
                                    <p className="text-[10px] text-muted-foreground mb-1.5">
                                      Etapa: <span className="font-medium">{g.pipeline_stages.name}</span>
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2 flex-wrap mt-1 pt-1.5 border-t border-border/50">
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${pConfig.className}`}>{pConfig.label}</span>
                                    {g.due_date && (
                                      <span className={`inline-flex items-center gap-1 text-[10px] ml-auto ${isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                                        <Calendar className="w-3 h-3" />
                                        {format(new Date(g.due_date), "dd MMM", { locale: es })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                        {grouped[col.id].length === 0 && !snapshot.isDraggingOver && (
                          <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/40 border border-dashed border-border/40 rounded-lg">Sin gestiones</div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </DragDropContext>
        ) : (
          /* ── GRID / LIST ────────────────────────────── */
          <div className={`p-4 ${viewMode === "grid"
            ? "grid gap-3 max-w-5xl mx-auto sm:grid-cols-2 lg:grid-cols-3"
            : "flex flex-col gap-2 max-w-4xl mx-auto"
          }`}>
            {filtered.map(g => {
              const stage     = g.pipeline_stages;
              const process   = processMap[g.process_id];
              const daysUntil = g.due_date ? Math.ceil((new Date(g.due_date).getTime() - Date.now()) / 86400000) : null;
              const isOverdue = daysUntil !== null && daysUntil < 0;
              const isDueSoon = daysUntil !== null && daysUntil >= 0 && daysUntil <= 3;

              if (viewMode === "list") {
                return (
                  <button key={g.id} onClick={() => setDetailGestionId(g.id)}
                    className="group w-full flex items-center gap-4 p-3 rounded-lg border border-border bg-card hover:shadow-sm hover:border-primary/30 transition-all text-left"
                  >
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <PriorityBadge priority={g.priority} />
                      {stage && <StatusBadge globalStatus={stage.global_status} stageName={stage.name} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {g.codigo && <span className="text-[10px] font-mono text-muted-foreground">{g.codigo}</span>}
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{g.title}</p>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        {process && <span>{process.name}</span>}
                        {g.responsable_nombre && <span>· {g.responsable_nombre}</span>}
                        {g.cliente_nombre && <span>· {g.cliente_nombre}</span>}
                      </div>
                    </div>
                    {g.due_date && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium flex-shrink-0 ${isOverdue ? "text-destructive" : isDueSoon ? "text-orange-500" : "text-muted-foreground"}`}>
                        <Calendar className="w-3 h-3" />
                        {format(new Date(g.due_date), "dd MMM", { locale: es })}
                      </span>
                    )}
                  </button>
                );
              }

              // Grid
              return (
                <button key={g.id} onClick={() => setDetailGestionId(g.id)}
                  className="group w-full flex flex-col gap-3 p-4 rounded-xl border border-border bg-card hover:shadow-md hover:border-primary/30 transition-all text-left"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <PriorityBadge priority={g.priority} />
                    {stage && <StatusBadge globalStatus={stage.global_status} stageName={stage.name} />}
                    {g.subtype && <Badge variant="outline" className="text-[10px] bg-accent/50">{g.subtype}</Badge>}
                  </div>
                  <div className="flex-1 min-w-0">
                    {g.codigo && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground mb-1">
                        <Hash className="w-2.5 h-2.5" />{g.codigo}
                      </span>
                    )}
                    <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">{g.title}</p>
                    {g.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{g.description}</p>}
                  </div>
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {process && <div className="flex items-center gap-1.5"><FolderKanban className="w-3 h-3 flex-shrink-0" /><span className="truncate">{process.name}</span></div>}
                    {g.cliente_nombre && <div className="flex items-center gap-1.5"><Tag className="w-3 h-3 flex-shrink-0" /><span className="truncate">{g.cliente_nombre}</span></div>}
                    {g.responsable_nombre && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[8px] font-bold text-primary">{g.responsable_nombre.charAt(0).toUpperCase()}</span>
                        </div>
                        <span className="truncate">{g.responsable_nombre}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    {g.due_date ? (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${isOverdue ? "text-destructive" : isDueSoon ? "text-orange-500" : "text-muted-foreground"}`}>
                        <Calendar className="w-3 h-3" />
                        {format(new Date(g.due_date), "dd MMM yyyy", { locale: es })}
                        {isOverdue && <span> · Vencida</span>}
                        {isDueSoon && !isOverdue && <span> · Pronto</span>}
                      </span>
                    ) : <span className="text-[10px] text-muted-foreground/40">Sin fecha</span>}
                    <span className="text-[10px] text-muted-foreground/50">{format(new Date(g.updated_at), "dd/MM HH:mm")}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail */}
      {detailGestionId && (
        <GestionDetailView
          open={!!detailGestionId}
          onOpenChange={(o) => {
            if (!o) {
              setDetailGestionId(null);
              queryClient.invalidateQueries({ queryKey: ["gestiones-type", type, scope, colaboradorId] });
            }
          }}
          gestionId={detailGestionId}
          processId={gestiones.find(g => g.id === detailGestionId)?.process_id || ""}
        />
      )}

      {/* Create */}
      {showCreate && defaultProcess && defaultStage && (
        <GestionDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          processId={defaultProcess.id}
          stageId={defaultStage.id}
        />
      )}
    </div>
  );
}

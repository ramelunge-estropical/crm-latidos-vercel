import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useColaboradores, useAllStages } from "@/hooks/useSharedQueries";
import { Skeleton } from "@/components/ui/skeleton";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { GestionDetailView } from "./GestionDetailView";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColaboradorCombobox } from "@/components/ui/ColaboradorCombobox";
import { Badge } from "@/components/ui/badge";
import { Calendar, Hash, Tag, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

const COLUMNS = [
  { id: "to_do",  label: "To Do",   dot: "bg-status-todo"   },
  { id: "doing",  label: "Doing",   dot: "bg-status-doing"  },
  { id: "review", label: "Review",  dot: "bg-status-review" },
  { id: "done",   label: "Done",    dot: "bg-status-done"   },
];

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgente", className: "bg-red-500/15 text-red-600" },
  high:   { label: "Alta",    className: "bg-orange-500/15 text-orange-600" },
  medium: { label: "Media",   className: "bg-primary/10 text-primary" },
  low:    { label: "Baja",    className: "bg-muted text-muted-foreground" },
};

const typeConfig: Record<string, { label: string; className: string }> = {
  comercial: { label: "Comercial", className: "bg-blue-500/10 text-blue-600" },
  proyecto:  { label: "Proyecto",  className: "bg-violet-500/10 text-violet-600" },
  operativa: { label: "Operativa", className: "bg-amber-500/10 text-amber-600" },
  caso:      { label: "Caso",      className: "bg-emerald-500/10 text-emerald-600" },
};

type GestionRow = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  responsable_nombre: string | null;
  responsable_id: string | null;
  stage_id: string;
  process_id: string;
  type: string | null;
  subtype: string | null;
  codigo: string | null;
  area_id: string | null;
  cliente_nombre: string | null;
  updated_at: string;
  pipeline_stages: {
    id: string;
    name: string;
    global_status: string;
    order: number;
    process_id: string;
  } | null;
};

export function MisGestionesView() {
  const queryClient = useQueryClient();
  const [detailGestionId, setDetailGestionId] = useState<string | null>(null);
  const [detailProcessId, setDetailProcessId] = useState<string>("");
  const [colaboradorId, setColaboradorId] = useState<string>(
    () => localStorage.getItem("mis_gestiones_colaborador") || ""
  );
  const [filterType,     setFilterType]     = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  const { data: colaboradores = [] } = useColaboradores();

  // Default al primer colaborador si no hay ninguno seleccionado
  useEffect(() => {
    if (!colaboradorId && colaboradores.length > 0) {
      const roberto = colaboradores.find(c => c.nombre.toLowerCase().includes("roberto")) || colaboradores[0];
      setColaboradorId(roberto.id);
      localStorage.setItem("mis_gestiones_colaborador", roberto.id);
    }
  }, [colaboradores, colaboradorId]);

  const { data: gestiones = [], isLoading } = useQuery<GestionRow[]>({
    queryKey: ["mis-gestiones", colaboradorId],
    queryFn: async () => {
      if (!colaboradorId) return [];
      const { data, error } = await (supabase as any)
        .from("gestiones")
        .select("*, pipeline_stages(id, name, global_status, order, process_id)")
        .eq("responsable_id", colaboradorId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as GestionRow[];
    },
    enabled: !!colaboradorId,
  });

  const { data: allStages = [] } = useAllStages();

  const onDragEnd = async (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;
    const newStatus = destination.droppableId;
    const gestion = gestiones.find(g => g.id === draggableId);
    if (!gestion || gestion.pipeline_stages?.global_status === newStatus) return;

    // Buscar stage del mismo proceso con el global_status destino
    const targetStage = allStages
      .filter(s => s.process_id === gestion.process_id && s.global_status === newStatus)
      .sort((a, b) => a.order - b.order)[0];

    if (!targetStage) {
      toast.error("Este proceso no tiene una etapa para ese estado");
      return;
    }

    // Optimistic update
    queryClient.setQueryData(["mis-gestiones", colaboradorId], (old: GestionRow[]) =>
      old?.map(g => g.id === draggableId
        ? { ...g, stage_id: targetStage.id, pipeline_stages: { ...g.pipeline_stages!, global_status: newStatus, id: targetStage.id } }
        : g
      )
    );

    const { error } = await (supabase as any)
      .from("gestiones")
      .update({ stage_id: targetStage.id, entered_stage_at: new Date().toISOString() })
      .eq("id", draggableId);

    if (error) {
      toast.error("Error al mover la gestión");
      queryClient.invalidateQueries({ queryKey: ["mis-gestiones", colaboradorId] });
    } else {
      await (supabase as any).from("stage_history").insert({
        gestion_id: draggableId,
        from_stage_id: gestion.stage_id,
        to_stage_id: targetStage.id,
      });
      queryClient.invalidateQueries({ queryKey: ["gestiones"] });
    }
  };

  const handleSelectColab = (id: string) => {
    setColaboradorId(id);
    localStorage.setItem("mis_gestiones_colaborador", id);
  };

  const currentColab = colaboradores.find(c => c.id === colaboradorId);

  const filtered = useMemo(() => {
    return gestiones.filter(g => {
      if (filterType     !== "all" && g.type     !== filterType)     return false;
      if (filterPriority !== "all" && g.priority !== filterPriority) return false;
      return true;
    });
  }, [gestiones, filterType, filterPriority]);

  const grouped = useMemo(() => {
    const map: Record<string, GestionRow[]> = { to_do: [], doing: [], review: [], done: [] };
    for (const g of filtered) {
      const status = g.pipeline_stages?.global_status || "to_do";
      if (map[status]) map[status].push(g);
    }
    return map;
  }, [filtered]);

  const vencidas = filtered.filter(g => g.due_date && new Date(g.due_date) < new Date() && g.pipeline_stages?.global_status !== "done").length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-foreground">Mis Gestiones</h2>
            <p className="text-xs text-muted-foreground">
              {filtered.length}{filtered.length !== gestiones.length && ` de ${gestiones.length}`} gestiones asignadas
              {vencidas > 0 && (
                <span className="ml-2 text-red-500 inline-flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{vencidas} vencida{vencidas > 1 ? "s" : ""}
                </span>
              )}
            </p>
          </div>
          {/* Selector de colaborador */}
          <ColaboradorCombobox
            value={colaboradorId}
            onValueChange={handleSelectColab}
            colaboradores={colaboradores}
            showEmpty={false}
            placeholder="Seleccionar colaborador"
            triggerClassName="h-9 min-w-[160px] max-w-[220px]"
          />
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 text-xs border-border min-w-[120px] max-w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all"       className="text-xs">Todos los tipos</SelectItem>
              <SelectItem value="comercial" className="text-xs">Comercial</SelectItem>
              <SelectItem value="proyecto"  className="text-xs">Proyecto</SelectItem>
              <SelectItem value="operativa" className="text-xs">Operativa</SelectItem>
              <SelectItem value="caso"      className="text-xs">Caso</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="h-8 text-xs border-border min-w-[120px] max-w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all"    className="text-xs">Todas las prioridades</SelectItem>
              <SelectItem value="urgent" className="text-xs">Urgente</SelectItem>
              <SelectItem value="high"   className="text-xs">Alta</SelectItem>
              <SelectItem value="medium" className="text-xs">Media</SelectItem>
              <SelectItem value="low"    className="text-xs">Baja</SelectItem>
            </SelectContent>
          </Select>

          {(filterType !== "all" || filterPriority !== "all") && (
            <button
              onClick={() => { setFilterType("all"); setFilterPriority("all"); }}
              className="text-xs text-primary hover:underline"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Kanban */}
      {isLoading ? (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-4 h-full p-4 min-w-max">
            {COLUMNS.map(col => (
              <div key={col.id} className="flex flex-col w-72 flex-shrink-0 bg-muted/40 rounded-xl p-3 gap-2">
                <div className="flex items-center gap-2 mb-1">
                  <Skeleton className="w-2.5 h-2.5 rounded-full" />
                  <Skeleton className="h-4 w-16" />
                </div>
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-card rounded-lg border border-border p-3 space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/2 mt-1" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-4 h-full p-4 min-w-max">
              {COLUMNS.map(col => (
                <div key={col.id} className="flex flex-col w-72 flex-shrink-0 bg-muted/40 rounded-xl">
                  {/* Column header */}
                  <div className="flex items-center gap-2 px-3 py-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                    <h3 className="text-sm font-semibold text-foreground">{col.label}</h3>
                    <span className="ml-auto text-xs font-medium text-muted-foreground bg-background rounded-full px-2 py-0.5">
                      {grouped[col.id].length}
                    </span>
                  </div>

                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[120px] rounded-lg mx-1 transition-colors ${
                          snapshot.isDraggingOver ? "bg-primary/5" : ""
                        }`}
                      >
                        {grouped[col.id].map((g, i) => {
                          const pConfig = priorityConfig[g.priority] || priorityConfig.medium;
                          const tConfig = g.type ? typeConfig[g.type] : null;
                          const isOverdue = g.due_date && new Date(g.due_date) < new Date() && col.id !== "done";
                          return (
                            <Draggable key={g.id} draggableId={g.id} index={i}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={() => { setDetailGestionId(g.id); setDetailProcessId(g.process_id); }}
                                  className={`bg-card rounded-lg border p-3 shadow-sm cursor-pointer transition-all ${
                                    snapshot.isDragging
                                      ? "shadow-lg border-primary/40 rotate-[1deg]"
                                      : "border-border hover:shadow-md hover:border-primary/30"
                                  }`}
                                >
                                  {/* Código + tipo */}
                                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                    {g.codigo && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold text-muted-foreground">
                                        <Hash className="w-2.5 h-2.5" />{g.codigo}
                                      </span>
                                    )}
                                    {tConfig && (
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${tConfig.className}`}>
                                        <Tag className="w-2.5 h-2.5" />{tConfig.label}
                                      </span>
                                    )}
                                  </div>

                                  {/* Título */}
                                  <p className="text-sm font-medium text-card-foreground leading-snug mb-1 line-clamp-2">{g.title}</p>

                                  {/* Cliente */}
                                  {g.cliente_nombre && (
                                    <p className="text-[11px] text-muted-foreground mb-1.5">{g.cliente_nombre}</p>
                                  )}

                                  {/* Etapa específica */}
                                  {g.pipeline_stages?.name && (
                                    <p className="text-[10px] text-muted-foreground mb-1.5">
                                      Etapa: <span className="font-medium">{g.pipeline_stages.name}</span>
                                    </p>
                                  )}

                                  {/* Footer: prioridad + fecha */}
                                  <div className="flex items-center gap-2 flex-wrap mt-1 pt-1.5 border-t border-border/50">
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${pConfig.className}`}>
                                      {pConfig.label}
                                    </span>
                                    {g.due_date && (
                                      <span className={`inline-flex items-center gap-1 text-[10px] ml-auto ${
                                        isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"
                                      }`}>
                                        <Calendar className="w-3 h-3" />
                                        {format(new Date(g.due_date), "dd MMM", { locale: es })}
                                        {isOverdue && " · Vencida"}
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
                          <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/40 border border-dashed border-border/40 rounded-lg">
                            Sin gestiones
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </div>
        </DragDropContext>
      )}

      {detailGestionId && (
        <GestionDetailView
          open={!!detailGestionId}
          onOpenChange={(o) => {
            if (!o) {
              setDetailGestionId(null);
              queryClient.invalidateQueries({ queryKey: ["mis-gestiones", colaboradorId] });
            }
          }}
          gestionId={detailGestionId}
          processId={detailProcessId}
        />
      )}
    </div>
  );
}

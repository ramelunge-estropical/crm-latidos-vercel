import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAreasEmpresa, useCurrentUserRol } from "@/hooks/useSharedQueries";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { BoardColumn } from "./BoardColumn";
import { GestionDialog } from "./GestionDialog";
import { GestionDetailView } from "./GestionDetailView";
import { StageRulesDialog } from "./StageRulesDialog";
import { useProcessEngine } from "@/hooks/useProcessEngine";
import { Plus, Filter, ShieldCheck, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColaboradorCombobox } from "@/components/ui/ColaboradorCombobox";
import { useColaboradores } from "@/hooks/useSharedQueries";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface BoardViewProps {
  processId: string;
  processName: string;
}

type GestionRow = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  responsable_nombre: string | null;
  owner_id: string | null;
  stage_id: string;
  process_id: string;
  created_at: string;
  updated_at: string;
  type: string | null;
  subtype: string | null;
  entered_stage_at?: string;
  codigo?: string | null;
  area_id?: string | null;
  cliente_nombre?: string | null;
};

export function BoardView({ processId, processName }: BoardViewProps) {
  const queryClient = useQueryClient();
  const { isAdmin } = useCurrentUserRol();
  const { data: colaboradores = [] } = useColaboradores();
  const [createStageId, setCreateStageId] = useState<string | null>(null);
  const [editGestion, setEditGestion] = useState<any | null>(null);
  const [detailGestionId, setDetailGestionId] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterResponsable, setFilterResponsable] = useState<string>("all");
  const [showRules, setShowRules] = useState(false);

  const { data: stages = [] } = useQuery({
    queryKey: ["stages", processId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("process_id", processId)
        .order("order");
      if (error) throw error;
      return data;
    },
  });

  const { data: gestiones = [] } = useQuery<GestionRow[]>({
    queryKey: ["gestiones", processId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gestiones")
        .select("*")
        .eq("process_id", processId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as GestionRow[];
    },
  });

  const { data: areas = [] } = useAreasEmpresa();

  const { data: taskCounts = [] } = useQuery<{ gestion_id: string; estado: string }[]>({
    queryKey: ["gestion_tareas_counts", processId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("gestion_tareas")
        .select("gestion_id, estado, gestiones!inner(process_id)")
        .eq("gestiones.process_id", processId);
      if (error) return [];
      return data;
    },
  });

  const areasMap = useMemo(() => {
    const map: Record<string, { nombre: string; color: string }> = {};
    for (const a of areas) map[a.id] = { nombre: a.nombre, color: a.color };
    return map;
  }, [areas]);

  const taskCountMap = useMemo(() => {
    const map: Record<string, { done: number; total: number }> = {};
    for (const t of taskCounts) {
      if (!map[t.gestion_id]) map[t.gestion_id] = { done: 0, total: 0 };
      map[t.gestion_id].total++;
      if (t.estado === "completado") map[t.gestion_id].done++;
    }
    return map;
  }, [taskCounts]);

  const { validateMove, getProgress, rules } = useProcessEngine(processId);

  // Filtered gestiones
  const filtered = useMemo(() => {
    return gestiones.filter((g) => {
      if (filterPriority !== "all" && g.priority !== filterPriority) return false;
      if (filterResponsable !== "all" && g.owner_id !== filterResponsable) return false;
      return true;
    });
  }, [gestiones, filterPriority, filterResponsable]);

  // Compute progress for each gestion
  const progressMap = useMemo(() => {
    const map: Record<string, number> = {};
    const stageList = stages.map((s) => ({ id: s.id, name: s.name, order: s.order, global_status: s.global_status }));
    for (const g of gestiones) {
      map[g.id] = getProgress(g, stageList);
    }
    return map;
  }, [gestiones, stages, getProgress]);

  const onDragEnd = async (result: DropResult) => {
    if (!isAdmin) return;
    const { draggableId, destination } = result;
    if (!destination) return;
    const newStageId = destination.droppableId;
    const gestion = gestiones.find((g) => g.id === draggableId);
    if (!gestion || gestion.stage_id === newStageId) return;

    // Validate move with process engine
    const stageList = stages.map((s) => ({ id: s.id, name: s.name, order: s.order, global_status: s.global_status }));
    const violations = validateMove(gestion, newStageId, stageList);

    if (violations.length > 0) {
      toast.error(
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="w-4 h-4" />
            No se puede mover
          </div>
          {violations.map((v, i) => (
            <p key={i} className="text-xs">{v.message}</p>
          ))}
        </div>,
        { duration: 5000 }
      );
      return;
    }

    // Optimistic update
    queryClient.setQueryData(["gestiones", processId], (old: any[]) =>
      old.map((g) =>
        g.id === draggableId
          ? { ...g, stage_id: newStageId, entered_stage_at: new Date().toISOString() }
          : g
      )
    );

    const { error } = await supabase
      .from("gestiones")
      .update({ stage_id: newStageId, entered_stage_at: new Date().toISOString() } as any)
      .eq("id", draggableId);

    if (error) {
      toast.error("Error al mover la gestión");
      queryClient.invalidateQueries({ queryKey: ["gestiones", processId] });
      return;
    }

    // Record stage history
    await supabase.from("stage_history").insert({
      gestion_id: draggableId,
      from_stage_id: gestion.stage_id,
      to_stage_id: newStageId,
    } as any);
  };

  const hasFilters = filterPriority !== "all" || filterResponsable !== "all";
  const hasRules = rules.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-foreground truncate">{processName}</h2>
            <p className="text-xs text-muted-foreground">
              {stages.length} etapas · {gestiones.length} gestiones
              {hasRules && (
                <span className="ml-2 inline-flex items-center gap-1 text-primary">
                  <ShieldCheck className="w-3 h-3" />
                  {rules.length} regla(s)
                </span>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 shrink-0"
            onClick={() => setShowRules(true)}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reglas</span>
          </Button>
        </div>

        {/* Filters — wraps on mobile */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="h-8 w-[120px] sm:w-[130px] text-xs">
              <SelectValue placeholder="Prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="urgent">Urgente</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="medium">Media</SelectItem>
              <SelectItem value="low">Baja</SelectItem>
            </SelectContent>
          </Select>
          <ColaboradorCombobox
            value={filterResponsable === "all" ? "__none__" : filterResponsable}
            onValueChange={v => setFilterResponsable(v === "__none__" ? "all" : v)}
            colaboradores={colaboradores}
            emptyLabel="Todos"
            placeholder="Responsable"
            triggerClassName="h-8 w-[140px] sm:w-[150px] text-xs"
            size="sm"
          />
          {hasFilters && (
            <button
              onClick={() => { setFilterPriority("all"); setFilterResponsable("all"); }}
              className="text-xs text-primary hover:underline"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto scrollbar-thin p-4">
          <div className="flex gap-4 h-full">
            {stages.map((stage) => (
              <BoardColumn
                key={stage.id}
                stageId={stage.id}
                name={stage.name}
                globalStatus={stage.global_status}
                gestiones={filtered.filter((g) => g.stage_id === stage.id)}
                progressMap={progressMap}
                taskCountMap={taskCountMap}
                areasMap={areasMap}
                hasRules={rules.some((r) => r.stage_id === stage.id)}
                canAdd={isAdmin}
                onAddGestion={() => isAdmin && setCreateStageId(stage.id)}
                onEditGestion={(g) => setDetailGestionId(g.id)}
              />
            ))}

            <button
              onClick={() => toast.info("Agregar etapa — próximamente")}
              className="flex items-center gap-2 px-4 py-3 h-fit w-72 flex-shrink-0 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar etapa
            </button>
          </div>
        </div>
      </DragDropContext>

      {/* Create dialog */}
      {createStageId && (
        <GestionDialog
          open={!!createStageId}
          onOpenChange={(o) => !o && setCreateStageId(null)}
          processId={processId}
          stageId={createStageId}
        />
      )}

      {/* Detail view */}
      {detailGestionId && (
        <GestionDetailView
          open={!!detailGestionId}
          onOpenChange={(o) => !o && setDetailGestionId(null)}
          gestionId={detailGestionId}
          processId={processId}
        />
      )}

      {/* Rules dialog */}
      {showRules && (
        <StageRulesDialog
          open={showRules}
          onOpenChange={setShowRules}
          processId={processId}
          stages={stages.map((s) => ({ id: s.id, name: s.name, order: s.order }))}
          rules={rules}
        />
      )}
    </div>
  );
}

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { BoardColumn } from "./BoardColumn";
import { GestionDialog } from "./GestionDialog";
import { Plus, Settings, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface BoardViewProps {
  processId: string;
  processName: string;
}

export function BoardView({ processId, processName }: BoardViewProps) {
  const queryClient = useQueryClient();
  const [createStageId, setCreateStageId] = useState<string | null>(null);
  const [editGestion, setEditGestion] = useState<any | null>(null);
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterResponsable, setFilterResponsable] = useState<string>("all");

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
  };

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

  // Unique responsables for filter
  const responsables = useMemo(() => {
    const names = gestiones
      .map((g) => g.responsable_nombre)
      .filter((n): n is string => !!n);
    return [...new Set(names)].sort();
  }, [gestiones]);

  // Filtered gestiones
  const filtered = useMemo(() => {
    return gestiones.filter((g) => {
      if (filterPriority !== "all" && g.priority !== filterPriority) return false;
      if (filterResponsable !== "all" && g.responsable_nombre !== filterResponsable) return false;
      return true;
    });
  }, [gestiones, filterPriority, filterResponsable]);

  const onDragEnd = async (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;
    const newStageId = destination.droppableId;
    const gestion = gestiones.find((g) => g.id === draggableId);
    if (!gestion || gestion.stage_id === newStageId) return;

    // Optimistic update
    queryClient.setQueryData(["gestiones", processId], (old: any[]) =>
      old.map((g) => (g.id === draggableId ? { ...g, stage_id: newStageId } : g))
    );

    const { error } = await supabase
      .from("gestiones")
      .update({ stage_id: newStageId })
      .eq("id", draggableId);

    if (error) {
      toast.error("Error al mover la gestión");
      queryClient.invalidateQueries({ queryKey: ["gestiones", processId] });
    }
  };

  const hasFilters = filterPriority !== "all" || filterResponsable !== "all";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{processName}</h2>
          <p className="text-xs text-muted-foreground">
            {stages.length} etapas · {gestiones.length} gestiones
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filters */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
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
            <Select value={filterResponsable} onValueChange={setFilterResponsable}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Responsable" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {responsables.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                onAddGestion={() => setCreateStageId(stage.id)}
                onEditGestion={(g) => setEditGestion(g)}
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

      {/* Edit dialog */}
      {editGestion && (
        <GestionDialog
          open={!!editGestion}
          onOpenChange={(o) => !o && setEditGestion(null)}
          processId={processId}
          gestion={editGestion}
        />
      )}
    </div>
  );
}

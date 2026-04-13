import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BoardColumn } from "./BoardColumn";
import { Plus, Settings } from "lucide-react";
import { toast } from "sonner";

interface BoardViewProps {
  processId: string;
  processName: string;
}

export function BoardView({ processId, processName }: BoardViewProps) {
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

  const { data: gestiones = [] } = useQuery({
    queryKey: ["gestiones", processId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gestiones")
        .select("*")
        .eq("process_id", processId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleAddGestion = (stageId: string) => {
    toast.info("Crear gestión — próximamente");
  };

  const handleAddStage = () => {
    toast.info("Agregar etapa — próximamente");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Board Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{processName}</h2>
          <p className="text-xs text-muted-foreground">
            {stages.length} etapas · {gestiones.length} gestiones
          </p>
        </div>
        <button className="p-2 rounded-lg hover:bg-accent transition-colors">
          <Settings className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Board Columns */}
      <div className="flex-1 overflow-x-auto scrollbar-thin p-4">
        <div className="flex gap-4 h-full">
          {stages.map((stage) => (
            <BoardColumn
              key={stage.id}
              name={stage.name}
              globalStatus={stage.global_status}
              gestiones={gestiones.filter((g) => g.stage_id === stage.id)}
              onAddGestion={() => handleAddGestion(stage.id)}
            />
          ))}

          {/* Add Column */}
          <button
            onClick={handleAddStage}
            className="flex items-center gap-2 px-4 py-3 h-fit w-72 flex-shrink-0 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar etapa
          </button>
        </div>
      </div>
    </div>
  );
}

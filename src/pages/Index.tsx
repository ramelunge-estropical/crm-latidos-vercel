import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProcessSidebar } from "@/components/ProcessSidebar";
import { BoardView } from "@/components/BoardView";
import { CreateProcessDialog } from "@/components/CreateProcessDialog";
import { LayoutGrid } from "lucide-react";

const Index = () => {
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: processes = [] } = useQuery({
    queryKey: ["processes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedProcess = processes.find((p) => p.id === selectedProcessId);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <ProcessSidebar
        processes={processes}
        selectedProcessId={selectedProcessId}
        onSelectProcess={setSelectedProcessId}
        onCreateProcess={() => setShowCreateDialog(true)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {selectedProcess ? (
          <BoardView processId={selectedProcess.id} processName={selectedProcess.name} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <LayoutGrid className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">
                Seleccioná un proceso
              </h2>
              <p className="text-sm text-muted-foreground">
                Elegí un proceso del menú lateral o creá uno nuevo para comenzar.
              </p>
            </div>
          </div>
        )}
      </div>

      <CreateProcessDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </div>
  );
};

export default Index;

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProcessSidebar, SidebarView } from "@/components/ProcessSidebar";
import { BoardView } from "@/components/BoardView";
import { AgendaView } from "@/components/AgendaView";
import { Cliente360View } from "@/components/Cliente360View";
import { MisGestionesView } from "@/components/MisGestionesView";
import { ResumenDiarioView } from "@/components/ResumenDiarioView";
import { ConfiguracionesView } from "@/components/ConfiguracionesView";
import { CreateProcessDialog } from "@/components/CreateProcessDialog";
import { LayoutGrid } from "lucide-react";

const Index = () => {
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeView, setActiveView] = useState<SidebarView>("process");

  const { data: processes = [] } = useQuery({
    queryKey: ["processes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("processes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedProcess = processes.find((p) => p.id === selectedProcessId);

  const handleSelectProcess = (id: string) => {
    setSelectedProcessId(id);
    setActiveView("process");
  };

  const handleChangeView = (view: SidebarView) => {
    setActiveView(view);
    if (view !== "process") setSelectedProcessId(null);
  };

  const renderContent = () => {
    switch (activeView) {
      case "agenda": return <AgendaView />;
      case "cliente360": return <Cliente360View />;
      case "mis-gestiones": return <MisGestionesView />;
      case "resumen": return <ResumenDiarioView />;
      case "configuraciones": return <ConfiguracionesView />;
      case "process":
      default:
        if (selectedProcess) {
          return <BoardView processId={selectedProcess.id} processName={selectedProcess.name} />;
        }
        return (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <LayoutGrid className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Seleccioná un proceso</h2>
              <p className="text-sm text-muted-foreground">Elegí un proceso del menú lateral o creá uno nuevo para comenzar.</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <ProcessSidebar
        processes={processes}
        selectedProcessId={selectedProcessId}
        activeView={activeView}
        onSelectProcess={handleSelectProcess}
        onCreateProcess={() => setShowCreateDialog(true)}
        onChangeView={handleChangeView}
      />
      <div className="flex-1 flex flex-col min-w-0">{renderContent()}</div>
      <CreateProcessDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </div>
  );
};

export default Index;

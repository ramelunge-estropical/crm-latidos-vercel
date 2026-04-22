import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProcesses } from "@/hooks/useSharedQueries";
import Login from "./Login";
import { ProcessSidebar, SidebarView } from "@/components/ProcessSidebar";
import { BoardView } from "@/components/BoardView";
import { AgendaView } from "@/components/AgendaView";
import { Cliente360View } from "@/components/Cliente360View";
import { MisGestionesView } from "@/components/MisGestionesView";
import { ResumenDiarioView } from "@/components/ResumenDiarioView";
import { ConfiguracionesView } from "@/components/ConfiguracionesView";
import { SpecializedView } from "@/components/SpecializedView";
import { LatBandejaView } from "@/components/lat/LatBandejaView";
import { LatDashboardView } from "@/components/lat/LatDashboardView";
import { LatFunnelView } from "@/components/lat/LatFunnelView";
import { CreateProcessDialog } from "@/components/CreateProcessDialog";
import { LayoutGrid, Menu } from "lucide-react";
import logoHeart from "@/assets/logo-heart.png";

const VIEW_LABELS: Record<SidebarView, string> = {
  process:          "Pipeline",
  agenda:           "Agenda",
  "cliente360":     "Cliente 360",
  "mis-gestiones":  "Mis Gestiones",
  resumen:          "Resumen Diario",
  configuraciones:  "Configuraciones",
  comercial:        "Comercial",
  proyectos:        "Proyectos",
  operativa:        "Operativa",
  casos:            "Casos",
  "lat-bandeja":    "LAT · Bandeja",
  "lat-dashboard":  "LAT · Dashboard",
  "lat-funnel":     "LAT · Funnel",
};

const Index = () => {
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeView, setActiveView] = useState<SidebarView>("mis-gestiones");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const { data: processes = [] } = useProcesses();

  // Handle Google OAuth callback + check existing session
  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);

      // Coming back from Google OAuth
      if (params.get("auth") === "google") {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) {
          const { data: colab } = await (supabase as any)
            .from("colaboradores")
            .select("id, activo")
            .ilike("email", session.user.email)
            .single();
          if (colab && colab.activo !== false) {
            localStorage.setItem("mis_gestiones_colaborador", colab.id);
            window.history.replaceState({}, "", "/");
          } else {
            await supabase.auth.signOut();
            window.location.href = "/login";
            return;
          }
        }
      }

      const colabId = localStorage.getItem("mis_gestiones_colaborador");
      setIsLoggedIn(!!colabId);
      setAuthReady(true);
    };
    init();
  }, []);

  if (!authReady) return null;
  if (!isLoggedIn) return <Login />;

  const selectedProcess = processes.find((p) => p.id === selectedProcessId);

  const handleSelectProcess = (id: string) => {
    setSelectedProcessId(id);
    setActiveView("process");
  };

  const handleChangeView = (view: SidebarView) => {
    setActiveView(view);
    if (view !== "process") setSelectedProcessId(null);
  };

  const currentLabel = activeView === "process" && selectedProcess
    ? selectedProcess.name
    : VIEW_LABELS[activeView];

  const renderContent = () => {
    switch (activeView) {
      case "agenda":          return <AgendaView />;
      case "cliente360":      return <Cliente360View />;
      case "mis-gestiones":   return <MisGestionesView />;
      case "resumen":         return <ResumenDiarioView />;
      case "configuraciones": return <ConfiguracionesView />;
      case "comercial":       return <SpecializedView type="comercial" />;
      case "proyectos":       return <SpecializedView type="proyecto" />;
      case "operativa":       return <SpecializedView type="operativa" />;
      case "casos":           return <SpecializedView type="caso" />;
      case "lat-bandeja":     return <LatBandejaView />;
      case "lat-dashboard":   return <LatDashboardView />;
      case "lat-funnel":      return <LatFunnelView />;
      case "process":
      default:
        if (selectedProcess) {
          return <BoardView processId={selectedProcess.id} processName={selectedProcess.name} />;
        }
        return (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div>
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
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:flex">
        <ProcessSidebar
          processes={processes}
          selectedProcessId={selectedProcessId}
          activeView={activeView}
          onSelectProcess={handleSelectProcess}
          onCreateProcess={() => setShowCreateDialog(true)}
          onChangeView={handleChangeView}
        />
      </div>

      {/* Mobile sidebar drawer */}
      <div className="md:hidden">
        <ProcessSidebar
          processes={processes}
          selectedProcessId={selectedProcessId}
          activeView={activeView}
          onSelectProcess={handleSelectProcess}
          onCreateProcess={() => { setShowCreateDialog(true); setMobileMenuOpen(false); }}
          onChangeView={handleChangeView}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <img src={logoHeart} alt="Latidos" className="w-6 h-6 rounded object-contain" />
          <span className="text-sm font-semibold text-foreground truncate">{currentLabel}</span>
        </div>

        {/* View content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {renderContent()}
        </div>
      </div>

      <CreateProcessDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </div>
  );
};

export default Index;

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, ChevronLeft, ChevronRight, CalendarDays, Users, ClipboardList, BarChart3, Settings, Briefcase, FolderKanban, Cog, AlertCircle, X, MessageSquare, TrendingUp, GitBranch, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import logoHeart from "@/assets/logo-heart.png";

interface Process {
  id: string;
  name: string;
  area: string | null;
}

export type SidebarView = "process" | "agenda" | "cliente360" | "mis-gestiones" | "resumen" | "configuraciones" | "comercial" | "proyectos" | "operativa" | "casos" | "lat-bandeja" | "lat-dashboard";

interface ProcessSidebarProps {
  processes: Process[];
  selectedProcessId: string | null;
  activeView: SidebarView;
  onSelectProcess: (id: string) => void;
  onCreateProcess: () => void;
  onChangeView: (view: SidebarView) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const mainItems: { view: SidebarView; label: string; icon: typeof CalendarDays }[] = [
  { view: "cliente360",   label: "Cliente 360",  icon: Users },
  { view: "mis-gestiones", label: "Mis Gestiones", icon: ClipboardList },
];

const specializedItems: { view: SidebarView; label: string; icon: typeof CalendarDays }[] = [
  { view: "comercial", label: "Comercial", icon: Briefcase },
  { view: "proyectos", label: "Proyectos", icon: FolderKanban },
  { view: "operativa", label: "Operativa", icon: Cog },
  { view: "casos",     label: "Casos",     icon: AlertCircle },
];

const latItems: { view: SidebarView; label: string; icon: typeof CalendarDays }[] = [
  { view: "lat-bandeja",   label: "Bandeja",   icon: MessageSquare },
  { view: "lat-dashboard", label: "Dashboard", icon: TrendingUp },
];

const utilItems: { view: SidebarView; label: string; icon: typeof CalendarDays }[] = [
  { view: "agenda",          label: "Agenda",         icon: CalendarDays },
  { view: "resumen",         label: "Resumen Diario", icon: BarChart3 },
  { view: "configuraciones", label: "Configuraciones", icon: Settings },
];

export function ProcessSidebar({
  processes, selectedProcessId, activeView, onSelectProcess, onCreateProcess, onChangeView,
  mobileOpen = false, onMobileClose,
}: ProcessSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const colaboradorId = localStorage.getItem("mis_gestiones_colaborador") || "";

  const { data: currentUser } = useQuery({
    queryKey: ["sidebar-user", colaboradorId],
    queryFn: async () => {
      if (!colaboradorId) return null;
      const { data } = await (supabase as any)
        .from("colaboradores")
        .select("nombre, cargo, color, email")
        .eq("id", colaboradorId)
        .single();
      return data as { nombre: string; cargo: string; color: string; email: string } | null;
    },
    enabled: !!colaboradorId,
  });

  const handleLogout = () => {
    localStorage.removeItem("mis_gestiones_colaborador");
    localStorage.removeItem("crm_session_expiry");
    supabase.auth.signOut();
    window.location.reload();
  };

  const handleNav = (view: SidebarView) => {
    onChangeView(view);
    onMobileClose?.();
  };
  const handleSelectProcess = (id: string) => {
    onSelectProcess(id);
    onMobileClose?.();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border
        transition-transform duration-300
        md:relative md:translate-x-0 md:z-auto
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        ${collapsed ? "md:w-16" : "md:w-64"}
        w-72
      `}>
        {/* Header */}
        <div className="flex items-center gap-2.5 p-4 border-b border-sidebar-border">
          <img src={logoHeart} alt="Latidos" className="w-8 h-8 rounded-lg object-contain flex-shrink-0" />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-semibold text-sidebar-primary-foreground truncate">CRM Latidos</h1>
              <p className="text-[11px] text-sidebar-foreground/60">Travel Operating System</p>
            </div>
          )}
          {/* Close button on mobile */}
          <button
            onClick={onMobileClose}
            className="md:hidden ml-auto p-1 rounded hover:bg-sidebar-accent transition-colors"
          >
            <X className="w-4 h-4 text-sidebar-foreground/60" />
          </button>
        </div>

        {/* Scrollable nav content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">

          {/* Principal */}
          <div className="px-2 pt-2 space-y-0.5">
            {!collapsed && (
              <span className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Principal</span>
            )}
            {mainItems.map((item) => (
              <button
                key={item.view}
                onClick={() => handleNav(item.view)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                  activeView === item.view
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </button>
            ))}
          </div>

          <Separator className="my-2 mx-2 bg-sidebar-border" />

          {/* Vistas Especializadas */}
          <div className="px-2 space-y-0.5">
            {!collapsed && (
              <span className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Vistas</span>
            )}
            {specializedItems.map((item) => (
              <button
                key={item.view}
                onClick={() => handleNav(item.view)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                  activeView === item.view
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </button>
            ))}
          </div>

          <Separator className="my-2 mx-2 bg-sidebar-border" />

          {/* LAT */}
          <div className="px-2 space-y-0.5">
            {!collapsed && (
              <span className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">LAT</span>
            )}
            {latItems.map((item) => (
              <button
                key={item.view}
                onClick={() => handleNav(item.view)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                  activeView === item.view
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </button>
            ))}
          </div>

          <Separator className="my-2 mx-2 bg-sidebar-border" />

          {/* Utilidades */}
          <div className="px-2 space-y-0.5">
            {!collapsed && (
              <span className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Utilidades</span>
            )}
            {utilItems.map((item) => (
              <button
                key={item.view}
                onClick={() => handleNav(item.view)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                  activeView === item.view
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </button>
            ))}
          </div>

          <Separator className="my-2 mx-2 bg-sidebar-border" />

          {/* Process List */}
          <div className="p-2 pb-4">
            {!collapsed && (
              <div className="flex items-center justify-between px-2 py-1.5 mb-1">
                <span className="text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">Procesos</span>
                <button onClick={onCreateProcess} className="p-1 rounded hover:bg-sidebar-accent transition-colors">
                  <Plus className="w-3.5 h-3.5 text-sidebar-foreground/60" />
                </button>
              </div>
            )}

            {processes.map((process) => (
              <button
                key={process.id}
                onClick={() => handleSelectProcess(process.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-sm transition-colors mb-0.5 ${
                  activeView === "process" && selectedProcessId === process.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                }`}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  activeView === "process" && selectedProcessId === process.id ? "bg-sidebar-primary" : "bg-sidebar-foreground/30"
                }`} />
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{process.name}</p>
                    {process.area && <p className="text-xs text-sidebar-foreground/50 truncate">{process.area}</p>}
                  </div>
                )}
              </button>
            ))}

            {processes.length === 0 && !collapsed && (
              <div className="px-3 py-8 text-center">
                <p className="text-xs text-sidebar-foreground/40">No hay procesos</p>
                <Button variant="ghost" size="sm" onClick={onCreateProcess}
                  className="mt-2 text-xs text-sidebar-primary hover:text-sidebar-primary hover:bg-sidebar-accent">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Crear proceso
                </Button>
              </div>
            )}
          </div>

        </div>

        {/* User footer */}
        <div className="border-t border-sidebar-border p-3 mt-auto">
          <div className="flex items-center gap-2.5">
            {currentUser && (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: currentUser.color || "#6366f1" }}
              >
                {currentUser.nombre.charAt(0)}
              </div>
            )}
            {!collapsed && currentUser && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">{currentUser.nombre}</p>
                <p className="text-[10px] text-sidebar-foreground/50 truncate">{currentUser.cargo}</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="p-1.5 rounded-md hover:bg-sidebar-accent transition-colors shrink-0 ml-auto"
            >
              <LogOut className="w-3.5 h-3.5 text-sidebar-foreground/50 hover:text-sidebar-foreground" />
            </button>
          </div>
        </div>

        {/* Collapse toggle — desktop only */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-card border border-border shadow-sm items-center justify-center hover:bg-accent transition-colors z-10"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
      </div>
    </>
  );
}

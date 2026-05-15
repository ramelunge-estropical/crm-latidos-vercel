import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, ChevronLeft, ChevronRight, CalendarDays, Users, ClipboardList, BarChart3, Settings, Briefcase, FolderKanban, Cog, AlertCircle, X, MessageSquare, TrendingUp, GitBranch, LogOut, ExternalLink, Globe, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import logoHeart from "@/assets/logo-heart.png";
import { setColaboradorPresence } from "@/lib/presence";

interface Process {
  id: string;
  name: string;
  area: string | null;
}

export type SidebarView = "process" | "agenda" | "cliente360" | "mis-gestiones" | "mi-dia" | "resumen" | "configuraciones" | "comercial" | "proyectos" | "operativa" | "casos" | "lat-bandeja" | "lat-dashboard" | "granola";

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
  { view: "mi-dia",        label: "Mi Día",        icon: LayoutDashboard },
  { view: "cliente360",    label: "Cliente 360",   icon: Users },
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
  { view: "granola",         label: "Reuniones IA",   icon: GitBranch },
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
        .select("nombre, cargo, color, email, ver_otros_sistemas")
        .eq("id", colaboradorId)
        .single();
      return data as { nombre: string; cargo: string; color: string; email: string; ver_otros_sistemas: boolean } | null;
    },
    enabled: !!colaboradorId,
  });

  const { data: otrosSistemas = [] } = useQuery({
    queryKey: ["otros-sistemas"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .schema("integraciones")
        .from("sistemas")
        .select("id, nombre, descripcion, app_url")
        .eq("activo", true)
        .not("app_url", "is", null)
        .neq("nombre", "latidos")
        .order("nombre");
      return (data ?? []) as { id: string; nombre: string; descripcion: string | null; app_url: string }[];
    },
    enabled: !!currentUser?.ver_otros_sistemas,
  });

  const handleLogout = async () => {
    await setColaboradorPresence(colaboradorId, false);
    localStorage.removeItem("mis_gestiones_colaborador");
    localStorage.removeItem("crm_session_expiry");
    await supabase.auth.signOut();
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

          {/* Procesos — solo header + crear */}
          <div className="px-2 pb-2">
            {!collapsed && (
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Procesos</span>
                <button onClick={onCreateProcess} className="p-1 rounded hover:bg-sidebar-accent transition-colors" title="Nuevo proceso">
                  <Plus className="w-3.5 h-3.5 text-sidebar-foreground/60" />
                </button>
              </div>
            )}
            {collapsed && (
              <button onClick={onCreateProcess} className="w-full flex items-center justify-center py-2 rounded-md hover:bg-sidebar-accent/50 transition-colors" title="Nuevo proceso">
                <Plus className="w-4 h-4 text-sidebar-foreground/60" />
              </button>
            )}
          </div>

          {/* Otros Sistemas */}
          {currentUser?.ver_otros_sistemas && otrosSistemas.length > 0 && (
            <>
              <Separator className="my-2 mx-2 bg-sidebar-border" />
              <div className="px-2 pb-4">
                {!collapsed && (
                  <span className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 block mb-0.5">
                    Otros Sistemas
                  </span>
                )}
                {otrosSistemas.map((sistema) => (
                  <a
                    key={sistema.id}
                    href={sistema.app_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-sm transition-colors mb-0.5 text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    title={sistema.descripcion ?? sistema.nombre}
                  >
                    <Globe className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate capitalize">{sistema.nombre}</span>
                        <ExternalLink className="w-3 h-3 text-sidebar-foreground/30 flex-shrink-0" />
                      </>
                    )}
                  </a>
                ))}
              </div>
            </>
          )}

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

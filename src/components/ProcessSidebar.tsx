import { useState } from "react";
import { Plus, LayoutGrid, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Process {
  id: string;
  name: string;
  area: string | null;
}

interface ProcessSidebarProps {
  processes: Process[];
  selectedProcessId: string | null;
  onSelectProcess: (id: string) => void;
  onCreateProcess: () => void;
}

export function ProcessSidebar({
  processes,
  selectedProcessId,
  onSelectProcess,
  onCreateProcess,
}: ProcessSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={`relative flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sidebar-primary">
          <LayoutGrid className="w-4 h-4 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-sidebar-primary-foreground truncate">
              Pulso TOS
            </h1>
            <p className="text-xs text-sidebar-foreground/60">Gestión Operativa</p>
          </div>
        )}
      </div>

      {/* Process List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        {!collapsed && (
          <div className="flex items-center justify-between px-2 py-1.5 mb-1">
            <span className="text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
              Procesos
            </span>
            <button
              onClick={onCreateProcess}
              className="p-1 rounded hover:bg-sidebar-accent transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-sidebar-foreground/60" />
            </button>
          </div>
        )}

        {processes.map((process) => (
          <button
            key={process.id}
            onClick={() => onSelectProcess(process.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-sm transition-colors mb-0.5 ${
              selectedProcessId === process.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                selectedProcessId === process.id ? "bg-sidebar-primary" : "bg-sidebar-foreground/30"
              }`}
            />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate">{process.name}</p>
                {process.area && (
                  <p className="text-xs text-sidebar-foreground/50 truncate">{process.area}</p>
                )}
              </div>
            )}
          </button>
        ))}

        {processes.length === 0 && !collapsed && (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-sidebar-foreground/40">No hay procesos</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCreateProcess}
              className="mt-2 text-xs text-sidebar-primary hover:text-sidebar-primary hover:bg-sidebar-accent"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Crear proceso
            </Button>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center hover:bg-accent transition-colors z-10"
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

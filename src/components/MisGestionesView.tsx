import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList, Clock, CheckSquare, Phone, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgente", className: "bg-priority-urgent/15 text-priority-urgent" },
  high: { label: "Alta", className: "bg-priority-high/15 text-priority-high" },
  medium: { label: "Media", className: "bg-primary/10 text-primary" },
  low: { label: "Baja", className: "bg-muted text-muted-foreground" },
};

export function MisGestionesView() {
  const { data: gestiones = [] } = useQuery({
    queryKey: ["all-gestiones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gestiones")
        .select("*, pipeline_stages(name)")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card">
        <ClipboardList className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Mis Gestiones</h2>
        <Badge variant="secondary" className="text-xs">{gestiones.length}</Badge>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {gestiones.map((g) => {
          const pConfig = priorityConfig[g.priority] || priorityConfig.medium;
          return (
            <div key={g.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:shadow-sm transition-shadow">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-foreground truncate">{g.title}</p>
                  <Badge variant="outline" className={`text-[10px] ${pConfig.className}`}>{pConfig.label}</Badge>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {g.pipeline_stages?.name && <span>{g.pipeline_stages.name}</span>}
                  {g.responsable_nombre && <span>· {g.responsable_nombre}</span>}
                  <span>· {format(new Date(g.updated_at), "dd MMM HH:mm", { locale: es })}</span>
                </div>
              </div>
            </div>
          );
        })}
        {gestiones.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No hay gestiones</p>
        )}
      </div>
    </div>
  );
}

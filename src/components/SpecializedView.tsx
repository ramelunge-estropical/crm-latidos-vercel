import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GestionDetailView } from "./GestionDetailView";
import { GestionDialog } from "./GestionDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Filter, Briefcase, FolderKanban, Cog, AlertCircle, Calendar, LayoutGrid, List } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const typeConfig = {
  comercial: { label: "Comercial", icon: Briefcase, color: "text-blue-500" },
  proyecto: { label: "Proyectos", icon: FolderKanban, color: "text-violet-500" },
  operativa: { label: "Operativa", icon: Cog, color: "text-amber-500" },
  caso: { label: "Casos", icon: AlertCircle, color: "text-rose-500" },
} as const;

interface SpecializedViewProps {
  type: "comercial" | "proyecto" | "operativa" | "caso";
}

export function SpecializedView({ type }: SpecializedViewProps) {
  const [detailGestionId, setDetailGestionId] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const config = typeConfig[type];
  const Icon = config.icon;

  const { data: gestiones = [] } = useQuery({
    queryKey: ["gestiones-type", type],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gestiones")
        .select("*")
        .eq("type", type)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: processes = [] } = useQuery({
    queryKey: ["processes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("processes").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: stages = [] } = useQuery({
    queryKey: ["all-stages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pipeline_stages").select("*").order("order");
      if (error) throw error;
      return data;
    },
  });

  const processMap = useMemo(() => Object.fromEntries(processes.map(p => [p.id, p])), [processes]);
  const stageMap = useMemo(() => Object.fromEntries(stages.map(s => [s.id, s])), [stages]);

  const filtered = useMemo(() => {
    return gestiones.filter(g => filterPriority === "all" || g.priority === filterPriority);
  }, [gestiones, filterPriority]);

  const priorityBadge = (p: string) => {
    const colors: Record<string, string> = {
      urgent: "bg-destructive/10 text-destructive border-destructive/20",
      high: "bg-orange-500/10 text-orange-600 border-orange-500/20",
      medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
      low: "bg-muted text-muted-foreground border-border",
    };
    const labels: Record<string, string> = { urgent: "Urgente", high: "Alta", medium: "Media", low: "Baja" };
    return <Badge variant="outline" className={`text-[10px] ${colors[p] || ""}`}>{labels[p] || p}</Badge>;
  };

  const statusBadge = (stageId: string) => {
    const stage = stageMap[stageId];
    if (!stage) return null;
    const colors: Record<string, string> = {
      todo: "bg-muted text-muted-foreground",
      planned: "bg-blue-500/10 text-blue-600",
      doing: "bg-amber-500/10 text-amber-600",
      review: "bg-violet-500/10 text-violet-600",
      done: "bg-emerald-500/10 text-emerald-600",
    };
    return <Badge variant="outline" className={`text-[10px] ${colors[stage.global_status] || ""}`}>{stage.name}</Badge>;
  };

  // For creating, pick first process that has stages
  const defaultProcess = processes[0];
  const defaultStage = stages.find(s => defaultProcess && s.process_id === defaultProcess.id);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center ${config.color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{config.label}</h2>
            <p className="text-xs text-muted-foreground">{gestiones.length} gestiones de tipo {config.label.toLowerCase()}</p>
          </div>
        </div>
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
          {defaultProcess && defaultStage && (
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" /> Nueva
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Icon className={`w-12 h-12 ${config.color} opacity-30 mb-3`} />
            <p className="text-sm text-muted-foreground">No hay gestiones de tipo {config.label.toLowerCase()}</p>
          </div>
        ) : (
          <div className="grid gap-3 max-w-4xl mx-auto sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(g => {
              const stage = stageMap[g.stage_id];
              const process = processMap[g.process_id];
              const daysUntilDue = g.due_date ? Math.ceil((new Date(g.due_date).getTime() - Date.now()) / 86400000) : null;
              const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
              const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3;

              return (
                <button
                  key={g.id}
                  onClick={() => setDetailGestionId(g.id)}
                  className="group w-full flex flex-col gap-3 p-4 rounded-xl border border-border bg-card hover:shadow-md hover:border-primary/30 transition-all text-left"
                >
                  {/* Top row: badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {priorityBadge(g.priority)}
                    {statusBadge(g.stage_id)}
                    {g.subtype && (
                      <Badge variant="outline" className="text-[10px] bg-accent/50">{g.subtype}</Badge>
                    )}
                  </div>

                  {/* Title & description */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {g.title}
                    </p>
                    {g.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{g.description}</p>
                    )}
                  </div>

                  {/* Meta info */}
                  <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    {process && (
                      <div className="flex items-center gap-1.5">
                        <FolderKanban className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{process.name}</span>
                      </div>
                    )}
                    {g.responsable_nombre && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[8px] font-bold text-primary">
                            {g.responsable_nombre.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="truncate">{g.responsable_nombre}</span>
                      </div>
                    )}
                  </div>

                  {/* Footer: due date + updated */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    {g.due_date ? (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${
                        isOverdue ? "text-destructive" : isDueSoon ? "text-orange-500" : "text-muted-foreground"
                      }`}>
                        <Calendar className="w-3 h-3" />
                        {format(new Date(g.due_date), "dd MMM yyyy", { locale: es })}
                        {isOverdue && <span className="text-destructive">· Vencida</span>}
                        {isDueSoon && !isOverdue && <span>· Pronto</span>}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40">Sin fecha</span>
                    )}
                    <span className="text-[10px] text-muted-foreground/50">
                      {format(new Date(g.updated_at), "dd/MM HH:mm")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail */}
      {detailGestionId && (
        <GestionDetailView
          open={!!detailGestionId}
          onOpenChange={(o) => !o && setDetailGestionId(null)}
          gestionId={detailGestionId}
          processId={gestiones.find(g => g.id === detailGestionId)?.process_id || ""}
        />
      )}

      {/* Create */}
      {showCreate && defaultProcess && defaultStage && (
        <GestionDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          processId={defaultProcess.id}
          stageId={defaultStage.id}
        />
      )}
    </div>
  );
}

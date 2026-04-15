import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, CheckCircle2, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export function ResumenDiarioView() {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  const { data: stats, isLoading } = useQuery({
    queryKey: ["daily-summary", todayStr],
    queryFn: async () => {
      const [gestiones, activities, recentHistory] = await Promise.all([
        supabase.from("gestiones").select("id, priority, stage_id", { count: "exact" }),
        supabase.from("activities").select("id, completed, scheduled_at").gte("scheduled_at", `${todayStr}T00:00:00`).lte("scheduled_at", `${todayStr}T23:59:59`),
        supabase.from("stage_history").select("id").gte("changed_at", `${todayStr}T00:00:00`),
      ]);
      return {
        totalGestiones: gestiones.count || 0,
        urgentCount: gestiones.data?.filter((g) => g.priority === "urgent" || g.priority === "high").length || 0,
        todayActivities: activities.data?.length || 0,
        completedToday: activities.data?.filter((a) => a.completed).length || 0,
        movesToday: recentHistory.data?.length || 0,
      };
    },
  });

  const cards = [
    { label: "Total gestiones", value: stats?.totalGestiones || 0, icon: TrendingUp, color: "text-primary" },
    { label: "Urgentes / Altas", value: stats?.urgentCount || 0, icon: AlertTriangle, color: "text-priority-urgent" },
    { label: "Actividades hoy", value: stats?.todayActivities || 0, icon: Clock, color: "text-blue-500" },
    { label: "Completadas hoy", value: stats?.completedToday || 0, icon: CheckCircle2, color: "text-green-500" },
    { label: "Movimientos hoy", value: stats?.movesToday || 0, icon: BarChart3, color: "text-violet-500" },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Resumen Diario</h2>
        <span className="text-xs text-muted-foreground">{format(today, "EEEE d 'de' MMMM", { locale: es })}</span>
      </div>
      <div className="flex-1 p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {cards.map((c) => (
            <div key={c.label} className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <c.icon className={`w-4 h-4 ${c.color}`} />
                <span className="text-xs text-muted-foreground">{c.label}</span>
              </div>
              {isLoading
                ? <Skeleton className="h-8 w-12" />
                : <p className="text-2xl font-bold text-foreground">{c.value}</p>
              }
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

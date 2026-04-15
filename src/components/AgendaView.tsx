import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Phone, Users, CheckSquare, Clock, CalendarDays } from "lucide-react";
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isSameDay, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

const activityTypeConfig = {
  tarea: { label: "Tarea", icon: CheckSquare, className: "bg-blue-500/10 text-blue-600" },
  llamada: { label: "Llamada", icon: Phone, className: "bg-green-500/10 text-green-600" },
  reunión: { label: "Reunión", icon: Users, className: "bg-violet-500/10 text-violet-600" },
};

export function AgendaView() {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"day" | "week">("week");

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const rangeStart = view === "day" ? startOfDay(currentDate) : weekStart;
  const rangeEnd = view === "day" ? endOfDay(currentDate) : weekEnd;

  const { data: activities = [] } = useQuery({
    queryKey: ["agenda-activities", rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*, gestiones(title, process_id)")
        .gte("scheduled_at", rangeStart.toISOString())
        .lte("scheduled_at", rangeEnd.toISOString())
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const navigate = (dir: number) => {
    if (view === "day") setCurrentDate((d) => addDays(d, dir));
    else setCurrentDate((d) => (dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1)));
  };

  const toggleComplete = async (id: string, completed: boolean) => {
    const { error } = await supabase.from("activities").update({
      completed: !completed, completed_at: !completed ? new Date().toISOString() : null,
    }).eq("id", id);
    if (error) { toast.error("Error al actualizar"); return; }
    queryClient.invalidateQueries({ queryKey: ["agenda-activities"] });
  };

  const dayGroups = useMemo(() => {
    if (view !== "week") return [];
    const days: { date: Date; activities: any[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      days.push({ date: day, activities: activities.filter((a) => a.scheduled_at && isSameDay(new Date(a.scheduled_at), day)) });
    }
    return days;
  }, [activities, weekStart, view]);

  const headerLabel = view === "day"
    ? format(currentDate, "EEEE d 'de' MMMM yyyy", { locale: es })
    : `${format(weekStart, "d MMM", { locale: es })} – ${format(weekEnd, "d MMM yyyy", { locale: es })}`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Agenda</h2>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as "day" | "week")}>
            <TabsList className="h-8">
              <TabsTrigger value="day" className="text-xs px-3 h-6">Día</TabsTrigger>
              <TabsTrigger value="week" className="text-xs px-3 h-6">Semana</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1 ml-2">
            <Button variant="ghost" size="sm" aria-label="Período anterior" className="h-7 w-7 p-0" onClick={() => navigate(-1)}><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCurrentDate(new Date())}>Hoy</Button>
            <Button variant="ghost" size="sm" aria-label="Período siguiente" className="h-7 w-7 p-0" onClick={() => navigate(1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>

      <div className="px-4 py-2">
        <p className="text-sm font-medium text-foreground capitalize">{headerLabel}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {view === "week" ? (
          <div className="space-y-1">
            {dayGroups.map(({ date, activities: dayActs }) => {
              const isToday = isSameDay(date, new Date());
              return (
                <div key={date.toISOString()} className={`rounded-lg ${isToday ? "bg-primary/5" : ""}`}>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className={`text-xs font-semibold ${isToday ? "text-primary" : "text-muted-foreground"} uppercase w-20`}>
                      {format(date, "EEE d", { locale: es })}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[10px] text-muted-foreground">{dayActs.length}</span>
                  </div>
                  {dayActs.length > 0 && (
                    <div className="space-y-1 px-3 pb-2">
                      {dayActs.map((a) => <ActivityItem key={a.id} activity={a} onToggle={toggleComplete} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {activities.length > 0 ? activities.map((a) => <ActivityItem key={a.id} activity={a} onToggle={toggleComplete} />) 
              : <p className="text-sm text-muted-foreground text-center py-8">No hay actividades para este día</p>}
          </div>
        )}
        {view === "week" && activities.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No hay actividades programadas esta semana</p>
        )}
      </div>
    </div>
  );
}

function ActivityItem({ activity: a, onToggle }: { activity: any; onToggle: (id: string, completed: boolean) => void }) {
  const config = activityTypeConfig[a.activity_type as keyof typeof activityTypeConfig];
  const Icon = config?.icon || CheckSquare;
  return (
    <div className={`flex items-start gap-2 p-2 rounded-lg border bg-card ${a.completed ? "opacity-50" : ""}`}>
      <Checkbox checked={a.completed} onCheckedChange={() => onToggle(a.id, a.completed)} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config?.className}`}>
            <Icon className="w-2.5 h-2.5" /> {config?.label}
          </span>
          {a.scheduled_at && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" /> {format(new Date(a.scheduled_at), "HH:mm")}
              {a.duration_minutes && <span>· {a.duration_minutes}min</span>}
            </span>
          )}
        </div>
        <p className={`text-sm font-medium ${a.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>{a.title}</p>
        {a.gestiones && <span className="text-[10px] text-muted-foreground">Gestión: {a.gestiones.title}</span>}
        {a.assigned_to && <span className="text-[10px] text-muted-foreground ml-2">· {a.assigned_to}</span>}
      </div>
    </div>
  );
}

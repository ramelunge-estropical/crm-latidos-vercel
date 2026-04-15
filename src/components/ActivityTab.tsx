import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, Plus, Phone, Users, CheckSquare, Clock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface ActivityTabProps {
  gestionId: string;
}

const activityTypeConfig = {
  tarea: { label: "Tarea", icon: CheckSquare, className: "bg-blue-500/10 text-blue-600" },
  llamada: { label: "Llamada", icon: Phone, className: "bg-green-500/10 text-green-600" },
  reunión: { label: "Reunión", icon: Users, className: "bg-violet-500/10 text-violet-600" },
};

export function ActivityTab({ gestionId }: ActivityTabProps) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [activityType, setActivityType] = useState<"tarea" | "llamada" | "reunión">("tarea");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>();
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [duration, setDuration] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: activities = [] } = useQuery({
    queryKey: ["activities", gestionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("gestion_id", gestionId)
        .order("scheduled_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const resetForm = () => {
    setTitle(""); setDescription(""); setActivityType("tarea");
    setScheduledDate(undefined); setScheduledTime("09:00");
    setDuration(""); setAssignedTo(""); setShowForm(false);
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      let scheduledAt: string | null = null;
      if (scheduledDate) {
        const [h, m] = scheduledTime.split(":").map(Number);
        const dt = new Date(scheduledDate);
        dt.setHours(h, m, 0, 0);
        scheduledAt = dt.toISOString();
      }
      const { error } = await supabase.from("activities").insert({
        gestion_id: gestionId,
        activity_type: activityType,
        title: title.trim(),
        description: description.trim() || null,
        scheduled_at: scheduledAt,
        duration_minutes: duration ? parseInt(duration) : null,
        assigned_to: assignedTo.trim() || null,
      });
      if (error) throw error;
      toast.success("Actividad creada");
      queryClient.invalidateQueries({ queryKey: ["activities", gestionId] });
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Error al crear actividad");
    } finally { setLoading(false); }
  };

  const toggleComplete = async (id: string, completed: boolean) => {
    const { error } = await supabase.from("activities").update({
      completed: !completed,
      completed_at: !completed ? new Date().toISOString() : null,
    }).eq("id", id);
    if (error) { toast.error("Error al actualizar"); return; }
    queryClient.invalidateQueries({ queryKey: ["activities", gestionId] });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("activities").delete().eq("id", id);
    if (error) { toast.error("Error al eliminar"); return; }
    queryClient.invalidateQueries({ queryKey: ["activities", gestionId] });
    toast.success("Actividad eliminada");
  };

  const pending = activities.filter((a) => !a.completed);
  const completed = activities.filter((a) => a.completed);

  return (
    <div className="space-y-4">
      {!showForm && (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" /> Nueva actividad
        </Button>
      )}

      {showForm && (
        <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Input placeholder="Título de la actividad" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <Select value={activityType} onValueChange={(v) => setActivityType(v as any)}>
              <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tarea">Tarea</SelectItem>
                <SelectItem value="llamada">Llamada</SelectItem>
                <SelectItem value="reunión">Reunión</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Asignado a" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="text-xs" />
          </div>
          <Textarea placeholder="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-xs" />
          <div className="grid grid-cols-3 gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("text-xs justify-start", !scheduledDate && "text-muted-foreground")}>
                  <CalendarIcon className="w-3 h-3 mr-1" />
                  {scheduledDate ? format(scheduledDate, "dd/MM", { locale: es }) : "Fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={scheduledDate} onSelect={setScheduledDate} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="text-xs" />
            <Input type="number" placeholder="Min." value={duration} onChange={(e) => setDuration(e.target.value)} className="text-xs" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={!title.trim() || loading} className="flex-1">
              {loading ? "Creando..." : "Crear actividad"}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancelar</Button>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pendientes ({pending.length})</h4>
          {pending.map((a) => {
            const config = activityTypeConfig[a.activity_type as keyof typeof activityTypeConfig];
            const Icon = config?.icon || CheckSquare;
            return (
              <div key={a.id} className="flex items-start gap-2 p-2 rounded-lg border border-border bg-card group">
                <Checkbox checked={false} onCheckedChange={() => toggleComplete(a.id, a.completed)} className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium", config?.className)}>
                      <Icon className="w-2.5 h-2.5" /> {config?.label}
                    </span>
                    {a.assigned_to && <span className="text-[10px] text-muted-foreground">· {a.assigned_to}</span>}
                  </div>
                  <p className="text-sm font-medium text-foreground">{a.title}</p>
                  {a.description && <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>}
                  {a.scheduled_at && (
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {format(new Date(a.scheduled_at), "dd MMM yyyy HH:mm", { locale: es })}
                      {a.duration_minutes && <span>· {a.duration_minutes} min</span>}
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="sm" aria-label="Eliminar actividad" className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0" onClick={() => handleDelete(a.id)}>
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completadas ({completed.length})</h4>
          {completed.map((a) => (
            <div key={a.id} className="flex items-start gap-2 p-2 rounded-lg border border-border bg-muted/30 opacity-60 group">
              <Checkbox checked={true} onCheckedChange={() => toggleComplete(a.id, a.completed)} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground line-through">{a.title}</p>
                {a.completed_at && <span className="text-[10px] text-muted-foreground">Completada {format(new Date(a.completed_at), "dd MMM HH:mm", { locale: es })}</span>}
              </div>
              <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0" onClick={() => handleDelete(a.id)}>
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {activities.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-6">No hay actividades todavía</p>
      )}
    </div>
  );
}

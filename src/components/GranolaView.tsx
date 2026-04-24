import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Brain, Calendar, Users, CheckSquare, Square, ChevronDown,
  ChevronRight, Plus, RefreshCw, ExternalLink, FileText,
  Sparkles, Check, Clock,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type GranolaTask = {
  id: string;
  meeting_id: string;
  descripcion: string;
  asignado_a: string | null;
  asignado_id: string | null;
  fecha_limite: string | null;
  activity_id: string | null;
  created_at: string;
};

type GranolaMeeting = {
  id: string;
  granola_id: string;
  titulo: string;
  fecha: string;
  participantes: { nombre: string; email?: string }[];
  notas: string | null;
  resumen: string | null;
  tasks_extracted: boolean;
  created_at: string;
  granola_tasks: GranolaTask[];
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function GranolaView() {
  const qc = useQueryClient();
  const colaboradorId = localStorage.getItem("mis_gestiones_colaborador") ?? "";

  const { data: meetings = [], isLoading } = useQuery<GranolaMeeting[]>({
    queryKey: ["granola_meetings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("granola_meetings")
        .select("*, granola_tasks(*)")
        .order("fecha", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((m: any) => ({
        ...m,
        participantes: m.participantes ?? [],
        granola_tasks: m.granola_tasks ?? [],
      }));
    },
    staleTime: 2 * 60 * 1000,
  });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Brain className="w-4 h-4 text-violet-500" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Granola · Reuniones</h1>
            <p className="text-xs text-muted-foreground">Resúmenes y tareas extraídas automáticamente</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs"
          onClick={() => { qc.invalidateQueries({ queryKey: ["granola_meetings"] }); toast.success("Reuniones actualizadas"); }}>
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : meetings.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4 max-w-3xl">
            {meetings.map(m => (
              <MeetingCard key={m.id} meeting={m} colaboradorId={colaboradorId}
                onTaskCreated={() => qc.invalidateQueries({ queryKey: ["granola_meetings"] })} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Meeting Card ─────────────────────────────────────────────────────────────

function MeetingCard({ meeting, colaboradorId, onTaskCreated }: {
  meeting: GranolaMeeting;
  colaboradorId: string;
  onTaskCreated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const pendingTasks = meeting.granola_tasks.filter(t => !t.activity_id);
  const doneTasks    = meeting.granola_tasks.filter(t => !!t.activity_id);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Card header */}
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Brain className="w-4 h-4 text-violet-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{meeting.titulo}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {format(new Date(meeting.fecha), "d 'de' MMMM yyyy · HH:mm", { locale: es })}
            </span>
            {meeting.participantes.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                {meeting.participantes.map(p => p.nombre).join(", ")}
              </span>
            )}
          </div>
          {meeting.resumen && !expanded && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{meeting.resumen}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {pendingTasks.length > 0 && (
            <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-200">
              {pendingTasks.length} tarea{pendingTasks.length > 1 ? "s" : ""} pendiente{pendingTasks.length > 1 ? "s" : ""}
            </Badge>
          )}
          {doneTasks.length > 0 && (
            <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-200">
              {doneTasks.length} creada{doneTasks.length > 1 ? "s" : ""}
            </Badge>
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border">
          {/* Summary */}
          {meeting.resumen && (
            <div className="px-4 py-3 bg-violet-500/5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-xs font-semibold text-violet-600">Resumen</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{meeting.resumen}</p>
            </div>
          )}

          <Separator />

          {/* Tasks */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">
                  Tareas extraídas ({meeting.granola_tasks.length})
                </span>
              </div>
            </div>

            {meeting.granola_tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Sin tareas extraídas en esta reunión</p>
            ) : (
              <div className="space-y-2">
                {meeting.granola_tasks.map(task => (
                  <TaskRow key={task.id} task={task} colaboradorId={colaboradorId}
                    meetingTitulo={meeting.titulo} onCreated={onTaskCreated} />
                ))}
              </div>
            )}
          </div>

          {/* Notes toggle */}
          {meeting.notas && (
            <>
              <Separator />
              <div className="px-4 py-2">
                <button
                  onClick={() => setShowNotes(n => !n)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {showNotes ? "Ocultar notas completas" : "Ver notas completas"}
                  {showNotes ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                {showNotes && (
                  <div className="mt-3 text-xs text-foreground leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-lg p-3 max-h-80 overflow-y-auto">
                    {meeting.notas}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, colaboradorId, meetingTitulo, onCreated }: {
  task: GranolaTask;
  colaboradorId: string;
  meetingTitulo: string;
  onCreated: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const alreadyCreated = !!task.activity_id;

  const handleCreate = async () => {
    if (!colaboradorId) { toast.error("No se detectó tu usuario"); return; }
    setCreating(true);
    try {
      const { data: act, error } = await (supabase as any)
        .from("activities")
        .insert({
          tipo:           "tarea",
          titulo:         task.descripcion,
          assigned_to_id: task.asignado_id || colaboradorId,
          created_by:     colaboradorId,
          fecha_limite:   task.fecha_limite || null,
          notas:          `Tarea generada desde reunión Granola: "${meetingTitulo}"`,
          status:         "to_do",
          priority:       "medium",
        })
        .select("id")
        .single();
      if (error) throw error;

      await (supabase as any)
        .from("granola_tasks")
        .update({ activity_id: act.id })
        .eq("id", task.id);

      toast.success("Tarea creada en el CRM");
      onCreated();
    } catch (e) {
      toast.error("Error al crear la tarea");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={`flex items-start gap-2.5 rounded-lg px-3 py-2 border transition-colors ${
      alreadyCreated ? "bg-emerald-500/5 border-emerald-200/50" : "bg-muted/20 border-border hover:bg-muted/40"
    }`}>
      <div className="mt-0.5 flex-shrink-0">
        {alreadyCreated
          ? <Check className="w-4 h-4 text-emerald-500" />
          : <Square className="w-4 h-4 text-muted-foreground" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${alreadyCreated ? "text-muted-foreground line-through" : "text-foreground"}`}>
          {task.descripcion}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {task.asignado_a && (
            <span className="text-[10px] text-muted-foreground">{task.asignado_a}</span>
          )}
          {task.fecha_limite && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Clock className="w-2.5 h-2.5" />
              {format(new Date(task.fecha_limite), "d MMM yyyy", { locale: es })}
            </span>
          )}
          {alreadyCreated && (
            <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-200 py-0">
              Creada en CRM
            </Badge>
          )}
        </div>
      </div>
      {!alreadyCreated && (
        <Button size="sm" variant="outline"
          className="flex-shrink-0 h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
          onClick={handleCreate} disabled={creating}>
          <Plus className="w-3 h-3" />
          {creating ? "..." : "Crear tarea"}
        </Button>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
        <Brain className="w-7 h-7 text-violet-500" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">Sin reuniones importadas</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-6">
        Tus reuniones de Granola aparecerán acá con su resumen y las tareas extraídas automáticamente.
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-4 py-3">
        <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Las reuniones se sincronizan automáticamente desde Granola vía API</span>
      </div>
    </div>
  );
}

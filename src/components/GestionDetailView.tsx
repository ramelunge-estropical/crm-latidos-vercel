import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColaboradores } from "@/hooks/useSharedQueries";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { ActivityTab } from "./ActivityTab";
import {
  FileText, MessageSquare, Paperclip, History, Activity,
  User, Calendar, Tag, Upload, Send, Trash2, ArrowRight,
  Hash, CheckSquare, Plus, ChevronRight,
  Zap, UserCheck, Pencil, X, Check, Link2, Building2, Settings
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface GestionDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gestionId: string;
  processId: string;
}

const GLOBAL_STEPS = [
  { id: "to_do",  label: "Por hacer",  color: "bg-status-todo"   },
  { id: "doing",  label: "En proceso", color: "bg-status-doing"  },
  { id: "review", label: "Revisión",   color: "bg-status-review" },
  { id: "done",   label: "Finalizado", color: "bg-status-done"   },
];

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgente", className: "bg-red-500/15 text-red-600 border-red-300" },
  high:   { label: "Alta",    className: "bg-orange-500/15 text-orange-600 border-orange-300" },
  medium: { label: "Media",   className: "bg-primary/10 text-primary border-primary/30" },
  low:    { label: "Baja",    className: "bg-muted text-muted-foreground border-border" },
};

const typeConfig: Record<string, { label: string; className: string }> = {
  comercial: { label: "Comercial", className: "bg-blue-500/10 text-blue-600" },
  proyecto:  { label: "Proyecto",  className: "bg-violet-500/10 text-violet-600" },
  operativa: { label: "Operativa", className: "bg-amber-500/10 text-amber-600" },
  caso:      { label: "Caso",      className: "bg-emerald-500/10 text-emerald-600" },
};

export function GestionDetailView({ open, onOpenChange, gestionId, processId }: GestionDetailViewProps) {
  const queryClient = useQueryClient();

  // Title inline edit
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue]   = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Responsable edit
  const [editingResponsable, setEditingResponsable] = useState(false);

  // Comments
  const [commentText, setCommentText]   = useState("");
  const [authorName,  setAuthorName]    = useState("");
  const [commentLoading, setCommentLoading] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState("resumen");

  // New task
  const [newTaskText, setNewTaskText]   = useState("");
  const [addingTask,  setAddingTask]    = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────
  const { data: gestion, isLoading } = useQuery({
    queryKey: ["gestion-detail", gestionId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("gestiones").select("*").eq("id", gestionId).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!gestionId,
  });

  const { data: stages = [] } = useQuery({
    queryKey: ["stages", processId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages").select("*").eq("process_id", processId).order("order");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!processId,
  });

  const { data: colaboradores = [] } = useColaboradores();

  const { data: tareas = [], refetch: refetchTareas } = useQuery({
    queryKey: ["gestion-tareas", gestionId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("gestion_tareas").select("*").eq("gestion_id", gestionId).order("created_at");
      if (error) return [];
      return data as any[];
    },
    enabled: !!gestionId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["gestion-comments", gestionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gestion_comments").select("*").eq("gestion_id", gestionId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["gestion-attachments", gestionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gestion_attachments").select("*").eq("gestion_id", gestionId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["gestion-history", gestionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_history").select("*").eq("gestion_id", gestionId).order("changed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // ── Derived state ──────────────────────────────────────────────────────
  const currentStage    = stages.find((s) => s.id === gestion?.stage_id);
  const currentGlobal   = currentStage?.global_status || "to_do";
  const globalStepIndex = GLOBAL_STEPS.findIndex((s) => s.id === currentGlobal);
  const pConfig         = gestion ? (priorityConfig[gestion.priority] || priorityConfig.medium) : priorityConfig.medium;
  const tConfig         = gestion?.type ? typeConfig[gestion.type] : null;
  const tareasDone      = tareas.filter((t) => t.estado === "done").length;
  const currentColab    = colaboradores.find((c) => c.id === gestion?.responsable_id);

  // Sync title value when gestion loads
  useEffect(() => {
    if (gestion) setTitleValue(gestion.title || "");
  }, [gestion?.title]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleSaveTitle = async () => {
    if (!gestion || !titleValue.trim() || titleValue.trim() === gestion.title) {
      setEditingTitle(false); return;
    }
    try {
      const { error } = await (supabase as any)
        .from("gestiones").update({ title: titleValue.trim() }).eq("id", gestionId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["gestion-detail", gestionId] });
      queryClient.invalidateQueries({ queryKey: ["gestiones", processId] });
      toast.success("Título actualizado");
    } catch (err: any) { toast.error(err.message); }
    setEditingTitle(false);
  };

  const handleStageChange = async (newStageId: string) => {
    if (!gestion || newStageId === gestion.stage_id) return;
    try {
      await (supabase as any).from("stage_history").insert({
        gestion_id: gestionId, from_stage_id: gestion.stage_id, to_stage_id: newStageId,
      });
      const { error } = await (supabase as any)
        .from("gestiones").update({ stage_id: newStageId, entered_stage_at: new Date().toISOString() }).eq("id", gestionId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["gestion-detail", gestionId] });
      queryClient.invalidateQueries({ queryKey: ["gestion-history", gestionId] });
      queryClient.invalidateQueries({ queryKey: ["gestiones", processId] });
      toast.success("Etapa actualizada");
    } catch (err: any) { toast.error(err.message); }
  };

  const handleResponsableChange = async (colabId: string) => {
    const colab = colaboradores.find((c) => c.id === colabId);
    try {
      const { error } = await (supabase as any).from("gestiones").update({
        responsable_id:     colabId === "__none__" ? null : colabId,
        responsable_nombre: colab?.nombre || null,
      }).eq("id", gestionId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["gestion-detail", gestionId] });
      queryClient.invalidateQueries({ queryKey: ["gestiones", processId] });
      setEditingResponsable(false);
      toast.success("Responsable actualizado");
    } catch (err: any) { toast.error(err.message); }
  };

  const handleToggleTarea = async (tarea: any) => {
    const nuevoEstado = tarea.estado === "done" ? "pending" : "done";
    await (supabase as any).from("gestion_tareas").update({ estado: nuevoEstado }).eq("id", tarea.id);
    refetchTareas();
  };

  const handleAddTarea = async () => {
    if (!newTaskText.trim()) return;
    setAddingTask(true);
    try {
      const { error } = await (supabase as any).from("gestion_tareas").insert({
        gestion_id: gestionId, titulo: newTaskText.trim(), estado: "pending",
      });
      if (error) throw error;
      setNewTaskText("");
      refetchTareas();
    } catch (err: any) { toast.error(err.message); }
    setAddingTask(false);
  };

  const handleDeleteTarea = async (id: string) => {
    await (supabase as any).from("gestion_tareas").delete().eq("id", id);
    refetchTareas();
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;
    setCommentLoading(true);
    try {
      const { error } = await supabase.from("gestion_comments").insert({
        gestion_id: gestionId, content: commentText.trim(),
        author_name: authorName.trim() || "Anónimo", comment_type: "comment",
      });
      if (error) throw error;
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["gestion-comments", gestionId] });
      toast.success("Comentario agregado");
    } catch (err: any) { toast.error(err.message); }
    setCommentLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const filePath = `${gestionId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("gestiones-files").upload(filePath, file);
      if (uploadError) throw uploadError;
      const { error: dbError } = await supabase.from("gestion_attachments").insert({
        gestion_id: gestionId, file_name: file.name, file_path: filePath,
        file_size: file.size, mime_type: file.type, uploaded_by_name: authorName.trim() || "Anónimo",
      });
      if (dbError) throw dbError;
      queryClient.invalidateQueries({ queryKey: ["gestion-attachments", gestionId] });
      toast.success("Archivo adjuntado");
    } catch (err: any) { toast.error(err.message); }
    e.target.value = "";
  };

  const handleDeleteAttachment = async (id: string, filePath: string) => {
    try {
      await supabase.storage.from("gestiones-files").remove([filePath]);
      await supabase.from("gestion_attachments").delete().eq("id", id);
      queryClient.invalidateQueries({ queryKey: ["gestion-attachments", gestionId] });
      toast.success("Archivo eliminado");
    } catch (err: any) { toast.error(err.message); }
  };

  const handleUpdateField = async (field: string, value: any) => {
    try {
      const { error } = await (supabase as any)
        .from("gestiones").update({ [field]: value || null }).eq("id", gestionId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["gestion-detail", gestionId] });
      queryClient.invalidateQueries({ queryKey: ["gestiones", processId] });
      toast.success("Campo actualizado");
    } catch (err: any) { toast.error(err.message); }
  };

  const getStageName = (stageId: string) => stages.find((s) => s.id === stageId)?.name || "—";

  if (isLoading || !gestion) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">

        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <div className="px-6 pt-5 pb-4 border-b border-border">
          {/* Código + Título editable */}
          <div className="flex items-start gap-2 mb-3">
            {gestion.codigo && (
              <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-muted-foreground mt-1 shrink-0">
                <Hash className="w-3 h-3" />{gestion.codigo}
              </span>
            )}
            {editingTitle ? (
              <div className="flex items-center gap-1.5 flex-1">
                <Input
                  ref={titleInputRef}
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                  className="text-lg font-semibold h-8 flex-1"
                />
                <Button size="sm" variant="ghost" aria-label="Guardar título" className="h-8 w-8 p-0 text-green-600 hover:text-green-700" onClick={handleSaveTitle}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" aria-label="Cancelar edición" className="h-8 w-8 p-0" onClick={() => setEditingTitle(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <button
                className="text-lg font-semibold text-foreground text-left hover:text-primary flex items-center gap-1.5 group flex-1"
                onClick={() => { setTitleValue(gestion.title); setEditingTitle(true); }}
              >
                {gestion.title}
                <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            )}
          </div>

          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <Badge variant="outline" className={cn("text-[10px] font-medium", pConfig.className)}>
              {pConfig.label}
            </Badge>
            {tConfig && (
              <Badge variant="secondary" className={cn("text-[10px]", tConfig.className)}>
                <Tag className="w-2.5 h-2.5 mr-1" />
                {tConfig.label}{gestion.subtype ? ` · ${gestion.subtype}` : ""}
              </Badge>
            )}
            {gestion.cliente_nombre && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1">
                <User className="w-2.5 h-2.5" />{gestion.cliente_nombre}
              </Badge>
            )}
            {gestion.due_date && (
              <Badge variant="outline" className={cn("text-[10px] gap-1",
                new Date(gestion.due_date) < new Date() && currentGlobal !== "done"
                  ? "text-red-500 border-red-300 bg-red-50"
                  : "text-muted-foreground"
              )}>
                <Calendar className="w-2.5 h-2.5" />
                {format(new Date(gestion.due_date), "dd MMM yyyy", { locale: es })}
                {new Date(gestion.due_date) < new Date() && currentGlobal !== "done" && " · Vencida"}
              </Badge>
            )}
            {tareas.length > 0 && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <CheckSquare className="w-2.5 h-2.5" />{tareasDone}/{tareas.length} tareas
              </Badge>
            )}
          </div>

          {/* ── Pipeline Global ────────────────────────────────────── */}
          <div className="mb-3">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1.5">Pipeline Global</p>
            <div className="flex items-center gap-0">
              {GLOBAL_STEPS.map((step, idx) => {
                const isActive  = idx === globalStepIndex;
                const isPast    = idx < globalStepIndex;
                const isFuture  = idx > globalStepIndex;
                return (
                  <div key={step.id} className="flex items-center flex-1">
                    <div className={cn(
                      "flex-1 flex items-center justify-center py-1.5 text-[11px] font-medium rounded transition-colors",
                      isActive  && "bg-primary text-primary-foreground",
                      isPast    && "bg-primary/20 text-primary",
                      isFuture  && "bg-muted/60 text-muted-foreground",
                    )}>
                      {step.label}
                    </div>
                    {idx < GLOBAL_STEPS.length - 1 && (
                      <ChevronRight className={cn("w-3.5 h-3.5 shrink-0 mx-0.5",
                        idx < globalStepIndex ? "text-primary" : "text-muted-foreground/40"
                      )} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Pipeline Específico ────────────────────────────────── */}
          <div>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1.5">Pipeline Específico</p>
            <div className="flex items-center gap-0 overflow-x-auto pb-0.5">
              {stages.map((stage, idx) => {
                const isActive = stage.id === gestion.stage_id;
                const isPast   = stages.findIndex((s) => s.id === gestion.stage_id) > idx;
                return (
                  <div key={stage.id} className="flex items-center flex-shrink-0">
                    <button
                      onClick={() => handleStageChange(stage.id)}
                      className={cn(
                        "px-3 py-1.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap",
                        isActive && "bg-primary text-primary-foreground shadow-sm",
                        isPast   && "bg-primary/20 text-primary hover:bg-primary/30",
                        !isActive && !isPast && "bg-muted/60 text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {stage.name}
                    </button>
                    {idx < stages.length - 1 && (
                      <ChevronRight className={cn("w-3.5 h-3.5 shrink-0 mx-0.5",
                        isPast || isActive ? "text-primary" : "text-muted-foreground/40"
                      )} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── BODY (main + sidebar) ──────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Main content */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <div className="px-4 pt-3 pb-0 shrink-0">
                <TabsList>
                  <TabsTrigger value="resumen"        className="text-xs gap-1"><FileText className="w-3 h-3" />Resumen</TabsTrigger>
                  <TabsTrigger value="checklist"      className="text-xs gap-1">
                    <CheckSquare className="w-3 h-3" />Checklist
                    {tareas.length > 0 && <span className="ml-0.5 text-[9px] bg-primary/15 text-primary rounded-full px-1">{tareasDone}/{tareas.length}</span>}
                  </TabsTrigger>
                  <TabsTrigger value="actividades"    className="text-xs gap-1"><Activity className="w-3 h-3" />Actividades</TabsTrigger>
                  <TabsTrigger value="comunicaciones" className="text-xs gap-1"><MessageSquare className="w-3 h-3" />Comunicaciones</TabsTrigger>
                  <TabsTrigger value="documentos"     className="text-xs gap-1"><Paperclip className="w-3 h-3" />Documentos</TabsTrigger>
                  <TabsTrigger value="historial"      className="text-xs gap-1"><History className="w-3 h-3" />Historial</TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1 px-4 py-4">

                {/* ── Resumen ── */}
                <TabsContent value="resumen" className="mt-0 space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Descripción</h4>
                    <p className="text-sm text-foreground leading-relaxed">{gestion.description || "Sin descripción"}</p>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">Creada</span>
                      <p>{format(new Date(gestion.created_at), "dd MMM yyyy HH:mm", { locale: es })}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Actualizada</span>
                      <p>{format(new Date(gestion.updated_at), "dd MMM yyyy HH:mm", { locale: es })}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">En etapa desde</span>
                      <p>{gestion.entered_stage_at ? format(new Date(gestion.entered_stage_at), "dd MMM yyyy HH:mm", { locale: es }) : "—"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Etapa actual</span>
                      <p>{currentStage?.name || "—"}</p>
                    </div>
                    {gestion.cliente_nombre && (
                      <div>
                        <span className="text-xs text-muted-foreground">Cliente</span>
                        <p>{gestion.cliente_nombre}</p>
                      </div>
                    )}
                    {gestion.area_id && (
                      <div>
                        <span className="text-xs text-muted-foreground">Área</span>
                        <p>{gestion.area_nombre || "—"}</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* ── Checklist ── */}
                <TabsContent value="checklist" className="mt-0">
                  <div className="space-y-2 mb-4">
                    {tareas.length > 0 && (
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${tareas.length ? (tareasDone / tareas.length) * 100 : 0}%` }}
                        />
                      </div>
                    )}
                    {tareas.map((tarea) => (
                      <div key={tarea.id} className="flex items-center gap-2.5 group py-1">
                        <Checkbox
                          checked={tarea.estado === "done"}
                          onCheckedChange={() => handleToggleTarea(tarea)}
                          className="shrink-0"
                        />
                        <span className={cn("text-sm flex-1", tarea.estado === "done" && "line-through text-muted-foreground")}>
                          {tarea.titulo}
                        </span>
                        <Button
                          variant="ghost" size="sm"
                          aria-label="Eliminar tarea"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDeleteTarea(tarea.id)}
                        >
                          <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    ))}
                    {tareas.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Sin tareas. Agregá la primera tarea abajo.</p>
                    )}
                  </div>
                  {/* Add task */}
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder="Nueva tarea..."
                      value={newTaskText}
                      onChange={(e) => setNewTaskText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddTarea()}
                      className="text-sm h-8"
                    />
                    <Button size="sm" className="h-8 gap-1" disabled={!newTaskText.trim() || addingTask} onClick={handleAddTarea}>
                      <Plus className="w-3.5 h-3.5" />Agregar
                    </Button>
                  </div>
                </TabsContent>

                {/* ── Actividades ── */}
                <TabsContent value="actividades" className="mt-0">
                  <ActivityTab gestionId={gestionId} />
                </TabsContent>

                {/* ── Comunicaciones ── */}
                <TabsContent value="comunicaciones" className="mt-0">
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Input placeholder="Tu nombre" value={authorName} onChange={(e) => setAuthorName(e.target.value)} className="w-32 text-xs h-8" />
                      <Input placeholder="Escribí un comentario..." value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleComment()}
                        className="flex-1 text-xs h-8" />
                      <Button size="sm" className="h-8" onClick={handleComment} disabled={!commentText.trim() || commentLoading}>
                        <Send className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {comments.map((c: any) => (
                        <div key={c.id} className="p-2.5 rounded-lg bg-muted/50 border border-border">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs font-medium">{c.author_name || "Anónimo"}</span>
                            <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), "dd MMM HH:mm", { locale: es })}</span>
                          </div>
                          <p className="text-sm">{c.content}</p>
                        </div>
                      ))}
                      {comments.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sin comentarios</p>}
                    </div>
                  </div>
                </TabsContent>

                {/* ── Documentos ── */}
                <TabsContent value="documentos" className="mt-0">
                  <div className="space-y-3">
                    <label className="cursor-pointer">
                      <Button variant="outline" size="sm" className="gap-1.5" asChild>
                        <span><Upload className="w-3.5 h-3.5" />Subir archivo</span>
                      </Button>
                      <input type="file" className="hidden" onChange={handleFileUpload} />
                    </label>
                    <div className="space-y-2">
                      {attachments.map((a: any) => (
                        <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg border border-border group">
                          <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{a.file_name}</p>
                            <span className="text-[10px] text-muted-foreground">
                              {a.file_size ? `${(a.file_size / 1024).toFixed(1)} KB` : ""} · {a.uploaded_by_name || "—"} · {format(new Date(a.created_at), "dd MMM HH:mm", { locale: es })}
                            </span>
                          </div>
                          <Button variant="ghost" size="sm" aria-label="Eliminar archivo" className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                            onClick={() => handleDeleteAttachment(a.id, a.file_path)}>
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                      {attachments.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sin documentos</p>}
                    </div>
                  </div>
                </TabsContent>

                {/* ── Historial ── */}
                <TabsContent value="historial" className="mt-0">
                  <div className="space-y-2">
                    {history.map((h: any) => (
                      <div key={h.id} className="flex items-center gap-2 p-2 rounded-lg border border-border text-sm">
                        <ArrowRight className="w-4 h-4 text-primary shrink-0" />
                        <div>
                          <span>{h.from_stage_id ? getStageName(h.from_stage_id) : "Inicio"} → {getStageName(h.to_stage_id)}</span>
                          <p className="text-[10px] text-muted-foreground">{format(new Date(h.changed_at), "dd MMM yyyy HH:mm", { locale: es })}</p>
                        </div>
                      </div>
                    ))}
                    {history.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sin historial</p>}
                  </div>
                </TabsContent>

                {/* ── Dependencias ── */}
                <TabsContent value="dependencias" className="mt-0">
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                    <Link2 className="w-8 h-8 text-muted-foreground/40" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Sin dependencias</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Las dependencias entre gestiones estarán disponibles próximamente.</p>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5 mt-1" disabled>
                      <Plus className="w-3.5 h-3.5" />Agregar dependencia
                    </Button>
                  </div>
                </TabsContent>

                {/* ── Cliente ── */}
                <TabsContent value="cliente" className="mt-0">
                  {gestion.cliente_nombre ? (
                    <div className="space-y-3">
                      <div className="p-4 rounded-lg border border-border bg-muted/30 flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm">{gestion.cliente_nombre}</p>
                          {gestion.cliente_id && (
                            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">ID: {gestion.cliente_id}</p>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground text-center">Para ver el perfil completo, buscá al cliente desde la vista Clientes.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                      <Building2 className="w-8 h-8 text-muted-foreground/40" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Sin cliente asociado</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Esta gestión no tiene un cliente vinculado.</p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* ── Configuración ── */}
                <TabsContent value="configuracion" className="mt-0">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide block mb-1">Prioridad</label>
                        <Select value={gestion.priority || "medium"} onValueChange={(v) => handleUpdateField("priority", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(priorityConfig).map(([key, cfg]) => (
                              <SelectItem key={key} value={key} className="text-xs">{cfg.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide block mb-1">Tipo</label>
                        <Select value={gestion.type || ""} onValueChange={(v) => handleUpdateField("type", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sin tipo" /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(typeConfig).map(([key, cfg]) => (
                              <SelectItem key={key} value={key} className="text-xs">{cfg.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide block mb-1">Subtipo</label>
                        <Input
                          defaultValue={gestion.subtype || ""}
                          className="h-8 text-xs"
                          placeholder="Ej: Renovación"
                          onBlur={(e) => {
                            if (e.target.value !== (gestion.subtype || "")) handleUpdateField("subtype", e.target.value);
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide block mb-1">Fecha límite</label>
                        <Input
                          type="date"
                          className="h-8 text-xs"
                          defaultValue={gestion.due_date ? gestion.due_date.slice(0, 10) : ""}
                          onBlur={(e) => {
                            if (e.target.value !== (gestion.due_date?.slice(0, 10) || "")) handleUpdateField("due_date", e.target.value || null);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

              </ScrollArea>
            </Tabs>
          </div>

          {/* ── SIDEBAR: Acciones Rápidas ────────────────────────────────── */}
          <div className="w-60 border-l border-border flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-primary" />Acciones rápidas
              </h3>
            </div>
            <ScrollArea className="flex-1">
              <div className="px-4 py-3 space-y-4">

                {/* Responsable */}
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide block mb-1.5">
                    Responsable
                  </label>
                  {editingResponsable ? (
                    <div className="space-y-1.5">
                      <Select
                        onValueChange={(val) => { handleResponsableChange(val); }}
                      >
                        <SelectTrigger className="h-7 text-xs w-full">
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sin asignar</SelectItem>
                          {colaboradores.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              <span className="flex items-center gap-1.5">
                                <span className="inline-flex w-4 h-4 rounded-full items-center justify-center text-white text-[8px] font-bold shrink-0"
                                  style={{ backgroundColor: c.color }}>
                                  {c.nombre.charAt(0)}
                                </span>
                                <span className="truncate">{c.nombre}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" className="h-6 w-full text-xs" onClick={() => setEditingResponsable(false)}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingResponsable(true)}
                      className="w-full flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted transition-colors text-left"
                    >
                      {currentColab ? (
                        <>
                          <span className="inline-flex w-6 h-6 rounded-full items-center justify-center text-white text-[10px] font-bold shrink-0"
                            style={{ backgroundColor: currentColab.color }}>
                            {currentColab.nombre.charAt(0)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{currentColab.nombre}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{currentColab.cargo}</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <User className="w-5 h-5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Sin asignar</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Cambiar Etapa */}
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide block mb-1.5">
                    Etapa
                  </label>
                  <Select value={gestion.stage_id} onValueChange={handleStageChange}>
                    <SelectTrigger className="h-7 text-xs w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Acciones */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Acciones</p>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-8 text-xs"
                    onClick={() => setEditingResponsable(true)}>
                    <UserCheck className="w-3.5 h-3.5" />Reasignar
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-8 text-xs"
                    onClick={() => setActiveTab("checklist")}>
                    <CheckSquare className="w-3.5 h-3.5" />Agregar tarea
                  </Button>
                  <label className="cursor-pointer w-full">
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-8 text-xs pointer-events-none" asChild>
                      <span><Paperclip className="w-3.5 h-3.5" />Adjuntar doc.</span>
                    </Button>
                    <input type="file" className="hidden" onChange={handleFileUpload} />
                  </label>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-8 text-xs"
                    onClick={() => setActiveTab("comunicaciones")}>
                    <MessageSquare className="w-3.5 h-3.5" />Enviar mensaje
                  </Button>
                </div>

                <Separator />

                {/* Secciones secundarias */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Ver más</p>
                  <Button variant="ghost" size="sm" className={cn("w-full justify-start gap-2 h-8 text-xs", activeTab === "dependencias" && "bg-muted")}
                    onClick={() => setActiveTab("dependencias")}>
                    <Link2 className="w-3.5 h-3.5" />Dependencias
                  </Button>
                  <Button variant="ghost" size="sm" className={cn("w-full justify-start gap-2 h-8 text-xs", activeTab === "cliente" && "bg-muted")}
                    onClick={() => setActiveTab("cliente")}>
                    <Building2 className="w-3.5 h-3.5" />Cliente
                  </Button>
                  <Button variant="ghost" size="sm" className={cn("w-full justify-start gap-2 h-8 text-xs", activeTab === "configuracion" && "bg-muted")}
                    onClick={() => setActiveTab("configuracion")}>
                    <Settings className="w-3.5 h-3.5" />Configuración
                  </Button>
                </div>

                <Separator />

                {/* Metadata */}
                <div className="space-y-2 text-xs">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Tipo / Subtipo</p>
                    <p className="font-medium">{gestion.type || "—"}{gestion.subtype ? ` · ${gestion.subtype}` : ""}</p>
                  </div>
                  {gestion.cliente_nombre && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Cliente</p>
                      <p className="font-medium truncate">{gestion.cliente_nombre}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Prioridad</p>
                    <Badge variant="outline" className={cn("text-[10px]", pConfig.className)}>{pConfig.label}</Badge>
                  </div>
                </div>

              </div>
            </ScrollArea>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}

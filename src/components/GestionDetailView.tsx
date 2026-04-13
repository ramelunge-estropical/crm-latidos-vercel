import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ActivityTab } from "./ActivityTab";
import {
  FileText, MessageSquare, Paperclip, History, Activity,
  User, Calendar, Tag, Upload, Send, Trash2, ArrowRight, Edit2
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface GestionDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gestionId: string;
  processId: string;
}

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgente", className: "bg-priority-urgent/15 text-priority-urgent" },
  high: { label: "Alta", className: "bg-priority-high/15 text-priority-high" },
  medium: { label: "Media", className: "bg-primary/10 text-primary" },
  low: { label: "Baja", className: "bg-muted text-muted-foreground" },
};

export function GestionDetailView({ open, onOpenChange, gestionId, processId }: GestionDetailViewProps) {
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [editingResponsable, setEditingResponsable] = useState(false);
  const [newResponsable, setNewResponsable] = useState("");

  const { data: gestion } = useQuery({
    queryKey: ["gestion-detail", gestionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("gestiones").select("*").eq("id", gestionId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: stages = [] } = useQuery({
    queryKey: ["stages", processId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pipeline_stages").select("*").eq("process_id", processId).order("order");
      if (error) throw error;
      return data;
    },
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["gestion-comments", gestionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("gestion_comments").select("*").eq("gestion_id", gestionId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["gestion-attachments", gestionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("gestion_attachments").select("*").eq("gestion_id", gestionId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["gestion-history", gestionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stage_history").select("*").eq("gestion_id", gestionId).order("changed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const currentStage = stages.find((s) => s.id === gestion?.stage_id);
  const pConfig = gestion ? priorityConfig[gestion.priority] || priorityConfig.medium : priorityConfig.medium;

  // Change stage
  const handleStageChange = async (newStageId: string) => {
    if (!gestion || newStageId === gestion.stage_id) return;
    try {
      await supabase.from("stage_history").insert({
        gestion_id: gestionId,
        from_stage_id: gestion.stage_id,
        to_stage_id: newStageId,
      } as any);
      const { error } = await supabase
        .from("gestiones")
        .update({ stage_id: newStageId, entered_stage_at: new Date().toISOString() } as any)
        .eq("id", gestionId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["gestion-detail", gestionId] });
      queryClient.invalidateQueries({ queryKey: ["gestion-history", gestionId] });
      queryClient.invalidateQueries({ queryKey: ["gestiones", processId] });
      toast.success("Etapa actualizada");
    } catch (err: any) { toast.error(err.message); }
  };

  // Assign responsable
  const handleAssignResponsable = async () => {
    if (!gestion) return;
    try {
      const { error } = await supabase
        .from("gestiones")
        .update({ responsable_nombre: newResponsable.trim() || null } as any)
        .eq("id", gestionId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["gestion-detail", gestionId] });
      queryClient.invalidateQueries({ queryKey: ["gestiones", processId] });
      setEditingResponsable(false);
      toast.success("Responsable actualizado");
    } catch (err: any) { toast.error(err.message); }
  };

  // Comment
  const handleComment = async () => {
    if (!commentText.trim()) return;
    setCommentLoading(true);
    try {
      const { error } = await supabase.from("gestion_comments").insert({
        gestion_id: gestionId,
        content: commentText.trim(),
        author_name: authorName.trim() || "Anónimo",
        comment_type: "comment",
      });
      if (error) throw error;
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["gestion-comments", gestionId] });
      toast.success("Comentario agregado");
    } catch (err: any) { toast.error(err.message); }
    finally { setCommentLoading(false); }
  };

  // File upload
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

  // Delete attachment
  const handleDeleteAttachment = async (id: string, filePath: string) => {
    try {
      await supabase.storage.from("gestiones-files").remove([filePath]);
      await supabase.from("gestion_attachments").delete().eq("id", id);
      queryClient.invalidateQueries({ queryKey: ["gestion-attachments", gestionId] });
      toast.success("Archivo eliminado");
    } catch (err: any) { toast.error(err.message); }
  };

  const getStageName = (stageId: string) => stages.find((s) => s.id === stageId)?.name || "—";

  if (!gestion) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-3">
          <DialogHeader>
            <DialogTitle className="text-lg">{gestion.title}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className={pConfig.className}>{pConfig.label}</Badge>
            {gestion.type && (
              <Badge variant="secondary" className="text-[10px]">
                <Tag className="w-2.5 h-2.5 mr-1" />
                {gestion.type}{gestion.subtype ? ` · ${gestion.subtype}` : ""}
              </Badge>
            )}
            {currentStage && <Badge variant="outline" className="text-[10px]">{currentStage.name}</Badge>}
            {gestion.due_date && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {format(new Date(gestion.due_date), "dd MMM yyyy", { locale: es })}
              </span>
            )}
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-3 mt-3">
            {/* Change stage */}
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Etapa</label>
              <Select value={gestion.stage_id} onValueChange={handleStageChange}>
                <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Assign responsable */}
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Responsable</label>
              {editingResponsable ? (
                <div className="flex gap-1">
                  <Input className="h-8 text-xs w-[140px]" value={newResponsable} onChange={(e) => setNewResponsable(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAssignResponsable()} autoFocus />
                  <Button size="sm" className="h-8 text-xs" onClick={handleAssignResponsable}>OK</Button>
                </div>
              ) : (
                <button
                  onClick={() => { setNewResponsable(gestion.responsable_nombre || ""); setEditingResponsable(true); }}
                  className="flex items-center gap-1 h-8 px-2 text-xs border border-border rounded-md hover:bg-accent transition-colors"
                >
                  <User className="w-3 h-3" />
                  {gestion.responsable_nombre || "Sin asignar"}
                  <Edit2 className="w-2.5 h-2.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Tabs */}
        <Tabs defaultValue="resumen" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-6 mt-2 w-fit">
            <TabsTrigger value="resumen" className="text-xs gap-1"><FileText className="w-3 h-3" />Resumen</TabsTrigger>
            <TabsTrigger value="actividades" className="text-xs gap-1"><Activity className="w-3 h-3" />Actividades</TabsTrigger>
            <TabsTrigger value="comunicaciones" className="text-xs gap-1"><MessageSquare className="w-3 h-3" />Comunicaciones</TabsTrigger>
            <TabsTrigger value="documentos" className="text-xs gap-1"><Paperclip className="w-3 h-3" />Documentos</TabsTrigger>
            <TabsTrigger value="historial" className="text-xs gap-1"><History className="w-3 h-3" />Historial</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 px-6 py-4">
            {/* Resumen */}
            <TabsContent value="resumen" className="mt-0">
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">Descripción</h4>
                  <p className="text-sm text-foreground">{gestion.description || "Sin descripción"}</p>
                </div>
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
                    <p>{format(new Date(gestion.entered_stage_at), "dd MMM yyyy HH:mm", { locale: es })}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Responsable</span>
                    <p>{gestion.responsable_nombre || "Sin asignar"}</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Actividades */}
            <TabsContent value="actividades" className="mt-0">
              <ActivityTab gestionId={gestionId} />
            </TabsContent>

            {/* Comunicaciones */}
            <TabsContent value="comunicaciones" className="mt-0">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input placeholder="Tu nombre" value={authorName} onChange={(e) => setAuthorName(e.target.value)} className="w-32 text-xs" />
                  <Input placeholder="Escribí un comentario..." value={commentText} onChange={(e) => setCommentText(e.target.value)}
                    className="flex-1 text-xs" onKeyDown={(e) => e.key === "Enter" && handleComment()} />
                  <Button size="sm" onClick={handleComment} disabled={!commentText.trim() || commentLoading}>
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {comments.map((c) => (
                    <div key={c.id} className="p-2 rounded-lg bg-muted/50 border border-border">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs font-medium text-foreground">{c.author_name || "Anónimo"}</span>
                        <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), "dd MMM HH:mm", { locale: es })}</span>
                      </div>
                      <p className="text-sm text-foreground">{c.content}</p>
                    </div>
                  ))}
                  {comments.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sin comentarios</p>}
                </div>
              </div>
            </TabsContent>

            {/* Documentos */}
            <TabsContent value="documentos" className="mt-0">
              <div className="space-y-3">
                <label className="cursor-pointer">
                  <Button variant="outline" size="sm" className="gap-1.5" asChild>
                    <span><Upload className="w-3.5 h-3.5" />Subir archivo</span>
                  </Button>
                  <input type="file" className="hidden" onChange={handleFileUpload} />
                </label>
                <div className="space-y-2">
                  {attachments.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg border border-border group">
                      <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{a.file_name}</p>
                        <span className="text-[10px] text-muted-foreground">
                          {a.file_size ? `${(a.file_size / 1024).toFixed(1)} KB` : ""} · {a.uploaded_by_name || "—"} · {format(new Date(a.created_at), "dd MMM HH:mm", { locale: es })}
                        </span>
                      </div>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                        onClick={() => handleDeleteAttachment(a.id, a.file_path)}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {attachments.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sin documentos</p>}
                </div>
              </div>
            </TabsContent>

            {/* Historial */}
            <TabsContent value="historial" className="mt-0">
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center gap-2 p-2 rounded-lg border border-border text-sm">
                    <ArrowRight className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <span className="text-foreground">
                        {h.from_stage_id ? getStageName(h.from_stage_id) : "Inicio"} → {getStageName(h.to_stage_id)}
                      </span>
                      <p className="text-[10px] text-muted-foreground">{format(new Date(h.changed_at), "dd MMM yyyy HH:mm", { locale: es })}</p>
                    </div>
                  </div>
                ))}
                {history.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sin historial de movimientos</p>}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

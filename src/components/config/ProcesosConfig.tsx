import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProcesses, useAllStages } from "@/hooks/useSharedQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Trash2, ChevronDown, ChevronRight, GripVertical,
  ArrowUp, ArrowDown, Pencil, Check, X, FolderKanban
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const GLOBAL_STATUS_OPTIONS = [
  { value: "to_do",  label: "Por hacer",  className: "bg-muted text-muted-foreground" },
  { value: "doing",  label: "En proceso", className: "bg-amber-500/10 text-amber-600" },
  { value: "review", label: "Revisión",   className: "bg-violet-500/10 text-violet-600" },
  { value: "done",   label: "Finalizado", className: "bg-emerald-500/10 text-emerald-600" },
];

export function ProcesosConfig({ readonly = false }: { readonly?: boolean }) {
  const queryClient = useQueryClient();
  const { data: processes = [] } = useProcesses();
  const { data: allStages  = [] } = useAllStages();

  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [creatingProc,  setCreatingProc]  = useState(false);
  const [newProcName,   setNewProcName]   = useState("");
  const [newProcArea,   setNewProcArea]   = useState("");
  const [newProcDesc,   setNewProcDesc]   = useState("");
  const [savingProc,    setSavingProc]    = useState(false);

  const [editingProcId, setEditingProcId] = useState<string | null>(null);
  const [editProcName,  setEditProcName]  = useState("");

  const [newStageName,  setNewStageName]  = useState<Record<string, string>>({});
  const [newStageStatus,setNewStageStatus]= useState<Record<string, string>>({});
  const [editingStage,  setEditingStage]  = useState<string | null>(null);
  const [editStageName, setEditStageName] = useState("");

  const stagesFor = (processId: string) =>
    allStages.filter(s => s.process_id === processId).sort((a, b) => a.order - b.order);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["processes"] });
    queryClient.invalidateQueries({ queryKey: ["all-stages"] });
  };

  // ── Proceso CRUD ──────────────────────────────────────
  const handleCreateProcess = async () => {
    if (!newProcName.trim()) return;
    setSavingProc(true);
    try {
      const { data: proc, error } = await supabase
        .from("processes").insert({ name: newProcName.trim(), area: newProcArea.trim() || null, description: newProcDesc.trim() || null })
        .select().single();
      if (error) throw error;
      // Stage inicial
      await supabase.from("pipeline_stages").insert({ process_id: proc.id, name: "Nueva etapa", order: 0, global_status: "to_do" });
      invalidate();
      setCreatingProc(false); setNewProcName(""); setNewProcArea(""); setNewProcDesc("");
      setExpandedId(proc.id);
      toast.success("Proceso creado");
    } catch (e: any) { toast.error(e.message); }
    setSavingProc(false);
  };

  const handleDeleteProcess = async (id: string) => {
    if (!confirm("¿Eliminar este proceso? Se eliminarán todas sus etapas y gestiones.")) return;
    const { error } = await supabase.from("processes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidate();
    toast.success("Proceso eliminado");
  };

  const handleSaveProcessName = async (id: string) => {
    if (!editProcName.trim()) { setEditingProcId(null); return; }
    const { error } = await supabase.from("processes").update({ name: editProcName.trim() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidate(); setEditingProcId(null);
    toast.success("Nombre actualizado");
  };

  // ── Stage CRUD ────────────────────────────────────────
  const handleAddStage = async (processId: string) => {
    const name   = newStageName[processId]?.trim();
    const status = newStageStatus[processId] || "to_do";
    if (!name) return;
    const existing = stagesFor(processId);
    const order = existing.length > 0 ? Math.max(...existing.map(s => s.order)) + 1 : 0;
    const { error } = await supabase
      .from("pipeline_stages").insert({ process_id: processId, name, order, global_status: status });
    if (error) { toast.error(error.message); return; }
    invalidate();
    setNewStageName(p => ({ ...p, [processId]: "" }));
    toast.success("Etapa agregada");
  };

  const handleDeleteStage = async (id: string) => {
    const { error } = await (supabase as any).from("pipeline_stages").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidate();
    toast.success("Etapa eliminada");
  };

  const handleMoveStage = async (stage: any, direction: "up" | "down", siblings: any[]) => {
    const idx = siblings.findIndex(s => s.id === stage.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const swap = siblings[swapIdx];
    await Promise.all([
      (supabase as any).from("pipeline_stages").update({ order: swap.order }).eq("id", stage.id),
      (supabase as any).from("pipeline_stages").update({ order: stage.order }).eq("id", swap.id),
    ]);
    invalidate();
  };

  const handleSaveStage = async (id: string) => {
    if (!editStageName.trim()) { setEditingStage(null); return; }
    await (supabase as any).from("pipeline_stages").update({ name: editStageName.trim() }).eq("id", id);
    invalidate(); setEditingStage(null);
  };

  const handleStageStatusChange = async (id: string, status: string) => {
    await (supabase as any).from("pipeline_stages").update({ global_status: status }).eq("id", id);
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{processes.length} proceso{processes.length !== 1 ? "s" : ""} configurado{processes.length !== 1 ? "s" : ""}</p>
        {!readonly && (
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreatingProc(true)}>
            <Plus className="w-3.5 h-3.5" />Nuevo proceso
          </Button>
        )}
      </div>

      {/* Formulario nuevo proceso */}
      {!readonly && creatingProc && (
        <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
          <p className="text-sm font-medium">Nuevo proceso</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Nombre *" value={newProcName} onChange={e => setNewProcName(e.target.value)} className="h-8 text-xs" autoFocus />
            <Input placeholder="Área (opcional)" value={newProcArea} onChange={e => setNewProcArea(e.target.value)} className="h-8 text-xs" />
          </div>
          <Input placeholder="Descripción (opcional)" value={newProcDesc} onChange={e => setNewProcDesc(e.target.value)} className="h-8 text-xs" />
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" disabled={!newProcName.trim() || savingProc} onClick={handleCreateProcess}>Crear</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreatingProc(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Lista de procesos */}
      <div className="space-y-2">
        {processes.map((proc: any) => {
          const stages  = stagesFor(proc.id);
          const isOpen  = expandedId === proc.id;
          return (
            <div key={proc.id} className="border border-border rounded-xl overflow-hidden">
              {/* Header del proceso */}
              <div className="flex items-center gap-3 px-4 py-3 bg-card">
                <button onClick={() => setExpandedId(isOpen ? null : proc.id)} className="flex items-center gap-2 flex-1 text-left">
                  <FolderKanban className="w-4 h-4 text-primary shrink-0" />
                  {editingProcId === proc.id ? (
                    <div className="flex items-center gap-1.5 flex-1" onClick={e => e.stopPropagation()}>
                      <Input value={editProcName} onChange={e => setEditProcName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleSaveProcessName(proc.id); if (e.key === "Escape") setEditingProcId(null); }}
                        className="h-7 text-sm flex-1" autoFocus />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600" onClick={() => handleSaveProcessName(proc.id)}><Check className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingProcId(null)}><X className="w-3.5 h-3.5" /></Button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{proc.name}</p>
                      {proc.area && <p className="text-[10px] text-muted-foreground">{proc.area}</p>}
                    </div>
                  )}
                  <Badge variant="outline" className="text-[10px] ml-2 shrink-0">{stages.length} etapas</Badge>
                  {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>
                {!readonly && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" aria-label="Editar nombre" className="h-7 w-7 p-0"
                      onClick={() => { setEditingProcId(proc.id); setEditProcName(proc.name); }}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" aria-label="Eliminar proceso" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteProcess(proc.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Pipeline stages */}
              {isOpen && (
                <div className="border-t border-border bg-muted/20 p-4 space-y-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Etapas del pipeline</p>

                  {stages.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">Sin etapas. Agregá la primera.</p>
                  )}

                  <div className="space-y-1.5">
                    {stages.map((stage, idx) => {
                      const statusOpt = GLOBAL_STATUS_OPTIONS.find(o => o.value === stage.global_status);
                      return (
                        <div key={stage.id} className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border">
                          {!readonly && <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
                          {!readonly && (
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" aria-label="Subir" className="h-6 w-6 p-0" disabled={idx === 0}
                                onClick={() => handleMoveStage(stage, "up", stages)}><ArrowUp className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="sm" aria-label="Bajar" className="h-6 w-6 p-0" disabled={idx === stages.length - 1}
                                onClick={() => handleMoveStage(stage, "down", stages)}><ArrowDown className="w-3 h-3" /></Button>
                            </div>
                          )}

                          {!readonly && editingStage === stage.id ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              <Input value={editStageName} onChange={e => setEditStageName(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleSaveStage(stage.id); if (e.key === "Escape") setEditingStage(null); }}
                                className="h-6 text-xs flex-1" autoFocus />
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600" onClick={() => handleSaveStage(stage.id)}><Check className="w-3 h-3" /></Button>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingStage(null)}><X className="w-3 h-3" /></Button>
                            </div>
                          ) : readonly ? (
                            <span className="text-xs font-medium flex-1">{stage.name}</span>
                          ) : (
                            <button className="text-xs font-medium flex-1 text-left hover:text-primary transition-colors"
                              onClick={() => { setEditingStage(stage.id); setEditStageName(stage.name); }}>
                              {stage.name}
                            </button>
                          )}

                          <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium", statusOpt?.className)}>
                            {statusOpt?.label}
                          </span>

                          {!readonly && (
                            <Button variant="ghost" size="sm" aria-label="Eliminar etapa" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteStage(stage.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Agregar etapa */}
                  {!readonly && <div className="flex gap-2 pt-1">
                    <Input
                      placeholder="Nombre de la nueva etapa..."
                      value={newStageName[proc.id] || ""}
                      onChange={e => setNewStageName(p => ({ ...p, [proc.id]: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && handleAddStage(proc.id)}
                      className="h-7 text-xs flex-1"
                    />
                    <Select value={newStageStatus[proc.id] || "to_do"} onValueChange={v => setNewStageStatus(p => ({ ...p, [proc.id]: v }))}>
                      <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GLOBAL_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => handleAddStage(proc.id)}
                      disabled={!newStageName[proc.id]?.trim()}>
                      <Plus className="w-3 h-3" />Agregar
                    </Button>
                  </div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

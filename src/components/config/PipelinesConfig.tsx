import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProcesses, useAllStages, useAreasEmpresa, useProcessAreas } from "@/hooks/useSharedQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, ChevronDown, ChevronRight, GripVertical,
  ArrowUp, ArrowDown, Pencil, Check, X, FolderKanban, Settings2
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "to_do",  label: "Por hacer",  className: "bg-muted text-muted-foreground" },
  { value: "doing",  label: "En proceso", className: "bg-amber-500/10 text-amber-600" },
  { value: "review", label: "Revisión",   className: "bg-violet-500/10 text-violet-600" },
  { value: "done",   label: "Finalizado", className: "bg-emerald-500/10 text-emerald-600" },
];

export function PipelinesConfig({ readonly = false }: { readonly?: boolean }) {
  const queryClient = useQueryClient();
  const { data: processes    = [] } = useProcesses();
  const { data: allStages    = [] } = useAllStages();
  const { data: areas        = [] } = useAreasEmpresa();
  const { data: processAreas = [] } = useProcessAreas();

  const [expandedId,     setExpandedId]     = useState<string | null>(null);
  const [newStageName,   setNewStageName]   = useState<Record<string, string>>({});
  const [newStageStatus, setNewStageStatus] = useState<Record<string, string>>({});
  const [editingStage,   setEditingStage]   = useState<string | null>(null);
  const [editStageName,  setEditStageName]  = useState("");

  // Edición de proceso (nombre + áreas) inline desde Pipeline
  const [editingProcId,   setEditingProcId]   = useState<string | null>(null);
  const [editProcName,    setEditProcName]    = useState("");
  const [editProcAreas,   setEditProcAreas]   = useState<string[]>([]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["processes"] });
    queryClient.invalidateQueries({ queryKey: ["all-stages"] });
    queryClient.invalidateQueries({ queryKey: ["process-areas"] });
  };

  const stagesFor = (processId: string) =>
    allStages.filter(s => s.process_id === processId).sort((a, b) => a.order - b.order);

  const areasForProcess = (processId: string) =>
    processAreas.filter(pa => pa.process_id === processId)
      .map(pa => areas.find((a: any) => a.id === pa.area_id))
      .filter(Boolean) as any[];

  const toggleArea = (areaId: string) => {
    setEditProcAreas(prev =>
      prev.includes(areaId) ? prev.filter(a => a !== areaId) : [...prev, areaId]
    );
  };

  const openEditProc = (proc: any) => {
    setEditingProcId(proc.id);
    setEditProcName(proc.name);
    setEditProcAreas(processAreas.filter(pa => pa.process_id === proc.id).map(pa => pa.area_id));
  };

  const handleSaveProc = async (procId: string) => {
    if (!editProcName.trim()) { setEditingProcId(null); return; }
    const { error } = await supabase.from("processes")
      .update({ name: editProcName.trim() }).eq("id", procId);
    if (error) { toast.error(error.message); return; }
    // Sync areas
    await (supabase as any).from("process_areas").delete().eq("process_id", procId);
    if (editProcAreas.length > 0) {
      await (supabase as any).from("process_areas").insert(
        editProcAreas.map(area_id => ({ process_id: procId, area_id }))
      );
    }
    invalidate(); setEditingProcId(null);
    toast.success("Pipeline actualizado");
  };

  // ── Stage CRUD ────────────────────────────────────────────
  const handleAddStage = async (processId: string) => {
    const name   = newStageName[processId]?.trim();
    const status = newStageStatus[processId] || "to_do";
    if (!name) return;
    const stages = stagesFor(processId);
    const order  = stages.length > 0 ? Math.max(...stages.map(s => s.order)) + 1 : 0;
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
    invalidate(); toast.success("Etapa eliminada");
  };

  const handleMoveStage = async (stage: any, direction: "up" | "down", siblings: any[]) => {
    const idx     = siblings.findIndex(s => s.id === stage.id);
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
    await (supabase as any).from("pipeline_stages")
      .update({ name: editStageName.trim() }).eq("id", id);
    invalidate(); setEditingStage(null);
  };

  const handleStageStatusChange = async (id: string, status: string) => {
    await (supabase as any).from("pipeline_stages").update({ global_status: status }).eq("id", id);
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {processes.length} proceso{processes.length !== 1 ? "s" : ""} — etapas de cada pipeline
        </p>
      </div>

      {processes.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          No hay procesos todavía. Creá uno primero en la sección <strong>Procesos</strong>.
        </div>
      )}

      <div className="space-y-2">
        {processes.map((proc: any) => {
          const stages    = stagesFor(proc.id);
          const procAreas = areasForProcess(proc.id);
          const isOpen    = expandedId === proc.id;
          const isEditing = editingProcId === proc.id;

          return (
            <div key={proc.id} className="border border-border rounded-xl overflow-hidden">

              {/* Header proceso — con edición inline de nombre + áreas */}
              {isEditing && !readonly ? (
                <div className="px-4 py-3 bg-card space-y-3">
                  <div className="flex items-center gap-2">
                    <FolderKanban className="w-4 h-4 text-primary shrink-0" />
                    <Input value={editProcName} onChange={e => setEditProcName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSaveProc(proc.id); if (e.key === "Escape") setEditingProcId(null); }}
                      className="h-7 text-sm flex-1" autoFocus />
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600"
                      onClick={() => handleSaveProc(proc.id)}><Check className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => setEditingProcId(null)}><X className="w-3.5 h-3.5" /></Button>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1.5">Áreas asociadas a este proceso/pipeline</p>
                    <div className="flex flex-wrap gap-1.5">
                      {areas.map((a: any) => (
                        <button key={a.id} type="button"
                          onClick={() => toggleArea(a.id)}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-xs border transition-colors",
                            editProcAreas.includes(a.id)
                              ? "text-white border-transparent"
                              : "bg-card border-border text-muted-foreground hover:border-primary/40"
                          )}
                          style={editProcAreas.includes(a.id) ? { backgroundColor: a.color, borderColor: a.color } : {}}>
                          {a.nombre}
                        </button>
                      ))}
                      {areas.length === 0 && (
                        <span className="text-xs text-muted-foreground">
                          No hay áreas. Creá una en la sección Áreas.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 bg-card">
                  <button
                    onClick={() => setExpandedId(isOpen ? null : proc.id)}
                    className="flex items-center gap-2 flex-1 text-left min-w-0">
                    <FolderKanban className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{proc.name}</p>
                      {procAreas.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {procAreas.map((a: any) => (
                            <span key={a.id}
                              className="inline-block px-1.5 py-0 rounded-full text-[10px] font-medium text-white"
                              style={{ backgroundColor: a.color }}>
                              {a.nombre}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">Sin áreas asociadas</p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {stages.length} etapa{stages.length !== 1 ? "s" : ""}
                    </Badge>
                    {isOpen
                      ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </button>
                  {!readonly && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0"
                      title="Editar nombre y áreas"
                      onClick={() => openEditProc(proc)}>
                      <Settings2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              )}

              {/* Pipeline stages */}
              {isOpen && !isEditing && (
                <div className="border-t border-border bg-muted/20 p-4 space-y-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Etapas del pipeline
                  </p>

                  {stages.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Sin etapas. Agregá la primera abajo.
                    </p>
                  )}

                  <div className="space-y-1.5">
                    {stages.map((stage, idx) => {
                      const statusOpt = STATUS_OPTIONS.find(o => o.value === stage.global_status);
                      return (
                        <div key={stage.id}
                          className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border">
                          {!readonly && <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
                          {!readonly && (
                            <div className="flex items-center gap-0.5">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={idx === 0}
                                onClick={() => handleMoveStage(stage, "up", stages)}>
                                <ArrowUp className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                                disabled={idx === stages.length - 1}
                                onClick={() => handleMoveStage(stage, "down", stages)}>
                                <ArrowDown className="w-3 h-3" />
                              </Button>
                            </div>
                          )}

                          {!readonly && editingStage === stage.id ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              <Input value={editStageName}
                                onChange={e => setEditStageName(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleSaveStage(stage.id); if (e.key === "Escape") setEditingStage(null); }}
                                className="h-6 text-xs flex-1" autoFocus />
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600"
                                onClick={() => handleSaveStage(stage.id)}>
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                                onClick={() => setEditingStage(null)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : readonly ? (
                            <span className="text-xs font-medium flex-1">{stage.name}</span>
                          ) : (
                            <button
                              className="text-xs font-medium flex-1 text-left hover:text-primary transition-colors"
                              onClick={() => { setEditingStage(stage.id); setEditStageName(stage.name); }}>
                              {stage.name}
                            </button>
                          )}

                          {readonly ? (
                            <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium shrink-0", statusOpt?.className)}>
                              {statusOpt?.label}
                            </span>
                          ) : (
                            <Select value={stage.global_status}
                              onValueChange={v => handleStageStatusChange(stage.id, v)}>
                              <SelectTrigger className={cn("h-6 w-[110px] text-[10px] border shrink-0", statusOpt?.className)}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map(o => (
                                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

                          {!readonly && (
                            <Button variant="ghost" size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive shrink-0"
                              onClick={() => handleDeleteStage(stage.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {!readonly && (
                    <div className="flex gap-2 pt-1">
                      <Input
                        placeholder="Nombre de la nueva etapa..."
                        value={newStageName[proc.id] || ""}
                        onChange={e => setNewStageName(p => ({ ...p, [proc.id]: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && handleAddStage(proc.id)}
                        className="h-7 text-xs flex-1"
                      />
                      <Select
                        value={newStageStatus[proc.id] || "to_do"}
                        onValueChange={v => setNewStageStatus(p => ({ ...p, [proc.id]: v }))}>
                        <SelectTrigger className="h-7 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-7 gap-1 text-xs"
                        onClick={() => handleAddStage(proc.id)}
                        disabled={!newStageName[proc.id]?.trim()}>
                        <Plus className="w-3 h-3" />Agregar
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

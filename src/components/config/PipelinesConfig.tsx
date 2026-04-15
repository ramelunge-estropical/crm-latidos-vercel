import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProcesses, useAllStages, useAreasEmpresa, useProcessAreas, useColaboradores } from "@/hooks/useSharedQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, ChevronDown, ChevronRight, GripVertical,
  ArrowUp, ArrowDown, Pencil, Check, X, FolderKanban, MapPin,
  User, Clock
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
  const { data: processes       = [] } = useProcesses();
  const { data: allStages       = [] } = useAllStages();
  const { data: areas           = [] } = useAreasEmpresa();
  const { data: processAreas    = [] } = useProcessAreas();
  const { data: colaboradores   = [] } = useColaboradores();

  const [expandedId,      setExpandedId]      = useState<string | null>(null);
  const [areaPickerOpen,  setAreaPickerOpen]  = useState<string | null>(null); // process_id con selector de áreas abierto
  const [editingNameId,   setEditingNameId]   = useState<string | null>(null);
  const [editNameValue,   setEditNameValue]   = useState("");
  const [newStageName,    setNewStageName]    = useState<Record<string, string>>({});
  const [newStageStatus,  setNewStageStatus]  = useState<Record<string, string>>({});
  const [editingStage,    setEditingStage]    = useState<string | null>(null);
  const [editStageName,   setEditStageName]   = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["processes"] });
    queryClient.invalidateQueries({ queryKey: ["all-stages"] });
    queryClient.invalidateQueries({ queryKey: ["process-areas"] });
  };

  const stagesFor = (processId: string) =>
    allStages.filter(s => s.process_id === processId).sort((a, b) => a.order - b.order);

  const areaIdsForProcess = (processId: string) =>
    processAreas.filter(pa => pa.process_id === processId).map(pa => pa.area_id);

  const areaObjsForProcess = (processId: string) =>
    areaIdsForProcess(processId)
      .map(id => areas.find((a: any) => a.id === id))
      .filter(Boolean) as any[];

  // ── Nombre proceso ────────────────────────────────────────
  const handleSaveName = async (procId: string) => {
    if (!editNameValue.trim()) { setEditingNameId(null); return; }
    await supabase.from("processes").update({ name: editNameValue.trim() }).eq("id", procId);
    invalidate(); setEditingNameId(null);
    toast.success("Nombre actualizado");
  };

  // ── Áreas asociadas ───────────────────────────────────────
  const toggleArea = async (procId: string, areaId: string) => {
    const current = areaIdsForProcess(procId);
    if (current.includes(areaId)) {
      await (supabase as any).from("process_areas")
        .delete().eq("process_id", procId).eq("area_id", areaId);
    } else {
      await (supabase as any).from("process_areas")
        .insert({ process_id: procId, area_id: areaId });
    }
    invalidate();
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
    await (supabase as any).from("pipeline_stages").delete().eq("id", id);
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
    await (supabase as any).from("pipeline_stages").update({ name: editStageName.trim() }).eq("id", id);
    invalidate(); setEditingStage(null);
  };

  const handleStageStatusChange = async (id: string, status: string) => {
    await (supabase as any).from("pipeline_stages").update({ global_status: status }).eq("id", id);
    invalidate();
  };

  const handleStageResponsable = async (id: string, responsableId: string) => {
    const val = responsableId === "none" ? null : responsableId;
    await (supabase as any).from("pipeline_stages").update({ responsable_id: val }).eq("id", id);
    invalidate();
  };

  const handleStageDuracion = async (id: string, dias: string) => {
    const val = dias === "" ? null : parseInt(dias, 10);
    if (val !== null && isNaN(val)) return;
    await (supabase as any).from("pipeline_stages").update({ duracion_estimada_dias: val }).eq("id", id);
    invalidate();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {processes.length} proceso{processes.length !== 1 ? "s" : ""} — configurá etapas y áreas de cada pipeline
      </p>

      {processes.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          No hay procesos. Creá uno primero en la sección <strong>Procesos</strong>.
        </div>
      )}

      <div className="space-y-3">
        {processes.map((proc: any) => {
          const stages      = stagesFor(proc.id);
          const procAreas   = areaObjsForProcess(proc.id);
          const procAreaIds = areaIdsForProcess(proc.id);
          const isOpen      = expandedId === proc.id;
          const pickerOpen  = areaPickerOpen === proc.id;
          const editingName = editingNameId === proc.id;

          return (
            <div key={proc.id} className="border border-border rounded-xl overflow-hidden">

              {/* ── Cabecera del proceso ── */}
              <div className="px-4 py-3 bg-card space-y-2">

                {/* Fila 1: nombre + badge etapas + expand */}
                <div className="flex items-center gap-2">
                  <FolderKanban className="w-4 h-4 text-primary shrink-0" />

                  {editingName && !readonly ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <Input value={editNameValue}
                        onChange={e => setEditNameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleSaveName(proc.id); if (e.key === "Escape") setEditingNameId(null); }}
                        className="h-7 text-sm flex-1" autoFocus />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600"
                        onClick={() => handleSaveName(proc.id)}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                        onClick={() => setEditingNameId(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-sm font-semibold truncate">{proc.name}</span>
                      {!readonly && (
                        <button onClick={() => { setEditingNameId(proc.id); setEditNameValue(proc.name); }}
                          className="opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                          title="Renombrar proceso">
                          <Pencil className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                  )}

                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {stages.length} etapa{stages.length !== 1 ? "s" : ""}
                  </Badge>
                  <button onClick={() => setExpandedId(isOpen ? null : proc.id)}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                    {isOpen
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>

                {/* Fila 2: áreas asociadas — siempre visible */}
                <div className="flex items-center gap-1.5 flex-wrap pl-6">
                  <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />

                  {procAreas.length === 0 && (
                    <span className="text-[11px] text-muted-foreground/70">Sin áreas asociadas</span>
                  )}

                  {procAreas.map((a: any) => (
                    <span key={a.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                      style={{ backgroundColor: a.color }}>
                      {a.nombre}
                      {!readonly && (
                        <button onClick={() => toggleArea(proc.id, a.id)}
                          className="hover:opacity-70 transition-opacity ml-0.5">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </span>
                  ))}

                  {!readonly && (
                    <button
                      onClick={() => setAreaPickerOpen(pickerOpen ? null : proc.id)}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors",
                        pickerOpen
                          ? "border-primary text-primary bg-primary/5"
                          : "border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary/50 hover:text-primary"
                      )}>
                      <Plus className="w-2.5 h-2.5" />
                      {procAreas.length === 0 ? "Asociar área" : "Agregar área"}
                    </button>
                  )}
                </div>

                {/* Selector de áreas — se expande al hacer clic en "+ Asociar área" */}
                {!readonly && pickerOpen && (
                  <div className="pl-6 pt-1">
                    <p className="text-[10px] text-muted-foreground mb-2">
                      Seleccioná las áreas de la empresa a las que pertenece este pipeline:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {areas.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          No hay áreas. Creá una en la sección <strong>Áreas</strong>.
                        </span>
                      ) : areas.map((a: any) => {
                        const selected = procAreaIds.includes(a.id);
                        return (
                          <button key={a.id} type="button"
                            onClick={() => toggleArea(proc.id, a.id)}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all",
                              selected
                                ? "text-white border-transparent shadow-sm"
                                : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                            )}
                            style={selected ? { backgroundColor: a.color, borderColor: a.color } : {}}>
                            {selected && <Check className="w-2.5 h-2.5" />}
                            {a.nombre}
                          </button>
                        );
                      })}
                    </div>
                    <button onClick={() => setAreaPickerOpen(null)}
                      className="mt-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                      Listo ✓
                    </button>
                  </div>
                )}
              </div>

              {/* ── Etapas del pipeline ── */}
              {isOpen && (
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
                      const statusOpt     = STATUS_OPTIONS.find(o => o.value === stage.global_status);
                      const responsable   = colaboradores.find((c: any) => c.id === stage.responsable_id);
                      return (
                        <div key={stage.id}
                          className="rounded-lg bg-card border border-border overflow-hidden">

                          {/* ── Fila principal: orden · nombre · estado · eliminar ── */}
                          <div className="flex items-center gap-2 px-2 pt-2 pb-1.5">
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

                          {/* ── Fila secundaria: responsable + duración ── */}
                          <div className="flex items-center gap-3 px-2 pb-2 border-t border-border/40 pt-1.5 bg-muted/20">
                            {/* Responsable */}
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <User className="w-3 h-3 text-muted-foreground shrink-0" />
                              {readonly ? (
                                <span className="text-[11px] text-muted-foreground truncate">
                                  {responsable ? responsable.nombre : "Sin responsable"}
                                </span>
                              ) : (
                                <Select
                                  value={stage.responsable_id || "none"}
                                  onValueChange={v => handleStageResponsable(stage.id, v)}>
                                  <SelectTrigger className="h-6 text-[11px] border-0 bg-transparent p-0 gap-1 focus:ring-0 w-auto max-w-[160px]">
                                    <SelectValue placeholder="Sin responsable" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none" className="text-xs text-muted-foreground">
                                      Sin responsable
                                    </SelectItem>
                                    {colaboradores.map((c: any) => (
                                      <SelectItem key={c.id} value={c.id} className="text-xs">
                                        <div className="flex items-center gap-1.5">
                                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                                          {c.nombre}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>

                            {/* Duración estimada */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              {readonly ? (
                                <span className="text-[11px] text-muted-foreground">
                                  {stage.duracion_estimada_dias
                                    ? `${stage.duracion_estimada_dias}d estimados`
                                    : "Sin duración"}
                                </span>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="—"
                                    defaultValue={stage.duracion_estimada_dias ?? ""}
                                    onBlur={e => handleStageDuracion(stage.id, e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                    className="h-6 w-14 text-[11px] text-center p-1"
                                  />
                                  <span className="text-[11px] text-muted-foreground">días</span>
                                </div>
                              )}
                            </div>
                          </div>

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

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useProcesses, useAllStages, useAreasEmpresa, useProcessAreas,
  useColaboradores, useSubAreasEmpresa, useProcessSubAreas
} from "@/hooks/useSharedQueries";
import { ColaboradorCombobox } from "@/components/ui/ColaboradorCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, ChevronDown, ChevronRight,
  ArrowUp, ArrowDown, Pencil, Check, X, FolderKanban,
  User, Clock, Layers
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
  const { data: processes        = [] } = useProcesses();
  const { data: allStages        = [] } = useAllStages();
  const { data: areas            = [] } = useAreasEmpresa();
  const { data: processAreas     = [] } = useProcessAreas();
  const { data: colaboradores    = [] } = useColaboradores();
  const { data: subAreas         = [] } = useSubAreasEmpresa();
  const { data: processSubAreas  = [] } = useProcessSubAreas();

  // ── Area expand state ─────────────────────────────────────
  const [expandedAreas,     setExpandedAreas]     = useState<Set<string>>(new Set());
  // ── Process expand (stages) state ────────────────────────
  const [expandedProcId,    setExpandedProcId]    = useState<string | null>(null);
  // ── Create process state ──────────────────────────────────
  const [creatingUnderArea, setCreatingUnderArea] = useState<string | null>(null);
  const [newProcName,       setNewProcName]       = useState("");
  const [newProcSubAreas,   setNewProcSubAreas]   = useState<string[]>([]);
  // ── Edit process name state ───────────────────────────────
  const [editingNameId,     setEditingNameId]     = useState<string | null>(null);
  const [editNameValue,     setEditNameValue]     = useState("");
  // ── Stage state ───────────────────────────────────────────
  const [newStageName,      setNewStageName]      = useState<Record<string, string>>({});
  const [newStageStatus,    setNewStageStatus]    = useState<Record<string, string>>({});
  const [editingStage,      setEditingStage]      = useState<string | null>(null);
  const [editStageName,     setEditStageName]     = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["processes"] });
    queryClient.invalidateQueries({ queryKey: ["all-stages"] });
    queryClient.invalidateQueries({ queryKey: ["process-areas"] });
    queryClient.invalidateQueries({ queryKey: ["process-sub-areas"] });
  };

  // ── Data helpers ──────────────────────────────────────────
  const stagesFor = (processId: string) =>
    allStages.filter(s => s.process_id === processId).sort((a, b) => a.order - b.order);

  const processesForArea = (areaId: string) => {
    const ids = processAreas.filter(pa => pa.area_id === areaId).map(pa => pa.process_id);
    return processes.filter((p: any) => ids.includes(p.id));
  };

  const processesNoArea = processes.filter((p: any) =>
    !processAreas.some(pa => pa.process_id === p.id)
  );

  const subAreaIdsForProcess = (processId: string) =>
    processSubAreas.filter(ps => ps.process_id === processId).map(ps => ps.sub_area_id);

  const subAreasForArea = (areaId: string) =>
    subAreas.filter(sa => sa.area_id === areaId).sort((a, b) => a.orden - b.orden);

  const toggleAreaExpand = (id: string) =>
    setExpandedAreas(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ── Create process ────────────────────────────────────────
  const handleCreateProcess = async (areaId: string) => {
    if (!newProcName.trim()) return;
    const { data: proc, error } = await supabase
      .from("processes")
      .insert({ name: newProcName.trim() })
      .select().single();
    if (error) { toast.error(error.message); return; }

    await (supabase as any).from("process_areas")
      .insert({ process_id: proc.id, area_id: areaId });

    if (newProcSubAreas.length > 0) {
      await (supabase as any).from("process_sub_areas")
        .insert(newProcSubAreas.map(saId => ({ process_id: proc.id, sub_area_id: saId })));
    }

    invalidate();
    setCreatingUnderArea(null);
    setNewProcName("");
    setNewProcSubAreas([]);
    toast.success("Proceso creado");
  };

  // ── Delete process ────────────────────────────────────────
  const handleDeleteProcess = async (id: string) => {
    if (!confirm("¿Eliminar este proceso? Se eliminarán todas sus etapas.")) return;
    const { error } = await supabase.from("processes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidate();
    toast.success("Proceso eliminado");
  };

  // ── Rename process ────────────────────────────────────────
  const handleSaveName = async (procId: string) => {
    if (!editNameValue.trim()) { setEditingNameId(null); return; }
    await supabase.from("processes").update({ name: editNameValue.trim() }).eq("id", procId);
    invalidate(); setEditingNameId(null);
    toast.success("Nombre actualizado");
  };

  // ── Toggle sub-area on process ────────────────────────────
  const toggleSubArea = async (procId: string, subAreaId: string) => {
    const current = subAreaIdsForProcess(procId);
    if (current.includes(subAreaId)) {
      await (supabase as any).from("process_sub_areas")
        .delete().eq("process_id", procId).eq("sub_area_id", subAreaId);
    } else {
      await (supabase as any).from("process_sub_areas")
        .insert({ process_id: procId, sub_area_id: subAreaId });
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
    const val = responsableId === "__none__" ? null : responsableId;
    await (supabase as any).from("pipeline_stages").update({ responsable_id: val }).eq("id", id);
    invalidate();
  };

  const handleStageDuracion = async (id: string, dias: string) => {
    const val = dias === "" ? null : parseInt(dias, 10);
    if (val !== null && isNaN(val)) return;
    await (supabase as any).from("pipeline_stages").update({ duracion_estimada_dias: val }).eq("id", id);
    invalidate();
  };

  // ── Render process card ───────────────────────────────────
  const renderProcess = (proc: any, areaId?: string) => {
    const stages         = stagesFor(proc.id);
    const procSubAreaIds = subAreaIdsForProcess(proc.id);
    const isOpen         = expandedProcId === proc.id;
    const editingName    = editingNameId === proc.id;
    // Sub-areas to show: those belonging to the current area (if areaId), or all
    const relevantSubAreas = areaId
      ? procSubAreaIds
          .map(id => subAreas.find((s: any) => s.id === id))
          .filter((s: any) => s && s.area_id === areaId)
      : procSubAreaIds.map(id => subAreas.find((s: any) => s.id === id)).filter(Boolean);

    return (
      <div key={proc.id} className="border border-border rounded-lg overflow-hidden">

        {/* Process header */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-card">
          <FolderKanban className="w-3.5 h-3.5 text-primary shrink-0" />

          {/* Name */}
          {editingName && !readonly ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
              <Input value={editNameValue}
                onChange={e => setEditNameValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSaveName(proc.id); if (e.key === "Escape") setEditingNameId(null); }}
                className="h-7 text-xs flex-1" autoFocus />
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600"
                onClick={() => handleSaveName(proc.id)}><Check className="w-3 h-3" /></Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                onClick={() => setEditingNameId(null)}><X className="w-3 h-3" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs font-semibold truncate">{proc.name}</span>

              {/* Sub-area chips */}
              {relevantSubAreas.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <Layers className="w-3 h-3 text-muted-foreground shrink-0" />
                  {(relevantSubAreas as any[]).map((sa: any) => (
                    <span key={sa.id}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                      style={{ backgroundColor: sa.color }}>
                      {sa.nombre}
                      {!readonly && (
                        <button onClick={() => toggleSubArea(proc.id, sa.id)}
                          className="hover:opacity-70 ml-0.5"><X className="w-2 h-2" /></button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <Badge variant="outline" className="text-[10px] shrink-0">
            {stages.length} etapa{stages.length !== 1 ? "s" : ""}
          </Badge>

          {!readonly && !editingName && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0"
              onClick={() => { setEditingNameId(proc.id); setEditNameValue(proc.name); }}>
              <Pencil className="w-3 h-3" />
            </Button>
          )}

          {!readonly && (
            <Button variant="ghost" size="sm"
              className="h-6 w-6 p-0 text-destructive hover:text-destructive shrink-0"
              onClick={() => handleDeleteProcess(proc.id)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          )}

          <button onClick={() => setExpandedProcId(isOpen ? null : proc.id)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Sub-area picker (when process is open & area is known) */}
        {isOpen && !readonly && areaId && (() => {
          const areaSubs = subAreasForArea(areaId);
          if (areaSubs.length === 0) return null;
          const selectedIds = subAreaIdsForProcess(proc.id);
          return (
            <div className="px-3 py-2 border-t border-border bg-muted/10 flex items-center gap-2 flex-wrap">
              <Layers className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground">Sub-áreas:</span>
              {areaSubs.map(sa => {
                const sel = selectedIds.includes(sa.id);
                return (
                  <button key={sa.id} type="button"
                    onClick={() => toggleSubArea(proc.id, sa.id)}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-all",
                      sel ? "text-white border-transparent" : "bg-card border-border text-muted-foreground hover:border-primary/50"
                    )}
                    style={sel ? { backgroundColor: sa.color } : {}}>
                    {sel && <Check className="w-2.5 h-2.5" />}
                    {sa.nombre}
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Stages */}
        {isOpen && (
          <div className="border-t border-border bg-muted/20 p-3 space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Etapas del pipeline
            </p>

            {stages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-1">
                Sin etapas. Agregá la primera abajo.
              </p>
            )}

            <div className="space-y-1.5">
              {stages.map((stage, idx) => {
                const statusOpt   = STATUS_OPTIONS.find(o => o.value === stage.global_status);
                const responsable = colaboradores.find((c: any) => c.id === stage.responsable_id);
                return (
                  <div key={stage.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border">

                    {!readonly && <div className="flex items-center gap-0.5 shrink-0">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={idx === 0}
                        onClick={() => handleMoveStage(stage, "up", stages)}>
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                        disabled={idx === stages.length - 1}
                        onClick={() => handleMoveStage(stage, "down", stages)}>
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                    </div>}

                    {/* Stage name */}
                    {!readonly && editingStage === stage.id ? (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <Input value={editStageName}
                          onChange={e => setEditStageName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleSaveStage(stage.id); if (e.key === "Escape") setEditingStage(null); }}
                          className="h-6 text-xs flex-1" autoFocus />
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600"
                          onClick={() => handleSaveStage(stage.id)}><Check className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                          onClick={() => setEditingStage(null)}><X className="w-3 h-3" /></Button>
                      </div>
                    ) : readonly ? (
                      <span className="text-xs font-medium w-36 shrink-0 truncate">{stage.name}</span>
                    ) : (
                      <button
                        className="text-xs font-medium w-36 shrink-0 text-left truncate hover:text-primary transition-colors"
                        onClick={() => { setEditingStage(stage.id); setEditStageName(stage.name); }}>
                        {stage.name}
                      </button>
                    )}

                    {/* Responsable */}
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <User className="w-3 h-3 text-muted-foreground shrink-0" />
                      {readonly ? (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {responsable ? responsable.nombre : "Sin responsable"}
                        </span>
                      ) : (
                        <ColaboradorCombobox
                          value={stage.responsable_id || "__none__"}
                          onValueChange={v => handleStageResponsable(stage.id, v)}
                          colaboradores={colaboradores as any}
                          emptyLabel="Sin responsable"
                          placeholder="Sin responsable"
                          triggerClassName="h-6 min-w-[120px] max-w-[160px]"
                          size="sm"
                        />
                      )}
                    </div>

                    {/* Duración */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      {readonly ? (
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {stage.duracion_estimada_dias ? `${stage.duracion_estimada_dias}d` : "—"}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Input type="number" min={1} placeholder="—"
                            defaultValue={stage.duracion_estimada_dias ?? ""}
                            onBlur={e => handleStageDuracion(stage.id, e.target.value)}
                            onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                            className="h-6 w-12 text-[11px] text-center p-1" />
                          <span className="text-[11px] text-muted-foreground">d</span>
                        </div>
                      )}
                    </div>

                    {/* Estado */}
                    {readonly ? (
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium shrink-0", statusOpt?.className)}>
                        {statusOpt?.label}
                      </span>
                    ) : (
                      <Select value={stage.global_status}
                        onValueChange={v => handleStageStatusChange(stage.id, v)}>
                        <SelectTrigger className={cn("h-6 w-[100px] text-[10px] border shrink-0", statusOpt?.className)}>
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
  };

  // ── Main render ───────────────────────────────────────────
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {processes.length} proceso{processes.length !== 1 ? "s" : ""} — organizados por área
      </p>

      {/* Areas */}
      {areas.map((area: any) => {
        const procs      = processesForArea(area.id);
        const areaSubs   = subAreasForArea(area.id);
        const isAreaOpen = expandedAreas.has(area.id);

        return (
          <div key={area.id} className="border border-border rounded-xl overflow-hidden">

            {/* Area header */}
            <div
              className="flex items-center gap-3 px-4 py-3 bg-card cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => toggleAreaExpand(area.id)}>
              <div className="w-4 h-4 rounded-md shrink-0" style={{ backgroundColor: area.color }} />
              <span className="text-sm font-semibold flex-1">{area.nombre}</span>

              {areaSubs.length > 0 && (
                <div className="flex items-center gap-1">
                  {areaSubs.map(sa => (
                    <span key={sa.id}
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: sa.color }}
                      title={sa.nombre} />
                  ))}
                </div>
              )}

              <Badge variant="outline" className="text-[10px] shrink-0">
                {procs.length} proceso{procs.length !== 1 ? "s" : ""}
              </Badge>

              {!readonly && (
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs shrink-0"
                  onClick={e => {
                    e.stopPropagation();
                    setCreatingUnderArea(area.id);
                    setNewProcName("");
                    setNewProcSubAreas([]);
                    // Auto-expand area
                    setExpandedAreas(prev => { const next = new Set(prev); next.add(area.id); return next; });
                  }}>
                  <Plus className="w-3 h-3" />Nuevo proceso
                </Button>
              )}

              {isAreaOpen
                ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
            </div>

            {/* Area content */}
            {isAreaOpen && (
              <div className="border-t border-border bg-muted/10 p-3 space-y-2">

                {/* Create process form */}
                {!readonly && creatingUnderArea === area.id && (
                  <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2.5">
                    <p className="text-xs font-medium text-primary">Nuevo proceso en {area.nombre}</p>
                    <Input
                      placeholder="Nombre del proceso *"
                      value={newProcName}
                      onChange={e => setNewProcName(e.target.value)}
                      onKeyDown={e => e.key === "Escape" && setCreatingUnderArea(null)}
                      className="h-7 text-xs"
                      autoFocus
                    />
                    {areaSubs.length > 0 && (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Layers className="w-3 h-3" />Sub-áreas del proceso:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {areaSubs.map(sa => {
                            const sel = newProcSubAreas.includes(sa.id);
                            return (
                              <button key={sa.id} type="button"
                                onClick={() => setNewProcSubAreas(prev =>
                                  sel ? prev.filter(id => id !== sa.id) : [...prev, sa.id]
                                )}
                                className={cn(
                                  "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-all",
                                  sel ? "text-white border-transparent" : "bg-card border-border text-muted-foreground hover:border-primary/50"
                                )}
                                style={sel ? { backgroundColor: sa.color } : {}}>
                                {sel && <Check className="w-2.5 h-2.5" />}
                                {sa.nombre}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs"
                        disabled={!newProcName.trim()}
                        onClick={() => handleCreateProcess(area.id)}>
                        Crear
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => setCreatingUnderArea(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {/* Processes under this area */}
                <div className="space-y-2">
                  {procs.map((proc: any) => renderProcess(proc, area.id))}
                </div>

                {procs.length === 0 && creatingUnderArea !== area.id && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Sin procesos. Agregá el primero.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Sin área */}
      {processesNoArea.length > 0 && (
        <div className="border border-dashed border-border rounded-xl overflow-hidden">
          <div
            className="flex items-center gap-3 px-4 py-3 bg-card/50 cursor-pointer"
            onClick={() => toggleAreaExpand("__no_area__")}>
            <div className="w-4 h-4 rounded-md bg-muted-foreground/30 shrink-0" />
            <span className="text-sm font-medium text-muted-foreground flex-1">Sin área asignada</span>
            <Badge variant="outline" className="text-[10px]">
              {processesNoArea.length} proceso{processesNoArea.length !== 1 ? "s" : ""}
            </Badge>
            {expandedAreas.has("__no_area__")
              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
          {expandedAreas.has("__no_area__") && (
            <div className="border-t border-border bg-muted/10 p-3 space-y-2">
              {processesNoArea.map((proc: any) => renderProcess(proc, undefined))}
            </div>
          )}
        </div>
      )}

      {areas.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          No hay áreas configuradas. Creá áreas primero en la sección <strong>Áreas</strong>.
        </div>
      )}
    </div>
  );
}

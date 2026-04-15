import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProcesses, useAreasEmpresa, useProcessAreas } from "@/hooks/useSharedQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Check, X, FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ProcesosConfig({ readonly = false }: { readonly?: boolean }) {
  const queryClient = useQueryClient();
  const { data: processes    = [] } = useProcesses();
  const { data: areas        = [] } = useAreasEmpresa();
  const { data: processAreas = [] } = useProcessAreas();

  const [creatingProc,  setCreatingProc]  = useState(false);
  const [newProcName,   setNewProcName]   = useState("");
  const [newProcDesc,   setNewProcDesc]   = useState("");
  const [newProcAreas,  setNewProcAreas]  = useState<string[]>([]);
  const [savingProc,    setSavingProc]    = useState(false);
  const [editingProcId, setEditingProcId] = useState<string | null>(null);
  const [editProcName,  setEditProcName]  = useState("");
  const [editProcDesc,  setEditProcDesc]  = useState("");
  const [editProcAreas, setEditProcAreas] = useState<string[]>([]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["processes"] });
    queryClient.invalidateQueries({ queryKey: ["process-areas"] });
  };

  const areasForProcess = (processId: string) =>
    processAreas.filter(pa => pa.process_id === processId).map(pa => pa.area_id);

  const toggleArea = (areaId: string, current: string[], setter: (v: string[]) => void) => {
    setter(current.includes(areaId) ? current.filter(a => a !== areaId) : [...current, areaId]);
  };

  const saveProcessAreas = async (processId: string, areaIds: string[]) => {
    await (supabase as any).from("process_areas").delete().eq("process_id", processId);
    if (areaIds.length > 0) {
      await (supabase as any).from("process_areas").insert(
        areaIds.map(area_id => ({ process_id: processId, area_id }))
      );
    }
  };

  const handleCreateProcess = async () => {
    if (!newProcName.trim()) return;
    setSavingProc(true);
    try {
      const { data: proc, error } = await supabase
        .from("processes")
        .insert({ name: newProcName.trim(), description: newProcDesc.trim() || null })
        .select().single();
      if (error) throw error;
      await saveProcessAreas(proc.id, newProcAreas);
      invalidate();
      setCreatingProc(false); setNewProcName(""); setNewProcDesc(""); setNewProcAreas([]);
      toast.success("Proceso creado");
    } catch (e: any) { toast.error(e.message); }
    setSavingProc(false);
  };

  const handleDeleteProcess = async (id: string) => {
    if (!confirm("¿Eliminar este proceso? Se eliminarán todas sus etapas y gestiones.")) return;
    const { error } = await supabase.from("processes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidate(); toast.success("Proceso eliminado");
  };

  const openEdit = (proc: any) => {
    setEditingProcId(proc.id);
    setEditProcName(proc.name);
    setEditProcDesc(proc.description || "");
    setEditProcAreas(areasForProcess(proc.id));
  };

  const handleSaveEdit = async (id: string) => {
    if (!editProcName.trim()) { setEditingProcId(null); return; }
    const { error } = await supabase.from("processes")
      .update({ name: editProcName.trim(), description: editProcDesc.trim() || null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await saveProcessAreas(id, editProcAreas);
    invalidate(); setEditingProcId(null);
    toast.success("Proceso actualizado");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {processes.length} proceso{processes.length !== 1 ? "s" : ""} configurado{processes.length !== 1 ? "s" : ""}
        </p>
        {!readonly && (
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreatingProc(true)}>
            <Plus className="w-3.5 h-3.5" />Nuevo proceso
          </Button>
        )}
      </div>

      {/* Form nuevo proceso */}
      {!readonly && creatingProc && (
        <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
          <p className="text-sm font-medium">Nuevo proceso</p>
          <Input placeholder="Nombre *" value={newProcName}
            onChange={e => setNewProcName(e.target.value)}
            className="h-8 text-xs" autoFocus />
          <Input placeholder="Descripción (opcional)" value={newProcDesc}
            onChange={e => setNewProcDesc(e.target.value)}
            className="h-8 text-xs" />
          <div>
            <p className="text-xs text-muted-foreground mb-2">Áreas asociadas</p>
            <div className="flex flex-wrap gap-2">
              {areas.map((a: any) => (
                <button key={a.id} type="button"
                  onClick={() => toggleArea(a.id, newProcAreas, setNewProcAreas)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs border transition-colors",
                    newProcAreas.includes(a.id)
                      ? "text-white border-transparent"
                      : "bg-card border-border text-muted-foreground hover:border-primary/40"
                  )}
                  style={newProcAreas.includes(a.id) ? { backgroundColor: a.color, borderColor: a.color } : {}}>
                  {a.nombre}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs"
              disabled={!newProcName.trim() || savingProc}
              onClick={handleCreateProcess}>Crear</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs"
              onClick={() => setCreatingProc(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Lista de procesos */}
      <div className="space-y-2">
        {processes.map((proc: any) => {
          const procAreaIds = areasForProcess(proc.id);
          const procAreaObjs = areas.filter((a: any) => procAreaIds.includes(a.id));
          const isEditing = editingProcId === proc.id;

          return (
            <div key={proc.id} className="border border-border rounded-xl bg-card">
              {isEditing ? (
                <div className="p-4 space-y-3">
                  <Input value={editProcName} onChange={e => setEditProcName(e.target.value)}
                    className="h-8 text-sm font-medium" autoFocus />
                  <Input placeholder="Descripción (opcional)" value={editProcDesc}
                    onChange={e => setEditProcDesc(e.target.value)}
                    className="h-8 text-xs" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Áreas asociadas</p>
                    <div className="flex flex-wrap gap-2">
                      {areas.map((a: any) => (
                        <button key={a.id} type="button"
                          onClick={() => toggleArea(a.id, editProcAreas, setEditProcAreas)}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-xs border transition-colors",
                            editProcAreas.includes(a.id)
                              ? "text-white border-transparent"
                              : "bg-muted border-border text-muted-foreground hover:border-primary/40"
                          )}
                          style={editProcAreas.includes(a.id) ? { backgroundColor: a.color, borderColor: a.color } : {}}>
                          {a.nombre}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={() => handleSaveEdit(proc.id)}>
                      <Check className="w-3 h-3" />Guardar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => setEditingProcId(null)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3">
                  <FolderKanban className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{proc.name}</p>
                    {proc.description && (
                      <p className="text-[11px] text-muted-foreground truncate">{proc.description}</p>
                    )}
                    {procAreaObjs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {procAreaObjs.map((a: any) => (
                          <span key={a.id}
                            className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white"
                            style={{ backgroundColor: a.color }}>
                            {a.nombre}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {!readonly && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                        onClick={() => openEdit(proc)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteProcess(proc.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {processes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay procesos. Creá el primero.
          </p>
        )}
      </div>
    </div>
  );
}

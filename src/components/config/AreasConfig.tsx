import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAreasEmpresa, useSubAreasEmpresa } from "@/hooks/useSharedQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronRight, Layers } from "lucide-react";
import { toast } from "sonner";

export function AreasConfig({ readonly = false }: { readonly?: boolean }) {
  const queryClient = useQueryClient();
  const { data: areas    = [] } = useAreasEmpresa();
  const { data: subAreas = [] } = useSubAreasEmpresa();

  // ── Area state ──────────────────────────────────────────
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [creating,     setCreating]     = useState(false);
  const [newNombre,    setNewNombre]    = useState("");
  const [newColor,     setNewColor]     = useState("#6366f1");
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editNombre,   setEditNombre]   = useState("");
  const [editColor,    setEditColor]    = useState("");

  // ── Sub-area state ──────────────────────────────────────
  const [newSubNombre,    setNewSubNombre]    = useState<Record<string, string>>({});
  const [newSubColor,     setNewSubColor]     = useState<Record<string, string>>({});
  const [editingSubId,    setEditingSubId]    = useState<string | null>(null);
  const [editSubNombre,   setEditSubNombre]   = useState("");
  const [editSubColor,    setEditSubColor]    = useState("");

  const invalidateAreas = () => {
    queryClient.invalidateQueries({ queryKey: ["areas_empresa"] });
    queryClient.invalidateQueries({ queryKey: ["sub_areas_empresa"] });
  };

  const subAreasFor = (areaId: string) =>
    subAreas.filter(s => s.area_id === areaId).sort((a, b) => a.orden - b.orden);

  // ── Areas CRUD ──────────────────────────────────────────
  const handleCreate = async () => {
    if (!newNombre.trim()) return;
    const { error } = await (supabase as any)
      .from("areas_empresa").insert({ nombre: newNombre.trim(), color: newColor });
    if (error) { toast.error(error.message); return; }
    invalidateAreas();
    setCreating(false); setNewNombre(""); setNewColor("#6366f1");
    toast.success("Área creada");
  };

  const handleSave = async (id: string) => {
    if (!editNombre.trim()) { setEditingId(null); return; }
    const { error } = await (supabase as any)
      .from("areas_empresa").update({ nombre: editNombre.trim(), color: editColor }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidateAreas(); setEditingId(null);
    toast.success("Área actualizada");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta área? Se eliminarán también todas sus sub-áreas.")) return;
    const { error } = await (supabase as any).from("areas_empresa").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidateAreas();
    toast.success("Área eliminada");
  };

  // ── Sub-areas CRUD ──────────────────────────────────────
  const handleAddSubArea = async (areaId: string) => {
    const nombre = newSubNombre[areaId]?.trim();
    if (!nombre) return;
    const color = newSubColor[areaId] || "#94a3b8";
    const subs  = subAreasFor(areaId);
    const orden = subs.length > 0 ? Math.max(...subs.map(s => s.orden)) + 1 : 0;
    const { error } = await (supabase as any)
      .from("sub_areas_empresa").insert({ area_id: areaId, nombre, color, orden });
    if (error) { toast.error(error.message); return; }
    invalidateAreas();
    setNewSubNombre(p => ({ ...p, [areaId]: "" }));
    toast.success("Sub-área creada");
  };

  const handleSaveSubArea = async (id: string) => {
    if (!editSubNombre.trim()) { setEditingSubId(null); return; }
    const { error } = await (supabase as any)
      .from("sub_areas_empresa")
      .update({ nombre: editSubNombre.trim(), color: editSubColor }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidateAreas(); setEditingSubId(null);
    toast.success("Sub-área actualizada");
  };

  const handleDeleteSubArea = async (id: string) => {
    const { error } = await (supabase as any).from("sub_areas_empresa").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidateAreas();
    toast.success("Sub-área eliminada");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {areas.length} área{areas.length !== 1 ? "s" : ""} configurada{areas.length !== 1 ? "s" : ""}
        </p>
        {!readonly && (
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5" />Nueva área
          </Button>
        )}
      </div>

      {/* Form nueva área */}
      {!readonly && creating && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border border-border p-0.5" />
          <Input placeholder="Nombre del área *" value={newNombre}
            onChange={e => setNewNombre(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            className="h-8 text-xs flex-1" autoFocus />
          <Button size="sm" className="h-8 text-xs" disabled={!newNombre.trim()} onClick={handleCreate}>Crear</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setCreating(false)}>Cancelar</Button>
        </div>
      )}

      {/* Lista de áreas */}
      <div className="space-y-2">
        {areas.map((area: any) => {
          const subs   = subAreasFor(area.id);
          const isOpen = expandedId === area.id;

          return (
            <div key={area.id} className="border border-border rounded-xl overflow-hidden">

              {/* ── Header del área ── */}
              <div className="flex items-center gap-3 px-4 py-3 bg-card">

                {/* Expand toggle */}
                <button
                  onClick={() => setExpandedId(isOpen ? null : area.id)}
                  className="flex items-center gap-2.5 flex-1 text-left min-w-0">

                  {editingId === area.id ? (
                    <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                      <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border border-border p-0.5 shrink-0" />
                      <Input value={editNombre} onChange={e => setEditNombre(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleSave(area.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="h-8 text-xs flex-1" autoFocus />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600"
                        onClick={() => handleSave(area.id)}><Check className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                        onClick={() => setEditingId(null)}><X className="w-3.5 h-3.5" /></Button>
                    </div>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-lg shrink-0" style={{ backgroundColor: area.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{area.nombre}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {subs.length} sub-área{subs.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </>
                  )}

                  {editingId !== area.id && (
                    isOpen
                      ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {/* Edit / Delete del área */}
                {!readonly && editingId !== area.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                      onClick={() => { setEditingId(area.id); setEditNombre(area.nombre); setEditColor(area.color); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(area.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {/* ── Sub-áreas expandibles ── */}
              {isOpen && (
                <div className="border-t border-border bg-muted/20 p-4 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Sub-áreas
                  </p>

                  <div className="space-y-1.5">
                    {subs.map(sub => (
                      <div key={sub.id}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border">
                        {editingSubId === sub.id ? (
                          <div className="flex items-center gap-1.5 flex-1">
                            <input type="color" value={editSubColor} onChange={e => setEditSubColor(e.target.value)}
                              className="w-6 h-6 rounded cursor-pointer border border-border p-0.5 shrink-0" />
                            <Input value={editSubNombre} onChange={e => setEditSubNombre(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") handleSaveSubArea(sub.id);
                                if (e.key === "Escape") setEditingSubId(null);
                              }}
                              className="h-6 text-xs flex-1" autoFocus />
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600"
                              onClick={() => handleSaveSubArea(sub.id)}><Check className="w-3 h-3" /></Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                              onClick={() => setEditingSubId(null)}><X className="w-3 h-3" /></Button>
                          </div>
                        ) : (
                          <>
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: sub.color }} />
                            <Layers className="w-3 h-3 text-muted-foreground shrink-0" />
                            {readonly ? (
                              <span className="text-xs flex-1">{sub.nombre}</span>
                            ) : (
                              <button
                                className="text-xs flex-1 text-left hover:text-primary transition-colors"
                                onClick={() => {
                                  setEditingSubId(sub.id);
                                  setEditSubNombre(sub.nombre);
                                  setEditSubColor(sub.color);
                                }}>
                                {sub.nombre}
                              </button>
                            )}
                            {!readonly && (
                              <Button variant="ghost" size="sm"
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteSubArea(sub.id)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    ))}

                    {subs.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        Sin sub-áreas. Agregá la primera.
                      </p>
                    )}
                  </div>

                  {!readonly && (
                    <div className="flex gap-2 pt-1">
                      <input
                        type="color"
                        value={newSubColor[area.id] || area.color}
                        onChange={e => setNewSubColor(p => ({ ...p, [area.id]: e.target.value }))}
                        className="w-7 h-7 rounded cursor-pointer border border-border p-0.5 shrink-0"
                        title="Color de la sub-área"
                      />
                      <Input
                        placeholder="Nombre de la sub-área..."
                        value={newSubNombre[area.id] || ""}
                        onChange={e => setNewSubNombre(p => ({ ...p, [area.id]: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && handleAddSubArea(area.id)}
                        className="h-7 text-xs flex-1"
                      />
                      <Button size="sm" className="h-7 gap-1 text-xs"
                        onClick={() => handleAddSubArea(area.id)}
                        disabled={!newSubNombre[area.id]?.trim()}>
                        <Plus className="w-3 h-3" />Agregar
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {areas.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay áreas. Creá la primera.
          </p>
        )}
      </div>
    </div>
  );
}

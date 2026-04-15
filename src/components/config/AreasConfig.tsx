import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAreasEmpresa } from "@/hooks/useSharedQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

export function AreasConfig({ readonly = false }: { readonly?: boolean }) {
  const queryClient = useQueryClient();
  const { data: areas = [] } = useAreasEmpresa();

  const [creating,     setCreating]     = useState(false);
  const [newNombre,    setNewNombre]    = useState("");
  const [newColor,     setNewColor]     = useState("#6366f1");
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editNombre,   setEditNombre]   = useState("");
  const [editColor,    setEditColor]    = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["areas_empresa"] });

  const handleCreate = async () => {
    if (!newNombre.trim()) return;
    const { error } = await (supabase as any)
      .from("areas_empresa").insert({ nombre: newNombre.trim(), color: newColor });
    if (error) { toast.error(error.message); return; }
    invalidate();
    setCreating(false); setNewNombre(""); setNewColor("#6366f1");
    toast.success("Área creada");
  };

  const handleSave = async (id: string) => {
    if (!editNombre.trim()) { setEditingId(null); return; }
    const { error } = await (supabase as any)
      .from("areas_empresa").update({ nombre: editNombre.trim(), color: editColor }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidate(); setEditingId(null);
    toast.success("Área actualizada");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta área?")) return;
    const { error } = await (supabase as any).from("areas_empresa").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidate();
    toast.success("Área eliminada");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{areas.length} área{areas.length !== 1 ? "s" : ""} configurada{areas.length !== 1 ? "s" : ""}</p>
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
          <Input placeholder="Nombre del área *" value={newNombre} onChange={e => setNewNombre(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            className="h-8 text-xs flex-1" autoFocus />
          <Button size="sm" className="h-8 text-xs" disabled={!newNombre.trim()} onClick={handleCreate}>Crear</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setCreating(false)}>Cancelar</Button>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {areas.map((area: any) => (
          <div key={area.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
            {editingId === area.id ? (
              <>
                <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-border p-0.5 shrink-0" />
                <Input value={editNombre} onChange={e => setEditNombre(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSave(area.id); if (e.key === "Escape") setEditingId(null); }}
                  className="h-8 text-xs flex-1" autoFocus />
                <Button size="sm" variant="ghost" aria-label="Guardar" className="h-7 w-7 p-0 text-green-600"
                  onClick={() => handleSave(area.id)}><Check className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" aria-label="Cancelar" className="h-7 w-7 p-0"
                  onClick={() => setEditingId(null)}><X className="w-3.5 h-3.5" /></Button>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-lg shrink-0" style={{ backgroundColor: area.color }} />
                <p className="text-sm font-medium flex-1">{area.nombre}</p>
                {!readonly && (
                  <>
                    <Button variant="ghost" size="sm" aria-label="Editar área" className="h-7 w-7 p-0"
                      onClick={() => { setEditingId(area.id); setEditNombre(area.nombre); setEditColor(area.color); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" aria-label="Eliminar área" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(area.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

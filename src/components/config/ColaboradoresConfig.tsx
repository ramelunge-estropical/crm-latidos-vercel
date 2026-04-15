import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAllColaboradores, useAreasEmpresa } from "@/hooks/useSharedQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ROL_CONFIG: Record<string, { label: string; className: string }> = {
  admin:       { label: "Admin",       className: "bg-red-500/10 text-red-600 border-red-300" },
  gerente:     { label: "Gerente",     className: "bg-amber-500/10 text-amber-600 border-amber-300" },
  colaborador: { label: "Colaborador", className: "bg-primary/10 text-primary border-primary/30" },
  viewer:      { label: "Viewer",      className: "bg-muted text-muted-foreground border-border" },
};

const EMPTY_FORM = { nombre: "", email: "", cargo: "", area_id: "", color: "#6366f1", rol: "colaborador" };

export function ColaboradoresConfig() {
  const queryClient = useQueryClient();
  const { data: colaboradores = [] } = useAllColaboradores();
  const { data: areas = [] }         = useAreasEmpresa();

  const [showForm,  setShowForm]  = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form,      setForm]      = useState({ ...EMPTY_FORM });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    queryClient.invalidateQueries({ queryKey: ["colaboradores-all"] });
  };
  const setField   = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const openCreate = () => { setForm({ ...EMPTY_FORM }); setEditingId(null); setShowForm(true); };
  const openEdit   = (c: any) => {
    setForm({ nombre: c.nombre, email: c.email || "", cargo: c.cargo || "", area_id: c.area_id || "", color: c.color, rol: c.rol || "colaborador" });
    setEditingId(c.id); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) return;
    const payload = {
      nombre: form.nombre.trim(), email: form.email.trim() || null,
      cargo: form.cargo.trim() || null, area_id: form.area_id || null,
      color: form.color, rol: form.rol,
    };
    if (editingId) {
      const { error } = await (supabase as any).from("colaboradores").update(payload).eq("id", editingId);
      if (error) { toast.error(error.message); return; }
      toast.success("Colaborador actualizado");
    } else {
      const { error } = await (supabase as any).from("colaboradores").insert({ ...payload, activo: true });
      if (error) { toast.error(error.message); return; }
      toast.success("Colaborador creado");
    }
    invalidate(); setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este colaborador?")) return;
    const { error } = await (supabase as any).from("colaboradores").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidate(); toast.success("Colaborador eliminado");
  };

  const handleToggleActivo = async (id: string, activo: boolean) => {
    await (supabase as any).from("colaboradores").update({ activo: !activo }).eq("id", id);
    invalidate();
  };

  const handleRolChange = async (id: string, rol: string) => {
    await (supabase as any).from("colaboradores").update({ rol }).eq("id", id);
    invalidate();
    toast.success("Rol actualizado");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{colaboradores.length} colaborador{colaboradores.length !== 1 ? "es" : ""}</p>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" />Nuevo colaborador
        </Button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{editingId ? "Editar colaborador" : "Nuevo colaborador"}</p>
            <Button variant="ghost" size="sm" aria-label="Cerrar" className="h-7 w-7 p-0" onClick={() => setShowForm(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Nombre *" value={form.nombre} onChange={e => setField("nombre", e.target.value)} className="h-8 text-xs" autoFocus />
            <Input placeholder="Email" value={form.email} onChange={e => setField("email", e.target.value)} className="h-8 text-xs" />
            <Input placeholder="Cargo" value={form.cargo} onChange={e => setField("cargo", e.target.value)} className="h-8 text-xs" />
            <Select value={form.area_id || "__none__"} onValueChange={v => setField("area_id", v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Área" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs">Sin área</SelectItem>
                {areas.map((a: any) => <SelectItem key={a.id} value={a.id} className="text-xs">{a.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.rol} onValueChange={v => setField("rol", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Rol" /></SelectTrigger>
              <SelectContent>
                {Object.entries(ROL_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key} className="text-xs">{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Color</label>
              <input type="color" value={form.color} onChange={e => setField("color", e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-border p-0.5" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" disabled={!form.nombre.trim()} onClick={handleSave}>
              {editingId ? "Guardar" : "Crear"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Colaborador</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Cargo / Área</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Rol</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Activo</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {colaboradores.map((c: any) => {
              const rolCfg = ROL_CONFIG[c.rol] || ROL_CONFIG.colaborador;
              const area   = areas.find((a: any) => a.id === c.area_id);
              return (
                <tr key={c.id} className={cn("border-b border-border last:border-0 transition-colors", !c.activo && "opacity-50")}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex w-7 h-7 rounded-full items-center justify-center text-white text-[11px] font-bold shrink-0"
                        style={{ backgroundColor: c.color }}>
                        {c.nombre.charAt(0)}
                      </span>
                      <div>
                        <p className="font-medium text-foreground">{c.nombre}</p>
                        {c.email && <p className="text-[10px] text-muted-foreground">{c.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    <p>{c.cargo || "—"}</p>
                    {area && <p className="text-[10px]" style={{ color: area.color }}>{area.nombre}</p>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Select value={c.rol || "colaborador"} onValueChange={v => handleRolChange(c.id, v)}>
                      <SelectTrigger className={cn("h-6 w-[110px] text-[10px] border", rolCfg.className)}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ROL_CONFIG).map(([key, cfg]) => (
                          <SelectItem key={key} value={key} className="text-xs">{cfg.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Switch checked={c.activo} onCheckedChange={() => handleToggleActivo(c.id, c.activo)} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="sm" aria-label="Editar" className="h-6 w-6 p-0" onClick={() => openEdit(c)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" aria-label="Eliminar" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

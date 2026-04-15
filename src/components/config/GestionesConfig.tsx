import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGestionTipos, useGestionSubtipos } from "@/hooks/useSharedQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronRight, Tag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ESTADOS = [
  { valor: "to_do",  label: "Por hacer",  className: "bg-muted text-muted-foreground border-border" },
  { valor: "doing",  label: "En proceso", className: "bg-amber-500/10 text-amber-600 border-amber-200" },
  { valor: "review", label: "Revisión",   className: "bg-violet-500/10 text-violet-600 border-violet-200" },
  { valor: "done",   label: "Finalizado", className: "bg-emerald-500/10 text-emerald-600 border-emerald-200" },
];

export function GestionesConfig({ readonly = false }: { readonly?: boolean }) {
  const queryClient = useQueryClient();
  const { data: tipos    = [] } = useGestionTipos();
  const { data: subtipos = [] } = useGestionSubtipos();

  const [expandedId,       setExpandedId]       = useState<string | null>(null);
  const [creatingTipo,     setCreatingTipo]     = useState(false);
  const [newNombre,        setNewNombre]        = useState("");
  const [newValor,         setNewValor]         = useState("");
  const [newColor,         setNewColor]         = useState("#6366f1");
  const [editingTipoId,    setEditingTipoId]    = useState<string | null>(null);
  const [editNombre,       setEditNombre]       = useState("");
  const [editColor,        setEditColor]        = useState("");
  const [newSubtipoName,   setNewSubtipoName]   = useState<Record<string, string>>({});
  const [editingSubtipoId, setEditingSubtipoId] = useState<string | null>(null);
  const [editSubtipoName,  setEditSubtipoName]  = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["gestion-tipos"] });
    queryClient.invalidateQueries({ queryKey: ["gestion-subtipos"] });
  };

  const subtipesFor = (tipoId: string) =>
    subtipos.filter(s => s.tipo_id === tipoId).sort((a, b) => a.orden - b.orden);

  // ── Tipos CRUD ───────────────────────────────────────────
  const handleCreateTipo = async () => {
    const nombre = newNombre.trim();
    if (!nombre) return;
    const valor  = newValor.trim() || nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
    const orden  = tipos.length;
    const { error } = await (supabase as any)
      .from("gestion_tipos").insert({ nombre, valor, color: newColor, orden });
    if (error) { toast.error(error.message); return; }
    invalidate();
    setCreatingTipo(false); setNewNombre(""); setNewValor(""); setNewColor("#6366f1");
    toast.success("Tipo creado");
  };

  const handleSaveTipo = async (id: string) => {
    if (!editNombre.trim()) { setEditingTipoId(null); return; }
    await (supabase as any).from("gestion_tipos")
      .update({ nombre: editNombre.trim(), color: editColor }).eq("id", id);
    invalidate(); setEditingTipoId(null);
    toast.success("Tipo actualizado");
  };

  const handleDeleteTipo = async (id: string) => {
    if (!confirm("¿Eliminar este tipo? Se eliminarán todos sus subtipos.")) return;
    const { error } = await (supabase as any).from("gestion_tipos").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    invalidate(); toast.success("Tipo eliminado");
  };

  // ── Subtipos CRUD ────────────────────────────────────────
  const handleAddSubtipo = async (tipoId: string) => {
    const nombre = newSubtipoName[tipoId]?.trim();
    if (!nombre) return;
    const subs  = subtipesFor(tipoId);
    const orden = subs.length > 0 ? Math.max(...subs.map(s => s.orden)) + 1 : 0;
    const { error } = await (supabase as any)
      .from("gestion_subtipos").insert({ tipo_id: tipoId, nombre, orden });
    if (error) { toast.error(error.message); return; }
    invalidate();
    setNewSubtipoName(p => ({ ...p, [tipoId]: "" }));
    toast.success("Subtipo agregado");
  };

  const handleSaveSubtipo = async (id: string) => {
    if (!editSubtipoName.trim()) { setEditingSubtipoId(null); return; }
    await (supabase as any).from("gestion_subtipos")
      .update({ nombre: editSubtipoName.trim() }).eq("id", id);
    invalidate(); setEditingSubtipoId(null);
  };

  const handleDeleteSubtipo = async (id: string) => {
    await (supabase as any).from("gestion_subtipos").delete().eq("id", id);
    invalidate();
  };

  return (
    <div className="space-y-6">

      {/* ── Estados globales ── */}
      <div>
        <p className="text-sm font-semibold mb-3">Estados globales</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ESTADOS.map(e => (
            <div key={e.valor}
              className={cn("px-3 py-2.5 rounded-lg text-xs font-medium text-center border", e.className)}>
              {e.label}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Los estados son fijos y se comparten en todos los procesos y gestiones.
        </p>
      </div>

      <div className="border-t border-border" />

      {/* ── Tipos de gestión ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">
            {tipos.length} tipo{tipos.length !== 1 ? "s" : ""} de gestión
          </p>
          {!readonly && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreatingTipo(true)}>
              <Plus className="w-3.5 h-3.5" />Nuevo tipo
            </Button>
          )}
        </div>

        {/* Form nuevo tipo */}
        {!readonly && creatingTipo && (
          <div className="mb-3 p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
            <p className="text-sm font-medium">Nuevo tipo de gestión</p>
            <div className="flex gap-2 items-center">
              <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-border p-0.5 shrink-0" />
              <Input placeholder="Nombre *" value={newNombre}
                onChange={e => setNewNombre(e.target.value)}
                className="h-8 text-xs flex-1" autoFocus />
              <Input placeholder="Valor técnico (ej: comercial)" value={newValor}
                onChange={e => setNewValor(e.target.value)}
                className="h-8 text-xs w-44" />
            </div>
            <p className="text-[10px] text-muted-foreground">
              El valor se genera automáticamente si no lo completás.
              Debe coincidir con el campo <span className="font-mono">type</span> de las gestiones.
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" disabled={!newNombre.trim()} onClick={handleCreateTipo}>Crear</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreatingTipo(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        {/* Lista de tipos */}
        <div className="space-y-2">
          {tipos.map((tipo) => {
            const subs   = subtipesFor(tipo.id);
            const isOpen = expandedId === tipo.id;
            return (
              <div key={tipo.id} className="border border-border rounded-xl overflow-hidden">

                {/* Header tipo */}
                <div className="flex items-center gap-3 px-4 py-3 bg-card">
                  <button
                    onClick={() => setExpandedId(isOpen ? null : tipo.id)}
                    className="flex items-center gap-2 flex-1 text-left">
                    <span className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: tipo.color }} />

                    {editingTipoId === tipo.id ? (
                      <div className="flex items-center gap-1.5 flex-1" onClick={e => e.stopPropagation()}>
                        <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)}
                          className="w-7 h-7 rounded cursor-pointer border border-border p-0.5 shrink-0" />
                        <Input value={editNombre} onChange={e => setEditNombre(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleSaveTipo(tipo.id); if (e.key === "Escape") setEditingTipoId(null); }}
                          className="h-7 text-sm flex-1" autoFocus />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600"
                          onClick={() => handleSaveTipo(tipo.id)}><Check className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => setEditingTipoId(null)}><X className="w-3.5 h-3.5" /></Button>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{tipo.nombre}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">{tipo.valor}</p>
                      </div>
                    )}

                    <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                      {subs.length} subtipo{subs.length !== 1 ? "s" : ""}
                    </span>
                    {isOpen
                      ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </button>

                  {!readonly && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                        onClick={() => { setEditingTipoId(tipo.id); setEditNombre(tipo.nombre); setEditColor(tipo.color); }}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteTipo(tipo.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Subtipos expandibles */}
                {isOpen && (
                  <div className="border-t border-border bg-muted/20 p-4 space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Subtipos</p>

                    <div className="space-y-1.5">
                      {subs.map(sub => (
                        <div key={sub.id}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border">
                          {editingSubtipoId === sub.id ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              <Input value={editSubtipoName} onChange={e => setEditSubtipoName(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleSaveSubtipo(sub.id); if (e.key === "Escape") setEditingSubtipoId(null); }}
                                className="h-6 text-xs flex-1" autoFocus />
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600"
                                onClick={() => handleSaveSubtipo(sub.id)}><Check className="w-3 h-3" /></Button>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                                onClick={() => setEditingSubtipoId(null)}><X className="w-3 h-3" /></Button>
                            </div>
                          ) : (
                            <>
                              <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
                              {readonly ? (
                                <span className="text-xs flex-1">{sub.nombre}</span>
                              ) : (
                                <button className="text-xs flex-1 text-left hover:text-primary transition-colors"
                                  onClick={() => { setEditingSubtipoId(sub.id); setEditSubtipoName(sub.nombre); }}>
                                  {sub.nombre}
                                </button>
                              )}
                              {!readonly && (
                                <Button variant="ghost" size="sm"
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteSubtipo(sub.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                      {subs.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-1">
                          Sin subtipos. Agregá el primero.
                        </p>
                      )}
                    </div>

                    {!readonly && (
                      <div className="flex gap-2 pt-1">
                        <Input
                          placeholder="Nombre del subtipo..."
                          value={newSubtipoName[tipo.id] || ""}
                          onChange={e => setNewSubtipoName(p => ({ ...p, [tipo.id]: e.target.value }))}
                          onKeyDown={e => e.key === "Enter" && handleAddSubtipo(tipo.id)}
                          className="h-7 text-xs flex-1"
                        />
                        <Button size="sm" className="h-7 gap-1 text-xs"
                          onClick={() => handleAddSubtipo(tipo.id)}
                          disabled={!newSubtipoName[tipo.id]?.trim()}>
                          <Plus className="w-3 h-3" />Agregar
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {tipos.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay tipos de gestión. Creá el primero.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

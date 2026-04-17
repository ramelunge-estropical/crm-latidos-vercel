import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useColaboradores, useAreasEmpresa, useSubAreasEmpresa,
  useProcesses, useAllStages, useProcessAreas, useProcessSubAreas, useClientes,
} from "@/hooks/useSharedQueries";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColaboradorCombobox } from "@/components/ui/ColaboradorCombobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Search, X as XIcon, Building2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const NO_AREA = "__none__";

interface GestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omitir para habilitar el selector de proceso interno */
  processId?: string;
  stageId?: string;
  gestion?: {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    due_date: string | null;
    owner_id: string | null;
    stage_id: string;
    responsable_nombre: string | null;
    responsable_id?: string | null;
    type: string | null;
    subtype: string | null;
    area_id?: string | null;
    cliente_nombre?: string | null;
    cliente_id?: string | null;
  } | null;
}

const GESTION_TYPES = [
  { value: "comercial", label: "Comercial" },
  { value: "proyecto",  label: "Proyecto"  },
  { value: "operativa", label: "Operativa" },
  { value: "caso",      label: "Caso"      },
];

const SUBTYPES: Record<string, string[]> = {
  comercial: ["Lead", "Oportunidad", "Renovación", "Upsell"],
  proyecto:  ["Implementación", "Migración", "Desarrollo", "Consultoría"],
  operativa: ["Tarea", "Mantenimiento", "Proceso", "Auditoría"],
  caso:      ["Incidencia", "Reclamo", "Consulta", "Solicitud"],
};

export function GestionDialog({ open, onOpenChange, processId, stageId, gestion }: GestionDialogProps) {
  const isEdit = !!gestion;
  const queryClient = useQueryClient();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [title,       setTitle]       = useState(gestion?.title || "");
  const [description, setDescription] = useState(gestion?.description || "");
  const [priority,    setPriority]    = useState(gestion?.priority || "medium");
  const [gestionType, setGestionType] = useState(gestion?.type || "operativa");
  const [subtype,     setSubtype]     = useState(gestion?.subtype || "");
  const [dueDate,     setDueDate]     = useState<Date | undefined>(
    gestion?.due_date ? new Date(gestion.due_date) : undefined
  );
  const [loading, setLoading] = useState(false);

  // Responsable — defaults to the currently selected user in MisGestiones
  const [responsableId, setResponsableId] = useState<string>(() => {
    if (gestion?.responsable_id) return gestion.responsable_id;
    return localStorage.getItem("mis_gestiones_colaborador") || NO_AREA;
  });

  // ── Process selection (when processId not provided from outside) ─────────
  const [areaId,            setAreaId]            = useState(gestion?.area_id || NO_AREA);
  const [subAreaId,         setSubAreaId]         = useState("");
  const [selectedProcessId, setSelectedProcessId] = useState("");
  const [selectedStageId,   setSelectedStageId]   = useState("");

  // ── Client selection from DB ─────────────────────────────────────────────
  const [clienteId,     setClienteId]     = useState<string | null>(gestion?.cliente_id || null);
  const [clienteNombre, setClienteNombre] = useState(gestion?.cliente_nombre || "");
  const [clienteSearch, setClienteSearch] = useState("");
  const [showClienteDrop, setShowClienteDrop] = useState(false);
  const clienteInputRef = useRef<HTMLInputElement>(null);

  // ── Data hooks ────────────────────────────────────────────────────────────
  const { data: areas        = [] } = useAreasEmpresa();
  const { data: allSubAreas  = [] } = useSubAreasEmpresa();
  const { data: processAreas = [] } = useProcessAreas();
  const { data: processSubs  = [] } = useProcessSubAreas();
  const { data: processes    = [] } = useProcesses();
  const { data: allStages    = [] } = useAllStages();
  const { data: colaboradores = [] } = useColaboradores();
  const { data: clientes     = [] } = useClientes();

  // ── Derived: area/sub-area/process selectors ──────────────────────────────
  const subAreasForArea = allSubAreas.filter(sa =>
    areaId !== NO_AREA ? sa.area_id === areaId : false
  );

  const processesForSelection = processes.filter(p => {
    if (areaId === NO_AREA) return true; // no area filter → show all
    const inArea = processAreas.some(pa => pa.process_id === p.id && pa.area_id === areaId);
    if (!inArea) return false;
    if (subAreaId) {
      return processSubs.some(ps => ps.process_id === p.id && ps.sub_area_id === subAreaId);
    }
    return true;
  });

  const stagesForProcess = allStages
    .filter(s => s.process_id === selectedProcessId)
    .sort((a: any, b: any) => a.order - b.order);

  // ── Derived: client search results ────────────────────────────────────────
  const filteredClientes = clienteSearch.length >= 2
    ? clientes.filter(c => {
        const q = clienteSearch.toLowerCase();
        return (
          c.nombre_completo.toLowerCase().includes(q) ||
          c.razon_social?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.telefono?.includes(clienteSearch) ||
          c.documento_numero?.includes(clienteSearch) ||   // búsqueda por CI
          c.nit?.includes(clienteSearch)                    // búsqueda por NIT
        );
      }).slice(0, 8)
    : [];

  // ── Effects ──────────────────────────────────────────────────────────────
  // Auto-select first stage when process changes
  useEffect(() => {
    if (!processId && selectedProcessId) {
      const first = stagesForProcess[0];
      setSelectedStageId(first?.id || "");
    }
  }, [selectedProcessId]);

  // Reset sub-area + process when area changes
  useEffect(() => {
    setSubAreaId("");
    setSelectedProcessId("");
    setSelectedStageId("");
  }, [areaId]);

  // Reset process when sub-area changes
  useEffect(() => {
    setSelectedProcessId("");
    setSelectedStageId("");
  }, [subAreaId]);

  // Reset selectors on close
  useEffect(() => {
    if (!open) {
      setSelectedProcessId("");
      setSelectedStageId("");
      setSubAreaId("");
      setClienteSearch("");
      setShowClienteDrop(false);
    }
  }, [open]);

  // Sync fields when editing
  useEffect(() => {
    if (gestion) {
      setTitle(gestion.title || "");
      setDescription(gestion.description || "");
      setPriority(gestion.priority || "medium");
      setResponsableId(gestion.responsable_id || localStorage.getItem("mis_gestiones_colaborador") || NO_AREA);
      setGestionType(gestion.type || "operativa");
      setSubtype(gestion.subtype || "");
      setAreaId(gestion.area_id || NO_AREA);
      setClienteId(gestion.cliente_id || null);
      setClienteNombre(gestion.cliente_nombre || "");
      setDueDate(gestion.due_date ? new Date(gestion.due_date) : undefined);
    }
  }, [gestion]);

  // ── Computed resolution ───────────────────────────────────────────────────
  const resolvedProcessId = processId || selectedProcessId;
  const resolvedStageId   = stageId || selectedStageId || gestion?.stage_id || "";
  const resolvedAreaId    = areaId !== NO_AREA ? areaId : null;

  // ── Invalidation ─────────────────────────────────────────────────────────
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["gestiones"] });
    queryClient.invalidateQueries({ queryKey: ["mis-gestiones"] });
    queryClient.invalidateQueries({ queryKey: ["gestiones-type"] });
    queryClient.invalidateQueries({ queryKey: ["gestiones_cliente"] });
    queryClient.invalidateQueries({ queryKey: ["gestion-detail"] });
    if (clienteId) {
      queryClient.invalidateQueries({ queryKey: ["gestiones_cliente_id", clienteId] });
    }
  };

  const resetForm = () => {
    setTitle(""); setDescription(""); setPriority("medium");
    setResponsableId(localStorage.getItem("mis_gestiones_colaborador") || NO_AREA);
    setGestionType("operativa"); setSubtype(""); setAreaId(NO_AREA);
    setClienteId(null); setClienteNombre(""); setClienteSearch("");
    setDueDate(undefined); setSubAreaId(""); setSelectedProcessId(""); setSelectedStageId("");
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!title.trim())        { toast.error("El título es requerido");         return; }
    if (!resolvedProcessId)   { toast.error("Seleccioná un proceso");          return; }
    if (!resolvedStageId)     { toast.error("No se encontró etapa del proceso"); return; }
    setLoading(true);
    try {
      const selectedColab = colaboradores.find(c => c.id === responsableId);
      const payload: any = {
        title:              title.trim(),
        description:        description.trim() || null,
        priority,
        due_date:           dueDate ? format(dueDate, "yyyy-MM-dd") : null,
        responsable_id:     responsableId === NO_AREA ? null : responsableId,
        responsable_nombre: selectedColab?.nombre || null,
        type:               gestionType,
        subtype:            subtype || null,
        process_id:         resolvedProcessId,
        stage_id:           resolvedStageId,
        area_id:            resolvedAreaId,
        cliente_id:         clienteId || null,
        cliente_nombre:     clienteNombre || null,
      };

      if (isEdit) {
        const { error } = await (supabase as any).from("gestiones").update(payload).eq("id", gestion!.id);
        if (error) throw error;
        toast.success("Gestión actualizada");
      } else {
        const { error } = await (supabase as any).from("gestiones").insert(payload);
        if (error) throw error;
        toast.success("Gestión creada");
      }

      invalidateAll();
      onOpenChange(false);
      if (!isEdit) resetForm();
    } catch (err: any) {
      toast.error(err.message || "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!gestion) return;
    setLoading(true);
    try {
      const { error } = await (supabase as any).from("gestiones").delete().eq("id", gestion.id);
      if (error) throw error;
      toast.success("Gestión eliminada");
      invalidateAll();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar");
    } finally {
      setLoading(false);
    }
  };

  const currentSubtypes = SUBTYPES[gestionType] || [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar gestión" : "Nueva gestión"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* ── Proceso (solo cuando no viene de un board) ── */}
          {!processId && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Proceso</p>

              {/* Área */}
              <div>
                <Label className="text-xs">Área *</Label>
                <Select value={areaId} onValueChange={setAreaId}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue placeholder="Seleccioná un área" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_AREA} className="text-xs">Todas las áreas</SelectItem>
                    {areas.map(a => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">{a.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sub-área (solo si el área tiene sub-áreas) */}
              {subAreasForArea.length > 0 && (
                <div>
                  <Label className="text-xs">Sub-área</Label>
                  <Select value={subAreaId || NO_AREA} onValueChange={v => setSubAreaId(v === NO_AREA ? "" : v)}>
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue placeholder="Todas las sub-áreas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_AREA} className="text-xs">Todas</SelectItem>
                      {subAreasForArea.map(sa => (
                        <SelectItem key={sa.id} value={sa.id} className="text-xs">{sa.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Proceso */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Proceso *</Label>
                  <Select value={selectedProcessId} onValueChange={setSelectedProcessId}>
                    <SelectTrigger className="h-8 text-xs mt-1" disabled={processesForSelection.length === 0}>
                      <SelectValue placeholder={processesForSelection.length === 0 ? "Sin procesos" : "Seleccioná"} />
                    </SelectTrigger>
                    <SelectContent>
                      {processesForSelection.map((p: any) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Etapa inicial</Label>
                  <Select
                    value={selectedStageId}
                    onValueChange={setSelectedStageId}
                    disabled={!selectedProcessId}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue placeholder={selectedProcessId ? "Seleccioná" : "—"} />
                    </SelectTrigger>
                    <SelectContent>
                      {stagesForProcess.map((s: any) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* ── Área (solo cuando viene de un board y hay áreas disponibles) ── */}
          {processId && (
            <div>
              <Label>Área</Label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Sin área" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_AREA}>Sin área</SelectItem>
                  {areas.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Título ── */}
          <div>
            <Label htmlFor="g-title">Título *</Label>
            <Input
              id="g-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Título de la gestión"
              className="mt-1"
            />
          </div>

          {/* ── Descripción ── */}
          <div>
            <Label htmlFor="g-desc">Descripción</Label>
            <Textarea
              id="g-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Descripción..."
              rows={2}
              className="mt-1"
            />
          </div>

          {/* ── Tipo + Subtipo ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={gestionType} onValueChange={v => { setGestionType(v); setSubtype(""); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GESTION_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subtipo</Label>
              <Select value={subtype || "ninguno"} onValueChange={v => setSubtype(v === "ninguno" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Sin subtipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Sin subtipo</SelectItem>
                  {currentSubtypes.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Cliente (búsqueda desde BD) ── */}
          <div>
            <Label>Cliente</Label>
            <div className="relative mt-1">
              {clienteId ? (
                /* Cliente seleccionado — mostrar chip con botón para quitar */
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-primary/5 text-xs">
                  <span className="flex-1 font-medium text-foreground">{clienteNombre}</span>
                  <button
                    type="button"
                    onClick={() => { setClienteId(null); setClienteNombre(""); setClienteSearch(""); }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                /* Buscador */
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={clienteInputRef}
                    value={clienteSearch}
                    onChange={e => { setClienteSearch(e.target.value); setShowClienteDrop(true); }}
                    onFocus={() => setShowClienteDrop(true)}
                    onBlur={() => setTimeout(() => setShowClienteDrop(false), 150)}
                    placeholder="Buscar cliente por nombre, email o teléfono…"
                    className="pl-8 h-8 text-xs"
                  />
                  {showClienteDrop && (clienteSearch.length >= 2) && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {filteredClientes.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados para "{clienteSearch}"</p>
                      ) : filteredClientes.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => {
                            setClienteId(c.id);
                            setClienteNombre(c.razon_social ?? c.nombre_completo);
                            setClienteSearch("");
                            setShowClienteDrop(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left transition-colors"
                        >
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-primary">
                            {c.tipo_cliente === "juridica"
                              ? <Building2 className="w-3 h-3" />
                              : c.nombre_completo.charAt(0).toUpperCase()
                            }
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">
                              {c.tipo_cliente === "juridica" ? (c.razon_social ?? c.nombre_completo) : c.nombre_completo}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {c.tipo_cliente === "juridica"
                                ? (c.nit ? `NIT: ${c.nit}` : c.email ?? "Empresa")
                                : (c.documento_numero ? `CI: ${c.documento_numero}` : (c.email ?? c.telefono ?? "Sin contacto"))
                              }
                            </p>
                          </div>
                          {c.tipo_cliente === "juridica"
                            ? <Building2 className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            : <User className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          }
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Opcional — asocia la gestión a un cliente existente</p>
          </div>

          {/* ── Prioridad + Fecha límite ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prioridad</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgente</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Media</SelectItem>
                  <SelectItem value="low">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha límite</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal mt-1 h-10", !dueDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "dd MMM yyyy", { locale: es }) : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* ── Responsable ── */}
          <div>
            <Label>Responsable</Label>
            <ColaboradorCombobox
              value={responsableId}
              onValueChange={setResponsableId}
              colaboradores={colaboradores}
              emptyLabel="Sin asignar"
              placeholder="Sin asignar"
              triggerClassName="w-full mt-1"
            />
          </div>

          {/* ── Botones ── */}
          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSubmit}
              disabled={!title.trim() || loading}
              className="flex-1"
            >
              {loading ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear gestión"}
            </Button>
            {isEdit && (
              <Button variant="destructive" onClick={handleDelete} disabled={loading}>
                Eliminar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

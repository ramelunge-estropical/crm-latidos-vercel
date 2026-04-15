import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useColaboradores, useAreasEmpresa } from "@/hooks/useSharedQueries";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColaboradorCombobox } from "@/components/ui/ColaboradorCombobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Valor centinela para "sin área" — Radix no permite value=""
const NO_AREA = "__none__";

interface GestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processId: string;
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
    type: string | null;
    subtype: string | null;
    area_id?: string | null;
    cliente_nombre?: string | null;
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

  const [title,           setTitle]           = useState(gestion?.title || "");
  const [description,     setDescription]     = useState(gestion?.description || "");
  const [priority,        setPriority]        = useState(gestion?.priority || "medium");
  const [responsableId,   setResponsableId]   = useState((gestion as any)?.responsable_id || NO_AREA);
  const [gestionType,     setGestionType]     = useState(gestion?.type || "operativa");
  const [subtype,         setSubtype]         = useState(gestion?.subtype || "");
  const [areaId,          setAreaId]          = useState(gestion?.area_id || NO_AREA);
  const [clienteNombre,   setClienteNombre]   = useState(gestion?.cliente_nombre || "");
  const [dueDate,         setDueDate]         = useState<Date | undefined>(
    gestion?.due_date ? new Date(gestion.due_date) : undefined
  );
  const [loading, setLoading] = useState(false);

  // Invalida todas las vistas que muestran gestiones
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["gestiones"] });
    queryClient.invalidateQueries({ queryKey: ["mis-gestiones"] });
    queryClient.invalidateQueries({ queryKey: ["gestiones-type"] });
    queryClient.invalidateQueries({ queryKey: ["gestiones_cliente"] });
    queryClient.invalidateQueries({ queryKey: ["gestion-detail"] });
  };

  useEffect(() => {
    if (gestion) {
      setTitle(gestion.title || "");
      setDescription(gestion.description || "");
      setPriority(gestion.priority || "medium");
      setResponsableId((gestion as any)?.responsable_id || NO_AREA);
      setGestionType(gestion.type || "operativa");
      setSubtype(gestion.subtype || "");
      setAreaId(gestion.area_id || NO_AREA);
      setClienteNombre(gestion.cliente_nombre || "");
      setDueDate(gestion.due_date ? new Date(gestion.due_date) : undefined);
    }
  }, [gestion]);

  const { data: areas = [] }         = useAreasEmpresa();
  const { data: colaboradores = [] } = useColaboradores();

  const currentSubtypes = SUBTYPES[gestionType] || [];

  const resetForm = () => {
    setTitle(""); setDescription(""); setPriority("medium"); setResponsableId(NO_AREA);
    setGestionType("operativa"); setSubtype(""); setAreaId(NO_AREA);
    setClienteNombre(""); setDueDate(undefined);
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
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
        process_id:         processId,
        stage_id:           gestion?.stage_id || stageId!,
        area_id:            areaId === NO_AREA ? null : areaId,
        cliente_nombre:     clienteNombre.trim() || null,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar gestión" : "Nueva gestión"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">

          <div>
            <Label htmlFor="g-title">Título *</Label>
            <Input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título de la gestión" />
          </div>

          <div>
            <Label htmlFor="g-desc">Descripción</Label>
            <Textarea id="g-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción..." rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={gestionType} onValueChange={(v) => { setGestionType(v); setSubtype(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GESTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subtipo</Label>
              <Select value={subtype || "ninguno"} onValueChange={(v) => setSubtype(v === "ninguno" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Sin subtipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Sin subtipo</SelectItem>
                  {currentSubtypes.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Área</Label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger><SelectValue placeholder="Sin área" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_AREA}>Sin área</SelectItem>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="g-cliente">Cliente</Label>
              <Input id="g-cliente" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Nombre del cliente" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prioridad</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "dd MMM yyyy", { locale: es }) : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div>
            <Label>Responsable</Label>
            <ColaboradorCombobox
              value={responsableId}
              onValueChange={setResponsableId}
              colaboradores={colaboradores}
              emptyLabel="Sin asignar"
              placeholder="Sin asignar"
              triggerClassName="w-full"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={!title.trim() || loading} className="flex-1">
              {loading ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear gestión"}
            </Button>
            {isEdit && (
              <Button variant="destructive" onClick={handleDelete} disabled={loading}>Eliminar</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

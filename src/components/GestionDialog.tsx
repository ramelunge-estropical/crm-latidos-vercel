import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
  } | null;
}

export function GestionDialog({ open, onOpenChange, processId, stageId, gestion }: GestionDialogProps) {
  const isEdit = !!gestion;
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(gestion?.title || "");
  const [description, setDescription] = useState(gestion?.description || "");
  const [priority, setPriority] = useState(gestion?.priority || "medium");
  const [responsable, setResponsable] = useState(gestion?.responsable_nombre || "");
  const [dueDate, setDueDate] = useState<Date | undefined>(
    gestion?.due_date ? new Date(gestion.due_date) : undefined
  );
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setResponsable("");
    setDueDate(undefined);
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        priority: priority as any,
        due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
        responsable_nombre: responsable.trim() || null,
        process_id: processId,
        stage_id: gestion?.stage_id || stageId!,
      };

      if (isEdit) {
        const { error } = await supabase.from("gestiones").update(payload as any).eq("id", gestion!.id);
        if (error) throw error;
        toast.success("Gestión actualizada");
      } else {
        const { error } = await supabase.from("gestiones").insert(payload as any);
        if (error) throw error;
        toast.success("Gestión creada");
      }

      queryClient.invalidateQueries({ queryKey: ["gestiones", processId] });
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
      const { error } = await supabase.from("gestiones").delete().eq("id", gestion.id);
      if (error) throw error;
      toast.success("Gestión eliminada");
      queryClient.invalidateQueries({ queryKey: ["gestiones", processId] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar gestión" : "Nueva gestión"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="g-title">Título</Label>
            <Input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título de la gestión" />
          </div>
          <div>
            <Label htmlFor="g-desc">Descripción</Label>
            <Textarea id="g-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción..." rows={2} />
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
            <Label htmlFor="g-resp">Responsable</Label>
            <Input id="g-resp" value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Nombre del responsable" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={!title.trim() || loading} className="flex-1">
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

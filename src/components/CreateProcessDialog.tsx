import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface CreateProcessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_STAGES = [
  { name: "Por hacer", order: 0, global_status: "todo" as const },
  { name: "Planificado", order: 1, global_status: "planned" as const },
  { name: "En progreso", order: 2, global_status: "doing" as const },
  { name: "En revisión", order: 3, global_status: "review" as const },
  { name: "Completado", order: 4, global_status: "done" as const },
];

export function CreateProcessDialog({ open, onOpenChange }: CreateProcessDialogProps) {
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const { data: process, error } = await supabase
        .from("processes")
        .insert({ name: name.trim(), area: area.trim() || null, description: description.trim() || null })
        .select()
        .single();
      if (error) throw error;

      // Create default stages
      const stages = DEFAULT_STAGES.map((s) => ({ ...s, process_id: process.id }));
      const { error: stagesError } = await supabase.from("pipeline_stages").insert(stages);
      if (stagesError) throw stagesError;

      toast.success("Proceso creado exitosamente");
      queryClient.invalidateQueries({ queryKey: ["processes"] });
      onOpenChange(false);
      setName("");
      setArea("");
      setDescription("");
    } catch (err: any) {
      toast.error(err.message || "Error al crear proceso");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo proceso</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Onboarding de clientes" />
          </div>
          <div>
            <Label htmlFor="area">Área</Label>
            <Input id="area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ej: Comercial" />
          </div>
          <div>
            <Label htmlFor="desc">Descripción</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción breve del proceso..." rows={3} />
          </div>
          <Button onClick={handleCreate} disabled={!name.trim() || loading} className="w-full">
            {loading ? "Creando..." : "Crear proceso"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

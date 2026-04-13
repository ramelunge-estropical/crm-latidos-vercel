import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShoppingCart, Headphones, Settings, FolderKanban, LayoutGrid } from "lucide-react";

interface CreateProcessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type GlobalStatus = "todo" | "planned" | "doing" | "review" | "done";

interface StageTemplate {
  name: string;
  order: number;
  global_status: GlobalStatus;
}

interface ProcessTemplate {
  name: string;
  area: string;
  icon: typeof ShoppingCart;
  description: string;
  stages: StageTemplate[];
}

const TEMPLATES: ProcessTemplate[] = [
  {
    name: "Ventas",
    area: "Comercial",
    icon: ShoppingCart,
    description: "Pipeline comercial de leads a cierre",
    stages: [
      { name: "Lead", order: 0, global_status: "todo" },
      { name: "Contacto", order: 1, global_status: "planned" },
      { name: "Cotización", order: 2, global_status: "doing" },
      { name: "Negociación", order: 3, global_status: "review" },
      { name: "Cierre", order: 4, global_status: "done" },
    ],
  },
  {
    name: "Soporte",
    area: "Atención al cliente",
    icon: Headphones,
    description: "Gestión de tickets y casos de soporte",
    stages: [
      { name: "Nuevo", order: 0, global_status: "todo" },
      { name: "Asignado", order: 1, global_status: "planned" },
      { name: "En atención", order: 2, global_status: "doing" },
      { name: "Esperando cliente", order: 3, global_status: "review" },
      { name: "Resuelto", order: 4, global_status: "done" },
    ],
  },
  {
    name: "Operaciones",
    area: "Operaciones",
    icon: Settings,
    description: "Control de tareas operativas",
    stages: [
      { name: "Pendiente", order: 0, global_status: "todo" },
      { name: "Programado", order: 1, global_status: "planned" },
      { name: "En ejecución", order: 2, global_status: "doing" },
      { name: "Verificación", order: 3, global_status: "review" },
      { name: "Finalizado", order: 4, global_status: "done" },
    ],
  },
  {
    name: "Proyectos",
    area: "PMO",
    icon: FolderKanban,
    description: "Seguimiento de proyectos y entregables",
    stages: [
      { name: "Backlog", order: 0, global_status: "todo" },
      { name: "Planificación", order: 1, global_status: "planned" },
      { name: "En desarrollo", order: 2, global_status: "doing" },
      { name: "QA / Revisión", order: 3, global_status: "review" },
      { name: "Entregado", order: 4, global_status: "done" },
    ],
  },
];

const DEFAULT_STAGES: StageTemplate[] = [
  { name: "Por hacer", order: 0, global_status: "todo" },
  { name: "Planificado", order: 1, global_status: "planned" },
  { name: "En progreso", order: 2, global_status: "doing" },
  { name: "En revisión", order: 3, global_status: "review" },
  { name: "Completado", order: 4, global_status: "done" },
];

export function CreateProcessDialog({ open, onOpenChange }: CreateProcessDialogProps) {
  const [step, setStep] = useState<"template" | "custom">("template");
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const resetForm = () => {
    setStep("template");
    setName("");
    setArea("");
    setDescription("");
  };

  const createProcess = async (processName: string, processArea: string, processDesc: string, stages: StageTemplate[]) => {
    setLoading(true);
    try {
      const { data: process, error } = await supabase
        .from("processes")
        .insert({ name: processName, area: processArea || null, description: processDesc || null })
        .select()
        .single();
      if (error) throw error;

      const stageRows = stages.map((s) => ({ ...s, process_id: process.id }));
      const { error: stagesError } = await supabase.from("pipeline_stages").insert(stageRows);
      if (stagesError) throw stagesError;

      toast.success(`Proceso "${processName}" creado`);
      queryClient.invalidateQueries({ queryKey: ["processes"] });
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Error al crear proceso");
    } finally {
      setLoading(false);
    }
  };

  const handleTemplate = (t: ProcessTemplate) => {
    createProcess(t.name, t.area, t.description, t.stages);
  };

  const handleCustom = () => {
    if (!name.trim()) return;
    createProcess(name.trim(), area.trim(), description.trim(), DEFAULT_STAGES);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo proceso</DialogTitle>
        </DialogHeader>

        {step === "template" ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Elegí una plantilla o creá un proceso personalizado.</p>

            <div className="grid grid-cols-2 gap-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => handleTemplate(t)}
                  disabled={loading}
                  className="flex flex-col items-start gap-2 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-accent/50 transition-all text-left group"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <t.icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {t.stages.map((s) => (
                      <span key={s.name} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep("custom")}
              className="w-full flex items-center gap-2 p-3 rounded-xl border-2 border-dashed border-border hover:border-primary/40 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <LayoutGrid className="w-4 h-4" />
              Crear proceso personalizado
            </button>
          </div>
        ) : (
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
            <p className="text-xs text-muted-foreground">Se crearán 5 etapas predeterminadas: Por hacer → Planificado → En progreso → En revisión → Completado</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("template")} className="flex-1">Volver</Button>
              <Button onClick={handleCustom} disabled={!name.trim() || loading} className="flex-1">
                {loading ? "Creando..." : "Crear proceso"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, ShieldCheck } from "lucide-react";
import type { StageRule } from "@/hooks/useProcessEngine";

interface StageRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processId: string;
  stages: { id: string; name: string; order: number }[];
  rules: StageRule[];
}

const RULE_TYPES = [
  { value: "required_field", label: "Campo requerido" },
  { value: "min_days_in_stage", label: "Días mínimos en etapa" },
  { value: "sequential_only", label: "Avance secuencial" },
  { value: "requires_subtype", label: "Requiere subtipo" },
];

const AVAILABLE_FIELDS = [
  { value: "description", label: "Descripción" },
  { value: "responsable_nombre", label: "Responsable" },
  { value: "due_date", label: "Fecha límite" },
  { value: "subtype", label: "Subtipo" },
];

const GESTION_TYPES = [
  { value: "", label: "Todos" },
  { value: "comercial", label: "Comercial" },
  { value: "proyecto", label: "Proyecto" },
  { value: "operativa", label: "Operativa" },
  { value: "caso", label: "Caso" },
];

export function StageRulesDialog({ open, onOpenChange, processId, stages, rules }: StageRulesDialogProps) {
  const queryClient = useQueryClient();
  const [selectedStage, setSelectedStage] = useState(stages[0]?.id || "");
  const [loading, setLoading] = useState(false);

  // New rule form
  const [newRuleType, setNewRuleType] = useState("required_field");
  const [newField, setNewField] = useState("description");
  const [newDays, setNewDays] = useState("1");
  const [newAppliesType, setNewAppliesType] = useState("");

  const stageRules = rules.filter((r) => r.stage_id === selectedStage);

  const handleAddRule = async () => {
    setLoading(true);
    try {
      let ruleConfig: Record<string, any> = {};
      if (newRuleType === "required_field") {
        ruleConfig = { field: newField };
      } else if (newRuleType === "min_days_in_stage") {
        ruleConfig = { days: parseInt(newDays) || 1 };
      } else if (newRuleType === "sequential_only") {
        ruleConfig = { no_skip_back: true };
      }

      const { error } = await supabase.from("stage_rules").insert({
        stage_id: selectedStage,
        rule_type: newRuleType,
        rule_config: ruleConfig,
        applies_to_type: newAppliesType || null,
      } as any);

      if (error) throw error;
      toast.success("Regla agregada");
      queryClient.invalidateQueries({ queryKey: ["stage_rules", processId] });
    } catch (err: any) {
      toast.error(err.message || "Error al agregar regla");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      const { error } = await supabase.from("stage_rules").delete().eq("id", ruleId) as any;
      if (error) throw error;
      toast.success("Regla eliminada");
      queryClient.invalidateQueries({ queryKey: ["stage_rules", processId] });
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar");
    }
  };

  const getRuleDescription = (rule: StageRule): string => {
    switch (rule.rule_type) {
      case "required_field": {
        const fieldLabel = AVAILABLE_FIELDS.find(f => f.value === rule.rule_config.field)?.label || rule.rule_config.field;
        return `Campo requerido: ${fieldLabel}`;
      }
      case "min_days_in_stage":
        return `Mínimo ${rule.rule_config.days} día(s) en etapa`;
      case "sequential_only":
        return "Solo avance secuencial (una etapa a la vez)";
      case "requires_subtype":
        return "Requiere subtipo asignado";
      default:
        return rule.rule_type;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Reglas de proceso
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Stage selector */}
          <div>
            <Label>Etapa</Label>
            <Select value={selectedStage} onValueChange={setSelectedStage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Existing rules */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Reglas activas</Label>
            {stageRules.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">Sin reglas configuradas para esta etapa.</p>
            ) : (
              <div className="space-y-2 mt-2">
                {stageRules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/30">
                    <div>
                      <p className="text-sm text-foreground">{getRuleDescription(rule)}</p>
                      {rule.applies_to_type && (
                        <p className="text-xs text-muted-foreground">Aplica a: {rule.applies_to_type}</p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteRule(rule.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add new rule */}
          <div className="border-t border-border pt-4">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Agregar regla</Label>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Tipo de regla</Label>
                  <Select value={newRuleType} onValueChange={setNewRuleType}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RULE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Aplica a tipo</Label>
                  <Select value={newAppliesType} onValueChange={setNewAppliesType}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GESTION_TYPES.map((t) => (
                        <SelectItem key={t.value || "__all"} value={t.value || "__all"}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {newRuleType === "required_field" && (
                <div>
                  <Label className="text-xs">Campo</Label>
                  <Select value={newField} onValueChange={setNewField}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_FIELDS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {newRuleType === "min_days_in_stage" && (
                <div>
                  <Label className="text-xs">Días mínimos</Label>
                  <Input type="number" min="1" value={newDays} onChange={(e) => setNewDays(e.target.value)} className="h-8 text-xs" />
                </div>
              )}

              <Button onClick={handleAddRule} disabled={loading} size="sm" className="w-full">
                <Plus className="w-3.5 h-3.5 mr-1" />
                {loading ? "Guardando..." : "Agregar regla"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

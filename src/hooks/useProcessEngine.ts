import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StageRule {
  id: string;
  stage_id: string;
  rule_type: "required_field" | "min_days_in_stage" | "sequential_only" | "requires_subtype";
  rule_config: Record<string, any>;
  applies_to_type: string | null;
  applies_to_subtype: string | null;
}

export interface RuleViolation {
  rule: StageRule;
  message: string;
}

interface Stage {
  id: string;
  name: string;
  order: number;
  global_status: string;
}

interface GestionData {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  responsable_nombre: string | null;
  stage_id: string;
  type: string | null;
  subtype: string | null;
  entered_stage_at?: string;
}

const FIELD_LABELS: Record<string, string> = {
  title: "Título",
  description: "Descripción",
  responsable_nombre: "Responsable",
  due_date: "Fecha límite",
  priority: "Prioridad",
  subtype: "Subtipo",
  type: "Tipo",
};

function checkRule(rule: StageRule, gestion: GestionData, stages: Stage[], targetStageId: string): RuleViolation | null {
  // Check if rule applies to this gestion's type/subtype
  if (rule.applies_to_type && gestion.type !== rule.applies_to_type) return null;
  if (rule.applies_to_subtype && gestion.subtype !== rule.applies_to_subtype) return null;

  switch (rule.rule_type) {
    case "required_field": {
      const field = rule.rule_config.field as string;
      const value = (gestion as any)[field];
      if (!value || (typeof value === "string" && !value.trim())) {
        return {
          rule,
          message: `Campo requerido: ${FIELD_LABELS[field] || field}`,
        };
      }
      return null;
    }

    case "min_days_in_stage": {
      const minDays = rule.rule_config.days as number;
      if (gestion.entered_stage_at) {
        const entered = new Date(gestion.entered_stage_at);
        const now = new Date();
        const diffDays = (now.getTime() - entered.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays < minDays) {
          const remaining = Math.ceil(minDays - diffDays);
          return {
            rule,
            message: `Debe permanecer ${minDays} día(s) en la etapa actual. Faltan ${remaining} día(s).`,
          };
        }
      }
      return null;
    }

    case "sequential_only": {
      const currentStage = stages.find((s) => s.id === gestion.stage_id);
      const targetStage = stages.find((s) => s.id === targetStageId);
      if (currentStage && targetStage) {
        const diff = targetStage.order - currentStage.order;
        if (diff > 1) {
          return {
            rule,
            message: `Solo se puede avanzar a la siguiente etapa (${stages.find(s => s.order === currentStage.order + 1)?.name || "siguiente"}).`,
          };
        }
        if (diff < -1 && rule.rule_config.no_skip_back) {
          return {
            rule,
            message: `No se puede retroceder más de una etapa.`,
          };
        }
      }
      return null;
    }

    case "requires_subtype": {
      if (!gestion.subtype) {
        return {
          rule,
          message: `Se requiere un subtipo para avanzar a esta etapa.`,
        };
      }
      return null;
    }

    default:
      return null;
  }
}

export function useProcessEngine(processId: string) {
  const { data: rules = [] } = useQuery<StageRule[]>({
    queryKey: ["stage_rules", processId],
    queryFn: async () => {
      // Get stage IDs for this process first
      const { data: stages } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("process_id", processId);

      if (!stages?.length) return [];

      const stageIds = stages.map((s) => s.id);
      const { data, error } = await supabase
        .from("stage_rules")
        .select("*")
        .in("stage_id", stageIds);

      if (error) throw error;
      return (data || []) as unknown as StageRule[];
    },
  });

  const validateMove = (
    gestion: GestionData,
    targetStageId: string,
    stages: Stage[]
  ): RuleViolation[] => {
    // Get rules for the TARGET stage (entry rules)
    const targetRules = rules.filter((r) => r.stage_id === targetStageId);
    // Get rules for the CURRENT stage (exit rules - like min_days_in_stage, sequential_only)
    const currentRules = rules.filter(
      (r) => r.stage_id === gestion.stage_id && (r.rule_type === "min_days_in_stage" || r.rule_type === "sequential_only")
    );

    const allRules = [...currentRules, ...targetRules];
    const violations: RuleViolation[] = [];

    for (const rule of allRules) {
      const violation = checkRule(rule, gestion, stages, targetStageId);
      if (violation) violations.push(violation);
    }

    return violations;
  };

  const getProgress = (gestion: GestionData, stages: Stage[]): number => {
    if (stages.length <= 1) return 100;
    const currentStage = stages.find((s) => s.id === gestion.stage_id);
    if (!currentStage) return 0;
    return Math.round((currentStage.order / (stages.length - 1)) * 100);
  };

  const getRulesForStage = (stageId: string): StageRule[] => {
    return rules.filter((r) => r.stage_id === stageId);
  };

  return {
    rules,
    validateMove,
    getProgress,
    getRulesForStage,
  };
}

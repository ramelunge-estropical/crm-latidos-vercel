-- Stage rules table
CREATE TABLE public.stage_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  rule_type text NOT NULL CHECK (rule_type IN ('required_field', 'min_days_in_stage', 'sequential_only', 'requires_subtype')),
  rule_config jsonb NOT NULL DEFAULT '{}',
  applies_to_type text,
  applies_to_subtype text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stage_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stage_rules" ON public.stage_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage stage_rules" ON public.stage_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Track when a card entered its current stage
ALTER TABLE public.gestiones ADD COLUMN entered_stage_at timestamptz NOT NULL DEFAULT now();

-- Stage history for audit trail
CREATE TABLE public.stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestion_id uuid NOT NULL REFERENCES public.gestiones(id) ON DELETE CASCADE,
  from_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id uuid NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

ALTER TABLE public.stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stage_history" ON public.stage_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert stage_history" ON public.stage_history FOR INSERT TO authenticated WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_stage_rules_stage_id ON public.stage_rules(stage_id);
CREATE INDEX idx_stage_history_gestion_id ON public.stage_history(gestion_id);
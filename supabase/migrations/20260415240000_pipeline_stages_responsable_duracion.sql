-- Add responsable_id and duracion_estimada_dias to pipeline_stages
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS responsable_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duracion_estimada_dias INTEGER;

COMMENT ON COLUMN pipeline_stages.responsable_id         IS 'Colaborador responsable de esta etapa del pipeline';
COMMENT ON COLUMN pipeline_stages.duracion_estimada_dias IS 'Duración estimada en días para completar esta etapa';

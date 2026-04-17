-- Sub-areas for each area of the company
CREATE TABLE IF NOT EXISTS sub_areas_empresa (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id     UUID        NOT NULL REFERENCES areas_empresa(id) ON DELETE CASCADE,
  nombre      TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '#94a3b8',
  orden       INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_areas_area_id ON sub_areas_empresa(area_id);

-- RLS
ALTER TABLE sub_areas_empresa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all sub_areas_empresa" ON sub_areas_empresa;
CREATE POLICY "Allow all sub_areas_empresa"
  ON sub_areas_empresa FOR ALL
  USING (true) WITH CHECK (true);

-- Link processes to specific sub-areas (optional; a process can belong to zero or more sub-areas)
CREATE TABLE IF NOT EXISTS process_sub_areas (
  process_id  UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  sub_area_id UUID NOT NULL REFERENCES sub_areas_empresa(id) ON DELETE CASCADE,
  PRIMARY KEY (process_id, sub_area_id)
);

CREATE INDEX IF NOT EXISTS idx_process_sub_areas_process ON process_sub_areas(process_id);

ALTER TABLE process_sub_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all process_sub_areas" ON process_sub_areas;
CREATE POLICY "Allow all process_sub_areas"
  ON process_sub_areas FOR ALL
  USING (true) WITH CHECK (true);

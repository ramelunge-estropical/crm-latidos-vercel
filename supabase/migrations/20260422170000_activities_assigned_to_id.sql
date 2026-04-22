-- Replace text-based assigned_to with proper FK
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS assigned_to_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL;

-- Migrate existing data: match assigned_to text → colaborador id
UPDATE activities a
SET assigned_to_id = c.id
FROM colaboradores c
WHERE a.assigned_to = c.nombre
  AND a.assigned_to_id IS NULL;

-- Backfill created_by from assigned_to for activities that have no created_by
-- (old activities created before the field existed — assume creator = responsable)
UPDATE activities
SET created_by = assigned_to_id
WHERE created_by IS NULL AND assigned_to_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activities_assigned_to_id ON activities(assigned_to_id);

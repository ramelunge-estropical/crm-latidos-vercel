-- Replace text-based assigned_to with proper FK
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS assigned_to_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL;

-- Migrate existing data: try to match nombre → id
UPDATE activities a
SET assigned_to_id = c.id
FROM colaboradores c
WHERE a.assigned_to = c.nombre
  AND a.assigned_to_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_activities_assigned_to_id ON activities(assigned_to_id);

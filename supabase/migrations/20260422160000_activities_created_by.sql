ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES colaboradores(id) ON DELETE SET NULL;

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_activities_created_by ON activities(created_by);
CREATE INDEX IF NOT EXISTS idx_activities_assigned_to ON activities(assigned_to);

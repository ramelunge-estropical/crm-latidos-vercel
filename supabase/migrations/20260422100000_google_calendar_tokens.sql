CREATE TABLE IF NOT EXISTS colaborador_google_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  google_email TEXT,
  access_token TEXT,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(colaborador_id)
);

ALTER TABLE colaborador_google_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON colaborador_google_tokens FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON colaborador_google_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);

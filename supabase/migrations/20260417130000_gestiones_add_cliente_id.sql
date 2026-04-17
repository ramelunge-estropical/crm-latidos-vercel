-- Add cliente_id FK to gestiones for proper relational client association
ALTER TABLE gestiones
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gestiones_cliente_id ON gestiones(cliente_id);

-- Ensure clientes table has open RLS (same pattern as other tables)
DROP POLICY IF EXISTS "Allow all clientes" ON clientes;
CREATE POLICY "Allow all clientes"
  ON clientes FOR ALL
  USING (true) WITH CHECK (true);

-- Días de crédito para clientes jurídicos
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS dias_credito INTEGER;

-- Tabla de cobranzas pendientes (aplica a ambos tipos de cliente)
CREATE TABLE IF NOT EXISTS cliente_cobranzas (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  concepto          TEXT        NOT NULL,
  monto             NUMERIC(12,2) NOT NULL DEFAULT 0,
  moneda            TEXT        NOT NULL DEFAULT 'Bs',
  fecha_emision     DATE,
  fecha_vencimiento DATE,
  estado            TEXT        NOT NULL DEFAULT 'pendiente',  -- pendiente | pagado | vencido
  notas             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- RLS: mismo patrón que las otras tablas del CRM
ALTER TABLE cliente_cobranzas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_cliente_cobranzas" ON cliente_cobranzas FOR ALL TO anon  USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_cliente_cobranzas" ON cliente_cobranzas FOR ALL TO authenticated USING (true) WITH CHECK (true);

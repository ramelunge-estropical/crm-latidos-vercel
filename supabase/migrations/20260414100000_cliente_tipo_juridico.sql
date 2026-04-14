
-- ═══════════════════════════════════════════════════════
-- Clientes: soporte para persona natural y jurídica
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS tipo_cliente     TEXT NOT NULL DEFAULT 'natural',   -- 'natural' | 'juridica'
  ADD COLUMN IF NOT EXISTS razon_social     TEXT,    -- nombre legal de la empresa (jurídica)
  ADD COLUMN IF NOT EXISTS nit              TEXT,    -- NIT (jurídica) — el CI ya está en documento_numero
  ADD COLUMN IF NOT EXISTS contacto_nombre  TEXT,    -- persona de contacto (jurídica)
  ADD COLUMN IF NOT EXISTS contacto_cargo   TEXT;    -- cargo del contacto (jurídica)

-- índice para búsqueda por NIT y razón social
CREATE INDEX IF NOT EXISTS idx_clientes_nit          ON public.clientes(nit);
CREATE INDEX IF NOT EXISTS idx_clientes_razon_social ON public.clientes(razon_social);

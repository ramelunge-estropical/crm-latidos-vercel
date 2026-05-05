-- ═══════════════════════════════════════════════════════════════════════════
-- LAT Canales & Reglas v2
-- - Reglas ahora se pueden escopar a un canal específico (canal_id)
-- - Canales tienen cola por defecto cuando ninguna regla coincide
-- - Conversaciones registran qué canal, regla y cola se aplicaron
-- ═══════════════════════════════════════════════════════════════════════════

-- ── lat_canales: cola por defecto y última actividad ────────────────────────
ALTER TABLE lat_canales
  ADD COLUMN IF NOT EXISTS cola_default_id    UUID REFERENCES lat_colas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ultima_actividad   TIMESTAMPTZ;

-- ── lat_reglas_asignacion: scope por canal ──────────────────────────────────
-- NULL = regla global (aplica a todos los canales)
ALTER TABLE lat_reglas_asignacion
  ADD COLUMN IF NOT EXISTS canal_id UUID REFERENCES lat_canales(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_lat_reglas_canal ON lat_reglas_asignacion(canal_id);

-- ── lat_conversaciones: trazabilidad de canal, regla y cola aplicados ───────
ALTER TABLE lat_conversaciones
  ADD COLUMN IF NOT EXISTS cola_id            UUID REFERENCES lat_colas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regla_aplicada_id  UUID REFERENCES lat_reglas_asignacion(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS canal_id_fk        UUID REFERENCES lat_canales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lat_conv_cola      ON lat_conversaciones(cola_id);
CREATE INDEX IF NOT EXISTS idx_lat_conv_canal_fk  ON lat_conversaciones(canal_id_fk);

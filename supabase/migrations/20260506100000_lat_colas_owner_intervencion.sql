-- ═══════════════════════════════════════════════════════════════════════════
-- LAT Colas — Owner, intervención y trazabilidad
-- ═══════════════════════════════════════════════════════════════════════════

-- ── lat_colas: configuración de owner e intervención ─────────────────────────
ALTER TABLE lat_colas
  ADD COLUMN IF NOT EXISTS owner_auto_asignar         BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_nivel                TEXT     NOT NULL DEFAULT 'por_conversacion'
    CHECK (owner_nivel IN ('por_cliente', 'por_conversacion')),
  ADD COLUMN IF NOT EXISTS owner_last_user_activo     BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_last_user_dias       INTEGER  NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS supervisor_puede_intervenir   BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS supervisor_puede_transferir   BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS permite_reasignacion_manual   BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS owner_registrar_trazabilidad  BOOLEAN  NOT NULL DEFAULT true;

-- ── lat_conversaciones: trazabilidad de owner e intervención ─────────────────
ALTER TABLE lat_conversaciones
  ADD COLUMN IF NOT EXISTS owner_original_id   UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_actual_id     UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intervenido_por_id  UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS canal_entrante_id   UUID REFERENCES lat_canales(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regla_aplicada_id   UUID REFERENCES lat_reglas_asignacion(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supervisor_responsable_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS desborde_aplicado   BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cola_desborde_id    UUID REFERENCES lat_colas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lat_conv_owner_original  ON lat_conversaciones(owner_original_id);
CREATE INDEX IF NOT EXISTS idx_lat_conv_owner_actual    ON lat_conversaciones(owner_actual_id);
CREATE INDEX IF NOT EXISTS idx_lat_conv_canal_entrante  ON lat_conversaciones(canal_entrante_id);
CREATE INDEX IF NOT EXISTS idx_lat_conv_regla_aplicada  ON lat_conversaciones(regla_aplicada_id);

-- ── lat_trazabilidad: tipos de evento extendidos ─────────────────────────────
-- Asegura que la tabla soporte eventos de owner e intervención
ALTER TABLE lat_trazabilidad
  ADD COLUMN IF NOT EXISTS owner_original_id  UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_nuevo_id     UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intervencion       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo            TEXT;

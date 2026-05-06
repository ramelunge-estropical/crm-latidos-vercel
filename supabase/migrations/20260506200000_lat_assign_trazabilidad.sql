-- ═══════════════════════════════════════════════════════════════════════════
-- LAT Asignación — trazabilidad completa de canal → regla → cola → agente
-- ═══════════════════════════════════════════════════════════════════════════

-- ── lat_conversaciones: campos de estado de asignación ───────────────────────
ALTER TABLE lat_conversaciones
  -- Estado del pipeline de enrutamiento
  ADD COLUMN IF NOT EXISTS estado_asignacion TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado_asignacion IN ('pendiente', 'en_cola', 'asignada', 'en_espera', 'desborde', 'ignorada')),

  -- Motivo cuando no se pudo asignar a ningún agente
  ADD COLUMN IF NOT EXISTS motivo_no_asignada TEXT,

  -- Disponibilidad snapshot del agente en el momento de asignación
  ADD COLUMN IF NOT EXISTS agente_disponibilidad_snap TEXT,

  -- Timestamps de cada transición del pipeline
  ADD COLUMN IF NOT EXISTS ts_regla_aplicada   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ts_cola_asignada    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ts_agente_asignado  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ts_desborde         TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_lat_conv_estado_asignacion ON lat_conversaciones(estado_asignacion);

-- ── lat_trazabilidad: tabla central de eventos de routing ────────────────────
-- Crea la tabla si aún no existe (puede haber sido creada en migración previa)
CREATE TABLE IF NOT EXISTS lat_trazabilidad (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id UUID        NOT NULL REFERENCES lat_conversaciones(id) ON DELETE CASCADE,
  tipo_evento     TEXT        NOT NULL,
    -- canal_asignado | regla_aplicada | cola_asignada | agente_asignado |
    -- agente_no_disponible | desborde_activado | reasignacion_manual |
    -- owner_asignado | intervencion_supervisor
  canal_id        UUID        REFERENCES lat_canales(id)           ON DELETE SET NULL,
  regla_id        UUID        REFERENCES lat_reglas_asignacion(id) ON DELETE SET NULL,
  cola_id         UUID        REFERENCES lat_colas(id)             ON DELETE SET NULL,
  cola_desborde_id UUID       REFERENCES lat_colas(id)             ON DELETE SET NULL,
  owner_original_id UUID      REFERENCES colaboradores(id)         ON DELETE SET NULL,
  owner_nuevo_id  UUID        REFERENCES colaboradores(id)         ON DELETE SET NULL,
  intervencion    BOOLEAN     NOT NULL DEFAULT false,
  motivo          TEXT,
  detalle         JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Si la tabla ya existía, agrega los campos que pudieran faltar
ALTER TABLE lat_trazabilidad
  ADD COLUMN IF NOT EXISTS canal_id         UUID REFERENCES lat_canales(id)           ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regla_id         UUID REFERENCES lat_reglas_asignacion(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cola_id          UUID REFERENCES lat_colas(id)             ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cola_desborde_id UUID REFERENCES lat_colas(id)             ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_original_id UUID REFERENCES colaboradores(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_nuevo_id   UUID REFERENCES colaboradores(id)         ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intervencion     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo           TEXT,
  ADD COLUMN IF NOT EXISTS detalle          JSONB;

CREATE INDEX IF NOT EXISTS idx_lat_trazabilidad_conv ON lat_trazabilidad(conversacion_id, created_at DESC);

ALTER TABLE lat_trazabilidad ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lat_trazabilidad' AND policyname = 'Allow all lat_trazabilidad'
  ) THEN
    CREATE POLICY "Allow all lat_trazabilidad" ON lat_trazabilidad FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

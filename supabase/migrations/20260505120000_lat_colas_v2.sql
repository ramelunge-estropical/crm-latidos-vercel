-- ═══════════════════════════════════════════════════════════════════════════
-- LAT Colas v2 — horario, canal saliente, miembros (agentes/supervisores)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── lat_colas: nuevos campos operativos ──────────────────────────────────────
ALTER TABLE lat_colas
  ADD COLUMN IF NOT EXISTS horario_id        UUID REFERENCES lat_horarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS canal_saliente_id UUID REFERENCES lat_canales(id)  ON DELETE SET NULL;

-- ── lat_cola_miembros: asignación de agentes y supervisores a colas ──────────
CREATE TABLE IF NOT EXISTS lat_cola_miembros (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  cola_id        UUID        NOT NULL REFERENCES lat_colas(id) ON DELETE CASCADE,
  colaborador_id UUID        NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  rol            TEXT        NOT NULL DEFAULT 'agente' CHECK (rol IN ('agente', 'supervisor')),
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (cola_id, colaborador_id)
);

CREATE INDEX IF NOT EXISTS idx_lat_cola_miembros_cola   ON lat_cola_miembros(cola_id);
CREATE INDEX IF NOT EXISTS idx_lat_cola_miembros_colab  ON lat_cola_miembros(colaborador_id);

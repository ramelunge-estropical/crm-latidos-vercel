-- ═══════════════════════════════════════════════════════
-- Schema integraciones — Registro de sistemas externos
-- y sincronización de tareas entre apps del ecosistema
-- ═══════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS integraciones;

-- ── sistemas: catálogo de apps externas conectadas ────
CREATE TABLE IF NOT EXISTS integraciones.sistemas (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre             TEXT        NOT NULL UNIQUE,       -- slug: "legal", "finanzas", etc.
  descripcion        TEXT,
  app_url            TEXT,                              -- URL de la app (para sidebar)
  webhook_url        TEXT,                              -- URL donde CRM envía tareas (push)
  api_key            TEXT,                              -- clave con que el sistema externo se autentica
  -- Ruta de destino para tarjetas entrantes (si se configura → crea gestión; si no → activity)
  process_id_default UUID        REFERENCES public.processes(id) ON DELETE SET NULL,
  stage_id_default   UUID        REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  activo             BOOLEAN     NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_integraciones_sistemas_updated_at
  BEFORE UPDATE ON integraciones.sistemas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: solo service_role escribe; anon/authenticated pueden leer
ALTER TABLE integraciones.sistemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_sistemas"
  ON integraciones.sistemas FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "service_role_all_sistemas"
  ON integraciones.sistemas FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);


-- ── tareas_sincronizadas: log de sincronización bidireccional ──
CREATE TABLE IF NOT EXISTS integraciones.tareas_sincronizadas (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  origen             TEXT        NOT NULL,   -- "crm" | "legal" | "finanzas" | etc.
  origen_id          TEXT        NOT NULL,   -- ID en el sistema origen
  destino            TEXT        NOT NULL,   -- "crm" | "legal" | etc.
  destino_id         TEXT,                   -- ID en el sistema destino (null si falló)
  titulo             TEXT        NOT NULL,
  descripcion        TEXT,
  estado             TEXT,
  prioridad          TEXT,
  fecha_vencimiento  DATE,
  colaborador_id     UUID        REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  error              TEXT,                   -- mensaje de error si el push falló
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (origen, origen_id, destino)        -- evita duplicados
);

CREATE INDEX IF NOT EXISTS idx_tareas_sinc_origen    ON integraciones.tareas_sincronizadas(origen, origen_id);
CREATE INDEX IF NOT EXISTS idx_tareas_sinc_destino   ON integraciones.tareas_sincronizadas(destino, destino_id);
CREATE INDEX IF NOT EXISTS idx_tareas_sinc_created   ON integraciones.tareas_sincronizadas(created_at DESC);

CREATE TRIGGER trg_tareas_sincronizadas_updated_at
  BEFORE UPDATE ON integraciones.tareas_sincronizadas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE integraciones.tareas_sincronizadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_tareas_sinc"
  ON integraciones.tareas_sincronizadas FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Lectura para colaboradores autenticados (para auditoría en UI)
CREATE POLICY "auth_read_tareas_sinc"
  ON integraciones.tareas_sincronizadas FOR SELECT
  TO authenticated
  USING (true);


-- ── Seed: sistemas conocidos ─────────────────────────
INSERT INTO integraciones.sistemas (nombre, descripcion, activo, api_key)
VALUES
  ('latidos',  'CRM Latidos — sistema central', true, null),
  ('legal',    'Hub Legal — gestión de contratos y casos legales', true, '14ab9667-eb65-403e-a568-37db76dfbc7b')
ON CONFLICT (nombre) DO NOTHING;

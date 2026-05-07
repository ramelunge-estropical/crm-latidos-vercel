-- ═══════════════════════════════════════════════════════════════════════════
-- LAT Routing Phase 1 — Normalización base del Motor de Enrutamiento
-- Flujo: Canal → Reglas → Cola → Usuario → Bandeja individual
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. lat_canales: proveedor, identificador y estado de conectividad ─────────
-- 'activo' se mantiene para retrocompatibilidad; 'estado' añade granularidad.

ALTER TABLE lat_canales
  ADD COLUMN IF NOT EXISTS identificador TEXT,
  ADD COLUMN IF NOT EXISTS proveedor     TEXT,
  ADD COLUMN IF NOT EXISTS estado        TEXT
    CHECK (estado IN ('conectado', 'desconectado', 'error', 'pendiente'));

-- Inicializar 'estado' a partir de 'activo' para filas existentes
UPDATE lat_canales
SET
  estado       = CASE WHEN activo THEN 'conectado' ELSE 'desconectado' END,
  identificador = COALESCE(identificador, numero_origen)
WHERE estado IS NULL;

-- Trigger bidireccional: mantiene activo y estado sincronizados
CREATE OR REPLACE FUNCTION sync_lat_canal_estado_activo()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado IS NULL THEN
      NEW.estado := CASE WHEN NEW.activo THEN 'conectado' ELSE 'desconectado' END;
    ELSE
      NEW.activo := (NEW.estado = 'conectado');
    END IF;
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
    NEW.activo := (NEW.estado = 'conectado');
  ELSIF NEW.activo IS DISTINCT FROM OLD.activo THEN
    NEW.estado := CASE WHEN NEW.activo THEN 'conectado' ELSE 'desconectado' END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lat_canal_sync_estado ON lat_canales;
CREATE TRIGGER trg_lat_canal_sync_estado
  BEFORE INSERT OR UPDATE OF estado, activo ON lat_canales
  FOR EACH ROW EXECUTE FUNCTION sync_lat_canal_estado_activo();

CREATE INDEX IF NOT EXISTS idx_lat_canales_estado ON lat_canales(estado);


-- ── 2. lat_colas: arrays de canales entrantes y salientes permitidos ──────────
-- canal_id y canal_saliente_id se mantienen (retrocompat); los arrays
-- permiten múltiples canales por cola para fases posteriores.

ALTER TABLE lat_colas
  ADD COLUMN IF NOT EXISTS canales_entrantes_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS canales_salientes_ids UUID[] DEFAULT '{}';

-- Inicializar arrays desde FKs existentes para filas que aún no los tienen
UPDATE lat_colas
SET
  canales_entrantes_ids = CASE
    WHEN canal_id IS NOT NULL THEN ARRAY[canal_id]
    ELSE '{}'::UUID[]
  END,
  canales_salientes_ids = CASE
    WHEN canal_saliente_id IS NOT NULL THEN ARRAY[canal_saliente_id]
    ELSE '{}'::UUID[]
  END
WHERE canales_entrantes_ids = '{}' OR canales_salientes_ids = '{}';

CREATE INDEX IF NOT EXISTS idx_lat_colas_entrantes ON lat_colas USING GIN(canales_entrantes_ids);
CREATE INDEX IF NOT EXISTS idx_lat_colas_salientes ON lat_colas USING GIN(canales_salientes_ids);


-- ── 3. lat_cola_miembros: estado de actividad, capacidad y peso por usuario ───

ALTER TABLE lat_cola_miembros
  ADD COLUMN IF NOT EXISTS activo             BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_conversaciones INTEGER,             -- NULL = usa el máximo de la cola
  ADD COLUMN IF NOT EXISTS peso               INTEGER NOT NULL DEFAULT 1
    CHECK (peso BETWEEN 1 AND 10);            -- peso para estrategia ponderada

CREATE INDEX IF NOT EXISTS idx_lat_cola_miembros_activo
  ON lat_cola_miembros(cola_id, activo);


-- ── 4. colaborador_presencia: estado de conexión explícito ────────────────────
-- 'conectado' = sesión activa (online); 'estado' = disponibilidad operativa.

ALTER TABLE colaborador_presencia
  ADD COLUMN IF NOT EXISTS conectado BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_presencia_conectado
  ON colaborador_presencia(colaborador_id, conectado);


-- ── 5. lat_conversaciones: ampliar pipeline de estado de asignación ───────────
-- Añadir 'en_gestion' y 'cerrada' para cubrir el ciclo completo de routing.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'lat_conversaciones'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%estado_asignacion%'
  LOOP
    EXECUTE 'ALTER TABLE lat_conversaciones DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE lat_conversaciones
  ADD CONSTRAINT lat_conv_estado_asignacion_check
  CHECK (estado_asignacion IN (
    'pendiente',   -- recibida, aún sin procesar por el motor
    'en_cola',     -- encolada, esperando agente disponible
    'asignada',    -- asignada a agente, pendiente de inicio de gestión
    'en_gestion',  -- agente atendiendo activamente
    'en_espera',   -- esperando respuesta del cliente
    'desborde',    -- derivada a cola de desborde
    'ignorada',    -- excluida del flujo (bot, filtro, etc.)
    'cerrada'      -- conversación finalizada
  ));

-- Índice parcial: solo conversaciones activas (excluye cerradas/ignoradas)
CREATE INDEX IF NOT EXISTS idx_lat_conv_estado_asig_activo
  ON lat_conversaciones(estado_asignacion)
  WHERE estado_asignacion NOT IN ('cerrada', 'ignorada');

-- Índice parcial: conversaciones activas por owner (asegura max 1 asignado)
CREATE INDEX IF NOT EXISTS idx_lat_conv_owner_activo
  ON lat_conversaciones(owner_actual_id)
  WHERE owner_actual_id IS NOT NULL
    AND estado_asignacion NOT IN ('cerrada', 'ignorada');


-- ── 6. Función auxiliar: ¿puede la cola activarse? ───────────────────────────
-- Retorna TRUE si tiene agentes activos O bot disponible en algún canal entrante.

CREATE OR REPLACE FUNCTION lat_cola_puede_activarse(p_cola_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  tiene_agentes BOOLEAN;
  tiene_bot     BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM lat_cola_miembros
    WHERE cola_id = p_cola_id
      AND rol     = 'agente'
      AND activo  = true
  ) INTO tiene_agentes;

  SELECT EXISTS(
    SELECT 1
    FROM lat_colas q
    JOIN lat_canales c ON c.id = ANY(q.canales_entrantes_ids)
    WHERE q.id = p_cola_id
      AND c.bot_default_id IS NOT NULL
  ) INTO tiene_bot;

  RETURN tiene_agentes OR tiene_bot;
END;
$$ LANGUAGE plpgsql STABLE;


-- ── 7. Función auxiliar: canales conectados de una cola ───────────────────────
-- Retorna los IDs de canales conectados asignados como entrantes a la cola.

CREATE OR REPLACE FUNCTION lat_cola_canales_conectados(p_cola_id UUID)
RETURNS UUID[] AS $$
  SELECT ARRAY(
    SELECT c.id
    FROM lat_colas q
    JOIN lat_canales c ON c.id = ANY(q.canales_entrantes_ids)
    WHERE q.id = p_cola_id
      AND c.estado = 'conectado'
  );
$$ LANGUAGE sql STABLE;

-- ═══════════════════════════════════════════════════════════════════════════
-- LAT Routing Phase 3 — Bandeja Individual, Cliente 360, Mis Gestiones, Trazabilidad
-- Conecta el motor de enrutamiento con el usuario logueado, roles y operativa
-- Flujo: Motor → Cola/Bot → Usuario asignado → Bandeja individual → C360 → Mis Gestiones
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. lat_conversaciones: campos de resultado del motor ─────────────────────
-- routing_status / routing_reason persisten el último resultado del motor
-- para que la bandeja los muestre sin recalcular sobre lat_trazabilidad.

ALTER TABLE lat_conversaciones
  ADD COLUMN IF NOT EXISTS routing_status  TEXT,
  ADD COLUMN IF NOT EXISTS routing_reason  TEXT,
  ADD COLUMN IF NOT EXISTS channel_type    TEXT;

CREATE INDEX IF NOT EXISTS idx_lat_conv_routing_status
  ON lat_conversaciones(routing_status)
  WHERE routing_status IS NOT NULL;


-- ── 2. Sync trigger: owner_actual_id ↔ responsable_id ────────────────────────
-- El motor escribe owner_actual_id (Phase 1/2).
-- Las queries históricas (carga activa, bandeja) usan responsable_id.
-- Este trigger los mantiene en sync sin romper código existente.

CREATE OR REPLACE FUNCTION sync_lat_conv_owner_responsable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_actual_id IS DISTINCT FROM OLD.owner_actual_id THEN
    NEW.responsable_id := NEW.owner_actual_id;
  ELSIF NEW.responsable_id IS DISTINCT FROM OLD.responsable_id THEN
    NEW.owner_actual_id := NEW.responsable_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_owner_responsable ON lat_conversaciones;
CREATE TRIGGER trg_sync_owner_responsable
  BEFORE UPDATE OF owner_actual_id, responsable_id ON lat_conversaciones
  FOR EACH ROW EXECUTE FUNCTION sync_lat_conv_owner_responsable();


-- ── 3. Índices para bandeja individual ───────────────────────────────────────
-- Optimizan la query: WHERE responsable_id = :id AND estado_asignacion NOT IN (...)

CREATE INDEX IF NOT EXISTS idx_lat_conv_bandeja_activa
  ON lat_conversaciones(responsable_id, estado_asignacion)
  WHERE estado_asignacion NOT IN ('cerrada', 'ignorada');

CREATE INDEX IF NOT EXISTS idx_lat_conv_cola_activa
  ON lat_conversaciones(cola_id, estado_asignacion)
  WHERE estado_asignacion NOT IN ('cerrada', 'ignorada');

CREATE INDEX IF NOT EXISTS idx_lat_conv_en_cola
  ON lat_conversaciones(cola_id)
  WHERE estado_asignacion = 'en_cola';

CREATE INDEX IF NOT EXISTS idx_lat_conv_sin_responsable
  ON lat_conversaciones(estado_asignacion)
  WHERE responsable_id IS NULL
    AND estado_asignacion NOT IN ('cerrada', 'ignorada');


-- ── 4. Vista bandeja colaborador ─────────────────────────────────────────────
-- Enriquece conversaciones con nombre del responsable, cola y cliente.
-- El filtro WHERE responsable_id = :id se aplica sobre la vista desde el frontend.

CREATE OR REPLACE VIEW lat_v_bandeja_colaborador AS
SELECT
  c.*,
  col.nombre          AS col_responsable_nombre,
  col.color           AS col_responsable_color,
  q.nombre            AS col_cola_nombre,
  cl.nombre_completo  AS col_cliente_nombre_360
FROM lat_conversaciones c
LEFT JOIN colaboradores col ON col.id = c.responsable_id
LEFT JOIN lat_colas q       ON q.id   = c.cola_id
LEFT JOIN clientes cl       ON cl.id  = c.cliente_id;


-- ── 5. Vista bandeja supervisor ──────────────────────────────────────────────
-- Muestra todas las conversaciones activas con contexto de cola y responsable.
-- El supervisor filtra por col_cola_id IN (sus colas supervisadas) en el frontend.

CREATE OR REPLACE VIEW lat_v_bandeja_supervisor AS
SELECT
  c.*,
  col.nombre          AS col_responsable_nombre,
  col.color           AS col_responsable_color,
  q.nombre            AS col_cola_nombre,
  cl.nombre_completo  AS col_cliente_nombre_360,
  (
    SELECT COUNT(*)::INTEGER
    FROM lat_trazabilidad t
    WHERE t.conversacion_id = c.id
      AND t.intervencion = true
  ) AS col_num_intervenciones
FROM lat_conversaciones c
LEFT JOIN colaboradores col ON col.id = c.responsable_id
LEFT JOIN lat_colas q       ON q.id   = c.cola_id
LEFT JOIN clientes cl       ON cl.id  = c.cliente_id
WHERE c.estado_asignacion NOT IN ('cerrada', 'ignorada');


-- ── 6. Función: reasignación manual con trazabilidad completa ─────────────────
-- Actualiza responsable_id y owner_actual_id atómicamente.
-- Registra el evento en lat_trazabilidad con motivo e interventor.

CREATE OR REPLACE FUNCTION lat_reasignar_conversacion(
  p_conversacion_id   UUID,
  p_nuevo_responsable UUID,
  p_intervenido_por   UUID,
  p_motivo            TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_owner_anterior  UUID;
  v_estado_actual   TEXT;
BEGIN
  SELECT responsable_id, estado_asignacion
    INTO v_owner_anterior, v_estado_actual
    FROM lat_conversaciones
   WHERE id = p_conversacion_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversación % no encontrada', p_conversacion_id;
  END IF;

  -- Actualizar asignación; si estaba en_cola/pendiente → asignada
  UPDATE lat_conversaciones
     SET responsable_id    = p_nuevo_responsable,
         owner_actual_id   = p_nuevo_responsable,
         owner_original_id = COALESCE(owner_original_id, v_owner_anterior),
         estado_asignacion = CASE
           WHEN v_estado_actual IN ('en_cola', 'pendiente') THEN 'asignada'
           ELSE v_estado_actual
         END,
         ts_agente_asignado = now(),
         updated_at         = now()
   WHERE id = p_conversacion_id;

  -- Registrar evento de reasignación en trazabilidad
  INSERT INTO lat_trazabilidad (
    conversacion_id,
    tipo_evento,
    owner_original_id,
    owner_nuevo_id,
    intervencion,
    motivo,
    detalle
  ) VALUES (
    p_conversacion_id,
    'reasignacion_manual',
    v_owner_anterior,
    p_nuevo_responsable,
    true,
    p_motivo,
    jsonb_build_object(
      'intervenido_por', p_intervenido_por,
      'estado_previo',   v_estado_actual,
      'ts',              now()
    )
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION lat_reasignar_conversacion IS
  'Reasigna una conversación a un nuevo agente y deja trazabilidad del evento.';


-- ── 7. Función: completar apertura de gestión desde conversación LAT ──────────
-- Cuando el asesor crea una gestión desde una conversación,
-- registra la relación lat_conversacion_id sin romper la asignación original.

CREATE OR REPLACE FUNCTION lat_gestionar_conversacion(
  p_conversacion_id UUID,
  p_gestion_id      UUID
)
RETURNS VOID AS $$
BEGIN
  -- Marcar conversación como en_gestion si está asignada
  UPDATE lat_conversaciones
     SET estado_asignacion = 'en_gestion',
         updated_at        = now()
   WHERE id              = p_conversacion_id
     AND estado_asignacion = 'asignada';

  -- Vincular gestión con conversación
  UPDATE gestiones
     SET lat_conversacion_id = p_conversacion_id
   WHERE id = p_gestion_id
     AND lat_conversacion_id IS NULL;

  -- Registrar en trazabilidad
  INSERT INTO lat_trazabilidad (
    conversacion_id,
    tipo_evento,
    detalle
  ) VALUES (
    p_conversacion_id,
    'owner_asignado',
    jsonb_build_object(
      'gestion_id', p_gestion_id,
      'accion',     'gestion_creada',
      'ts',         now()
    )
  );
END;
$$ LANGUAGE plpgsql;


-- ── 8. gestiones: vincular con conversación LAT ───────────────────────────────
-- Permite que Mis Gestiones muestre el origen omnicanal de cada tarea.
-- Conserva cliente, canal, cola y asesor de la conversación origen.

ALTER TABLE gestiones
  ADD COLUMN IF NOT EXISTS lat_conversacion_id UUID
    REFERENCES lat_conversaciones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gestiones_lat_conv
  ON gestiones(lat_conversacion_id)
  WHERE lat_conversacion_id IS NOT NULL;


-- ── 9. lat_cola_miembros: normalizar rol supervisor ────────────────────────────
-- Ampliar el CHECK para incluir 'supervisor' y 'observador' explícitamente.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'lat_cola_miembros'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) LIKE '%rol%'
  LOOP
    EXECUTE 'ALTER TABLE lat_cola_miembros DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE lat_cola_miembros
  ADD CONSTRAINT lat_cola_miembros_rol_check
  CHECK (rol IN ('agente', 'supervisor', 'observador'));


-- ── 10. Habilitar RLS en lat_conversaciones (política permisiva) ───────────────
-- El filtro real (WHERE responsable_id = :id) se aplica en el frontend.
-- RLS completo con auth.uid() → colaboradores.id se implementa en fase posterior.

ALTER TABLE lat_conversaciones ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lat_conversaciones'
      AND policyname = 'Allow all lat_conversaciones'
  ) THEN
    CREATE POLICY "Allow all lat_conversaciones"
      ON lat_conversaciones FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ── 11. Función: snapshot de trazabilidad para una conversación ───────────────
-- Retorna el último estado del routing de forma denormalizada para el panel.

CREATE OR REPLACE FUNCTION lat_trazabilidad_resumen(p_conversacion_id UUID)
RETURNS TABLE (
  canal_origen_id    UUID,
  regla_origen_id    UUID,
  cola_origen_id     UUID,
  agente_asignado_id UUID,
  routing_status     TEXT,
  routing_reason     TEXT,
  desborde_cola_id   UUID,
  num_reasignaciones INTEGER,
  ultima_intervencion TIMESTAMPTZ
) AS $$
  SELECT
    -- Canal: primer evento canal_asignado
    (SELECT t.canal_id FROM lat_trazabilidad t
     WHERE t.conversacion_id = p_conversacion_id
       AND t.tipo_evento = 'canal_asignado'
     ORDER BY t.created_at LIMIT 1),
    -- Regla: primer evento regla_aplicada
    (SELECT t.regla_id FROM lat_trazabilidad t
     WHERE t.conversacion_id = p_conversacion_id
       AND t.tipo_evento = 'regla_aplicada'
     ORDER BY t.created_at LIMIT 1),
    -- Cola: primer evento cola_asignada
    (SELECT t.cola_id FROM lat_trazabilidad t
     WHERE t.conversacion_id = p_conversacion_id
       AND t.tipo_evento = 'cola_asignada'
     ORDER BY t.created_at LIMIT 1),
    -- Agente: último evento agente_asignado u owner_asignado
    (SELECT t.owner_nuevo_id FROM lat_trazabilidad t
     WHERE t.conversacion_id = p_conversacion_id
       AND t.tipo_evento IN ('agente_asignado', 'owner_asignado')
     ORDER BY t.created_at DESC LIMIT 1),
    -- routing_status/reason desde la conversación
    c.routing_status,
    c.routing_reason,
    -- Cola de desborde si aplica
    (SELECT t.cola_desborde_id FROM lat_trazabilidad t
     WHERE t.conversacion_id = p_conversacion_id
       AND t.tipo_evento = 'desborde_activado'
     ORDER BY t.created_at LIMIT 1),
    -- Número de reasignaciones manuales
    (SELECT COUNT(*)::INTEGER FROM lat_trazabilidad t
     WHERE t.conversacion_id = p_conversacion_id
       AND t.tipo_evento = 'reasignacion_manual'),
    -- Última intervención de supervisor
    (SELECT MAX(t.created_at) FROM lat_trazabilidad t
     WHERE t.conversacion_id = p_conversacion_id
       AND t.intervencion = true)
  FROM lat_conversaciones c
  WHERE c.id = p_conversacion_id;
$$ LANGUAGE sql STABLE;

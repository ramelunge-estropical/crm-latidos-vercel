-- ═══════════════════════════════════════════════════════════════════════════
-- LAT Routing Phase 2 — Motor Central de Enrutamiento
-- Función: routeIncomingCommunication (lat-routing-engine)
-- Flujo: Canal → Reglas → Cola → Usuario disponible → Asignación → Trazabilidad
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. lat_trazabilidad: campos del motor unificado ───────────────────────────
-- channel_type permite filtrar trazas por canal (whatsapp, email, etc.)
-- routing_status es el resultado final del motor para cada evento
-- routing_reason complementa el motivo con detalle legible

ALTER TABLE lat_trazabilidad
  ADD COLUMN IF NOT EXISTS channel_type    TEXT,
  ADD COLUMN IF NOT EXISTS routing_status  TEXT,
  ADD COLUMN IF NOT EXISTS routing_reason  TEXT;

CREATE INDEX IF NOT EXISTS idx_lat_trazabilidad_channel ON lat_trazabilidad(channel_type);
CREATE INDEX IF NOT EXISTS idx_lat_trazabilidad_rstatus ON lat_trazabilidad(routing_status);


-- ── 2. lat_conversaciones: canal_entrante_id como FK tipada ──────────────────
-- Semánticamente es el canal que originó la conversación.
-- canal_id_fk y canal_entrante_id se mantienen sincronizados.

ALTER TABLE lat_conversaciones
  ADD COLUMN IF NOT EXISTS canal_entrante_id UUID REFERENCES lat_canales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lat_conv_canal_entrante
  ON lat_conversaciones(canal_entrante_id);


-- ── 3. Función: validar si una cola acepta un canal entrante ──────────────────
-- Retorna TRUE si la cola está activa y acepta el canal.
-- Cola con canales_entrantes_ids vacío acepta cualquier canal.

CREATE OR REPLACE FUNCTION lat_cola_valida_para_canal(p_cola_id UUID, p_canal_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM lat_colas
    WHERE id     = p_cola_id
      AND activa = true
      AND (
        p_canal_id = ANY(canales_entrantes_ids)
        OR canales_entrantes_ids = '{}'::UUID[]
        OR array_length(canales_entrantes_ids, 1) IS NULL
      )
  );
$$ LANGUAGE sql STABLE;


-- ── 4. Función: conversaciones activas de un agente ──────────────────────────
-- Usa carga real de BD excluyendo cerradas/ignoradas.
-- El índice parcial idx_lat_conv_owner_activo (Phase 1) ya cubre esta query.

CREATE OR REPLACE FUNCTION lat_agente_carga_activa(p_colaborador_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM lat_conversaciones
  WHERE responsable_id   = p_colaborador_id
    AND estado_asignacion NOT IN ('cerrada', 'ignorada');
$$ LANGUAGE sql STABLE;


-- ── 5. Índice adicional: carga por responsable (optimiza lat_agente_carga_activa) ──

CREATE INDEX IF NOT EXISTS idx_lat_conv_responsable_activa
  ON lat_conversaciones(responsable_id)
  WHERE estado_asignacion NOT IN ('cerrada', 'ignorada');


-- ── 6. Vista de monitoreo: agentes disponibles por cola ──────────────────────
-- Útil para diagnóstico en panel admin y alertas futuras.

CREATE OR REPLACE VIEW lat_v_agentes_disponibles AS
SELECT
  m.cola_id,
  q.nombre                                                  AS cola_nombre,
  m.colaborador_id,
  p.conectado,
  p.estado                                                  AS estado_operativo,
  COALESCE(m.max_conversaciones, q.max_conversaciones_agente, 5) AS capacidad_max,
  lat_agente_carga_activa(m.colaborador_id)                 AS carga_activa,
  CASE
    WHEN p.conectado AND p.estado = 'disponible'
      AND lat_agente_carga_activa(m.colaborador_id) <
          COALESCE(m.max_conversaciones, q.max_conversaciones_agente, 5)
    THEN true ELSE false
  END                                                       AS elegible
FROM lat_cola_miembros m
JOIN lat_colas q ON q.id = m.cola_id
LEFT JOIN colaborador_presencia p ON p.colaborador_id = m.colaborador_id
WHERE m.activo = true
  AND m.rol    = 'agente'
  AND q.activa = true;

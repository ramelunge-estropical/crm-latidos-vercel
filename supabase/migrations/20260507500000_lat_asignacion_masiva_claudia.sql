-- ═══════════════════════════════════════════════════════════════════════════
-- LAT Asignación Masiva — Conversaciones sin responsable → Cola Postventa + Claudia K.P.
-- Fecha: 2026-05-07
-- Objetivo: Asignar conversaciones activas sin responsable a la cola Postventa
--           con Claudia Knauerhase Padilla como asesor asignado.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_claudia_id        UUID;
  v_cola_id           UUID;
  v_total_sin_asignar INTEGER;
  v_asignadas         INTEGER := 0;
  v_conv              RECORD;
BEGIN

  -- ── 1. Resolver colaborador_id real de Claudia ───────────────────────────
  SELECT id
    INTO v_claudia_id
    FROM colaboradores
   WHERE email  = 'aplataformas@estropical.com'
     AND activo = true
  LIMIT 1;

  IF v_claudia_id IS NULL THEN
    RAISE EXCEPTION
      'No se encontró colaborador activo con email aplataformas@estropical.com. Abortando.';
  END IF;

  RAISE NOTICE '✓ Asesor encontrado: id = %', v_claudia_id;

  -- ── 2. Resolver id de la cola Postventa ──────────────────────────────────
  SELECT id
    INTO v_cola_id
    FROM lat_colas
   WHERE nombre ILIKE '%postventa%'
     AND activa = true
  LIMIT 1;

  IF v_cola_id IS NULL THEN
    RAISE EXCEPTION
      'No se encontró cola activa con nombre "Postventa". Abortando.';
  END IF;

  RAISE NOTICE '✓ Cola encontrada: Postventa (id = %)', v_cola_id;

  -- ── 3. Contar conversaciones que serán afectadas ──────────────────────────
  SELECT COUNT(*)
    INTO v_total_sin_asignar
    FROM lat_conversaciones
   WHERE responsable_id   IS NULL
     AND estado_asignacion NOT IN ('cerrada', 'ignorada');

  RAISE NOTICE '→ Conversaciones sin responsable a asignar: %', v_total_sin_asignar;

  IF v_total_sin_asignar = 0 THEN
    RAISE NOTICE 'Sin conversaciones pendientes. Operación finalizada sin cambios.';
    RETURN;
  END IF;

  -- ── 4. Asignación directa: cola Postventa + Claudia como asesor ──────────
  --       Por cada conversación: actualiza cola, asigna asesor y registra
  --       evento agente_asignado en trazabilidad (sin marcar como intervención).
  FOR v_conv IN
    SELECT id, estado_asignacion, cola_id AS cola_anterior
      FROM lat_conversaciones
     WHERE responsable_id   IS NULL
       AND estado_asignacion NOT IN ('cerrada', 'ignorada')
     ORDER BY created_at ASC
  LOOP
    -- Asignar cola Postventa + asesor Claudia
    UPDATE lat_conversaciones
       SET cola_id           = v_cola_id,
           responsable_id    = v_claudia_id,
           owner_actual_id   = v_claudia_id,
           estado_asignacion = CASE
             WHEN v_conv.estado_asignacion IN ('en_cola', 'pendiente') THEN 'asignada'
             ELSE v_conv.estado_asignacion
           END,
           ts_cola_asignada  = COALESCE(ts_cola_asignada, now()),
           ts_agente_asignado = now(),
           updated_at        = now()
     WHERE id = v_conv.id;

    -- Registrar evento en trazabilidad
    INSERT INTO lat_trazabilidad (
      conversacion_id,
      tipo_evento,
      cola_id,
      owner_original_id,
      owner_nuevo_id,
      intervencion,
      motivo,
      detalle
    ) VALUES (
      v_conv.id,
      'asignacion_manual',
      v_cola_id,
      NULL,
      v_claudia_id,
      false,
      'Asignación masiva de comunicaciones sin responsable a Claudia Knauerhase Padilla — cola Postventa',
      jsonb_build_object(
        'cola_anterior',    v_conv.cola_anterior,
        'cola_nueva',       v_cola_id,
        'estado_previo',    v_conv.estado_asignacion,
        'ts',               now()
      )
    );

    v_asignadas := v_asignadas + 1;
  END LOOP;

  RAISE NOTICE '✓ Completado: % de % conversaciones asignadas a cola Postventa / asesor Claudia (id = %)',
    v_asignadas, v_total_sin_asignar, v_claudia_id;

END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- LAT Email Canal → Cola "Grupos y Bodas" → Jose Manuel Gutierrez
--
-- Objetivo:
--   1. Asegurar que existe un canal de tipo "email" en estado "conectado"
--   2. Vincular ese canal como cola_default_id de "Grupos y Bodas"
--   3. Incluir el canal en canales_entrantes_ids de la cola
--   4. Agregar a Jose Manuel Gutierrez como agente activo de la cola
--   5. Inicializar su colaborador_presencia si no existe
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_canal_id      UUID;
  v_cola_id       UUID;
  v_jose_id       UUID;
BEGIN

  -- ── 1. Resolver o crear el canal de email ──────────────────────────────────
  SELECT id INTO v_canal_id
    FROM lat_canales
   WHERE tipo = 'email'
   LIMIT 1;

  IF v_canal_id IS NULL THEN
    INSERT INTO lat_canales (nombre, tipo, identificador, proveedor, estado, activo)
    VALUES ('Email Corporativo', 'email', 'microvoz@estropical.com', 'gmail', 'conectado', true)
    RETURNING id INTO v_canal_id;
    RAISE NOTICE '✓ Canal email creado: id = %', v_canal_id;
  ELSE
    -- Asegurar que esté conectado
    UPDATE lat_canales
       SET estado = 'conectado', activo = true
     WHERE id = v_canal_id
       AND (estado IS DISTINCT FROM 'conectado' OR activo IS DISTINCT FROM true);
    RAISE NOTICE '✓ Canal email encontrado: id = %', v_canal_id;
  END IF;

  -- ── 2. Resolver la cola "Grupos y Bodas" ──────────────────────────────────
  SELECT id INTO v_cola_id
    FROM lat_colas
   WHERE nombre ILIKE '%grupos%bodas%' OR nombre ILIKE '%grupos y bodas%'
   LIMIT 1;

  IF v_cola_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la cola "Grupos y Bodas". Verifique que exista en lat_colas.';
  END IF;

  RAISE NOTICE '✓ Cola encontrada: "Grupos y Bodas" id = %', v_cola_id;

  -- ── 3. Vincular el canal email como cola_default_id del canal ──────────────
  -- (el canal apunta a su cola default para emails sin regla específica)
  UPDATE lat_canales
     SET cola_default_id = v_cola_id
   WHERE id = v_canal_id
     AND (cola_default_id IS DISTINCT FROM v_cola_id);

  -- ── 4. Agregar el canal email a canales_entrantes_ids de la cola ───────────
  UPDATE lat_colas
     SET canales_entrantes_ids = array_append(COALESCE(canales_entrantes_ids, ARRAY[]::UUID[]), v_canal_id)
   WHERE id = v_cola_id
     AND NOT (COALESCE(canales_entrantes_ids, ARRAY[]::UUID[]) @> ARRAY[v_canal_id]::UUID[]);

  RAISE NOTICE '✓ Canal email vinculado a cola Grupos y Bodas';

  -- ── 5. Asegurar que la cola está activa ────────────────────────────────────
  UPDATE lat_colas
     SET activa = true
   WHERE id = v_cola_id AND activa = false;

  -- ── 6. Resolver colaborador Jose Manuel Gutierrez ─────────────────────────
  SELECT id INTO v_jose_id
    FROM colaboradores
   WHERE lower(trim(email)) = lower('pinnovacion@estropical.com')
     AND activo = true
   LIMIT 1;

  IF v_jose_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró colaborador activo con email pinnovacion@estropical.com.';
  END IF;

  RAISE NOTICE '✓ Colaborador encontrado: Jose Manuel Gutierrez id = %', v_jose_id;

  -- ── 7. Agregar Jose Manuel como agente de la cola ─────────────────────────
  INSERT INTO lat_cola_miembros (cola_id, colaborador_id, rol, activo)
  VALUES (v_cola_id, v_jose_id, 'agente', true)
  ON CONFLICT (cola_id, colaborador_id)
  DO UPDATE SET rol = 'agente', activo = true;

  RAISE NOTICE '✓ Jose Manuel agregado como agente activo en cola Grupos y Bodas';

  -- ── 8. Inicializar colaborador_presencia si no existe ─────────────────────
  -- conectado=false intencionalmente: se actualiza al hacer login en el sistema.
  -- estado='disponible' es el estado de trabajo correcto para recibir asignaciones.
  INSERT INTO colaborador_presencia (
    colaborador_id, conectado, estado, capacidad_maxima, chats_abiertos
  )
  VALUES (v_jose_id, false, 'disponible', 10, 0)
  ON CONFLICT (colaborador_id)
  DO NOTHING;

  RAISE NOTICE '✓ colaborador_presencia inicializado para Jose Manuel (conectado=false, estado=disponible)';
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE 'IMPORTANTE: Jose Manuel debe iniciar sesión en el CRM para';
  RAISE NOTICE 'que su estado pase a conectado=true y reciba asignaciones.';
  RAISE NOTICE '══════════════════════════════════════════════════════════';

END $$;

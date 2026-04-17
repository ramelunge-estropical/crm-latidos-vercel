-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Sub-áreas, Procesos y Pipeline por área
-- Idempotente: no inserta si ya existen registros con el mismo nombre/área
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- ── IDs de las áreas existentes ──────────────────────────────────────────
  a_comercial   UUID;
  a_operaciones UUID;
  a_finanzas    UUID;
  a_proyectos   UUID;
  a_atencion    UUID;

  -- ── IDs de sub-áreas (Comercial) ─────────────────────────────────────────
  sa_ventas         UUID;
  sa_marketing      UUID;
  sa_licitaciones   UUID;

  -- ── IDs de sub-áreas (Operaciones) ───────────────────────────────────────
  sa_logistica      UUID;
  sa_compras        UUID;
  sa_mantenimiento  UUID;

  -- ── IDs de sub-áreas (Finanzas) ──────────────────────────────────────────
  sa_facturacion    UUID;
  sa_cobranzas      UUID;
  sa_contabilidad   UUID;

  -- ── IDs de sub-áreas (Proyectos) ─────────────────────────────────────────
  sa_planificacion  UUID;
  sa_ejecucion      UUID;
  sa_cierre_proy    UUID;

  -- ── IDs de sub-áreas (Atención al Cliente) ───────────────────────────────
  sa_soporte        UUID;
  sa_reclamos       UUID;
  sa_fidelizacion   UUID;

  -- ── IDs de procesos ──────────────────────────────────────────────────────
  p_venta           UUID;
  p_campana         UUID;
  p_despacho        UUID;
  p_compras         UUID;
  p_facturacion     UUID;
  p_cobranzas       UUID;
  p_planif_proy     UUID;
  p_ejecucion_proy  UUID;
  p_ticket          UUID;
  p_reclamo         UUID;

BEGIN

  -- ── 0. Obtener IDs de las áreas existentes ────────────────────────────────
  SELECT id INTO a_comercial   FROM areas_empresa WHERE nombre = 'Comercial'           LIMIT 1;
  SELECT id INTO a_operaciones FROM areas_empresa WHERE nombre = 'Operaciones'         LIMIT 1;
  SELECT id INTO a_finanzas    FROM areas_empresa WHERE nombre = 'Finanzas'            LIMIT 1;
  SELECT id INTO a_proyectos   FROM areas_empresa WHERE nombre = 'Proyectos'           LIMIT 1;
  SELECT id INTO a_atencion    FROM areas_empresa WHERE nombre = 'Atención al Cliente' LIMIT 1;

  IF a_comercial IS NULL OR a_operaciones IS NULL OR a_finanzas IS NULL
     OR a_proyectos IS NULL OR a_atencion IS NULL THEN
    RAISE NOTICE 'No se encontraron todas las áreas base. Verificá que existan: Comercial, Operaciones, Finanzas, Proyectos, Atención al Cliente.';
    RETURN;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- 1. SUB-ÁREAS
  -- ════════════════════════════════════════════════════════════════════════

  -- ── Comercial ─────────────────────────────────────────────────────────
  INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
    SELECT a_comercial, 'Ventas', '#2563eb', 0
    WHERE NOT EXISTS (SELECT 1 FROM sub_areas_empresa WHERE area_id = a_comercial AND nombre = 'Ventas')
  RETURNING id INTO sa_ventas;
  IF sa_ventas IS NULL THEN
    SELECT id INTO sa_ventas FROM sub_areas_empresa WHERE area_id = a_comercial AND nombre = 'Ventas';
  END IF;

  INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
    SELECT a_comercial, 'Marketing', '#1d4ed8', 1
    WHERE NOT EXISTS (SELECT 1 FROM sub_areas_empresa WHERE area_id = a_comercial AND nombre = 'Marketing')
  RETURNING id INTO sa_marketing;
  IF sa_marketing IS NULL THEN
    SELECT id INTO sa_marketing FROM sub_areas_empresa WHERE area_id = a_comercial AND nombre = 'Marketing';
  END IF;

  INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
    SELECT a_comercial, 'Licitaciones', '#1e40af', 2
    WHERE NOT EXISTS (SELECT 1 FROM sub_areas_empresa WHERE area_id = a_comercial AND nombre = 'Licitaciones')
  RETURNING id INTO sa_licitaciones;
  IF sa_licitaciones IS NULL THEN
    SELECT id INTO sa_licitaciones FROM sub_areas_empresa WHERE area_id = a_comercial AND nombre = 'Licitaciones';
  END IF;

  -- ── Operaciones ───────────────────────────────────────────────────────
  INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
    SELECT a_operaciones, 'Logística', '#d97706', 0
    WHERE NOT EXISTS (SELECT 1 FROM sub_areas_empresa WHERE area_id = a_operaciones AND nombre = 'Logística')
  RETURNING id INTO sa_logistica;
  IF sa_logistica IS NULL THEN
    SELECT id INTO sa_logistica FROM sub_areas_empresa WHERE area_id = a_operaciones AND nombre = 'Logística';
  END IF;

  INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
    SELECT a_operaciones, 'Compras', '#b45309', 1
    WHERE NOT EXISTS (SELECT 1 FROM sub_areas_empresa WHERE area_id = a_operaciones AND nombre = 'Compras')
  RETURNING id INTO sa_compras;
  IF sa_compras IS NULL THEN
    SELECT id INTO sa_compras FROM sub_areas_empresa WHERE area_id = a_operaciones AND nombre = 'Compras';
  END IF;

  INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
    SELECT a_operaciones, 'Mantenimiento', '#92400e', 2
    WHERE NOT EXISTS (SELECT 1 FROM sub_areas_empresa WHERE area_id = a_operaciones AND nombre = 'Mantenimiento')
  RETURNING id INTO sa_mantenimiento;
  IF sa_mantenimiento IS NULL THEN
    SELECT id INTO sa_mantenimiento FROM sub_areas_empresa WHERE area_id = a_operaciones AND nombre = 'Mantenimiento';
  END IF;

  -- ── Finanzas ──────────────────────────────────────────────────────────
  INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
    SELECT a_finanzas, 'Contabilidad', '#059669', 0
    WHERE NOT EXISTS (SELECT 1 FROM sub_areas_empresa WHERE area_id = a_finanzas AND nombre = 'Contabilidad')
  RETURNING id INTO sa_contabilidad;
  IF sa_contabilidad IS NULL THEN
    SELECT id INTO sa_contabilidad FROM sub_areas_empresa WHERE area_id = a_finanzas AND nombre = 'Contabilidad';
  END IF;

  INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
    SELECT a_finanzas, 'Facturación', '#047857', 1
    WHERE NOT EXISTS (SELECT 1 FROM sub_areas_empresa WHERE area_id = a_finanzas AND nombre = 'Facturación')
  RETURNING id INTO sa_facturacion;
  IF sa_facturacion IS NULL THEN
    SELECT id INTO sa_facturacion FROM sub_areas_empresa WHERE area_id = a_finanzas AND nombre = 'Facturación';
  END IF;

  INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
    SELECT a_finanzas, 'Cobranzas', '#065f46', 2
    WHERE NOT EXISTS (SELECT 1 FROM sub_areas_empresa WHERE area_id = a_finanzas AND nombre = 'Cobranzas')
  RETURNING id INTO sa_cobranzas;
  IF sa_cobranzas IS NULL THEN
    SELECT id INTO sa_cobranzas FROM sub_areas_empresa WHERE area_id = a_finanzas AND nombre = 'Cobranzas';
  END IF;

  -- ── Proyectos ─────────────────────────────────────────────────────────
  INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
    SELECT a_proyectos, 'Planificación', '#7c3aed', 0
    WHERE NOT EXISTS (SELECT 1 FROM sub_areas_empresa WHERE area_id = a_proyectos AND nombre = 'Planificación')
  RETURNING id INTO sa_planificacion;
  IF sa_planificacion IS NULL THEN
    SELECT id INTO sa_planificacion FROM sub_areas_empresa WHERE area_id = a_proyectos AND nombre = 'Planificación';
  END IF;

  INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
    SELECT a_proyectos, 'Ejecución', '#6d28d9', 1
    WHERE NOT EXISTS (SELECT 1 FROM sub_areas_empresa WHERE area_id = a_proyectos AND nombre = 'Ejecución')
  RETURNING id INTO sa_ejecucion;
  IF sa_ejecucion IS NULL THEN
    SELECT id INTO sa_ejecucion FROM sub_areas_empresa WHERE area_id = a_proyectos AND nombre = 'Ejecución';
  END IF;

  INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
    SELECT a_proyectos, 'Cierre', '#5b21b6', 2
    WHERE NOT EXISTS (SELECT 1 FROM sub_areas_empresa WHERE area_id = a_proyectos AND nombre = 'Cierre')
  RETURNING id INTO sa_cierre_proy;
  IF sa_cierre_proy IS NULL THEN
    SELECT id INTO sa_cierre_proy FROM sub_areas_empresa WHERE area_id = a_proyectos AND nombre = 'Cierre';
  END IF;

  -- ── Atención al Cliente ───────────────────────────────────────────────
  INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
    SELECT a_atencion, 'Soporte Técnico', '#dc2626', 0
    WHERE NOT EXISTS (SELECT 1 FROM sub_areas_empresa WHERE area_id = a_atencion AND nombre = 'Soporte Técnico')
  RETURNING id INTO sa_soporte;
  IF sa_soporte IS NULL THEN
    SELECT id INTO sa_soporte FROM sub_areas_empresa WHERE area_id = a_atencion AND nombre = 'Soporte Técnico';
  END IF;

  INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
    SELECT a_atencion, 'Reclamos', '#b91c1c', 1
    WHERE NOT EXISTS (SELECT 1 FROM sub_areas_empresa WHERE area_id = a_atencion AND nombre = 'Reclamos')
  RETURNING id INTO sa_reclamos;
  IF sa_reclamos IS NULL THEN
    SELECT id INTO sa_reclamos FROM sub_areas_empresa WHERE area_id = a_atencion AND nombre = 'Reclamos';
  END IF;

  INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
    SELECT a_atencion, 'Fidelización', '#991b1b', 2
    WHERE NOT EXISTS (SELECT 1 FROM sub_areas_empresa WHERE area_id = a_atencion AND nombre = 'Fidelización')
  RETURNING id INTO sa_fidelizacion;
  IF sa_fidelizacion IS NULL THEN
    SELECT id INTO sa_fidelizacion FROM sub_areas_empresa WHERE area_id = a_atencion AND nombre = 'Fidelización';
  END IF;

  RAISE NOTICE 'Sub-áreas creadas/verificadas correctamente.';

  -- ════════════════════════════════════════════════════════════════════════
  -- 2. PROCESOS + ÁREAS + SUB-ÁREAS + ETAPAS
  -- ════════════════════════════════════════════════════════════════════════

  -- ── COMERCIAL / VENTAS ──────────────────────────────────────────────────
  -- Proceso: Proceso de Venta
  IF NOT EXISTS (SELECT 1 FROM processes WHERE name = 'Proceso de Venta') THEN
    INSERT INTO processes (name, description)
      VALUES ('Proceso de Venta', 'Flujo completo desde la prospección hasta el onboarding del cliente.')
    RETURNING id INTO p_venta;

    INSERT INTO process_areas   VALUES (p_venta, a_comercial);
    INSERT INTO process_sub_areas VALUES (p_venta, sa_ventas);

    INSERT INTO pipeline_stages (process_id, name, "order", global_status, duracion_estimada_dias) VALUES
      (p_venta, 'Prospección y calificación', 0, 'to_do',  3),
      (p_venta, 'Primer contacto',            1, 'to_do',  1),
      (p_venta, 'Presentación de propuesta',  2, 'doing',  3),
      (p_venta, 'Negociación',                3, 'doing',  5),
      (p_venta, 'Cierre y firma',             4, 'review', 2),
      (p_venta, 'Onboarding del cliente',     5, 'done',   7);

    RAISE NOTICE 'Proceso "Proceso de Venta" creado.';
  ELSE
    RAISE NOTICE 'Proceso "Proceso de Venta" ya existe. Omitido.';
  END IF;

  -- ── COMERCIAL / MARKETING ───────────────────────────────────────────────
  -- Proceso: Campaña de Marketing
  IF NOT EXISTS (SELECT 1 FROM processes WHERE name = 'Campaña de Marketing') THEN
    INSERT INTO processes (name, description)
      VALUES ('Campaña de Marketing', 'Planificación, ejecución y análisis de campañas comerciales.')
    RETURNING id INTO p_campana;

    INSERT INTO process_areas   VALUES (p_campana, a_comercial);
    INSERT INTO process_sub_areas VALUES (p_campana, sa_marketing);

    INSERT INTO pipeline_stages (process_id, name, "order", global_status, duracion_estimada_dias) VALUES
      (p_campana, 'Definición de objetivo',    0, 'to_do',  2),
      (p_campana, 'Diseño de campaña',         1, 'doing',  5),
      (p_campana, 'Aprobación interna',        2, 'review', 2),
      (p_campana, 'Lanzamiento',               3, 'doing',  1),
      (p_campana, 'Monitoreo y seguimiento',   4, 'doing',  14),
      (p_campana, 'Análisis de resultados',    5, 'done',   3);

    RAISE NOTICE 'Proceso "Campaña de Marketing" creado.';
  ELSE
    RAISE NOTICE 'Proceso "Campaña de Marketing" ya existe. Omitido.';
  END IF;

  -- ── OPERACIONES / LOGÍSTICA ─────────────────────────────────────────────
  -- Proceso: Despacho y Entrega
  IF NOT EXISTS (SELECT 1 FROM processes WHERE name = 'Despacho y Entrega') THEN
    INSERT INTO processes (name, description)
      VALUES ('Despacho y Entrega', 'Proceso de preparación, control de calidad y entrega al cliente.')
    RETURNING id INTO p_despacho;

    INSERT INTO process_areas   VALUES (p_despacho, a_operaciones);
    INSERT INTO process_sub_areas VALUES (p_despacho, sa_logistica);

    INSERT INTO pipeline_stages (process_id, name, "order", global_status, duracion_estimada_dias) VALUES
      (p_despacho, 'Recepción de pedido',       0, 'to_do',  1),
      (p_despacho, 'Preparación de mercadería', 1, 'doing',  2),
      (p_despacho, 'Control de calidad',        2, 'review', 1),
      (p_despacho, 'Coordinación de transporte',3, 'doing',  1),
      (p_despacho, 'Entrega al cliente',        4, 'doing',  2),
      (p_despacho, 'Confirmación y cierre',     5, 'done',   1);

    RAISE NOTICE 'Proceso "Despacho y Entrega" creado.';
  ELSE
    RAISE NOTICE 'Proceso "Despacho y Entrega" ya existe. Omitido.';
  END IF;

  -- ── OPERACIONES / COMPRAS ───────────────────────────────────────────────
  -- Proceso: Proceso de Compras
  IF NOT EXISTS (SELECT 1 FROM processes WHERE name = 'Proceso de Compras') THEN
    INSERT INTO processes (name, description)
      VALUES ('Proceso de Compras', 'Solicitud, evaluación de proveedores, orden de compra y recepción.')
    RETURNING id INTO p_compras;

    INSERT INTO process_areas   VALUES (p_compras, a_operaciones);
    INSERT INTO process_sub_areas VALUES (p_compras, sa_compras);

    INSERT INTO pipeline_stages (process_id, name, "order", global_status, duracion_estimada_dias) VALUES
      (p_compras, 'Solicitud de compra',         0, 'to_do',  1),
      (p_compras, 'Cotización con proveedores',  1, 'doing',  3),
      (p_compras, 'Evaluación y selección',      2, 'review', 2),
      (p_compras, 'Emisión de orden de compra',  3, 'doing',  1),
      (p_compras, 'Seguimiento de entrega',      4, 'doing',  5),
      (p_compras, 'Recepción y verificación',    5, 'done',   1);

    RAISE NOTICE 'Proceso "Proceso de Compras" creado.';
  ELSE
    RAISE NOTICE 'Proceso "Proceso de Compras" ya existe. Omitido.';
  END IF;

  -- ── FINANZAS / FACTURACIÓN ──────────────────────────────────────────────
  -- Proceso: Proceso de Facturación
  IF NOT EXISTS (SELECT 1 FROM processes WHERE name = 'Proceso de Facturación') THEN
    INSERT INTO processes (name, description)
      VALUES ('Proceso de Facturación', 'Generación, revisión, envío y registro contable de facturas.')
    RETURNING id INTO p_facturacion;

    INSERT INTO process_areas   VALUES (p_facturacion, a_finanzas);
    INSERT INTO process_sub_areas VALUES (p_facturacion, sa_facturacion);

    INSERT INTO pipeline_stages (process_id, name, "order", global_status, duracion_estimada_dias) VALUES
      (p_facturacion, 'Verificación de orden de servicio', 0, 'to_do',  1),
      (p_facturacion, 'Generación de factura',             1, 'doing',  1),
      (p_facturacion, 'Revisión y aprobación',             2, 'review', 1),
      (p_facturacion, 'Envío al cliente',                  3, 'doing',  1),
      (p_facturacion, 'Registro contable',                 4, 'done',   1);

    RAISE NOTICE 'Proceso "Proceso de Facturación" creado.';
  ELSE
    RAISE NOTICE 'Proceso "Proceso de Facturación" ya existe. Omitido.';
  END IF;

  -- ── FINANZAS / COBRANZAS ────────────────────────────────────────────────
  -- Proceso: Gestión de Cobranzas
  IF NOT EXISTS (SELECT 1 FROM processes WHERE name = 'Gestión de Cobranzas') THEN
    INSERT INTO processes (name, description)
      VALUES ('Gestión de Cobranzas', 'Seguimiento de deudas, contacto con clientes y regularización de pagos.')
    RETURNING id INTO p_cobranzas;

    INSERT INTO process_areas   VALUES (p_cobranzas, a_finanzas);
    INSERT INTO process_sub_areas VALUES (p_cobranzas, sa_cobranzas);

    INSERT INTO pipeline_stages (process_id, name, "order", global_status, duracion_estimada_dias) VALUES
      (p_cobranzas, 'Identificación de deuda',    0, 'to_do',  1),
      (p_cobranzas, 'Emisión de recordatorio',    1, 'doing',  1),
      (p_cobranzas, 'Contacto con el cliente',    2, 'doing',  2),
      (p_cobranzas, 'Negociación de pago',        3, 'review', 5),
      (p_cobranzas, 'Confirmación de pago',       4, 'done',   1),
      (p_cobranzas, 'Cierre y regularización',    5, 'done',   1);

    RAISE NOTICE 'Proceso "Gestión de Cobranzas" creado.';
  ELSE
    RAISE NOTICE 'Proceso "Gestión de Cobranzas" ya existe. Omitido.';
  END IF;

  -- ── PROYECTOS / PLANIFICACIÓN ───────────────────────────────────────────
  -- Proceso: Planificación de Proyecto
  IF NOT EXISTS (SELECT 1 FROM processes WHERE name = 'Planificación de Proyecto') THEN
    INSERT INTO processes (name, description)
      VALUES ('Planificación de Proyecto', 'Relevamiento, definición de alcance, recursos y cronograma hasta el kickoff.')
    RETURNING id INTO p_planif_proy;

    INSERT INTO process_areas   VALUES (p_planif_proy, a_proyectos);
    INSERT INTO process_sub_areas VALUES (p_planif_proy, sa_planificacion);

    INSERT INTO pipeline_stages (process_id, name, "order", global_status, duracion_estimada_dias) VALUES
      (p_planif_proy, 'Relevamiento de necesidades',    0, 'to_do',  5),
      (p_planif_proy, 'Definición de alcance',          1, 'doing',  3),
      (p_planif_proy, 'Análisis de recursos y costos',  2, 'doing',  3),
      (p_planif_proy, 'Cronograma y asignación',        3, 'review', 2),
      (p_planif_proy, 'Aprobación del proyecto',        4, 'review', 2),
      (p_planif_proy, 'Kickoff',                        5, 'done',   1);

    RAISE NOTICE 'Proceso "Planificación de Proyecto" creado.';
  ELSE
    RAISE NOTICE 'Proceso "Planificación de Proyecto" ya existe. Omitido.';
  END IF;

  -- ── PROYECTOS / EJECUCIÓN ───────────────────────────────────────────────
  -- Proceso: Ejecución de Proyecto
  IF NOT EXISTS (SELECT 1 FROM processes WHERE name = 'Ejecución de Proyecto') THEN
    INSERT INTO processes (name, description)
      VALUES ('Ejecución de Proyecto', 'Desarrollo, control de avance, gestión de cambios y entrega final.')
    RETURNING id INTO p_ejecucion_proy;

    INSERT INTO process_areas   VALUES (p_ejecucion_proy, a_proyectos);
    INSERT INTO process_sub_areas VALUES (p_ejecucion_proy, sa_ejecucion);

    INSERT INTO pipeline_stages (process_id, name, "order", global_status, duracion_estimada_dias) VALUES
      (p_ejecucion_proy, 'Inicio de tareas',              0, 'to_do',  2),
      (p_ejecucion_proy, 'Desarrollo / Ejecución',        1, 'doing',  30),
      (p_ejecucion_proy, 'Control de avance semanal',     2, 'doing',  7),
      (p_ejecucion_proy, 'Gestión de cambios y desvíos',  3, 'review', 3),
      (p_ejecucion_proy, 'Entrega de entregables',        4, 'review', 2),
      (p_ejecucion_proy, 'Aceptación del cliente',        5, 'done',   2);

    RAISE NOTICE 'Proceso "Ejecución de Proyecto" creado.';
  ELSE
    RAISE NOTICE 'Proceso "Ejecución de Proyecto" ya existe. Omitido.';
  END IF;

  -- ── ATENCIÓN AL CLIENTE / SOPORTE TÉCNICO ──────────────────────────────
  -- Proceso: Atención de Ticket
  IF NOT EXISTS (SELECT 1 FROM processes WHERE name = 'Atención de Ticket') THEN
    INSERT INTO processes (name, description)
      VALUES ('Atención de Ticket', 'Recepción, diagnóstico, resolución y cierre de tickets de soporte técnico.')
    RETURNING id INTO p_ticket;

    INSERT INTO process_areas   VALUES (p_ticket, a_atencion);
    INSERT INTO process_sub_areas VALUES (p_ticket, sa_soporte);

    INSERT INTO pipeline_stages (process_id, name, "order", global_status, duracion_estimada_dias) VALUES
      (p_ticket, 'Recepción y registro',          0, 'to_do',  0),
      (p_ticket, 'Clasificación y priorización',  1, 'to_do',  1),
      (p_ticket, 'Diagnóstico',                   2, 'doing',  2),
      (p_ticket, 'Resolución técnica',            3, 'doing',  3),
      (p_ticket, 'Verificación con el cliente',   4, 'review', 1),
      (p_ticket, 'Cierre del ticket',             5, 'done',   1);

    RAISE NOTICE 'Proceso "Atención de Ticket" creado.';
  ELSE
    RAISE NOTICE 'Proceso "Atención de Ticket" ya existe. Omitido.';
  END IF;

  -- ── ATENCIÓN AL CLIENTE / RECLAMOS ─────────────────────────────────────
  -- Proceso: Gestión de Reclamos
  IF NOT EXISTS (SELECT 1 FROM processes WHERE name = 'Gestión de Reclamos') THEN
    INSERT INTO processes (name, description)
      VALUES ('Gestión de Reclamos', 'Registro, análisis, resolución y seguimiento de reclamos de clientes.')
    RETURNING id INTO p_reclamo;

    INSERT INTO process_areas   VALUES (p_reclamo, a_atencion);
    INSERT INTO process_sub_areas VALUES (p_reclamo, sa_reclamos);

    INSERT INTO pipeline_stages (process_id, name, "order", global_status, duracion_estimada_dias) VALUES
      (p_reclamo, 'Registro del reclamo',         0, 'to_do',  1),
      (p_reclamo, 'Verificación de datos',        1, 'doing',  1),
      (p_reclamo, 'Análisis del caso',            2, 'doing',  3),
      (p_reclamo, 'Resolución y respuesta',       3, 'review', 2),
      (p_reclamo, 'Seguimiento de conformidad',   4, 'doing',  3),
      (p_reclamo, 'Cierre conforme',              5, 'done',   1);

    RAISE NOTICE 'Proceso "Gestión de Reclamos" creado.';
  ELSE
    RAISE NOTICE 'Proceso "Gestión de Reclamos" ya existe. Omitido.';
  END IF;

  RAISE NOTICE '✓ Seed de sub-áreas, procesos y pipelines completado.';

END $$;

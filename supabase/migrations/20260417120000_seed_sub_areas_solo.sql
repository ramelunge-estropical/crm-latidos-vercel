-- Seed rápido: sub-áreas para cada área existente
-- Idempotente: omite si ya existe (nombre + area_id)
DO $$
DECLARE
  a_atencion    UUID;
  a_comercial   UUID;
  a_finanzas    UUID;
  a_operaciones UUID;
  a_proyectos   UUID;
  a_rrhh        UUID;
BEGIN
  SELECT id INTO a_atencion    FROM areas_empresa WHERE nombre = 'Atención al Cliente' LIMIT 1;
  SELECT id INTO a_comercial   FROM areas_empresa WHERE nombre = 'Comercial'           LIMIT 1;
  SELECT id INTO a_finanzas    FROM areas_empresa WHERE nombre = 'Finanzas'            LIMIT 1;
  SELECT id INTO a_operaciones FROM areas_empresa WHERE nombre = 'Operaciones'         LIMIT 1;
  SELECT id INTO a_proyectos   FROM areas_empresa WHERE nombre = 'Proyectos'           LIMIT 1;
  SELECT id INTO a_rrhh        FROM areas_empresa WHERE nombre = 'RRHH'                LIMIT 1;

  -- Atención al Cliente
  IF a_atencion IS NOT NULL THEN
    INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
      SELECT a_atencion, v.nombre, v.color, v.orden FROM (VALUES
        ('Soporte Técnico', '#dc2626', 0),
        ('Reclamos',        '#b91c1c', 1),
        ('Fidelización',    '#ef4444', 2)
      ) AS v(nombre, color, orden)
      WHERE NOT EXISTS (
        SELECT 1 FROM sub_areas_empresa WHERE area_id = a_atencion AND nombre = v.nombre
      );
  END IF;

  -- Comercial
  IF a_comercial IS NOT NULL THEN
    INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
      SELECT a_comercial, v.nombre, v.color, v.orden FROM (VALUES
        ('Ventas',        '#2563eb', 0),
        ('Marketing',     '#1d4ed8', 1),
        ('Licitaciones',  '#1e40af', 2)
      ) AS v(nombre, color, orden)
      WHERE NOT EXISTS (
        SELECT 1 FROM sub_areas_empresa WHERE area_id = a_comercial AND nombre = v.nombre
      );
  END IF;

  -- Finanzas
  IF a_finanzas IS NOT NULL THEN
    INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
      SELECT a_finanzas, v.nombre, v.color, v.orden FROM (VALUES
        ('Contabilidad', '#059669', 0),
        ('Facturación',  '#047857', 1),
        ('Cobranzas',    '#065f46', 2)
      ) AS v(nombre, color, orden)
      WHERE NOT EXISTS (
        SELECT 1 FROM sub_areas_empresa WHERE area_id = a_finanzas AND nombre = v.nombre
      );
  END IF;

  -- Operaciones
  IF a_operaciones IS NOT NULL THEN
    INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
      SELECT a_operaciones, v.nombre, v.color, v.orden FROM (VALUES
        ('Logística',     '#d97706', 0),
        ('Compras',       '#b45309', 1),
        ('Mantenimiento', '#92400e', 2)
      ) AS v(nombre, color, orden)
      WHERE NOT EXISTS (
        SELECT 1 FROM sub_areas_empresa WHERE area_id = a_operaciones AND nombre = v.nombre
      );
  END IF;

  -- Proyectos
  IF a_proyectos IS NOT NULL THEN
    INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
      SELECT a_proyectos, v.nombre, v.color, v.orden FROM (VALUES
        ('Planificación', '#7c3aed', 0),
        ('Ejecución',     '#6d28d9', 1),
        ('Cierre',        '#5b21b6', 2)
      ) AS v(nombre, color, orden)
      WHERE NOT EXISTS (
        SELECT 1 FROM sub_areas_empresa WHERE area_id = a_proyectos AND nombre = v.nombre
      );
  END IF;

  -- RRHH
  IF a_rrhh IS NOT NULL THEN
    INSERT INTO sub_areas_empresa (area_id, nombre, color, orden)
      SELECT a_rrhh, v.nombre, v.color, v.orden FROM (VALUES
        ('Talento',      '#16a34a', 0),
        ('Capacitación', '#15803d', 1),
        ('Onboarding',   '#166534', 2)
      ) AS v(nombre, color, orden)
      WHERE NOT EXISTS (
        SELECT 1 FROM sub_areas_empresa WHERE area_id = a_rrhh AND nombre = v.nombre
      );
  END IF;

  RAISE NOTICE '✓ Sub-áreas insertadas correctamente.';
END $$;

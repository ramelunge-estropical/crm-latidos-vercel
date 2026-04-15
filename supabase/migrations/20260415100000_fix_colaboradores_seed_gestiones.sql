-- ═══════════════════════════════════════════════════════
-- Fix: dedup colaboradores + unique constraint + gestiones de ejemplo
-- ═══════════════════════════════════════════════════════

-- ── 1. Redirigir gestiones que apuntan a duplicados ────
-- Antes de borrar, actualizamos responsable_id al colaborador "canónico"
-- (el más antiguo por email)
UPDATE public.gestiones g
SET
  responsable_id     = canon.id,
  responsable_nombre = canon.nombre
FROM (
  SELECT DISTINCT ON (email) id, nombre, email
  FROM public.colaboradores
  WHERE email IS NOT NULL
  ORDER BY email, created_at ASC
) AS canon
JOIN public.colaboradores dup
  ON dup.email = canon.email
  AND dup.id  <> canon.id
WHERE g.responsable_id = dup.id;

-- ── 2. Eliminar duplicados (quedarse con el más antiguo por email) ──
DELETE FROM public.colaboradores
WHERE id NOT IN (
  SELECT DISTINCT ON (email) id
  FROM public.colaboradores
  WHERE email IS NOT NULL
  ORDER BY email, created_at ASC
);

-- ── 3. Unique constraint en email ─────────────────────
ALTER TABLE public.colaboradores
  DROP CONSTRAINT IF EXISTS colaboradores_email_unique;
ALTER TABLE public.colaboradores
  ADD CONSTRAINT colaboradores_email_unique UNIQUE (email);

-- ── 4. Gestiones de ejemplo para Roberto Amelunge ─────
DO $$
DECLARE
  v_roberto  UUID;
  v_luis     UUID;
  v_maria    UUID;
  v_sofia    UUID;
  v_proc     UUID;
  v_s_todo   UUID;
  v_s_doing  UUID;
  v_s_review UUID;
  v_s_done   UUID;
BEGIN
  -- Colaboradores
  SELECT id INTO v_roberto FROM public.colaboradores WHERE email = 'roberto.amelunge@latidos.com'  LIMIT 1;
  SELECT id INTO v_luis    FROM public.colaboradores WHERE email = 'luis.martinez@latidos.com'     LIMIT 1;
  SELECT id INTO v_maria   FROM public.colaboradores WHERE email = 'maria.gonzalez@latidos.com'    LIMIT 1;
  SELECT id INTO v_sofia   FROM public.colaboradores WHERE email = 'sofia.herrera@latidos.com'     LIMIT 1;

  -- Primer proceso disponible
  SELECT id INTO v_proc FROM public.processes ORDER BY created_at LIMIT 1;
  IF v_proc IS NULL THEN
    RAISE NOTICE 'No hay procesos. Creá al menos uno desde la app primero.';
    RETURN;
  END IF;

  -- Stages por global_status (fallback al primero disponible)
  SELECT id INTO v_s_todo   FROM public.pipeline_stages WHERE process_id = v_proc AND global_status = 'to_do'  ORDER BY "order" LIMIT 1;
  SELECT id INTO v_s_doing  FROM public.pipeline_stages WHERE process_id = v_proc AND global_status = 'doing'  ORDER BY "order" LIMIT 1;
  SELECT id INTO v_s_review FROM public.pipeline_stages WHERE process_id = v_proc AND global_status = 'review' ORDER BY "order" LIMIT 1;
  SELECT id INTO v_s_done   FROM public.pipeline_stages WHERE process_id = v_proc AND global_status = 'done'   ORDER BY "order" LIMIT 1;

  -- Fallback: si no hay stages con ese global_status, usar cualquiera
  IF v_s_todo   IS NULL THEN SELECT id INTO v_s_todo   FROM public.pipeline_stages WHERE process_id = v_proc ORDER BY "order" LIMIT 1; END IF;
  IF v_s_doing  IS NULL THEN v_s_doing  := v_s_todo; END IF;
  IF v_s_review IS NULL THEN v_s_review := v_s_todo; END IF;
  IF v_s_done   IS NULL THEN v_s_done   := v_s_todo; END IF;

  IF v_roberto IS NULL THEN
    RAISE NOTICE 'No se encontró roberto.amelunge@latidos.com en colaboradores.';
    RETURN;
  END IF;

  -- Gestiones para Roberto (comercial)
  INSERT INTO public.gestiones (title, description, priority, type, subtype, responsable_id, responsable_nombre, process_id, stage_id, due_date, cliente_nombre)
  VALUES
    ('Propuesta Viaje Corporativo TechCorp',   'Viaje para 25 ejecutivos a conferencia internacional en Miami', 'high',   'comercial', 'Oportunidad', v_roberto, 'Roberto Amelunge', v_proc, v_s_doing,  CURRENT_DATE + 7,  'TechCorp SA'),
    ('Seguimiento Lead Agencia XYZ',           'Reunión de presentación de servicios pendiente',                 'medium', 'comercial', 'Lead',        v_roberto, 'Roberto Amelunge', v_proc, v_s_todo,   CURRENT_DATE + 14, 'Agencia XYZ'),
    ('Renovación Contrato GlobalTrade',        'Contrato vence en 30 días, gestionar renovación',               'urgent', 'comercial', 'Renovación',  v_roberto, 'Roberto Amelunge', v_proc, v_s_review, CURRENT_DATE + 5,  'GlobalTrade Partners'),
    ('Cotización Paquete Familiar Cancún',     'Cliente interesado en paquete vacacional todo incluido',         'medium', 'comercial', 'Oportunidad', v_roberto, 'Roberto Amelunge', v_proc, v_s_todo,   CURRENT_DATE + 10, 'Familia Rodríguez');

  -- Gestiones para Roberto (operativa)
  INSERT INTO public.gestiones (title, description, priority, type, subtype, responsable_id, responsable_nombre, process_id, stage_id, due_date)
  VALUES
    ('Actualizar base de datos de clientes',   'Revisar y depurar registros duplicados en el sistema',          'medium', 'operativa', 'Mantenimiento', v_roberto, 'Roberto Amelunge', v_proc, v_s_doing,  CURRENT_DATE + 3),
    ('Reporte mensual de ventas febrero',      'Consolidar cifras y enviar a gerencia',                          'high',   'operativa', 'Tarea',         v_roberto, 'Roberto Amelunge', v_proc, v_s_review, CURRENT_DATE + 2);

  -- Gestión completada para Roberto
  INSERT INTO public.gestiones (title, description, priority, type, subtype, responsable_id, responsable_nombre, process_id, stage_id, due_date, cliente_nombre)
  VALUES
    ('Cierre Convenio Aerolíneas Sur',         'Convenio anual firmado y archivado',                             'high',   'comercial', 'Renovación',  v_roberto, 'Roberto Amelunge', v_proc, v_s_done,   CURRENT_DATE - 3, 'Aerolíneas Sur');

  -- Gestiones para Luis (operativa)
  IF v_luis IS NOT NULL THEN
    INSERT INTO public.gestiones (title, description, priority, type, subtype, responsable_id, responsable_nombre, process_id, stage_id, due_date)
    VALUES
      ('Auditoría de procesos Q1',             'Revisión de cumplimiento de procedimientos internos',            'medium', 'operativa', 'Auditoría',   v_luis, 'Luis Martínez', v_proc, v_s_todo,   CURRENT_DATE + 20),
      ('Aprobación presupuesto Q2',            'Validar y aprobar presupuesto operativo del segundo trimestre',  'high',   'operativa', 'Tarea',       v_luis, 'Luis Martínez', v_proc, v_s_doing,  CURRENT_DATE + 8);
  END IF;

  -- Gestión para Sofía (proyecto)
  IF v_sofia IS NOT NULL THEN
    INSERT INTO public.gestiones (title, description, priority, type, subtype, responsable_id, responsable_nombre, process_id, stage_id, due_date)
    VALUES
      ('Implementación módulo de reportes',    'Desarrollo e integración del módulo de reportes avanzados',     'high',   'proyecto', 'Desarrollo',  v_sofia, 'Sofía Herrera', v_proc, v_s_doing,  CURRENT_DATE + 30);
  END IF;

  RAISE NOTICE 'Gestiones de ejemplo creadas correctamente.';
END $$;

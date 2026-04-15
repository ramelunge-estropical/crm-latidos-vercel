-- ─────────────────────────────────────────────────────────────────────────────
-- Tablas: gestion_tipos, gestion_subtipos, process_areas
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tipos de gestión
CREATE TABLE IF NOT EXISTS public.gestion_tipos (
  id      uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre  text    NOT NULL,
  valor   text    NOT NULL UNIQUE,   -- valor técnico almacenado en gestiones.type
  color   text    NOT NULL DEFAULT '#6366f1',
  orden   int     NOT NULL DEFAULT 0,
  activo  boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.gestion_tipos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all gestion_tipos" ON public.gestion_tipos FOR ALL USING (true) WITH CHECK (true);

-- 2. Subtipos de gestión
CREATE TABLE IF NOT EXISTS public.gestion_subtipos (
  id      uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_id uuid    NOT NULL REFERENCES public.gestion_tipos(id) ON DELETE CASCADE,
  nombre  text    NOT NULL,
  orden   int     NOT NULL DEFAULT 0,
  activo  boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.gestion_subtipos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all gestion_subtipos" ON public.gestion_subtipos FOR ALL USING (true) WITH CHECK (true);

-- 3. Relación proceso ↔ áreas (many-to-many)
CREATE TABLE IF NOT EXISTS public.process_areas (
  process_id uuid NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  area_id    uuid NOT NULL REFERENCES public.areas_empresa(id) ON DELETE CASCADE,
  PRIMARY KEY (process_id, area_id)
);
ALTER TABLE public.process_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all process_areas" ON public.process_areas FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: tipos y subtipos iniciales (idempotente)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t_comercial uuid;
  t_proyecto  uuid;
  t_operativa uuid;
  t_caso      uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.gestion_tipos WHERE valor = 'comercial') THEN

    INSERT INTO public.gestion_tipos (nombre, valor, color, orden)
    VALUES ('Comercial', 'comercial', '#f59e0b', 0) RETURNING id INTO t_comercial;

    INSERT INTO public.gestion_tipos (nombre, valor, color, orden)
    VALUES ('Proyecto', 'proyecto', '#8b5cf6', 1) RETURNING id INTO t_proyecto;

    INSERT INTO public.gestion_tipos (nombre, valor, color, orden)
    VALUES ('Operativa', 'operativa', '#3b82f6', 2) RETURNING id INTO t_operativa;

    INSERT INTO public.gestion_tipos (nombre, valor, color, orden)
    VALUES ('Caso', 'caso', '#ef4444', 3) RETURNING id INTO t_caso;

    INSERT INTO public.gestion_subtipos (tipo_id, nombre, orden) VALUES
      (t_comercial, 'Lead',            0),
      (t_comercial, 'Oportunidad',     1),
      (t_comercial, 'Renovación',      2),
      (t_comercial, 'Upsell',          3),
      (t_proyecto,  'Implementación',  0),
      (t_proyecto,  'Migración',       1),
      (t_proyecto,  'Desarrollo',      2),
      (t_proyecto,  'Consultoría',     3),
      (t_operativa, 'Tarea',           0),
      (t_operativa, 'Mantenimiento',   1),
      (t_operativa, 'Proceso',         2),
      (t_operativa, 'Auditoría',       3),
      (t_caso,      'Incidencia',      0),
      (t_caso,      'Reclamo',         1),
      (t_caso,      'Consulta',        2),
      (t_caso,      'Solicitud',       3);

  END IF;
END $$;

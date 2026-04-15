-- ═══════════════════════════════════════════════════════
-- Colaboradores + global_status → 4 estados
-- ═══════════════════════════════════════════════════════

-- ── 1. Tabla colaboradores ────────────────────────────
CREATE TABLE IF NOT EXISTS public.colaboradores (
  id         UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre     TEXT    NOT NULL,
  email      TEXT,
  cargo      TEXT,
  area_id    UUID    REFERENCES public.areas_empresa(id),
  color      TEXT    NOT NULL DEFAULT '#6366f1',
  user_id    UUID    REFERENCES auth.users(id),   -- para futuro login
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_colaboradores" ON public.colaboradores;
DROP POLICY IF EXISTS "auth_all_colaboradores"  ON public.colaboradores;
CREATE POLICY "anon_read_colaboradores" ON public.colaboradores FOR SELECT TO anon        USING (true);
CREATE POLICY "auth_all_colaboradores"  ON public.colaboradores FOR ALL    TO authenticated USING (true);

-- ── 2. Seed: 10 colaboradores (area_id desde areas_empresa) ──
INSERT INTO public.colaboradores (nombre, email, cargo, area_id, color)
SELECT 'Roberto Amelunge','roberto.amelunge@latidos.com','Gerente Comercial',id,'#3b82f6'
FROM public.areas_empresa WHERE nombre='Comercial' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.colaboradores (nombre, email, cargo, area_id, color)
SELECT 'Carlos Rodríguez','carlos.rodriguez@latidos.com','Asesor Comercial',id,'#2563eb'
FROM public.areas_empresa WHERE nombre='Comercial' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.colaboradores (nombre, email, cargo, area_id, color)
SELECT 'María González','maria.gonzalez@latidos.com','Jefa de Operaciones',id,'#f59e0b'
FROM public.areas_empresa WHERE nombre='Operaciones' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.colaboradores (nombre, email, cargo, area_id, color)
SELECT 'Luis Martínez','luis.martinez@latidos.com','Coordinador Operativo',id,'#d97706'
FROM public.areas_empresa WHERE nombre='Operaciones' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.colaboradores (nombre, email, cargo, area_id, color)
SELECT 'Ana López','ana.lopez@latidos.com','Analista Financiero',id,'#10b981'
FROM public.areas_empresa WHERE nombre='Finanzas' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.colaboradores (nombre, email, cargo, area_id, color)
SELECT 'Pedro Sánchez','pedro.sanchez@latidos.com','Controller',id,'#059669'
FROM public.areas_empresa WHERE nombre='Finanzas' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.colaboradores (nombre, email, cargo, area_id, color)
SELECT 'Sofía Herrera','sofia.herrera@latidos.com','Project Manager',id,'#8b5cf6'
FROM public.areas_empresa WHERE nombre='Proyectos' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.colaboradores (nombre, email, cargo, area_id, color)
SELECT 'Diego Fernández','diego.fernandez@latidos.com','Desarrollador',id,'#7c3aed'
FROM public.areas_empresa WHERE nombre='Proyectos' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.colaboradores (nombre, email, cargo, area_id, color)
SELECT 'Valentina Torres','valentina.torres@latidos.com','Agente Senior',id,'#ef4444'
FROM public.areas_empresa WHERE nombre='Atención al Cliente' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.colaboradores (nombre, email, cargo, area_id, color)
SELECT 'Nicolás Ramírez','nicolas.ramirez@latidos.com','Agente',id,'#dc2626'
FROM public.areas_empresa WHERE nombre='Atención al Cliente' LIMIT 1
ON CONFLICT DO NOTHING;

-- ── 3. responsable_id en gestiones ───────────────────
ALTER TABLE public.gestiones
  ADD COLUMN IF NOT EXISTS responsable_id UUID REFERENCES public.colaboradores(id);

-- ── 4. global_status: 4 estados (to_do, doing, review, done) ──
ALTER TYPE public.global_status RENAME TO global_status_old;
CREATE TYPE public.global_status AS ENUM ('to_do', 'doing', 'review', 'done');

ALTER TABLE public.pipeline_stages
  ALTER COLUMN global_status DROP DEFAULT;

ALTER TABLE public.pipeline_stages
  ALTER COLUMN global_status TYPE public.global_status
  USING (
    CASE global_status::text
      WHEN 'todo'    THEN 'to_do'
      WHEN 'planned' THEN 'to_do'
      WHEN 'doing'   THEN 'doing'
      WHEN 'review'  THEN 'review'
      WHEN 'done'    THEN 'done'
      ELSE 'to_do'
    END
  )::public.global_status;

ALTER TABLE public.pipeline_stages
  ALTER COLUMN global_status SET DEFAULT 'to_do';

DROP TYPE public.global_status_old;

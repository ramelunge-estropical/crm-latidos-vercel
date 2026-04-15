
-- ═══════════════════════════════════════════════════════
-- Gestiones: áreas de empresa, tareas internas, identificadores
-- ═══════════════════════════════════════════════════════

-- ── 1. Tabla áreas de empresa ──────────────────────────
CREATE TABLE IF NOT EXISTS public.areas_empresa (
  id         UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre     TEXT    NOT NULL,
  color      TEXT    NOT NULL DEFAULT '#6366f1',
  icono      TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.areas_empresa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_areas" ON public.areas_empresa;
DROP POLICY IF EXISTS "auth_all_areas"  ON public.areas_empresa;
CREATE POLICY "anon_read_areas"  ON public.areas_empresa FOR SELECT TO anon        USING (true);
CREATE POLICY "auth_all_areas"   ON public.areas_empresa FOR ALL    TO authenticated USING (true);

INSERT INTO public.areas_empresa (nombre, color, icono) VALUES
  ('Comercial',           '#3b82f6', 'briefcase'),
  ('Operaciones',         '#f59e0b', 'settings'),
  ('Finanzas',            '#10b981', 'dollar-sign'),
  ('Proyectos',           '#8b5cf6', 'folder'),
  ('Atención al Cliente', '#ef4444', 'headphones')
ON CONFLICT DO NOTHING;

-- ── 2. Tareas internas de gestión ─────────────────────
CREATE TABLE IF NOT EXISTS public.gestion_tareas (
  id           UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  gestion_id   UUID    NOT NULL REFERENCES public.gestiones(id) ON DELETE CASCADE,
  titulo       TEXT    NOT NULL,
  descripcion  TEXT,
  estado       TEXT    NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente','en_progreso','revision','completado')),
  asignado_a   TEXT,
  fecha_limite DATE,
  orden        INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gestion_tareas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_tareas" ON public.gestion_tareas;
DROP POLICY IF EXISTS "auth_all_tareas"  ON public.gestion_tareas;
CREATE POLICY "anon_read_tareas" ON public.gestion_tareas FOR SELECT TO anon        USING (true);
CREATE POLICY "auth_all_tareas"  ON public.gestion_tareas FOR ALL    TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_gestion_tareas_gestion_id ON public.gestion_tareas(gestion_id);

-- ── 3. Extender tabla gestiones ───────────────────────
ALTER TABLE public.gestiones
  ADD COLUMN IF NOT EXISTS codigo          TEXT,
  ADD COLUMN IF NOT EXISTS area_id         UUID REFERENCES public.areas_empresa(id),
  ADD COLUMN IF NOT EXISTS cliente_nombre  TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gestiones_codigo
  ON public.gestiones(codigo) WHERE codigo IS NOT NULL;

-- ── 4. Extender tabla processes ───────────────────────
ALTER TABLE public.processes
  ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.areas_empresa(id);

-- ── 5. Trigger: auto-generar código ───────────────────
CREATE OR REPLACE FUNCTION public.generate_gestion_codigo()
RETURNS TRIGGER AS $$
DECLARE v_prefix TEXT; v_next_num INTEGER;
BEGIN
  v_prefix := CASE NEW.type
    WHEN 'comercial' THEN 'COM' WHEN 'proyecto' THEN 'PRO'
    WHEN 'operativa' THEN 'OPE' WHEN 'caso'     THEN 'CAS'
    ELSE 'GES' END;
  SELECT COALESCE(MAX(CAST(SPLIT_PART(codigo,'-',2) AS INTEGER)),0)+1
    INTO v_next_num FROM public.gestiones WHERE codigo LIKE v_prefix||'-%';
  NEW.codigo := v_prefix||'-'||LPAD(v_next_num::TEXT,4,'0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gestion_codigo ON public.gestiones;
CREATE TRIGGER trg_gestion_codigo
  BEFORE INSERT ON public.gestiones FOR EACH ROW
  WHEN (NEW.codigo IS NULL)
  EXECUTE FUNCTION public.generate_gestion_codigo();

-- Backfill códigos existentes
DO $$
DECLARE rec RECORD; v_prefix TEXT; v_next_num INTEGER;
BEGIN
  FOR rec IN SELECT id, type FROM public.gestiones WHERE codigo IS NULL ORDER BY created_at LOOP
    v_prefix := CASE rec.type WHEN 'comercial' THEN 'COM' WHEN 'proyecto' THEN 'PRO'
      WHEN 'operativa' THEN 'OPE' WHEN 'caso' THEN 'CAS' ELSE 'GES' END;
    SELECT COALESCE(MAX(CAST(SPLIT_PART(codigo,'-',2) AS INTEGER)),0)+1
      INTO v_next_num FROM public.gestiones WHERE codigo LIKE v_prefix||'-%';
    UPDATE public.gestiones SET codigo = v_prefix||'-'||LPAD(v_next_num::TEXT,4,'0') WHERE id = rec.id;
  END LOOP;
END $$;

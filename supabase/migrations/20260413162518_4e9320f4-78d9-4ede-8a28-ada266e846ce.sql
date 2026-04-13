
-- Enum for global status
CREATE TYPE public.global_status AS ENUM ('todo', 'planned', 'doing', 'review', 'done');

-- Enum for priority
CREATE TYPE public.gestion_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- Processes table (boards)
CREATE TABLE public.processes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  area TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view processes"
  ON public.processes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create processes"
  ON public.processes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update processes"
  ON public.processes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete processes"
  ON public.processes FOR DELETE TO authenticated USING (true);

-- Pipeline stages table (columns)
CREATE TABLE public.pipeline_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  global_status public.global_status NOT NULL DEFAULT 'todo',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stages"
  ON public.pipeline_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create stages"
  ON public.pipeline_stages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update stages"
  ON public.pipeline_stages FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete stages"
  ON public.pipeline_stages FOR DELETE TO authenticated USING (true);

-- Gestiones table (cards)
CREATE TABLE public.gestiones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id),
  priority public.gestion_priority NOT NULL DEFAULT 'medium',
  due_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.gestiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view gestiones"
  ON public.gestiones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create gestiones"
  ON public.gestiones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update gestiones"
  ON public.gestiones FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete gestiones"
  ON public.gestiones FOR DELETE TO authenticated USING (true);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers
CREATE TRIGGER update_processes_updated_at
  BEFORE UPDATE ON public.processes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pipeline_stages_updated_at
  BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gestiones_updated_at
  BEFORE UPDATE ON public.gestiones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

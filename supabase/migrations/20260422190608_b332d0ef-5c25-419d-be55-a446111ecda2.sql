-- 1) Presencia de colaboradores
CREATE TABLE IF NOT EXISTS public.colaborador_presencia (
  colaborador_id uuid PRIMARY KEY REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'desconectado',
  -- estados válidos: 'disponible' | 'ocupado' | 'pausa' | 'desconectado'
  capacidad_maxima integer NOT NULL DEFAULT 5,
  chats_abiertos integer NOT NULL DEFAULT 0,
  ultima_actividad timestamp with time zone NOT NULL DEFAULT now(),
  motivo_pausa text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.colaborador_presencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view colaborador_presencia"
  ON public.colaborador_presencia FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Anyone can insert colaborador_presencia"
  ON public.colaborador_presencia FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Anyone can update colaborador_presencia"
  ON public.colaborador_presencia FOR UPDATE
  TO anon, authenticated USING (true);

-- Trigger updated_at
CREATE TRIGGER trg_colaborador_presencia_updated_at
  BEFORE UPDATE ON public.colaborador_presencia
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sembrar presencia para colaboradores existentes (estado disponible por defecto, así la derivación funciona out-of-the-box en demo)
INSERT INTO public.colaborador_presencia (colaborador_id, estado, capacidad_maxima, chats_abiertos)
SELECT id, 'disponible', 5, 0
FROM public.colaboradores
WHERE activo = true
ON CONFLICT (colaborador_id) DO NOTHING;

-- 2) Bitácora de derivaciones
CREATE TABLE IF NOT EXISTS public.chat_derivaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES public.lat_conversaciones(id) ON DELETE CASCADE,
  -- quién deriva
  derivado_por_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  derivado_por_nombre text,
  -- destino nominal (lo que el usuario eligió)
  destino_tipo text NOT NULL, -- 'usuario' | 'equipo'
  destino_usuario_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  destino_usuario_nombre text,
  destino_area_id uuid REFERENCES public.areas_empresa(id) ON DELETE SET NULL,
  destino_area_nombre text,
  -- destino efectivo (lo que terminó pasando)
  efectivo_tipo text NOT NULL, -- 'usuario' | 'cola'
  efectivo_usuario_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  efectivo_usuario_nombre text,
  efectivo_area_id uuid REFERENCES public.areas_empresa(id) ON DELETE SET NULL,
  efectivo_area_nombre text,
  -- fallback
  hubo_fallback boolean NOT NULL DEFAULT false,
  motivo_fallback text,
  -- estado del usuario nominal al momento de derivar
  presencia_destino text,
  capacidad_destino integer,
  chats_abiertos_destino integer,
  -- nota / contexto
  nota text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_derivaciones_conv ON public.chat_derivaciones(conversacion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_derivaciones_efectivo_area ON public.chat_derivaciones(efectivo_area_id) WHERE efectivo_tipo = 'cola';

ALTER TABLE public.chat_derivaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view chat_derivaciones"
  ON public.chat_derivaciones FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Anyone can insert chat_derivaciones"
  ON public.chat_derivaciones FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- 3) Agregar columna en lat_conversaciones para distinguir "en cola de equipo" de "asignado a usuario"
ALTER TABLE public.lat_conversaciones
  ADD COLUMN IF NOT EXISTS cola_area_id uuid REFERENCES public.areas_empresa(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cola_area_nombre text,
  ADD COLUMN IF NOT EXISTS en_cola boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_lat_conv_cola ON public.lat_conversaciones(cola_area_id) WHERE en_cola = true;
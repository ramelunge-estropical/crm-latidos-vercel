-- 1. Vínculo gestion_id en conversaciones (1:N - una gestión, varias conversaciones)
ALTER TABLE public.lat_conversaciones
  ADD COLUMN IF NOT EXISTS gestion_id uuid REFERENCES public.gestiones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lat_conv_gestion_id
  ON public.lat_conversaciones(gestion_id) WHERE gestion_id IS NOT NULL;

-- 2. Trazabilidad inversa en gestiones: conversación origen + canal origen
ALTER TABLE public.gestiones
  ADD COLUMN IF NOT EXISTS conversacion_id_origen uuid REFERENCES public.lat_conversaciones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS canal_origen text;

CREATE INDEX IF NOT EXISTS idx_gestiones_conv_origen
  ON public.gestiones(conversacion_id_origen) WHERE conversacion_id_origen IS NOT NULL;

-- 3. Tabla de eventos de auditoría entre módulos
CREATE TABLE IF NOT EXISTS public.gestion_conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestion_id uuid REFERENCES public.gestiones(id) ON DELETE CASCADE,
  conversacion_id uuid REFERENCES public.lat_conversaciones(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- 'gestion_created_from_conv' | 'conv_linked' | 'conv_unlinked' | 'conv_reactivated' | 'conv_reassigned' | 'gestion_created_for_conv' | 'derivacion_interna'
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gce_gestion ON public.gestion_conversation_events(gestion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gce_conv    ON public.gestion_conversation_events(conversacion_id, created_at DESC);

ALTER TABLE public.gestion_conversation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view gce"
  ON public.gestion_conversation_events FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert gce"
  ON public.gestion_conversation_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
-- ═══════════════════════════════════════════════════════════════════════════
-- LAT Queue Processor v2 — Cubrir también estado 'en_cola'
-- Conversaciones en_cola sin agente asignado quedan atascadas igual que
-- en_espera. Se amplían el trigger y el cron para procesar ambos estados.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Índice parcial adicional para en_cola ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_lat_conv_en_cola_fifo
  ON lat_conversaciones (created_at ASC)
  WHERE estado_asignacion = 'en_cola';


-- ── 2. Actualizar función del trigger para cubrir ambos estados ───────────────

CREATE OR REPLACE FUNCTION public.lat_trigger_queue_on_agent_free()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF  NEW.conectado = true
  AND NEW.estado    = 'disponible'
  AND (
        ( OLD.conectado IS DISTINCT FROM NEW.conectado AND NEW.conectado = true )
     OR ( OLD.estado    IS DISTINCT FROM NEW.estado    AND NEW.estado = 'disponible' )
     OR ( NEW.chats_abiertos < OLD.chats_abiertos )
  )
  THEN
    IF EXISTS (
      SELECT 1 FROM public.lat_conversaciones
      WHERE  estado_asignacion IN ('en_cola', 'en_espera')
      LIMIT  1
    ) THEN
      PERFORM net.http_post(
        url     := 'https://qadfjbgfdejmhblgvaef.supabase.co/functions/v1/lat-process-queue',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := jsonb_build_object('source', 'trigger', 'colaborador_id', NEW.colaborador_id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- ── 3. Actualizar cron para cubrir ambos estados ──────────────────────────────

SELECT cron.unschedule('lat-queue-safety-net')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'lat-queue-safety-net'
);

SELECT cron.schedule(
  'lat-queue-safety-net',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://qadfjbgfdejmhblgvaef.supabase.co/functions/v1/lat-process-queue',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{"source":"cron"}'::jsonb
  ) AS request_id
  FROM lat_conversaciones
  WHERE estado_asignacion IN ('en_cola', 'en_espera')
  LIMIT 1;
  $$
);

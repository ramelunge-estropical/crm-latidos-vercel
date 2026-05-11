-- ═══════════════════════════════════════════════════════════════════════════
-- LAT Queue Processor — Re-asignación automática de conversaciones en_espera
-- Cuando un agente gana disponibilidad, dispara lat-process-queue (FIFO)
-- Red de seguridad: pg_cron cada 3 minutos
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net;


-- ── 1. Índice parcial: acelera el SELECT de cola en_espera ───────────────────

CREATE INDEX IF NOT EXISTS idx_lat_conv_en_espera_fifo
  ON lat_conversaciones (created_at ASC)
  WHERE estado_asignacion = 'en_espera';


-- ── 2. Función del trigger ───────────────────────────────────────────────────
-- Reacciona SOLO cuando el agente GANA disponibilidad (nunca cuando la pierde).
-- Condición anti-cascade: `NEW.chats_abiertos < OLD.chats_abiertos` es FALSE
-- cuando incrementarChatsAbiertos sube el contador → no hay loops.

CREATE OR REPLACE FUNCTION public.lat_trigger_queue_on_agent_free()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF  NEW.conectado = true
  AND NEW.estado    = 'disponible'
  AND (
        -- Agente se conectó
        ( OLD.conectado IS DISTINCT FROM NEW.conectado AND NEW.conectado = true )
        -- Pasó a estado disponible
     OR ( OLD.estado    IS DISTINCT FROM NEW.estado    AND NEW.estado = 'disponible' )
        -- Cerró un chat (chats_abiertos bajó — nunca sube aquí)
     OR ( NEW.chats_abiertos < OLD.chats_abiertos )
  )
  THEN
    -- Invocar solo si existe cola real (evita HTTP innecesarios)
    IF EXISTS (
      SELECT 1 FROM public.lat_conversaciones
      WHERE  estado_asignacion = 'en_espera'
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


-- ── 3. Trigger en colaborador_presencia ─────────────────────────────────────

DROP TRIGGER IF EXISTS trg_presencia_libera_cola ON public.colaborador_presencia;

CREATE TRIGGER trg_presencia_libera_cola
  AFTER UPDATE OF conectado, estado, chats_abiertos
  ON public.colaborador_presencia
  FOR EACH ROW
  EXECUTE FUNCTION public.lat_trigger_queue_on_agent_free();


-- ── 4. pg_cron: red de seguridad cada 3 minutos ──────────────────────────────
-- Solo invoca la función si hay al menos una conversación en_espera.
-- Patrón idéntico al cron existente lat-email-agent-poll.

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
  WHERE estado_asignacion = 'en_espera'
  LIMIT 1;
  $$
);

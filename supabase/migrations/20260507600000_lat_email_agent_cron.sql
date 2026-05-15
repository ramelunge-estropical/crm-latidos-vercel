-- ═══════════════════════════════════════════════════════════════════════════
-- LAT Email Agent Cron — polling automático cada 5 minutos
-- Requiere extensiones pg_cron y pg_net (habilitadas por defecto en Supabase)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Eliminar job anterior si existe (idempotente)
SELECT cron.unschedule('lat-email-agent-poll')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'lat-email-agent-poll'
);

-- Programar polling cada 5 minutos
-- verify_jwt=false permite llamar sin Authorization header
SELECT cron.schedule(
  'lat-email-agent-poll',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://qadfjbgfdejmhblgvaef.supabase.co/functions/v1/lat-email-agent',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

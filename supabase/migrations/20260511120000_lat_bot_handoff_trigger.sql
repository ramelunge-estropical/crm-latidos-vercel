-- ═══════════════════════════════════════════════════════════════════════════
-- LAT Bot Handoff Trigger — Disparo de asignación directo desde la BD
--
-- Reemplaza el triggerAssignEngine HTTP fire-and-forget del bot.
-- Cuando bot_estado cambia a 'handed_off' y hay cola_id válida, la BD
-- llama a lat-process-queue vía pg_net dentro de la misma transacción.
-- Garantía: si el UPDATE del bot persiste, el disparo también persiste.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.lat_trigger_bot_handoff_assign()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.bot_estado = 'handed_off'
     AND (OLD.bot_estado IS DISTINCT FROM NEW.bot_estado)
     AND NEW.cola_id IS NOT NULL
  THEN
    PERFORM net.http_post(
      url     := 'https://qadfjbgfdejmhblgvaef.supabase.co/functions/v1/lat-process-queue',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := jsonb_build_object('source', 'bot_handoff', 'conversacion_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bot_handoff_assign ON public.lat_conversaciones;

CREATE TRIGGER trg_bot_handoff_assign
  AFTER UPDATE OF bot_estado
  ON public.lat_conversaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.lat_trigger_bot_handoff_assign();

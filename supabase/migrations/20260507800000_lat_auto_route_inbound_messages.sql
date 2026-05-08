-- LAT: safety net de enrutamiento automatico para todo mensaje entrante.
-- Cada INSERT inbound en lat_mensajes invoca lat-routing-engine.
-- Si la conversacion ya esta asignada, el motor responde ya_asignada y no la mueve.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.lat_trigger_route_inbound_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_canal TEXT;
  v_canal_id UUID;
  v_message TEXT;
BEGIN
  IF NEW.tipo IS DISTINCT FROM 'inbound' THEN
    RETURN NEW;
  END IF;

  SELECT canal, COALESCE(canal_entrante_id, canal_id_fk)
    INTO v_canal, v_canal_id
    FROM public.lat_conversaciones
   WHERE id = NEW.conversacion_id;

  IF v_canal IS NULL THEN
    RETURN NEW;
  END IF;

  v_message := COALESCE(to_jsonb(NEW)->>'email_subject', NEW.contenido, '');

  PERFORM net.http_post(
    url := 'https://qadfjbgfdejmhblgvaef.supabase.co/functions/v1/lat-routing-engine',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_strip_nulls(jsonb_build_object(
      'conversation_id', NEW.conversacion_id,
      'channel_id', v_canal_id,
      'channel_type', v_canal,
      'message_content', v_message,
      'metadata', jsonb_build_object(
        'canal_tipo', v_canal,
        'texto_mensaje', v_message,
        'mensaje_inicial', v_message,
        'email_from', to_jsonb(NEW)->>'email_from_email',
        'email_subject', to_jsonb(NEW)->>'email_subject'
      )
    ))
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lat_auto_route_inbound_message ON public.lat_mensajes;

CREATE TRIGGER trg_lat_auto_route_inbound_message
  AFTER INSERT ON public.lat_mensajes
  FOR EACH ROW
  EXECUTE FUNCTION public.lat_trigger_route_inbound_message();

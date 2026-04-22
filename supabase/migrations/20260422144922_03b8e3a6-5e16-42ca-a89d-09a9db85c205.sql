-- Storage bucket para adjuntos LAT (imágenes, documentos, audios WhatsApp)
INSERT INTO storage.buckets (id, name, public)
VALUES ('lat-adjuntos', 'lat-adjuntos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policies: lectura pública (los adjuntos se sirven directo) + escritura abierta (solo edge functions usan service role)
CREATE POLICY "Public read lat-adjuntos"
ON storage.objects FOR SELECT
USING (bucket_id = 'lat-adjuntos');

CREATE POLICY "Anyone can upload lat-adjuntos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'lat-adjuntos');

CREATE POLICY "Anyone can update lat-adjuntos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'lat-adjuntos');

-- Trigger update_lat_conv_on_message: NO incrementar no_leidos si tipo es sistema
CREATE OR REPLACE FUNCTION public.update_lat_conv_on_message()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE lat_conversaciones
  SET
    ultimo_mensaje       = LEFT(COALESCE(NEW.contenido, '[adjunto]'), 160),
    ultima_interaccion   = NEW.created_at,
    no_leidos            = CASE WHEN NEW.tipo = 'inbound' THEN no_leidos + 1 ELSE no_leidos END,
    ventana_whatsapp     = CASE WHEN NEW.tipo = 'inbound' THEN NOW() + INTERVAL '24 hours' ELSE ventana_whatsapp END,
    en_foco              = CASE WHEN NEW.tipo = 'inbound' THEN true ELSE en_foco END,
    estado               = CASE
                             WHEN NEW.tipo = 'inbound' AND estado = 'liberado' THEN 'abierto'
                             ELSE estado
                           END
  WHERE id = NEW.conversacion_id;
  RETURN NEW;
END;
$function$;

-- Asegurar trigger
DROP TRIGGER IF EXISTS trg_update_lat_conv_on_message ON public.lat_mensajes;
CREATE TRIGGER trg_update_lat_conv_on_message
AFTER INSERT ON public.lat_mensajes
FOR EACH ROW EXECUTE FUNCTION public.update_lat_conv_on_message();
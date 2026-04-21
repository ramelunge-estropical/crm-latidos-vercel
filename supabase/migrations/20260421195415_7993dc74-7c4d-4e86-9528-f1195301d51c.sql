-- 1) Agregar columna en_foco a lat_conversaciones
-- Por defecto true: toda conversación nueva entra al foco de Bandeja
ALTER TABLE public.lat_conversaciones
  ADD COLUMN IF NOT EXISTS en_foco boolean NOT NULL DEFAULT true;

-- Índice para filtrar rápido el foco principal de bandeja
CREATE INDEX IF NOT EXISTS idx_lat_conv_en_foco
  ON public.lat_conversaciones (en_foco, ultima_interaccion DESC);

-- 2) Permitir el estado 'liberado' (no usamos CHECK, dejamos abierto como ya está)
-- Solo documentamos: estados válidos: nuevo, abierto, en_curso, urgente, pausado, cerrado, liberado

-- 3) Trigger: cuando entra un nuevo mensaje INBOUND, reactivar conversación al foco de Bandeja
-- Esto extiende update_lat_conv_on_message agregando en_foco = true en mensajes entrantes
CREATE OR REPLACE FUNCTION public.update_lat_conv_on_message()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE lat_conversaciones
  SET
    ultimo_mensaje       = LEFT(NEW.contenido, 160),
    ultima_interaccion   = NEW.created_at,
    no_leidos            = CASE WHEN NEW.tipo = 'inbound' THEN no_leidos + 1 ELSE no_leidos END,
    ventana_whatsapp     = CASE WHEN NEW.tipo = 'inbound' THEN NOW() + INTERVAL '24 hours' ELSE ventana_whatsapp END,
    -- Reactivar al foco de Bandeja con cualquier mensaje entrante o llamada/correo del cliente
    en_foco              = CASE WHEN NEW.tipo = 'inbound' THEN true ELSE en_foco END,
    -- Si estaba 'liberado' y entra mensaje, vuelve a 'abierto'
    estado               = CASE
                             WHEN NEW.tipo = 'inbound' AND estado = 'liberado' THEN 'abierto'
                             ELSE estado
                           END
  WHERE id = NEW.conversacion_id;
  RETURN NEW;
END;
$function$;

-- Asegurar que el trigger esté activo en lat_mensajes
DROP TRIGGER IF EXISTS trg_lat_conv_on_message ON public.lat_mensajes;
CREATE TRIGGER trg_lat_conv_on_message
  AFTER INSERT ON public.lat_mensajes
  FOR EACH ROW EXECUTE FUNCTION public.update_lat_conv_on_message();

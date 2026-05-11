-- lat-bot-agent v3: tabla de auditoría + horario configurable en lat_bot_config

-- 1. Tabla de auditoría de routing
CREATE TABLE IF NOT EXISTS "public"."lat_routing_audit_log" (
  "id"                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "conversacion_id"     uuid REFERENCES "public"."lat_conversaciones"("id") ON DELETE CASCADE,
  "turno"               integer,
  "mensaje_cliente"     text,
  "accion"              text,
  "intencion_detectada" text,
  "cola_sugerida"       text,
  "cola_id"             uuid,
  "confianza"           numeric(3,2),
  "motivo"              text,
  "output_modelo"       jsonb,
  "created_at"          timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "public"."lat_routing_audit_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lat_routing_audit_log_all" ON "public"."lat_routing_audit_log" USING (true) WITH CHECK (true);

-- 2. Horario configurable en lat_bot_config (franjas por día de semana)
--    Formato franjas: {"1":["08:00-19:00"],"2":["08:00-19:00"],...,"6":["08:00-13:00"]}
--    Claves: 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
ALTER TABLE "public"."lat_bot_config"
  ADD COLUMN IF NOT EXISTS "horario_zona_horaria" text DEFAULT 'America/La_Paz',
  ADD COLUMN IF NOT EXISTS "horario_franjas" jsonb DEFAULT '{
    "1": ["08:00-19:00"],
    "2": ["08:00-19:00"],
    "3": ["08:00-19:00"],
    "4": ["08:00-19:00"],
    "5": ["08:00-19:00"],
    "6": ["08:00-13:00"]
  }'::jsonb;

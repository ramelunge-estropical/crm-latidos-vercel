-- lat_canales: soporte de bot/agente IA como fallback (además de cola)
ALTER TABLE lat_canales
  ADD COLUMN IF NOT EXISTS bot_default_id UUID REFERENCES lat_bot_config(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- LAT: Tablas para conversaciones y mensajes reales
-- Soporta WhatsApp, Email y Phone
-- ═══════════════════════════════════════════════════════════════════════════

-- ── lat_conversaciones ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lat_conversaciones (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Referencia al cliente (nullable: puede venir de un número desconocido)
  cliente_id           UUID        REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre       TEXT,
  telefono             TEXT,
  canal                TEXT        NOT NULL DEFAULT 'whatsapp', -- whatsapp | email | phone
  estado               TEXT        NOT NULL DEFAULT 'nuevo',
    -- nuevo | pendiente_respuesta | en_seguimiento | urgente | fuera_ventana | con_tarea | finalizado
  asunto               TEXT,
  ultimo_mensaje       TEXT,
  ultima_interaccion   TIMESTAMPTZ DEFAULT now(),
  no_leidos            INTEGER     DEFAULT 0,
  prioridad            TEXT        DEFAULT 'media', -- urgente | alta | media | baja
  responsable_id       UUID        REFERENCES colaboradores(id) ON DELETE SET NULL,
  responsable_nombre   TEXT,
  proxima_accion       TEXT,
  ventana_whatsapp     TIMESTAMPTZ,  -- expira 24h después del último mensaje entrante
  wpp_contact_id       TEXT,         -- ID de contacto en WhatsApp Business API
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lat_conv_cliente       ON lat_conversaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_lat_conv_telefono      ON lat_conversaciones(telefono);
CREATE INDEX IF NOT EXISTS idx_lat_conv_ultima        ON lat_conversaciones(ultima_interaccion DESC);
CREATE INDEX IF NOT EXISTS idx_lat_conv_estado        ON lat_conversaciones(estado);

ALTER TABLE lat_conversaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all lat_conversaciones" ON lat_conversaciones FOR ALL USING (true) WITH CHECK (true);

-- ── lat_mensajes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lat_mensajes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id  UUID        NOT NULL REFERENCES lat_conversaciones(id) ON DELETE CASCADE,
  tipo             TEXT        NOT NULL DEFAULT 'inbound',
    -- inbound | outbound | nota_interna | sistema
  contenido        TEXT        NOT NULL,
  estado           TEXT        DEFAULT 'enviado',
    -- enviado | entregado | leido | fallido | pendiente
  adjunto_url      TEXT,
  adjunto_nombre   TEXT,
  adjunto_tipo     TEXT,
  wpp_message_id   TEXT,       -- ID del mensaje en la API de WhatsApp (dedup)
  autor_nombre     TEXT,       -- para notas internas: nombre del colaborador
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lat_msg_conv   ON lat_mensajes(conversacion_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lat_msg_wpp_id ON lat_mensajes(wpp_message_id) WHERE wpp_message_id IS NOT NULL;

ALTER TABLE lat_mensajes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all lat_mensajes" ON lat_mensajes FOR ALL USING (true) WITH CHECK (true);

-- ── Trigger: updated_at en lat_conversaciones ────────────────────────────
CREATE OR REPLACE FUNCTION update_lat_conv_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lat_conv_updated_at ON lat_conversaciones;
CREATE TRIGGER trg_lat_conv_updated_at
  BEFORE UPDATE ON lat_conversaciones
  FOR EACH ROW EXECUTE FUNCTION update_lat_conv_updated_at();

-- ── Trigger: actualizar último mensaje en conversación ───────────────────
CREATE OR REPLACE FUNCTION update_lat_conv_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE lat_conversaciones
  SET
    ultimo_mensaje       = LEFT(NEW.contenido, 160),
    ultima_interaccion   = NEW.created_at,
    -- Sumar no_leidos solo en mensajes entrantes
    no_leidos            = CASE WHEN NEW.tipo = 'inbound' THEN no_leidos + 1 ELSE no_leidos END,
    -- Actualizar ventana WhatsApp si es entrante (24h desde ahora)
    ventana_whatsapp     = CASE WHEN NEW.tipo = 'inbound' THEN NOW() + INTERVAL '24 hours' ELSE ventana_whatsapp END
  WHERE id = NEW.conversacion_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lat_msg_update_conv ON lat_mensajes;
CREATE TRIGGER trg_lat_msg_update_conv
  AFTER INSERT ON lat_mensajes
  FOR EACH ROW EXECUTE FUNCTION update_lat_conv_on_message();

-- Habilitar Realtime para actualizaciones en tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE lat_conversaciones;
ALTER PUBLICATION supabase_realtime ADD TABLE lat_mensajes;

-- lat_colas: estrategia enriquecida + configuración de desborde
ALTER TABLE lat_colas
  ADD COLUMN IF NOT EXISTS tiempo_reserva_comunicacion  INTEGER  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tiempo_reserva_mensajes      INTEGER  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tiempo_redistribucion        INTEGER  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS redistribuir_ausentes        BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_tipificacion_ausentes   BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS desborde_activo              BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS desborde_cola_id             UUID     REFERENCES lat_colas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS desborde_tiempo_espera       INTEGER  NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS desborde_condiciones         TEXT[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS desborde_registrar           BOOLEAN  NOT NULL DEFAULT true;

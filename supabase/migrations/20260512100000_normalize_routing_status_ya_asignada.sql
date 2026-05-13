-- Normaliza routing_status: unifica 'ya_asignada' → 'asignada'.
-- 'ya_asignada' era un alias interno del routing engine para indicar que la
-- conversación ya tenía agente activo. Semánticamente equivale a 'asignada'.

UPDATE lat_conversaciones
SET routing_status = 'asignada'
WHERE routing_status = 'ya_asignada';

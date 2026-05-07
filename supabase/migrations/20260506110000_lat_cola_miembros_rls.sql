-- lat_cola_miembros: habilitar RLS con política permisiva (mismo patrón que lat_*)
DROP POLICY IF EXISTS "Allow all lat_cola_miembros" ON lat_cola_miembros;
ALTER TABLE lat_cola_miembros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all lat_cola_miembros" ON lat_cola_miembros FOR ALL USING (true) WITH CHECK (true);

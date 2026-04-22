-- Reemplazar policy de lectura para evitar listing masivo del bucket
DROP POLICY IF EXISTS "Public read lat-adjuntos" ON storage.objects;

-- Lectura pública SOLO para object names dentro del bucket (acceso por path conocido).
-- Como el bucket es público, las URLs públicas siguen sirviendo cada archivo por path,
-- pero esta policy evita LIST() masivo sin un path/prefix.
CREATE POLICY "Public read lat-adjuntos by path"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'lat-adjuntos'
  AND name IS NOT NULL
  AND name <> ''
);
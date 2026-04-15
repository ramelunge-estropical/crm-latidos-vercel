-- Eliminar áreas duplicadas (dejar solo la primera por nombre)
DELETE FROM public.areas_empresa
WHERE id NOT IN (
  SELECT MIN(id::text)::uuid
  FROM public.areas_empresa
  GROUP BY nombre
);

-- Agregar UNIQUE constraint para evitar duplicados futuros
ALTER TABLE public.areas_empresa
  ADD CONSTRAINT areas_empresa_nombre_unique UNIQUE (nombre);

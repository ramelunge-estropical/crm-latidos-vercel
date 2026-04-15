-- Agregar campo rol a colaboradores
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'colaborador'
  CHECK (rol IN ('admin', 'gerente', 'colaborador', 'viewer'));

-- Dar rol admin al primer colaborador (Roberto)
UPDATE public.colaboradores SET rol = 'admin'
WHERE email = 'roberto.amelunge@latidos.com';

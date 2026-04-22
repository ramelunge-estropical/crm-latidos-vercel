INSERT INTO colaboradores (id, nombre, cargo, email, color, activo, rol)
VALUES
  (gen_random_uuid(), 'Franklin Romero',        'Líder de Desarrollo',     'fromero@estropical.com',    '#6366f1', true, 'colaborador'),
  (gen_random_uuid(), 'Jose Manuel Gutierrez',  'Analista de Innovación',  'jmgutierrez@estropical.com', '#10b981', true, 'colaborador')
ON CONFLICT (email) DO NOTHING;

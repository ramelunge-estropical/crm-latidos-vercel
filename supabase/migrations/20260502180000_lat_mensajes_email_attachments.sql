-- Agrega columna para almacenar múltiples adjuntos de correo
alter table lat_mensajes
  add column if not exists email_attachments jsonb default '[]'::jsonb;

comment on column lat_mensajes.email_attachments is
  'Array de adjuntos: [{url, nombre, tipo, size_bytes}]';

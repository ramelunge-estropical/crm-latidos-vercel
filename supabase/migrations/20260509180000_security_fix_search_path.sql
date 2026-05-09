-- Fix: function_search_path_mutable
-- Todas las funciones deben tener search_path fijo para evitar
-- ataques de search_path injection (Supabase security advisor WARN).

ALTER FUNCTION integraciones.set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.generate_gestion_codigo() SET search_path = pg_catalog, public;
ALTER FUNCTION public.lat_agente_carga_activa(p_colaborador_id uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.lat_cola_canales_conectados(p_cola_id uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.lat_cola_puede_activarse(p_cola_id uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.lat_cola_valida_para_canal(p_cola_id uuid, p_canal_id uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.lat_gestionar_conversacion(p_conversacion_id uuid, p_gestion_id uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.lat_reasignar_conversacion(p_conversacion_id uuid, p_nuevo_responsable uuid, p_intervenido_por uuid, p_motivo text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.lat_trazabilidad_resumen(p_conversacion_id uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.lat_trigger_route_inbound_message() SET search_path = pg_catalog, public;
ALTER FUNCTION public.sync_lat_canal_estado_activo() SET search_path = pg_catalog, public;
ALTER FUNCTION public.sync_lat_conv_owner_responsable() SET search_path = pg_catalog, public;
ALTER FUNCTION public.touch_email_drafts_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.update_lat_conv_on_message() SET search_path = pg_catalog, public;
ALTER FUNCTION public.update_lat_conv_updated_at() SET search_path = pg_catalog, public;

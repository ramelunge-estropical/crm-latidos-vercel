


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE SCHEMA IF NOT EXISTS "integraciones";


ALTER SCHEMA "integraciones" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."activity_type" AS ENUM (
    'tarea',
    'llamada',
    'reunión'
);


ALTER TYPE "public"."activity_type" OWNER TO "postgres";


CREATE TYPE "public"."gestion_priority" AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


ALTER TYPE "public"."gestion_priority" OWNER TO "postgres";


CREATE TYPE "public"."gestion_type" AS ENUM (
    'comercial',
    'proyecto',
    'operativa',
    'caso'
);


ALTER TYPE "public"."gestion_type" OWNER TO "postgres";


CREATE TYPE "public"."global_status" AS ENUM (
    'to_do',
    'doing',
    'review',
    'done'
);


ALTER TYPE "public"."global_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "integraciones"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "integraciones"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_gestion_codigo"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_prefix TEXT; v_next_num INTEGER;
BEGIN
  v_prefix := CASE NEW.type
    WHEN 'comercial' THEN 'COM' WHEN 'proyecto' THEN 'PRO'
    WHEN 'operativa' THEN 'OPE' WHEN 'caso'     THEN 'CAS'
    ELSE 'GES' END;
  SELECT COALESCE(MAX(CAST(SPLIT_PART(codigo,'-',2) AS INTEGER)),0)+1
    INTO v_next_num FROM public.gestiones WHERE codigo LIKE v_prefix||'-%';
  NEW.codigo := v_prefix||'-'||LPAD(v_next_num::TEXT,4,'0');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_gestion_codigo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lat_agente_carga_activa"("p_colaborador_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COUNT(*)::INTEGER
  FROM lat_conversaciones
  WHERE responsable_id   = p_colaborador_id
    AND estado_asignacion NOT IN ('cerrada', 'ignorada');
$$;


ALTER FUNCTION "public"."lat_agente_carga_activa"("p_colaborador_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lat_cola_canales_conectados"("p_cola_id" "uuid") RETURNS "uuid"[]
    LANGUAGE "sql" STABLE
    AS $$
  SELECT ARRAY(
    SELECT c.id
    FROM lat_colas q
    JOIN lat_canales c ON c.id = ANY(q.canales_entrantes_ids)
    WHERE q.id = p_cola_id
      AND c.estado = 'conectado'
  );
$$;


ALTER FUNCTION "public"."lat_cola_canales_conectados"("p_cola_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lat_cola_puede_activarse"("p_cola_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  tiene_agentes BOOLEAN;
  tiene_bot     BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM lat_cola_miembros
    WHERE cola_id = p_cola_id
      AND rol     = 'agente'
      AND activo  = true
  ) INTO tiene_agentes;

  SELECT EXISTS(
    SELECT 1
    FROM lat_colas q
    JOIN lat_canales c ON c.id = ANY(q.canales_entrantes_ids)
    WHERE q.id = p_cola_id
      AND c.bot_default_id IS NOT NULL
  ) INTO tiene_bot;

  RETURN tiene_agentes OR tiene_bot;
END;
$$;


ALTER FUNCTION "public"."lat_cola_puede_activarse"("p_cola_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lat_cola_valida_para_canal"("p_cola_id" "uuid", "p_canal_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT EXISTS(
    SELECT 1 FROM lat_colas
    WHERE id     = p_cola_id
      AND activa = true
      AND (
        p_canal_id = ANY(canales_entrantes_ids)
        OR canales_entrantes_ids = '{}'::UUID[]
        OR array_length(canales_entrantes_ids, 1) IS NULL
      )
  );
$$;


ALTER FUNCTION "public"."lat_cola_valida_para_canal"("p_cola_id" "uuid", "p_canal_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lat_gestionar_conversacion"("p_conversacion_id" "uuid", "p_gestion_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Marcar conversación como en_gestion si está asignada
  UPDATE lat_conversaciones
     SET estado_asignacion = 'en_gestion',
         updated_at        = now()
   WHERE id              = p_conversacion_id
     AND estado_asignacion = 'asignada';

  -- Vincular gestión con conversación
  UPDATE gestiones
     SET lat_conversacion_id = p_conversacion_id
   WHERE id = p_gestion_id
     AND lat_conversacion_id IS NULL;

  -- Registrar en trazabilidad
  INSERT INTO lat_trazabilidad (
    conversacion_id,
    tipo_evento,
    detalle
  ) VALUES (
    p_conversacion_id,
    'owner_asignado',
    jsonb_build_object(
      'gestion_id', p_gestion_id,
      'accion',     'gestion_creada',
      'ts',         now()
    )
  );
END;
$$;


ALTER FUNCTION "public"."lat_gestionar_conversacion"("p_conversacion_id" "uuid", "p_gestion_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lat_reasignar_conversacion"("p_conversacion_id" "uuid", "p_nuevo_responsable" "uuid", "p_intervenido_por" "uuid", "p_motivo" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_owner_anterior  UUID;
  v_estado_actual   TEXT;
BEGIN
  SELECT responsable_id, estado_asignacion
    INTO v_owner_anterior, v_estado_actual
    FROM lat_conversaciones
   WHERE id = p_conversacion_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversación % no encontrada', p_conversacion_id;
  END IF;

  -- Actualizar asignación; si estaba en_cola/pendiente → asignada
  UPDATE lat_conversaciones
     SET responsable_id    = p_nuevo_responsable,
         owner_actual_id   = p_nuevo_responsable,
         owner_original_id = COALESCE(owner_original_id, v_owner_anterior),
         estado_asignacion = CASE
           WHEN v_estado_actual IN ('en_cola', 'pendiente') THEN 'asignada'
           ELSE v_estado_actual
         END,
         ts_agente_asignado = now(),
         updated_at         = now()
   WHERE id = p_conversacion_id;

  -- Registrar evento de reasignación en trazabilidad
  INSERT INTO lat_trazabilidad (
    conversacion_id,
    tipo_evento,
    owner_original_id,
    owner_nuevo_id,
    intervencion,
    motivo,
    detalle
  ) VALUES (
    p_conversacion_id,
    'reasignacion_manual',
    v_owner_anterior,
    p_nuevo_responsable,
    true,
    p_motivo,
    jsonb_build_object(
      'intervenido_por', p_intervenido_por,
      'estado_previo',   v_estado_actual,
      'ts',              now()
    )
  );
END;
$$;


ALTER FUNCTION "public"."lat_reasignar_conversacion"("p_conversacion_id" "uuid", "p_nuevo_responsable" "uuid", "p_intervenido_por" "uuid", "p_motivo" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."lat_reasignar_conversacion"("p_conversacion_id" "uuid", "p_nuevo_responsable" "uuid", "p_intervenido_por" "uuid", "p_motivo" "text") IS 'Reasigna una conversación a un nuevo agente y deja trazabilidad del evento.';



CREATE OR REPLACE FUNCTION "public"."lat_trazabilidad_resumen"("p_conversacion_id" "uuid") RETURNS TABLE("canal_origen_id" "uuid", "regla_origen_id" "uuid", "cola_origen_id" "uuid", "agente_asignado_id" "uuid", "routing_status" "text", "routing_reason" "text", "desborde_cola_id" "uuid", "num_reasignaciones" integer, "ultima_intervencion" timestamp with time zone)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    -- Canal: primer evento canal_asignado
    (SELECT t.canal_id FROM lat_trazabilidad t
     WHERE t.conversacion_id = p_conversacion_id
       AND t.tipo_evento = 'canal_asignado'
     ORDER BY t.created_at LIMIT 1),
    -- Regla: primer evento regla_aplicada
    (SELECT t.regla_id FROM lat_trazabilidad t
     WHERE t.conversacion_id = p_conversacion_id
       AND t.tipo_evento = 'regla_aplicada'
     ORDER BY t.created_at LIMIT 1),
    -- Cola: primer evento cola_asignada
    (SELECT t.cola_id FROM lat_trazabilidad t
     WHERE t.conversacion_id = p_conversacion_id
       AND t.tipo_evento = 'cola_asignada'
     ORDER BY t.created_at LIMIT 1),
    -- Agente: último evento agente_asignado u owner_asignado
    (SELECT t.owner_nuevo_id FROM lat_trazabilidad t
     WHERE t.conversacion_id = p_conversacion_id
       AND t.tipo_evento IN ('agente_asignado', 'owner_asignado')
     ORDER BY t.created_at DESC LIMIT 1),
    -- routing_status/reason desde la conversación
    c.routing_status,
    c.routing_reason,
    -- Cola de desborde si aplica
    (SELECT t.cola_desborde_id FROM lat_trazabilidad t
     WHERE t.conversacion_id = p_conversacion_id
       AND t.tipo_evento = 'desborde_activado'
     ORDER BY t.created_at LIMIT 1),
    -- Número de reasignaciones manuales
    (SELECT COUNT(*)::INTEGER FROM lat_trazabilidad t
     WHERE t.conversacion_id = p_conversacion_id
       AND t.tipo_evento = 'reasignacion_manual'),
    -- Última intervención de supervisor
    (SELECT MAX(t.created_at) FROM lat_trazabilidad t
     WHERE t.conversacion_id = p_conversacion_id
       AND t.intervencion = true)
  FROM lat_conversaciones c
  WHERE c.id = p_conversacion_id;
$$;


ALTER FUNCTION "public"."lat_trazabilidad_resumen"("p_conversacion_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lat_trigger_route_inbound_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_canal TEXT;
  v_canal_id UUID;
  v_message TEXT;
BEGIN
  IF NEW.tipo IS DISTINCT FROM 'inbound' THEN
    RETURN NEW;
  END IF;

  SELECT canal, COALESCE(canal_entrante_id, canal_id_fk)
    INTO v_canal, v_canal_id
    FROM public.lat_conversaciones
   WHERE id = NEW.conversacion_id;

  IF v_canal IS NULL THEN
    RETURN NEW;
  END IF;

  v_message := COALESCE(to_jsonb(NEW)->>'email_subject', NEW.contenido, '');

  PERFORM net.http_post(
    url := 'https://qadfjbgfdejmhblgvaef.supabase.co/functions/v1/lat-routing-engine',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_strip_nulls(jsonb_build_object(
      'conversation_id', NEW.conversacion_id,
      'channel_id', v_canal_id,
      'channel_type', v_canal,
      'message_content', v_message,
      'metadata', jsonb_build_object(
        'canal_tipo', v_canal,
        'texto_mensaje', v_message,
        'mensaje_inicial', v_message,
        'email_from', to_jsonb(NEW)->>'email_from_email',
        'email_subject', to_jsonb(NEW)->>'email_subject'
      )
    ))
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."lat_trigger_route_inbound_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_lat_canal_estado_activo"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado IS NULL THEN
      NEW.estado := CASE WHEN NEW.activo THEN 'conectado' ELSE 'desconectado' END;
    ELSE
      NEW.activo := (NEW.estado = 'conectado');
    END IF;
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
    NEW.activo := (NEW.estado = 'conectado');
  ELSIF NEW.activo IS DISTINCT FROM OLD.activo THEN
    NEW.estado := CASE WHEN NEW.activo THEN 'conectado' ELSE 'desconectado' END;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_lat_canal_estado_activo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_lat_conv_owner_responsable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.owner_actual_id IS DISTINCT FROM OLD.owner_actual_id THEN
    NEW.responsable_id := NEW.owner_actual_id;
  ELSIF NEW.responsable_id IS DISTINCT FROM OLD.responsable_id THEN
    NEW.owner_actual_id := NEW.responsable_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_lat_conv_owner_responsable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_email_drafts_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


ALTER FUNCTION "public"."touch_email_drafts_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_lat_conv_on_message"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$ BEGIN UPDATE lat_conversaciones SET ultimo_mensaje = LEFT(COALESCE(NEW.contenido, '[adjunto]'), 160), ultima_interaccion = NEW.created_at, no_leidos = CASE WHEN NEW.tipo = 'inbound' THEN no_leidos + 1 ELSE no_leidos END, ventana_whatsapp = CASE WHEN NEW.tipo = 'inbound' THEN NOW() + INTERVAL '24 hours' ELSE ventana_whatsapp END, en_foco = CASE WHEN NEW.tipo = 'inbound' THEN true ELSE en_foco END, estado = CASE WHEN NEW.tipo = 'inbound' AND estado = 'liberado' THEN 'abierto' ELSE estado END WHERE id = NEW.conversacion_id; RETURN NEW; END; $$;


ALTER FUNCTION "public"."update_lat_conv_on_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_lat_conv_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_lat_conv_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "integraciones"."entregas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "evento_id" "uuid" NOT NULL,
    "sistema_id" "uuid" NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "http_status" integer,
    "respuesta" "text",
    "intentos" integer DEFAULT 0 NOT NULL,
    "enviado_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "integraciones"."entregas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "integraciones"."eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sync_id" "uuid" DEFAULT "gen_random_uuid"(),
    "origen" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "procesado" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "integraciones"."eventos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "integraciones"."sistemas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "webhook_url" "text",
    "api_key" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "app_url" "text"
);


ALTER TABLE "integraciones"."sistemas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "integraciones"."tareas_sincronizadas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "origen" "text" NOT NULL,
    "origen_id" "text" NOT NULL,
    "destino" "text" NOT NULL,
    "destino_id" "text",
    "titulo" "text" NOT NULL,
    "descripcion" "text",
    "estado" "text" DEFAULT 'pendiente'::"text",
    "prioridad" "text" DEFAULT 'media'::"text",
    "fecha_vencimiento" "date",
    "colaborador_id" "uuid",
    "sincronizado_at" timestamp with time zone DEFAULT "now"(),
    "error" "text",
    CONSTRAINT "tareas_sincronizadas_destino_check" CHECK (("destino" = ANY (ARRAY['crm'::"text", 'legal'::"text"]))),
    CONSTRAINT "tareas_sincronizadas_origen_check" CHECK (("origen" = ANY (ARRAY['crm'::"text", 'legal'::"text"])))
);


ALTER TABLE "integraciones"."tareas_sincronizadas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestion_id" "uuid",
    "activity_type" "public"."activity_type" DEFAULT 'tarea'::"public"."activity_type" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "scheduled_at" timestamp with time zone,
    "duration_minutes" integer,
    "completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "assigned_to" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "google_event_id" "text",
    "meet_link" "text",
    "cliente_id" "uuid",
    "cliente_nombre" "text",
    "created_by" "uuid",
    "assigned_to_id" "uuid"
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_assistant_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identidad" "text" DEFAULT 'Sos el asistente IA del CRM Latidos de Estropical, una agencia de viajes boliviana. Respond� siempre en espa�ol, de forma concisa y �til.'::"text",
    "temperatura" numeric DEFAULT 0.4,
    "max_tokens" integer DEFAULT 800,
    "acceso_asesor" "jsonb" DEFAULT '{"clientes": true, "gestiones": true, "actividades": true, "limite_registros": 20}'::"jsonb",
    "acceso_supervisor" "jsonb" DEFAULT '{"equipo": true, "clientes": true, "gestiones": true, "actividades": true, "limite_registros": 30}'::"jsonb",
    "acceso_admin" "jsonb" DEFAULT '{"equipo": true, "clientes": true, "reportes": true, "gestiones": true, "actividades": true, "limite_registros": 50}'::"jsonb",
    "activo" boolean DEFAULT true,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
);


ALTER TABLE "public"."ai_assistant_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."areas_empresa" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "color" "text" DEFAULT '#6366f1'::"text" NOT NULL,
    "icono" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."areas_empresa" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_derivaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversacion_id" "uuid" NOT NULL,
    "derivado_por_id" "uuid",
    "derivado_por_nombre" "text",
    "destino_tipo" "text" NOT NULL,
    "destino_usuario_id" "uuid",
    "destino_usuario_nombre" "text",
    "destino_area_id" "uuid",
    "destino_area_nombre" "text",
    "efectivo_tipo" "text" NOT NULL,
    "efectivo_usuario_id" "uuid",
    "efectivo_usuario_nombre" "text",
    "efectivo_area_id" "uuid",
    "efectivo_area_nombre" "text",
    "hubo_fallback" boolean DEFAULT false NOT NULL,
    "motivo_fallback" "text",
    "presencia_destino" "text",
    "capacidad_destino" integer,
    "chats_abiertos_destino" integer,
    "nota" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_derivaciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cliente_bancos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "banco" "text" NOT NULL,
    "tipo_cuenta" "text",
    "observaciones" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cliente_bancos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cliente_cobranzas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "concepto" "text" NOT NULL,
    "monto" numeric(12,2) DEFAULT 0 NOT NULL,
    "moneda" "text" DEFAULT 'Bs'::"text" NOT NULL,
    "fecha_emision" "date",
    "fecha_vencimiento" "date",
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cliente_cobranzas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cliente_documentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "numero" "text",
    "fecha_emision" "date",
    "fecha_vencimiento" "date",
    "pais_emisor" "text",
    "observaciones" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cliente_documentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cliente_familiar" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "familiar_cliente_id" "uuid",
    "nombre" "text" NOT NULL,
    "relacion" "text" NOT NULL,
    "fecha_nacimiento" "date",
    "documento_numero" "text",
    "observaciones" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cliente_familiar" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cliente_ideas_viaje" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "destino" "text" NOT NULL,
    "notas" "text",
    "prioridad" "text" DEFAULT 'media'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cliente_ideas_viaje" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cliente_lealtad" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "programa" "text" NOT NULL,
    "numero_membresia" "text",
    "estado" "text" DEFAULT 'activo'::"text",
    "nivel" "text",
    "millas_acumuladas" integer DEFAULT 0,
    "observaciones" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cliente_lealtad" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cliente_pagos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "monto" numeric(12,2) NOT NULL,
    "moneda" "text" DEFAULT 'BOB'::"text",
    "concepto" "text",
    "fecha" "date" DEFAULT CURRENT_DATE,
    "estado" "text" DEFAULT 'completado'::"text",
    "referencia" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cliente_pagos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cliente_referidos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "referido_id" "uuid",
    "referido_nombre" "text",
    "tipo" "text" DEFAULT 'saliente'::"text" NOT NULL,
    "fecha" "date" DEFAULT CURRENT_DATE,
    "observaciones" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cliente_referidos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cliente_viajes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "destino" "text" NOT NULL,
    "fecha_salida" "date",
    "fecha_regreso" "date",
    "tipo_viaje" "text",
    "estado" "text" DEFAULT 'completado'::"text",
    "monto" numeric(12,2),
    "observaciones" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cliente_viajes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre_completo" "text" NOT NULL,
    "email" "text",
    "email_secundario" "text",
    "telefono" "text",
    "telefono_secundario" "text",
    "documento_tipo" "text" DEFAULT 'CI'::"text",
    "documento_numero" "text",
    "fecha_nacimiento" "date",
    "nacionalidad" "text" DEFAULT 'Boliviana'::"text",
    "ciudad" "text",
    "pais" "text" DEFAULT 'Bolivia'::"text",
    "estado" "text" DEFAULT 'activo'::"text" NOT NULL,
    "profesion" "text",
    "estado_civil" "text",
    "club_viajes" boolean DEFAULT false NOT NULL,
    "espacio_a_bordo" boolean DEFAULT false NOT NULL,
    "pases_a_bordo" integer DEFAULT 0 NOT NULL,
    "asesor_nombre" "text",
    "score_valor" integer DEFAULT 0 NOT NULL,
    "score_etiqueta" "text",
    "notas_rapidas" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tipo_cliente" "text" DEFAULT 'natural'::"text" NOT NULL,
    "razon_social" "text",
    "nit" "text",
    "contacto_nombre" "text",
    "contacto_cargo" "text",
    "canal_contacto" "text",
    "instagram" "text",
    "facebook" "text",
    "tiktok" "text",
    "dias_credito" integer
);


ALTER TABLE "public"."clientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."colaborador_google_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "colaborador_id" "uuid" NOT NULL,
    "google_email" "text",
    "access_token" "text",
    "refresh_token" "text" NOT NULL,
    "token_expiry" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."colaborador_google_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."colaborador_presencia" (
    "colaborador_id" "uuid" NOT NULL,
    "estado" "text" DEFAULT 'desconectado'::"text" NOT NULL,
    "capacidad_maxima" integer DEFAULT 5 NOT NULL,
    "chats_abiertos" integer DEFAULT 0 NOT NULL,
    "ultima_actividad" timestamp with time zone DEFAULT "now"() NOT NULL,
    "motivo_pausa" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "conectado" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."colaborador_presencia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."colaboradores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "email" "text",
    "cargo" "text",
    "area_id" "uuid",
    "color" "text" DEFAULT '#6366f1'::"text" NOT NULL,
    "user_id" "uuid",
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "rol" "text" DEFAULT 'colaborador'::"text" NOT NULL,
    "ver_otros_sistemas" boolean DEFAULT false NOT NULL,
    CONSTRAINT "colaboradores_rol_check" CHECK (("rol" = ANY (ARRAY['admin'::"text", 'gerente'::"text", 'colaborador'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."colaboradores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mensaje_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text",
    "size" bigint,
    "storage_url" "text" NOT NULL,
    "disposition" "text" DEFAULT 'attachment'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversacion_id" "uuid" NOT NULL,
    "reply_type" "text" DEFAULT 'reply'::"text" NOT NULL,
    "in_reply_to_message_id" "uuid",
    "email_to" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "email_cc" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "email_bcc" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "subject" "text",
    "body_html" "text",
    "body_text" "text",
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gestion_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestion_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_size" bigint,
    "mime_type" "text",
    "uploaded_by_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gestion_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gestion_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestion_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "comment_type" "text" DEFAULT 'comment'::"text" NOT NULL,
    "author_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gestion_comments_comment_type_check" CHECK (("comment_type" = ANY (ARRAY['comment'::"text", 'activity'::"text", 'communication'::"text"])))
);


ALTER TABLE "public"."gestion_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gestion_conversation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestion_id" "uuid",
    "conversacion_id" "uuid",
    "event_type" "text" NOT NULL,
    "event_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "actor_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gestion_conversation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gestion_subtipos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gestion_subtipos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gestion_tareas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestion_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "descripcion" "text",
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "asignado_a" "text",
    "fecha_limite" "date",
    "orden" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "gestion_tareas_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'en_progreso'::"text", 'revision'::"text", 'completado'::"text"])))
);


ALTER TABLE "public"."gestion_tareas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gestion_tipos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "valor" "text" NOT NULL,
    "color" "text" DEFAULT '#6366f1'::"text" NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gestion_tipos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gestiones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "process_id" "uuid" NOT NULL,
    "stage_id" "uuid" NOT NULL,
    "owner_id" "uuid",
    "priority" "public"."gestion_priority" DEFAULT 'medium'::"public"."gestion_priority" NOT NULL,
    "due_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responsable_nombre" "text",
    "type" "public"."gestion_type" DEFAULT 'operativa'::"public"."gestion_type" NOT NULL,
    "subtype" "text",
    "entered_stage_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "codigo" "text",
    "area_id" "uuid",
    "cliente_nombre" "text",
    "responsable_id" "uuid",
    "cliente_id" "uuid",
    "conversacion_id_origen" "uuid",
    "canal_origen" "text",
    "lat_conversacion_id" "uuid"
);


ALTER TABLE "public"."gestiones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."granola_meetings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "granola_id" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "fecha" timestamp with time zone NOT NULL,
    "participantes" "jsonb" DEFAULT '[]'::"jsonb",
    "notas" "text",
    "resumen" "text",
    "tasks_extracted" boolean DEFAULT false,
    "colaborador_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."granola_meetings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."granola_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meeting_id" "uuid" NOT NULL,
    "descripcion" "text" NOT NULL,
    "asignado_a" "text",
    "asignado_id" "uuid",
    "fecha_limite" "date",
    "activity_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."granola_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lat_bot_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" DEFAULT 'lati'::"text" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "modelo" "text" DEFAULT 'gpt-4o-mini'::"text" NOT NULL,
    "max_turnos" integer DEFAULT 6 NOT NULL,
    "temperatura" numeric(3,2) DEFAULT 0.40 NOT NULL,
    "prompt_identidad" "text" DEFAULT 'Sos Lati, asistente virtual de Estropical Bolivia, agencia de viajes lider en Bolivia.'::"text" NOT NULL,
    "prompt_reglas" "text" DEFAULT '- Habla en espanol latinoamericano, calido y profesional
- Nunca inventes precios, fechas ni disponibilidad especifica
- La agencia opera 24/7
- Se concisa: respuestas cortas
- Llama al cliente por su nombre'::"text" NOT NULL,
    "prompt_categorias" "text" DEFAULT '- vacacional
- visa
- grupos
- corporativo
- soporte
- emergencia
- cobranzas
- otro'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "text",
    "min_preguntas_calificacion" integer DEFAULT 1 NOT NULL,
    "prompt_calificacion" "text" DEFAULT '- vacacional: preguntá destino deseado, fechas aproximadas y cantidad de viajeros
- visa: preguntá país destino y tipo de visa que necesitan
- grupos: preguntá cantidad de personas, tipo de evento y fechas
- corporativo: preguntá empresa, cantidad de viajeros y frecuencia
- soporte: preguntá número de reserva o fecha del viaje
- cobranzas: preguntá monto aproximado y fecha del último pago
- emergencia: NO preguntes nada, derivá inmediatamente'::"text" NOT NULL,
    "crear_gestion_auto" boolean DEFAULT true NOT NULL,
    "gestion_process_id" "uuid",
    "gestion_stage_id" "uuid",
    "canal" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "auto_reply" boolean DEFAULT false,
    "gmail_refresh_token" "text",
    "gmail_access_token" "text",
    "gmail_token_expiry" timestamp with time zone,
    "gmail_email" "text"
);


ALTER TABLE "public"."lat_bot_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lat_canales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "troncal_id" "uuid",
    "nombre" "text" NOT NULL,
    "tipo" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "numero_origen" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "descripcion" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cola_default_id" "uuid",
    "ultima_actividad" timestamp with time zone,
    "bot_default_id" "uuid",
    "identificador" "text",
    "proveedor" "text",
    "estado" "text",
    CONSTRAINT "lat_canales_estado_check" CHECK (("estado" = ANY (ARRAY['conectado'::"text", 'desconectado'::"text", 'error'::"text", 'pendiente'::"text"]))),
    CONSTRAINT "lat_canales_tipo_check" CHECK (("tipo" = ANY (ARRAY['whatsapp'::"text", 'instagram'::"text", 'facebook'::"text", 'email'::"text", 'web'::"text", 'interno'::"text"])))
);


ALTER TABLE "public"."lat_canales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lat_cola_miembros" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cola_id" "uuid" NOT NULL,
    "colaborador_id" "uuid" NOT NULL,
    "rol" "text" DEFAULT 'agente'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "activo" boolean DEFAULT true NOT NULL,
    "max_conversaciones" integer,
    "peso" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "lat_cola_miembros_peso_check" CHECK ((("peso" >= 1) AND ("peso" <= 10))),
    CONSTRAINT "lat_cola_miembros_rol_check" CHECK (("rol" = ANY (ARRAY['agente'::"text", 'supervisor'::"text", 'observador'::"text"])))
);


ALTER TABLE "public"."lat_cola_miembros" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lat_cola_usuarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cola_id" "uuid" NOT NULL,
    "colaborador_id" "uuid" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "es_supervisor" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lat_cola_usuarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lat_colas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "area" "text",
    "canal_id" "uuid",
    "estrategia_asignacion" "text" DEFAULT 'round_robin'::"text" NOT NULL,
    "max_conversaciones_agente" integer DEFAULT 5 NOT NULL,
    "tiempo_espera_max_seg" integer DEFAULT 300 NOT NULL,
    "activa" boolean DEFAULT true NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "color" "text" DEFAULT '#6366f1'::"text" NOT NULL,
    "icono" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "horario_id" "uuid",
    "canal_saliente_id" "uuid",
    "tiempo_reserva_comunicacion" integer DEFAULT 0 NOT NULL,
    "tiempo_reserva_mensajes" integer DEFAULT 0 NOT NULL,
    "tiempo_redistribucion" integer DEFAULT 0 NOT NULL,
    "redistribuir_ausentes" boolean DEFAULT false NOT NULL,
    "auto_tipificacion_ausentes" boolean DEFAULT false NOT NULL,
    "desborde_activo" boolean DEFAULT false NOT NULL,
    "desborde_cola_id" "uuid",
    "desborde_tiempo_espera" integer DEFAULT 5 NOT NULL,
    "desborde_condiciones" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "desborde_registrar" boolean DEFAULT true NOT NULL,
    "owner_auto_asignar" boolean DEFAULT false NOT NULL,
    "owner_nivel" "text" DEFAULT 'por_conversacion'::"text" NOT NULL,
    "owner_last_user_activo" boolean DEFAULT false NOT NULL,
    "owner_last_user_dias" integer DEFAULT 30 NOT NULL,
    "supervisor_puede_intervenir" boolean DEFAULT true NOT NULL,
    "supervisor_puede_transferir" boolean DEFAULT true NOT NULL,
    "permite_reasignacion_manual" boolean DEFAULT true NOT NULL,
    "owner_registrar_trazabilidad" boolean DEFAULT true NOT NULL,
    "canales_entrantes_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "canales_salientes_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    CONSTRAINT "lat_colas_estrategia_asignacion_check" CHECK (("estrategia_asignacion" = ANY (ARRAY['round_robin'::"text", 'menos_carga'::"text", 'primero_disponible'::"text", 'manual'::"text"]))),
    CONSTRAINT "lat_colas_owner_nivel_check" CHECK (("owner_nivel" = ANY (ARRAY['por_cliente'::"text", 'por_conversacion'::"text"])))
);


ALTER TABLE "public"."lat_colas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lat_conversaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid",
    "cliente_nombre" "text",
    "telefono" "text",
    "canal" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "estado" "text" DEFAULT 'nuevo'::"text" NOT NULL,
    "asunto" "text",
    "ultimo_mensaje" "text",
    "ultima_interaccion" timestamp with time zone DEFAULT "now"(),
    "no_leidos" integer DEFAULT 0,
    "prioridad" "text" DEFAULT 'media'::"text",
    "responsable_id" "uuid",
    "responsable_nombre" "text",
    "proxima_accion" "text",
    "ventana_whatsapp" timestamp with time zone,
    "wpp_contact_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "gestion_id" "uuid",
    "en_foco" boolean DEFAULT true NOT NULL,
    "cola_area_id" "uuid",
    "cola_area_nombre" "text",
    "en_cola" boolean DEFAULT false NOT NULL,
    "troncal_id" "uuid",
    "cola_id" "uuid",
    "intencion_detectada" "text",
    "urgencia_detectada" "text",
    "sentimiento_detectado" "text",
    "resumen_ia" "text",
    "cola_sugerida_id" "uuid",
    "tiempo_primera_respuesta_seg" integer,
    "tiempo_resolucion_seg" integer,
    "satisfaccion_cliente" integer,
    "bot_estado" "text" DEFAULT 'activo'::"text" NOT NULL,
    "bot_contexto" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "bot_turnos" integer DEFAULT 0 NOT NULL,
    "regla_aplicada_id" "uuid",
    "canal_id_fk" "uuid",
    "owner_original_id" "uuid",
    "owner_actual_id" "uuid",
    "intervenido_por_id" "uuid",
    "canal_entrante_id" "uuid",
    "supervisor_responsable_id" "uuid",
    "desborde_aplicado" boolean DEFAULT false NOT NULL,
    "cola_desborde_id" "uuid",
    "estado_asignacion" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "motivo_no_asignada" "text",
    "agente_disponibilidad_snap" "text",
    "ts_regla_aplicada" timestamp with time zone,
    "ts_cola_asignada" timestamp with time zone,
    "ts_agente_asignado" timestamp with time zone,
    "ts_desborde" timestamp with time zone,
    "routing_status" "text",
    "routing_reason" "text",
    "channel_type" "text",
    CONSTRAINT "lat_conv_estado_asignacion_check" CHECK (("estado_asignacion" = ANY (ARRAY['pendiente'::"text", 'en_cola'::"text", 'asignada'::"text", 'en_gestion'::"text", 'en_espera'::"text", 'desborde'::"text", 'ignorada'::"text", 'cerrada'::"text"]))),
    CONSTRAINT "lat_conversaciones_bot_estado_check" CHECK (("bot_estado" = ANY (ARRAY['activo'::"text", 'pausado'::"text", 'handed_off'::"text"]))),
    CONSTRAINT "lat_conversaciones_estado_check" CHECK (("estado" = ANY (ARRAY['abierta'::"text", 'cerrada'::"text", 'pendiente'::"text", 'en_cola'::"text", 'asignada'::"text", 'en_atencion'::"text", 'en_espera_cliente'::"text", 'en_espera_interna'::"text", 'derivada'::"text", 'resuelta'::"text", 'reabierta'::"text"]))),
    CONSTRAINT "lat_conversaciones_satisfaccion_cliente_check" CHECK ((("satisfaccion_cliente" >= 1) AND ("satisfaccion_cliente" <= 5))),
    CONSTRAINT "lat_conversaciones_sentimiento_detectado_check" CHECK (("sentimiento_detectado" = ANY (ARRAY['positivo'::"text", 'neutro'::"text", 'negativo'::"text", 'frustrado'::"text"]))),
    CONSTRAINT "lat_conversaciones_urgencia_detectada_check" CHECK (("urgencia_detectada" = ANY (ARRAY['baja'::"text", 'media'::"text", 'alta'::"text", 'critica'::"text"])))
);


ALTER TABLE "public"."lat_conversaciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lat_email_procesados" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "text" NOT NULL,
    "conversacion_id" "uuid",
    "procesado_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lat_email_procesados" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lat_horarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "zona_horaria" "text" DEFAULT 'America/La_Paz'::"text" NOT NULL,
    "franjas" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "cola_id" "uuid",
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lat_horarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lat_mensajes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversacion_id" "uuid" NOT NULL,
    "tipo" "text" DEFAULT 'inbound'::"text" NOT NULL,
    "contenido" "text" NOT NULL,
    "estado" "text" DEFAULT 'enviado'::"text",
    "adjunto_url" "text",
    "adjunto_nombre" "text",
    "adjunto_tipo" "text",
    "wpp_message_id" "text",
    "autor_nombre" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email_subject" "text",
    "email_from_name" "text",
    "email_from_email" "text",
    "email_to" "jsonb" DEFAULT '[]'::"jsonb",
    "email_cc" "jsonb" DEFAULT '[]'::"jsonb",
    "email_bcc" "jsonb" DEFAULT '[]'::"jsonb",
    "email_body_html" "text",
    "email_body_text" "text",
    "email_message_id" "text",
    "email_thread_id" "text",
    "email_in_reply_to" "text",
    "email_references" "text",
    "email_has_attachments" boolean DEFAULT false NOT NULL,
    "email_attachments" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."lat_mensajes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."lat_mensajes"."email_attachments" IS 'Array de adjuntos: [{url, nombre, tipo, size_bytes}]';



CREATE TABLE IF NOT EXISTS "public"."lat_reglas_asignacion" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "activa" boolean DEFAULT true NOT NULL,
    "prioridad" integer DEFAULT 0 NOT NULL,
    "condiciones" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "accion" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "canal_id" "uuid"
);


ALTER TABLE "public"."lat_reglas_asignacion" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lat_trazabilidad" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversacion_id" "uuid" NOT NULL,
    "tipo_evento" "text" NOT NULL,
    "estado_anterior" "text",
    "estado_nuevo" "text",
    "cola_anterior_id" "uuid",
    "cola_nueva_id" "uuid",
    "colaborador_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "descripcion" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_original_id" "uuid",
    "owner_nuevo_id" "uuid",
    "intervencion" boolean DEFAULT false NOT NULL,
    "motivo" "text",
    "canal_id" "uuid",
    "regla_id" "uuid",
    "cola_id" "uuid",
    "cola_desborde_id" "uuid",
    "detalle" "jsonb",
    "channel_type" "text",
    "routing_status" "text",
    "routing_reason" "text",
    CONSTRAINT "lat_trazabilidad_tipo_evento_check" CHECK (("tipo_evento" = ANY (ARRAY['ingreso'::"text", 'asignacion_automatica'::"text", 'asignacion_manual'::"text", 'derivacion'::"text", 'cambio_estado'::"text", 'cambio_cola'::"text", 'mensaje_entrante'::"text", 'mensaje_saliente'::"text", 'nota_interna'::"text", 'ia_sugerencia'::"text", 'ia_aplicada'::"text", 'cierre'::"text", 'reapertura'::"text", 'bot_activado'::"text", 'bot_desactivado'::"text"])))
);


ALTER TABLE "public"."lat_trazabilidad" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lat_troncales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "proveedor" "text" DEFAULT 'gupshup'::"text" NOT NULL,
    "tipo" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "numero" "text",
    "api_key" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "descripcion" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lat_troncales_tipo_check" CHECK (("tipo" = ANY (ARRAY['whatsapp'::"text", 'sms'::"text", 'email'::"text", 'voz'::"text"])))
);


ALTER TABLE "public"."lat_troncales" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."lat_v_agentes_disponibles" AS
 SELECT "m"."cola_id",
    "q"."nombre" AS "cola_nombre",
    "m"."colaborador_id",
    "p"."conectado",
    "p"."estado" AS "estado_operativo",
    COALESCE("m"."max_conversaciones", "q"."max_conversaciones_agente", 5) AS "capacidad_max",
    "public"."lat_agente_carga_activa"("m"."colaborador_id") AS "carga_activa",
        CASE
            WHEN ("p"."conectado" AND ("p"."estado" = 'disponible'::"text") AND ("public"."lat_agente_carga_activa"("m"."colaborador_id") < COALESCE("m"."max_conversaciones", "q"."max_conversaciones_agente", 5))) THEN true
            ELSE false
        END AS "elegible"
   FROM (("public"."lat_cola_miembros" "m"
     JOIN "public"."lat_colas" "q" ON (("q"."id" = "m"."cola_id")))
     LEFT JOIN "public"."colaborador_presencia" "p" ON (("p"."colaborador_id" = "m"."colaborador_id")))
  WHERE (("m"."activo" = true) AND ("m"."rol" = 'agente'::"text") AND ("q"."activa" = true));


ALTER VIEW "public"."lat_v_agentes_disponibles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."lat_v_bandeja_colaborador" AS
 SELECT "c"."id",
    "c"."cliente_id",
    "c"."cliente_nombre",
    "c"."telefono",
    "c"."canal",
    "c"."estado",
    "c"."asunto",
    "c"."ultimo_mensaje",
    "c"."ultima_interaccion",
    "c"."no_leidos",
    "c"."prioridad",
    "c"."responsable_id",
    "c"."responsable_nombre",
    "c"."proxima_accion",
    "c"."ventana_whatsapp",
    "c"."wpp_contact_id",
    "c"."created_at",
    "c"."updated_at",
    "c"."gestion_id",
    "c"."en_foco",
    "c"."cola_area_id",
    "c"."cola_area_nombre",
    "c"."en_cola",
    "c"."troncal_id",
    "c"."cola_id",
    "c"."intencion_detectada",
    "c"."urgencia_detectada",
    "c"."sentimiento_detectado",
    "c"."resumen_ia",
    "c"."cola_sugerida_id",
    "c"."tiempo_primera_respuesta_seg",
    "c"."tiempo_resolucion_seg",
    "c"."satisfaccion_cliente",
    "c"."bot_estado",
    "c"."bot_contexto",
    "c"."bot_turnos",
    "c"."regla_aplicada_id",
    "c"."canal_id_fk",
    "c"."owner_original_id",
    "c"."owner_actual_id",
    "c"."intervenido_por_id",
    "c"."canal_entrante_id",
    "c"."supervisor_responsable_id",
    "c"."desborde_aplicado",
    "c"."cola_desborde_id",
    "c"."estado_asignacion",
    "c"."motivo_no_asignada",
    "c"."agente_disponibilidad_snap",
    "c"."ts_regla_aplicada",
    "c"."ts_cola_asignada",
    "c"."ts_agente_asignado",
    "c"."ts_desborde",
    "c"."routing_status",
    "c"."routing_reason",
    "c"."channel_type",
    "col"."nombre" AS "col_responsable_nombre",
    "col"."color" AS "col_responsable_color",
    "q"."nombre" AS "col_cola_nombre",
    "cl"."nombre_completo" AS "col_cliente_nombre_360"
   FROM ((("public"."lat_conversaciones" "c"
     LEFT JOIN "public"."colaboradores" "col" ON (("col"."id" = "c"."responsable_id")))
     LEFT JOIN "public"."lat_colas" "q" ON (("q"."id" = "c"."cola_id")))
     LEFT JOIN "public"."clientes" "cl" ON (("cl"."id" = "c"."cliente_id")));


ALTER VIEW "public"."lat_v_bandeja_colaborador" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."lat_v_bandeja_supervisor" AS
 SELECT "c"."id",
    "c"."cliente_id",
    "c"."cliente_nombre",
    "c"."telefono",
    "c"."canal",
    "c"."estado",
    "c"."asunto",
    "c"."ultimo_mensaje",
    "c"."ultima_interaccion",
    "c"."no_leidos",
    "c"."prioridad",
    "c"."responsable_id",
    "c"."responsable_nombre",
    "c"."proxima_accion",
    "c"."ventana_whatsapp",
    "c"."wpp_contact_id",
    "c"."created_at",
    "c"."updated_at",
    "c"."gestion_id",
    "c"."en_foco",
    "c"."cola_area_id",
    "c"."cola_area_nombre",
    "c"."en_cola",
    "c"."troncal_id",
    "c"."cola_id",
    "c"."intencion_detectada",
    "c"."urgencia_detectada",
    "c"."sentimiento_detectado",
    "c"."resumen_ia",
    "c"."cola_sugerida_id",
    "c"."tiempo_primera_respuesta_seg",
    "c"."tiempo_resolucion_seg",
    "c"."satisfaccion_cliente",
    "c"."bot_estado",
    "c"."bot_contexto",
    "c"."bot_turnos",
    "c"."regla_aplicada_id",
    "c"."canal_id_fk",
    "c"."owner_original_id",
    "c"."owner_actual_id",
    "c"."intervenido_por_id",
    "c"."canal_entrante_id",
    "c"."supervisor_responsable_id",
    "c"."desborde_aplicado",
    "c"."cola_desborde_id",
    "c"."estado_asignacion",
    "c"."motivo_no_asignada",
    "c"."agente_disponibilidad_snap",
    "c"."ts_regla_aplicada",
    "c"."ts_cola_asignada",
    "c"."ts_agente_asignado",
    "c"."ts_desborde",
    "c"."routing_status",
    "c"."routing_reason",
    "c"."channel_type",
    "col"."nombre" AS "col_responsable_nombre",
    "col"."color" AS "col_responsable_color",
    "q"."nombre" AS "col_cola_nombre",
    "cl"."nombre_completo" AS "col_cliente_nombre_360",
    ( SELECT ("count"(*))::integer AS "count"
           FROM "public"."lat_trazabilidad" "t"
          WHERE (("t"."conversacion_id" = "c"."id") AND ("t"."intervencion" = true))) AS "col_num_intervenciones"
   FROM ((("public"."lat_conversaciones" "c"
     LEFT JOIN "public"."colaboradores" "col" ON (("col"."id" = "c"."responsable_id")))
     LEFT JOIN "public"."lat_colas" "q" ON (("q"."id" = "c"."cola_id")))
     LEFT JOIN "public"."clientes" "cl" ON (("cl"."id" = "c"."cliente_id")))
  WHERE ("c"."estado_asignacion" <> ALL (ARRAY['cerrada'::"text", 'ignorada'::"text"]));


ALTER VIEW "public"."lat_v_bandeja_supervisor" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipeline_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "process_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    "global_status" "public"."global_status" DEFAULT 'to_do'::"public"."global_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responsable_id" "uuid",
    "duracion_estimada_dias" integer
);


ALTER TABLE "public"."pipeline_stages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."process_areas" (
    "process_id" "uuid" NOT NULL,
    "area_id" "uuid" NOT NULL
);


ALTER TABLE "public"."process_areas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."process_sub_areas" (
    "process_id" "uuid" NOT NULL,
    "sub_area_id" "uuid" NOT NULL
);


ALTER TABLE "public"."process_sub_areas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."processes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "area" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "area_id" "uuid",
    "sistemas_integrados" "text"[] DEFAULT '{}'::"text"[]
);


ALTER TABLE "public"."processes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."processes"."sistemas_integrados" IS 'Nombres de sistemas externos integrados (ej: [legal, rrhh])';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text",
    "email" "text",
    "avatar_url" "text",
    "role" "text" DEFAULT 'user'::"text",
    "phone" "text",
    "department" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stage_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gestion_id" "uuid" NOT NULL,
    "from_stage_id" "uuid",
    "to_stage_id" "uuid" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "changed_by" "uuid"
);


ALTER TABLE "public"."stage_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stage_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stage_id" "uuid" NOT NULL,
    "rule_type" "text" NOT NULL,
    "rule_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "applies_to_type" "text",
    "applies_to_subtype" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stage_rules_rule_type_check" CHECK (("rule_type" = ANY (ARRAY['required_field'::"text", 'min_days_in_stage'::"text", 'sequential_only'::"text", 'requires_subtype'::"text"])))
);


ALTER TABLE "public"."stage_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sub_areas_empresa" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "area_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "color" "text" DEFAULT '#94a3b8'::"text" NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sub_areas_empresa" OWNER TO "postgres";


ALTER TABLE ONLY "integraciones"."entregas"
    ADD CONSTRAINT "entregas_evento_id_sistema_id_key" UNIQUE ("evento_id", "sistema_id");



ALTER TABLE ONLY "integraciones"."entregas"
    ADD CONSTRAINT "entregas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "integraciones"."eventos"
    ADD CONSTRAINT "eventos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "integraciones"."eventos"
    ADD CONSTRAINT "eventos_sync_id_key" UNIQUE ("sync_id");



ALTER TABLE ONLY "integraciones"."sistemas"
    ADD CONSTRAINT "sistemas_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "integraciones"."sistemas"
    ADD CONSTRAINT "sistemas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "integraciones"."tareas_sincronizadas"
    ADD CONSTRAINT "tareas_sincronizadas_origen_origen_id_destino_key" UNIQUE ("origen", "origen_id", "destino");



ALTER TABLE ONLY "integraciones"."tareas_sincronizadas"
    ADD CONSTRAINT "tareas_sincronizadas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_assistant_config"
    ADD CONSTRAINT "ai_assistant_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."areas_empresa"
    ADD CONSTRAINT "areas_empresa_nombre_unique" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."areas_empresa"
    ADD CONSTRAINT "areas_empresa_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_derivaciones"
    ADD CONSTRAINT "chat_derivaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cliente_bancos"
    ADD CONSTRAINT "cliente_bancos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cliente_cobranzas"
    ADD CONSTRAINT "cliente_cobranzas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cliente_documentos"
    ADD CONSTRAINT "cliente_documentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cliente_familiar"
    ADD CONSTRAINT "cliente_familiar_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cliente_ideas_viaje"
    ADD CONSTRAINT "cliente_ideas_viaje_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cliente_lealtad"
    ADD CONSTRAINT "cliente_lealtad_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cliente_pagos"
    ADD CONSTRAINT "cliente_pagos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cliente_referidos"
    ADD CONSTRAINT "cliente_referidos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cliente_viajes"
    ADD CONSTRAINT "cliente_viajes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."colaborador_google_tokens"
    ADD CONSTRAINT "colaborador_google_tokens_colaborador_id_key" UNIQUE ("colaborador_id");



ALTER TABLE ONLY "public"."colaborador_google_tokens"
    ADD CONSTRAINT "colaborador_google_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."colaborador_presencia"
    ADD CONSTRAINT "colaborador_presencia_pkey" PRIMARY KEY ("colaborador_id");



ALTER TABLE ONLY "public"."colaboradores"
    ADD CONSTRAINT "colaboradores_email_unique" UNIQUE ("email");



ALTER TABLE ONLY "public"."colaboradores"
    ADD CONSTRAINT "colaboradores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_attachments"
    ADD CONSTRAINT "email_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_drafts"
    ADD CONSTRAINT "email_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gestion_attachments"
    ADD CONSTRAINT "gestion_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gestion_comments"
    ADD CONSTRAINT "gestion_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gestion_conversation_events"
    ADD CONSTRAINT "gestion_conversation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gestion_subtipos"
    ADD CONSTRAINT "gestion_subtipos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gestion_tareas"
    ADD CONSTRAINT "gestion_tareas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gestion_tipos"
    ADD CONSTRAINT "gestion_tipos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gestion_tipos"
    ADD CONSTRAINT "gestion_tipos_valor_key" UNIQUE ("valor");



ALTER TABLE ONLY "public"."gestiones"
    ADD CONSTRAINT "gestiones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."granola_meetings"
    ADD CONSTRAINT "granola_meetings_granola_id_key" UNIQUE ("granola_id");



ALTER TABLE ONLY "public"."granola_meetings"
    ADD CONSTRAINT "granola_meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."granola_tasks"
    ADD CONSTRAINT "granola_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lat_bot_config"
    ADD CONSTRAINT "lat_bot_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lat_canales"
    ADD CONSTRAINT "lat_canales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lat_cola_miembros"
    ADD CONSTRAINT "lat_cola_miembros_cola_id_colaborador_id_key" UNIQUE ("cola_id", "colaborador_id");



ALTER TABLE ONLY "public"."lat_cola_miembros"
    ADD CONSTRAINT "lat_cola_miembros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lat_cola_usuarios"
    ADD CONSTRAINT "lat_cola_usuarios_cola_id_colaborador_id_key" UNIQUE ("cola_id", "colaborador_id");



ALTER TABLE ONLY "public"."lat_cola_usuarios"
    ADD CONSTRAINT "lat_cola_usuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lat_colas"
    ADD CONSTRAINT "lat_colas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lat_email_procesados"
    ADD CONSTRAINT "lat_email_procesados_message_id_key" UNIQUE ("message_id");



ALTER TABLE ONLY "public"."lat_email_procesados"
    ADD CONSTRAINT "lat_email_procesados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lat_horarios"
    ADD CONSTRAINT "lat_horarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lat_mensajes"
    ADD CONSTRAINT "lat_mensajes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lat_reglas_asignacion"
    ADD CONSTRAINT "lat_reglas_asignacion_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lat_trazabilidad"
    ADD CONSTRAINT "lat_trazabilidad_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lat_troncales"
    ADD CONSTRAINT "lat_troncales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_areas"
    ADD CONSTRAINT "process_areas_pkey" PRIMARY KEY ("process_id", "area_id");



ALTER TABLE ONLY "public"."process_sub_areas"
    ADD CONSTRAINT "process_sub_areas_pkey" PRIMARY KEY ("process_id", "sub_area_id");



ALTER TABLE ONLY "public"."processes"
    ADD CONSTRAINT "processes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."stage_history"
    ADD CONSTRAINT "stage_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stage_rules"
    ADD CONSTRAINT "stage_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sub_areas_empresa"
    ADD CONSTRAINT "sub_areas_empresa_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_entregas_estado" ON "integraciones"."entregas" USING "btree" ("estado") WHERE ("estado" = 'pendiente'::"text");



CREATE INDEX "idx_entregas_evento" ON "integraciones"."entregas" USING "btree" ("evento_id");



CREATE INDEX "idx_eventos_created" ON "integraciones"."eventos" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_eventos_origen" ON "integraciones"."eventos" USING "btree" ("origen");



CREATE INDEX "idx_eventos_procesado" ON "integraciones"."eventos" USING "btree" ("procesado") WHERE ("procesado" = false);



CREATE INDEX "idx_eventos_tipo" ON "integraciones"."eventos" USING "btree" ("tipo");



CREATE INDEX "idx_activities_assigned_to" ON "public"."activities" USING "btree" ("assigned_to");



CREATE INDEX "idx_activities_assigned_to_id" ON "public"."activities" USING "btree" ("assigned_to_id");



CREATE INDEX "idx_activities_completed" ON "public"."activities" USING "btree" ("completed");



CREATE INDEX "idx_activities_created_by" ON "public"."activities" USING "btree" ("created_by");



CREATE INDEX "idx_activities_gestion_id" ON "public"."activities" USING "btree" ("gestion_id");



CREATE INDEX "idx_activities_scheduled_at" ON "public"."activities" USING "btree" ("scheduled_at");



CREATE INDEX "idx_chat_derivaciones_conv" ON "public"."chat_derivaciones" USING "btree" ("conversacion_id", "created_at" DESC);



CREATE INDEX "idx_chat_derivaciones_efectivo_area" ON "public"."chat_derivaciones" USING "btree" ("efectivo_area_id") WHERE ("efectivo_tipo" = 'cola'::"text");



CREATE INDEX "idx_cliente_bancos_cliente" ON "public"."cliente_bancos" USING "btree" ("cliente_id");



CREATE INDEX "idx_cliente_documentos_cliente" ON "public"."cliente_documentos" USING "btree" ("cliente_id");



CREATE INDEX "idx_cliente_familiar_cliente" ON "public"."cliente_familiar" USING "btree" ("cliente_id");



CREATE INDEX "idx_cliente_ideas_cliente" ON "public"."cliente_ideas_viaje" USING "btree" ("cliente_id");



CREATE INDEX "idx_cliente_lealtad_cliente" ON "public"."cliente_lealtad" USING "btree" ("cliente_id");



CREATE INDEX "idx_cliente_pagos_cliente" ON "public"."cliente_pagos" USING "btree" ("cliente_id");



CREATE INDEX "idx_cliente_referidos_cliente" ON "public"."cliente_referidos" USING "btree" ("cliente_id");



CREATE INDEX "idx_cliente_viajes_cliente" ON "public"."cliente_viajes" USING "btree" ("cliente_id");



CREATE INDEX "idx_clientes_email" ON "public"."clientes" USING "btree" ("email");



CREATE INDEX "idx_clientes_nombre" ON "public"."clientes" USING "btree" ("nombre_completo");



CREATE INDEX "idx_email_attachments_msg" ON "public"."email_attachments" USING "btree" ("mensaje_id");



CREATE INDEX "idx_email_drafts_conv" ON "public"."email_drafts" USING "btree" ("conversacion_id");



CREATE INDEX "idx_gce_conv" ON "public"."gestion_conversation_events" USING "btree" ("conversacion_id", "created_at" DESC);



CREATE INDEX "idx_gce_gestion" ON "public"."gestion_conversation_events" USING "btree" ("gestion_id", "created_at" DESC);



CREATE INDEX "idx_gestion_attachments_gestion_id" ON "public"."gestion_attachments" USING "btree" ("gestion_id");



CREATE INDEX "idx_gestion_comments_gestion_id" ON "public"."gestion_comments" USING "btree" ("gestion_id");



CREATE INDEX "idx_gestion_tareas_gestion_id" ON "public"."gestion_tareas" USING "btree" ("gestion_id");



CREATE INDEX "idx_gestiones_cliente_id" ON "public"."gestiones" USING "btree" ("cliente_id");



CREATE UNIQUE INDEX "idx_gestiones_codigo" ON "public"."gestiones" USING "btree" ("codigo") WHERE ("codigo" IS NOT NULL);



CREATE INDEX "idx_gestiones_conv_origen" ON "public"."gestiones" USING "btree" ("conversacion_id_origen") WHERE ("conversacion_id_origen" IS NOT NULL);



CREATE INDEX "idx_gestiones_lat_conv" ON "public"."gestiones" USING "btree" ("lat_conversacion_id") WHERE ("lat_conversacion_id" IS NOT NULL);



CREATE INDEX "idx_lat_canales_estado" ON "public"."lat_canales" USING "btree" ("estado");



CREATE INDEX "idx_lat_cola_miembros_activo" ON "public"."lat_cola_miembros" USING "btree" ("cola_id", "activo");



CREATE INDEX "idx_lat_cola_miembros_cola" ON "public"."lat_cola_miembros" USING "btree" ("cola_id");



CREATE INDEX "idx_lat_cola_miembros_colab" ON "public"."lat_cola_miembros" USING "btree" ("colaborador_id");



CREATE INDEX "idx_lat_colas_entrantes" ON "public"."lat_colas" USING "gin" ("canales_entrantes_ids");



CREATE INDEX "idx_lat_colas_salientes" ON "public"."lat_colas" USING "gin" ("canales_salientes_ids");



CREATE INDEX "idx_lat_conv_bandeja_activa" ON "public"."lat_conversaciones" USING "btree" ("responsable_id", "estado_asignacion") WHERE ("estado_asignacion" <> ALL (ARRAY['cerrada'::"text", 'ignorada'::"text"]));



CREATE INDEX "idx_lat_conv_canal_entrante" ON "public"."lat_conversaciones" USING "btree" ("canal_entrante_id");



CREATE INDEX "idx_lat_conv_canal_fk" ON "public"."lat_conversaciones" USING "btree" ("canal_id_fk");



CREATE INDEX "idx_lat_conv_cliente" ON "public"."lat_conversaciones" USING "btree" ("cliente_id");



CREATE INDEX "idx_lat_conv_cola" ON "public"."lat_conversaciones" USING "btree" ("cola_area_id") WHERE ("en_cola" = true);



CREATE INDEX "idx_lat_conv_cola_activa" ON "public"."lat_conversaciones" USING "btree" ("cola_id", "estado_asignacion") WHERE ("estado_asignacion" <> ALL (ARRAY['cerrada'::"text", 'ignorada'::"text"]));



CREATE INDEX "idx_lat_conv_en_cola" ON "public"."lat_conversaciones" USING "btree" ("cola_id") WHERE ("estado_asignacion" = 'en_cola'::"text");



CREATE INDEX "idx_lat_conv_en_foco" ON "public"."lat_conversaciones" USING "btree" ("en_foco", "ultima_interaccion" DESC);



CREATE INDEX "idx_lat_conv_estado" ON "public"."lat_conversaciones" USING "btree" ("estado");



CREATE INDEX "idx_lat_conv_estado_asig_activo" ON "public"."lat_conversaciones" USING "btree" ("estado_asignacion") WHERE ("estado_asignacion" <> ALL (ARRAY['cerrada'::"text", 'ignorada'::"text"]));



CREATE INDEX "idx_lat_conv_estado_asignacion" ON "public"."lat_conversaciones" USING "btree" ("estado_asignacion");



CREATE INDEX "idx_lat_conv_gestion_id" ON "public"."lat_conversaciones" USING "btree" ("gestion_id") WHERE ("gestion_id" IS NOT NULL);



CREATE INDEX "idx_lat_conv_owner_activo" ON "public"."lat_conversaciones" USING "btree" ("owner_actual_id") WHERE (("owner_actual_id" IS NOT NULL) AND ("estado_asignacion" <> ALL (ARRAY['cerrada'::"text", 'ignorada'::"text"])));



CREATE INDEX "idx_lat_conv_owner_actual" ON "public"."lat_conversaciones" USING "btree" ("owner_actual_id");



CREATE INDEX "idx_lat_conv_owner_original" ON "public"."lat_conversaciones" USING "btree" ("owner_original_id");



CREATE INDEX "idx_lat_conv_regla_aplicada" ON "public"."lat_conversaciones" USING "btree" ("regla_aplicada_id");



CREATE INDEX "idx_lat_conv_responsable_activa" ON "public"."lat_conversaciones" USING "btree" ("responsable_id") WHERE ("estado_asignacion" <> ALL (ARRAY['cerrada'::"text", 'ignorada'::"text"]));



CREATE INDEX "idx_lat_conv_routing_status" ON "public"."lat_conversaciones" USING "btree" ("routing_status") WHERE ("routing_status" IS NOT NULL);



CREATE INDEX "idx_lat_conv_sin_responsable" ON "public"."lat_conversaciones" USING "btree" ("estado_asignacion") WHERE (("responsable_id" IS NULL) AND ("estado_asignacion" <> ALL (ARRAY['cerrada'::"text", 'ignorada'::"text"])));



CREATE INDEX "idx_lat_conv_telefono" ON "public"."lat_conversaciones" USING "btree" ("telefono");



CREATE INDEX "idx_lat_conv_ultima" ON "public"."lat_conversaciones" USING "btree" ("ultima_interaccion" DESC);



CREATE INDEX "idx_lat_mensajes_email_message_id" ON "public"."lat_mensajes" USING "btree" ("email_message_id");



CREATE INDEX "idx_lat_mensajes_email_thread" ON "public"."lat_mensajes" USING "btree" ("email_thread_id");



CREATE INDEX "idx_lat_msg_conv" ON "public"."lat_mensajes" USING "btree" ("conversacion_id", "created_at");



CREATE UNIQUE INDEX "idx_lat_msg_wpp_id" ON "public"."lat_mensajes" USING "btree" ("wpp_message_id") WHERE ("wpp_message_id" IS NOT NULL);



CREATE INDEX "idx_lat_reglas_canal" ON "public"."lat_reglas_asignacion" USING "btree" ("canal_id");



CREATE INDEX "idx_lat_trazabilidad_channel" ON "public"."lat_trazabilidad" USING "btree" ("channel_type");



CREATE INDEX "idx_lat_trazabilidad_conv" ON "public"."lat_trazabilidad" USING "btree" ("conversacion_id", "created_at" DESC);



CREATE INDEX "idx_lat_trazabilidad_rstatus" ON "public"."lat_trazabilidad" USING "btree" ("routing_status");



CREATE INDEX "idx_presencia_conectado" ON "public"."colaborador_presencia" USING "btree" ("colaborador_id", "conectado");



CREATE INDEX "idx_process_sub_areas_process" ON "public"."process_sub_areas" USING "btree" ("process_id");



CREATE INDEX "idx_profiles_user_id" ON "public"."profiles" USING "btree" ("user_id");



CREATE INDEX "idx_stage_history_gestion_id" ON "public"."stage_history" USING "btree" ("gestion_id");



CREATE INDEX "idx_stage_rules_stage_id" ON "public"."stage_rules" USING "btree" ("stage_id");



CREATE INDEX "idx_sub_areas_area_id" ON "public"."sub_areas_empresa" USING "btree" ("area_id");



CREATE UNIQUE INDEX "lat_bot_config_canal_activo" ON "public"."lat_bot_config" USING "btree" ("canal") WHERE ("activo" = true);



CREATE INDEX "lat_email_procesados_msg" ON "public"."lat_email_procesados" USING "btree" ("message_id");



CREATE INDEX "lat_trazabilidad_conversacion_idx" ON "public"."lat_trazabilidad" USING "btree" ("conversacion_id");



CREATE INDEX "lat_trazabilidad_created_idx" ON "public"."lat_trazabilidad" USING "btree" ("created_at" DESC);



CREATE OR REPLACE TRIGGER "trg_sistemas_updated_at" BEFORE UPDATE ON "integraciones"."sistemas" FOR EACH ROW EXECUTE FUNCTION "integraciones"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_colaborador_presencia_updated_at" BEFORE UPDATE ON "public"."colaborador_presencia" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_gestion_codigo" BEFORE INSERT ON "public"."gestiones" FOR EACH ROW WHEN (("new"."codigo" IS NULL)) EXECUTE FUNCTION "public"."generate_gestion_codigo"();



CREATE OR REPLACE TRIGGER "trg_lat_auto_route_inbound_message" AFTER INSERT ON "public"."lat_mensajes" FOR EACH ROW EXECUTE FUNCTION "public"."lat_trigger_route_inbound_message"();



CREATE OR REPLACE TRIGGER "trg_lat_canal_sync_estado" BEFORE INSERT OR UPDATE OF "estado", "activo" ON "public"."lat_canales" FOR EACH ROW EXECUTE FUNCTION "public"."sync_lat_canal_estado_activo"();



CREATE OR REPLACE TRIGGER "trg_lat_conv_on_message" AFTER INSERT ON "public"."lat_mensajes" FOR EACH ROW EXECUTE FUNCTION "public"."update_lat_conv_on_message"();



CREATE OR REPLACE TRIGGER "trg_lat_conv_updated_at" BEFORE UPDATE ON "public"."lat_conversaciones" FOR EACH ROW EXECUTE FUNCTION "public"."update_lat_conv_updated_at"();



CREATE OR REPLACE TRIGGER "trg_lat_msg_update_conv" AFTER INSERT ON "public"."lat_mensajes" FOR EACH ROW EXECUTE FUNCTION "public"."update_lat_conv_on_message"();



CREATE OR REPLACE TRIGGER "trg_sync_owner_responsable" BEFORE UPDATE OF "owner_actual_id", "responsable_id" ON "public"."lat_conversaciones" FOR EACH ROW EXECUTE FUNCTION "public"."sync_lat_conv_owner_responsable"();



CREATE OR REPLACE TRIGGER "trg_touch_email_drafts" BEFORE UPDATE ON "public"."email_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."touch_email_drafts_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_lat_conv_on_message" AFTER INSERT ON "public"."lat_mensajes" FOR EACH ROW EXECUTE FUNCTION "public"."update_lat_conv_on_message"();



CREATE OR REPLACE TRIGGER "update_activities_updated_at" BEFORE UPDATE ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_clientes_updated_at" BEFORE UPDATE ON "public"."clientes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_gestiones_updated_at" BEFORE UPDATE ON "public"."gestiones" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_pipeline_stages_updated_at" BEFORE UPDATE ON "public"."pipeline_stages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_processes_updated_at" BEFORE UPDATE ON "public"."processes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "integraciones"."entregas"
    ADD CONSTRAINT "entregas_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "integraciones"."eventos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "integraciones"."entregas"
    ADD CONSTRAINT "entregas_sistema_id_fkey" FOREIGN KEY ("sistema_id") REFERENCES "integraciones"."sistemas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "integraciones"."tareas_sincronizadas"
    ADD CONSTRAINT "tareas_sincronizadas_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_gestion_id_fkey" FOREIGN KEY ("gestion_id") REFERENCES "public"."gestiones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_assistant_config"
    ADD CONSTRAINT "ai_assistant_config_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."colaboradores"("id");



ALTER TABLE ONLY "public"."chat_derivaciones"
    ADD CONSTRAINT "chat_derivaciones_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "public"."lat_conversaciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_derivaciones"
    ADD CONSTRAINT "chat_derivaciones_derivado_por_id_fkey" FOREIGN KEY ("derivado_por_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_derivaciones"
    ADD CONSTRAINT "chat_derivaciones_destino_area_id_fkey" FOREIGN KEY ("destino_area_id") REFERENCES "public"."areas_empresa"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_derivaciones"
    ADD CONSTRAINT "chat_derivaciones_destino_usuario_id_fkey" FOREIGN KEY ("destino_usuario_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_derivaciones"
    ADD CONSTRAINT "chat_derivaciones_efectivo_area_id_fkey" FOREIGN KEY ("efectivo_area_id") REFERENCES "public"."areas_empresa"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_derivaciones"
    ADD CONSTRAINT "chat_derivaciones_efectivo_usuario_id_fkey" FOREIGN KEY ("efectivo_usuario_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cliente_bancos"
    ADD CONSTRAINT "cliente_bancos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cliente_cobranzas"
    ADD CONSTRAINT "cliente_cobranzas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cliente_documentos"
    ADD CONSTRAINT "cliente_documentos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cliente_familiar"
    ADD CONSTRAINT "cliente_familiar_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cliente_familiar"
    ADD CONSTRAINT "cliente_familiar_familiar_cliente_id_fkey" FOREIGN KEY ("familiar_cliente_id") REFERENCES "public"."clientes"("id");



ALTER TABLE ONLY "public"."cliente_ideas_viaje"
    ADD CONSTRAINT "cliente_ideas_viaje_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cliente_lealtad"
    ADD CONSTRAINT "cliente_lealtad_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cliente_pagos"
    ADD CONSTRAINT "cliente_pagos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cliente_referidos"
    ADD CONSTRAINT "cliente_referidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cliente_referidos"
    ADD CONSTRAINT "cliente_referidos_referido_id_fkey" FOREIGN KEY ("referido_id") REFERENCES "public"."clientes"("id");



ALTER TABLE ONLY "public"."cliente_viajes"
    ADD CONSTRAINT "cliente_viajes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."colaborador_google_tokens"
    ADD CONSTRAINT "colaborador_google_tokens_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."colaborador_presencia"
    ADD CONSTRAINT "colaborador_presencia_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."colaboradores"
    ADD CONSTRAINT "colaboradores_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas_empresa"("id");



ALTER TABLE ONLY "public"."colaboradores"
    ADD CONSTRAINT "colaboradores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gestion_attachments"
    ADD CONSTRAINT "gestion_attachments_gestion_id_fkey" FOREIGN KEY ("gestion_id") REFERENCES "public"."gestiones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gestion_comments"
    ADD CONSTRAINT "gestion_comments_gestion_id_fkey" FOREIGN KEY ("gestion_id") REFERENCES "public"."gestiones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gestion_conversation_events"
    ADD CONSTRAINT "gestion_conversation_events_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "public"."lat_conversaciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gestion_conversation_events"
    ADD CONSTRAINT "gestion_conversation_events_gestion_id_fkey" FOREIGN KEY ("gestion_id") REFERENCES "public"."gestiones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gestion_subtipos"
    ADD CONSTRAINT "gestion_subtipos_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "public"."gestion_tipos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gestion_tareas"
    ADD CONSTRAINT "gestion_tareas_gestion_id_fkey" FOREIGN KEY ("gestion_id") REFERENCES "public"."gestiones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gestiones"
    ADD CONSTRAINT "gestiones_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas_empresa"("id");



ALTER TABLE ONLY "public"."gestiones"
    ADD CONSTRAINT "gestiones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gestiones"
    ADD CONSTRAINT "gestiones_conversacion_id_origen_fkey" FOREIGN KEY ("conversacion_id_origen") REFERENCES "public"."lat_conversaciones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gestiones"
    ADD CONSTRAINT "gestiones_lat_conversacion_id_fkey" FOREIGN KEY ("lat_conversacion_id") REFERENCES "public"."lat_conversaciones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gestiones"
    ADD CONSTRAINT "gestiones_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gestiones"
    ADD CONSTRAINT "gestiones_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gestiones"
    ADD CONSTRAINT "gestiones_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "public"."colaboradores"("id");



ALTER TABLE ONLY "public"."gestiones"
    ADD CONSTRAINT "gestiones_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."granola_meetings"
    ADD CONSTRAINT "granola_meetings_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."granola_tasks"
    ADD CONSTRAINT "granola_tasks_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."granola_tasks"
    ADD CONSTRAINT "granola_tasks_asignado_id_fkey" FOREIGN KEY ("asignado_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."granola_tasks"
    ADD CONSTRAINT "granola_tasks_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."granola_meetings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lat_canales"
    ADD CONSTRAINT "lat_canales_bot_default_id_fkey" FOREIGN KEY ("bot_default_id") REFERENCES "public"."lat_bot_config"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_canales"
    ADD CONSTRAINT "lat_canales_cola_default_id_fkey" FOREIGN KEY ("cola_default_id") REFERENCES "public"."lat_colas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_canales"
    ADD CONSTRAINT "lat_canales_troncal_id_fkey" FOREIGN KEY ("troncal_id") REFERENCES "public"."lat_troncales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_cola_miembros"
    ADD CONSTRAINT "lat_cola_miembros_cola_id_fkey" FOREIGN KEY ("cola_id") REFERENCES "public"."lat_colas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lat_cola_miembros"
    ADD CONSTRAINT "lat_cola_miembros_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lat_cola_usuarios"
    ADD CONSTRAINT "lat_cola_usuarios_cola_id_fkey" FOREIGN KEY ("cola_id") REFERENCES "public"."lat_colas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lat_cola_usuarios"
    ADD CONSTRAINT "lat_cola_usuarios_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lat_colas"
    ADD CONSTRAINT "lat_colas_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "public"."lat_canales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_colas"
    ADD CONSTRAINT "lat_colas_canal_saliente_id_fkey" FOREIGN KEY ("canal_saliente_id") REFERENCES "public"."lat_canales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_colas"
    ADD CONSTRAINT "lat_colas_desborde_cola_id_fkey" FOREIGN KEY ("desborde_cola_id") REFERENCES "public"."lat_colas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_colas"
    ADD CONSTRAINT "lat_colas_horario_id_fkey" FOREIGN KEY ("horario_id") REFERENCES "public"."lat_horarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_canal_entrante_id_fkey" FOREIGN KEY ("canal_entrante_id") REFERENCES "public"."lat_canales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_canal_id_fk_fkey" FOREIGN KEY ("canal_id_fk") REFERENCES "public"."lat_canales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_cola_area_id_fkey" FOREIGN KEY ("cola_area_id") REFERENCES "public"."areas_empresa"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_cola_desborde_id_fkey" FOREIGN KEY ("cola_desborde_id") REFERENCES "public"."lat_colas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_cola_id_fkey" FOREIGN KEY ("cola_id") REFERENCES "public"."lat_colas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_cola_sugerida_id_fkey" FOREIGN KEY ("cola_sugerida_id") REFERENCES "public"."lat_colas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_gestion_id_fkey" FOREIGN KEY ("gestion_id") REFERENCES "public"."gestiones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_intervenido_por_id_fkey" FOREIGN KEY ("intervenido_por_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_owner_actual_id_fkey" FOREIGN KEY ("owner_actual_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_owner_original_id_fkey" FOREIGN KEY ("owner_original_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_regla_aplicada_id_fkey" FOREIGN KEY ("regla_aplicada_id") REFERENCES "public"."lat_reglas_asignacion"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_supervisor_responsable_id_fkey" FOREIGN KEY ("supervisor_responsable_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_conversaciones"
    ADD CONSTRAINT "lat_conversaciones_troncal_id_fkey" FOREIGN KEY ("troncal_id") REFERENCES "public"."lat_troncales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_email_procesados"
    ADD CONSTRAINT "lat_email_procesados_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "public"."lat_conversaciones"("id");



ALTER TABLE ONLY "public"."lat_horarios"
    ADD CONSTRAINT "lat_horarios_cola_id_fkey" FOREIGN KEY ("cola_id") REFERENCES "public"."lat_colas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_mensajes"
    ADD CONSTRAINT "lat_mensajes_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "public"."lat_conversaciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lat_reglas_asignacion"
    ADD CONSTRAINT "lat_reglas_asignacion_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "public"."lat_canales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lat_trazabilidad"
    ADD CONSTRAINT "lat_trazabilidad_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "public"."lat_canales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_trazabilidad"
    ADD CONSTRAINT "lat_trazabilidad_cola_anterior_id_fkey" FOREIGN KEY ("cola_anterior_id") REFERENCES "public"."lat_colas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_trazabilidad"
    ADD CONSTRAINT "lat_trazabilidad_cola_desborde_id_fkey" FOREIGN KEY ("cola_desborde_id") REFERENCES "public"."lat_colas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_trazabilidad"
    ADD CONSTRAINT "lat_trazabilidad_cola_id_fkey" FOREIGN KEY ("cola_id") REFERENCES "public"."lat_colas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_trazabilidad"
    ADD CONSTRAINT "lat_trazabilidad_cola_nueva_id_fkey" FOREIGN KEY ("cola_nueva_id") REFERENCES "public"."lat_colas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_trazabilidad"
    ADD CONSTRAINT "lat_trazabilidad_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_trazabilidad"
    ADD CONSTRAINT "lat_trazabilidad_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "public"."lat_conversaciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lat_trazabilidad"
    ADD CONSTRAINT "lat_trazabilidad_owner_nuevo_id_fkey" FOREIGN KEY ("owner_nuevo_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_trazabilidad"
    ADD CONSTRAINT "lat_trazabilidad_owner_original_id_fkey" FOREIGN KEY ("owner_original_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lat_trazabilidad"
    ADD CONSTRAINT "lat_trazabilidad_regla_id_fkey" FOREIGN KEY ("regla_id") REFERENCES "public"."lat_reglas_asignacion"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "public"."colaboradores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."process_areas"
    ADD CONSTRAINT "process_areas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas_empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_areas"
    ADD CONSTRAINT "process_areas_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_sub_areas"
    ADD CONSTRAINT "process_sub_areas_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_sub_areas"
    ADD CONSTRAINT "process_sub_areas_sub_area_id_fkey" FOREIGN KEY ("sub_area_id") REFERENCES "public"."sub_areas_empresa"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."processes"
    ADD CONSTRAINT "processes_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas_empresa"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stage_history"
    ADD CONSTRAINT "stage_history_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stage_history"
    ADD CONSTRAINT "stage_history_gestion_id_fkey" FOREIGN KEY ("gestion_id") REFERENCES "public"."gestiones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stage_history"
    ADD CONSTRAINT "stage_history_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stage_rules"
    ADD CONSTRAINT "stage_rules_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sub_areas_empresa"
    ADD CONSTRAINT "sub_areas_empresa_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas_empresa"("id") ON DELETE CASCADE;



CREATE POLICY "Allow all areas_empresa" ON "public"."areas_empresa" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all clientes" ON "public"."clientes" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all gestion_subtipos" ON "public"."gestion_subtipos" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all gestion_tareas" ON "public"."gestion_tareas" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all gestion_tipos" ON "public"."gestion_tipos" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all gestiones" ON "public"."gestiones" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all lat_cola_miembros" ON "public"."lat_cola_miembros" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all lat_conversaciones" ON "public"."lat_conversaciones" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all lat_mensajes" ON "public"."lat_mensajes" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all lat_trazabilidad" ON "public"."lat_trazabilidad" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all pipeline_stages" ON "public"."pipeline_stages" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all process_areas" ON "public"."process_areas" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all process_sub_areas" ON "public"."process_sub_areas" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all processes" ON "public"."processes" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all sub_areas_empresa" ON "public"."sub_areas_empresa" USING (true) WITH CHECK (true);



CREATE POLICY "Anon users can create gestiones" ON "public"."gestiones" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Anon users can create processes" ON "public"."processes" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Anon users can create stages" ON "public"."pipeline_stages" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Anon users can delete gestiones" ON "public"."gestiones" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Anon users can delete processes" ON "public"."processes" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Anon users can delete stages" ON "public"."pipeline_stages" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Anon users can insert stage_history" ON "public"."stage_history" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Anon users can manage stage_rules" ON "public"."stage_rules" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Anon users can update gestiones" ON "public"."gestiones" FOR UPDATE TO "anon" USING (true);



CREATE POLICY "Anon users can update processes" ON "public"."processes" FOR UPDATE TO "anon" USING (true);



CREATE POLICY "Anon users can update stages" ON "public"."pipeline_stages" FOR UPDATE TO "anon" USING (true);



CREATE POLICY "Anon users can view gestiones" ON "public"."gestiones" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Anon users can view processes" ON "public"."processes" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Anon users can view stage_history" ON "public"."stage_history" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Anon users can view stage_rules" ON "public"."stage_rules" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Anon users can view stages" ON "public"."pipeline_stages" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Anyone can create activities" ON "public"."activities" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Anyone can create clientes" ON "public"."clientes" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Anyone can create gestion_attachments" ON "public"."gestion_attachments" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Anyone can create gestion_comments" ON "public"."gestion_comments" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Anyone can create profiles" ON "public"."profiles" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Anyone can delete activities" ON "public"."activities" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can delete clientes" ON "public"."clientes" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can delete gestion_attachments" ON "public"."gestion_attachments" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can delete gestion_comments" ON "public"."gestion_comments" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can delete granola_meetings" ON "public"."granola_meetings" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can delete granola_tasks" ON "public"."granola_tasks" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can insert chat_derivaciones" ON "public"."chat_derivaciones" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Anyone can insert colaborador_presencia" ON "public"."colaborador_presencia" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Anyone can insert gce" ON "public"."gestion_conversation_events" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Anyone can insert granola_meetings" ON "public"."granola_meetings" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Anyone can insert granola_tasks" ON "public"."granola_tasks" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Anyone can manage cliente_bancos" ON "public"."cliente_bancos" TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can manage cliente_documentos" ON "public"."cliente_documentos" TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can manage cliente_familiar" ON "public"."cliente_familiar" TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can manage cliente_ideas_viaje" ON "public"."cliente_ideas_viaje" TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can manage cliente_lealtad" ON "public"."cliente_lealtad" TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can manage cliente_pagos" ON "public"."cliente_pagos" TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can manage cliente_referidos" ON "public"."cliente_referidos" TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can manage cliente_viajes" ON "public"."cliente_viajes" TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can update activities" ON "public"."activities" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can update clientes" ON "public"."clientes" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can update colaborador_presencia" ON "public"."colaborador_presencia" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can update granola_meetings" ON "public"."granola_meetings" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can update granola_tasks" ON "public"."granola_tasks" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can update profiles" ON "public"."profiles" FOR UPDATE TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can view activities" ON "public"."activities" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can view chat_derivaciones" ON "public"."chat_derivaciones" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can view clientes" ON "public"."clientes" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can view colaborador_presencia" ON "public"."colaborador_presencia" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can view gce" ON "public"."gestion_conversation_events" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can view gestion_attachments" ON "public"."gestion_attachments" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can view gestion_comments" ON "public"."gestion_comments" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can view granola_meetings" ON "public"."granola_meetings" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can view granola_tasks" ON "public"."granola_tasks" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can view profiles" ON "public"."profiles" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Authenticated users can insert stage_history" ON "public"."stage_history" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can manage stage_rules" ON "public"."stage_rules" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can view stage_history" ON "public"."stage_history" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view stage_rules" ON "public"."stage_rules" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_assistant_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anon_all" ON "public"."cliente_cobranzas" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_all" ON "public"."colaborador_google_tokens" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_read_colaboradores" ON "public"."colaboradores" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read_tareas" ON "public"."gestion_tareas" FOR SELECT TO "anon" USING (true);



ALTER TABLE "public"."areas_empresa" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "auth_all" ON "public"."cliente_cobranzas" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_all" ON "public"."colaborador_google_tokens" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth_all_colaboradores" ON "public"."colaboradores" TO "authenticated" USING (true);



CREATE POLICY "auth_all_tareas" ON "public"."gestion_tareas" TO "authenticated" USING (true);



ALTER TABLE "public"."chat_derivaciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cliente_bancos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cliente_cobranzas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cliente_documentos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cliente_familiar" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cliente_ideas_viaje" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cliente_lealtad" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cliente_pagos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cliente_referidos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cliente_viajes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."colaborador_google_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."colaborador_presencia" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."colaboradores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_attachments_all" ON "public"."email_attachments" TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."email_drafts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_drafts_all" ON "public"."email_drafts" TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."gestion_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gestion_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gestion_conversation_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gestion_subtipos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gestion_tareas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gestion_tipos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gestiones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."granola_meetings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."granola_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lat_bot_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lat_canales" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lat_canales_all" ON "public"."lat_canales" USING (true) WITH CHECK (true);



ALTER TABLE "public"."lat_cola_miembros" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lat_cola_usuarios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lat_cola_usuarios_all" ON "public"."lat_cola_usuarios" USING (true) WITH CHECK (true);



ALTER TABLE "public"."lat_colas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lat_colas_all" ON "public"."lat_colas" USING (true) WITH CHECK (true);



ALTER TABLE "public"."lat_conversaciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lat_email_procesados" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lat_horarios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lat_horarios_all" ON "public"."lat_horarios" USING (true) WITH CHECK (true);



ALTER TABLE "public"."lat_mensajes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lat_reglas_all" ON "public"."lat_reglas_asignacion" USING (true) WITH CHECK (true);



ALTER TABLE "public"."lat_reglas_asignacion" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lat_trazabilidad" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lat_trazabilidad_all" ON "public"."lat_trazabilidad" USING (true) WITH CHECK (true);



ALTER TABLE "public"."lat_troncales" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lat_troncales_all" ON "public"."lat_troncales" USING (true) WITH CHECK (true);



ALTER TABLE "public"."pipeline_stages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."process_areas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."process_sub_areas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."processes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public read" ON "public"."lat_bot_config" FOR SELECT USING (true);



ALTER TABLE "public"."stage_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stage_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sub_areas_empresa" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."email_attachments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."email_drafts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."lat_conversaciones";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."lat_mensajes";






GRANT USAGE ON SCHEMA "integraciones" TO "authenticated";
GRANT USAGE ON SCHEMA "integraciones" TO "anon";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."generate_gestion_codigo"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_gestion_codigo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_gestion_codigo"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lat_agente_carga_activa"("p_colaborador_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."lat_agente_carga_activa"("p_colaborador_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lat_agente_carga_activa"("p_colaborador_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."lat_cola_canales_conectados"("p_cola_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."lat_cola_canales_conectados"("p_cola_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lat_cola_canales_conectados"("p_cola_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."lat_cola_puede_activarse"("p_cola_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."lat_cola_puede_activarse"("p_cola_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lat_cola_puede_activarse"("p_cola_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."lat_cola_valida_para_canal"("p_cola_id" "uuid", "p_canal_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."lat_cola_valida_para_canal"("p_cola_id" "uuid", "p_canal_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lat_cola_valida_para_canal"("p_cola_id" "uuid", "p_canal_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."lat_gestionar_conversacion"("p_conversacion_id" "uuid", "p_gestion_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."lat_gestionar_conversacion"("p_conversacion_id" "uuid", "p_gestion_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lat_gestionar_conversacion"("p_conversacion_id" "uuid", "p_gestion_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."lat_reasignar_conversacion"("p_conversacion_id" "uuid", "p_nuevo_responsable" "uuid", "p_intervenido_por" "uuid", "p_motivo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lat_reasignar_conversacion"("p_conversacion_id" "uuid", "p_nuevo_responsable" "uuid", "p_intervenido_por" "uuid", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lat_reasignar_conversacion"("p_conversacion_id" "uuid", "p_nuevo_responsable" "uuid", "p_intervenido_por" "uuid", "p_motivo" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lat_trazabilidad_resumen"("p_conversacion_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."lat_trazabilidad_resumen"("p_conversacion_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lat_trazabilidad_resumen"("p_conversacion_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."lat_trigger_route_inbound_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."lat_trigger_route_inbound_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lat_trigger_route_inbound_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_lat_canal_estado_activo"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_lat_canal_estado_activo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_lat_canal_estado_activo"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_lat_conv_owner_responsable"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_lat_conv_owner_responsable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_lat_conv_owner_responsable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_email_drafts_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_email_drafts_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_email_drafts_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_lat_conv_on_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_lat_conv_on_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_lat_conv_on_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_lat_conv_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_lat_conv_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_lat_conv_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
























GRANT SELECT ON TABLE "integraciones"."sistemas" TO "authenticated";
GRANT SELECT ON TABLE "integraciones"."sistemas" TO "anon";



GRANT SELECT,INSERT,UPDATE ON TABLE "integraciones"."tareas_sincronizadas" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "integraciones"."tareas_sincronizadas" TO "anon";



GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."ai_assistant_config" TO "anon";
GRANT ALL ON TABLE "public"."ai_assistant_config" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_assistant_config" TO "service_role";



GRANT ALL ON TABLE "public"."areas_empresa" TO "anon";
GRANT ALL ON TABLE "public"."areas_empresa" TO "authenticated";
GRANT ALL ON TABLE "public"."areas_empresa" TO "service_role";



GRANT ALL ON TABLE "public"."chat_derivaciones" TO "anon";
GRANT ALL ON TABLE "public"."chat_derivaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_derivaciones" TO "service_role";



GRANT ALL ON TABLE "public"."cliente_bancos" TO "anon";
GRANT ALL ON TABLE "public"."cliente_bancos" TO "authenticated";
GRANT ALL ON TABLE "public"."cliente_bancos" TO "service_role";



GRANT ALL ON TABLE "public"."cliente_cobranzas" TO "anon";
GRANT ALL ON TABLE "public"."cliente_cobranzas" TO "authenticated";
GRANT ALL ON TABLE "public"."cliente_cobranzas" TO "service_role";



GRANT ALL ON TABLE "public"."cliente_documentos" TO "anon";
GRANT ALL ON TABLE "public"."cliente_documentos" TO "authenticated";
GRANT ALL ON TABLE "public"."cliente_documentos" TO "service_role";



GRANT ALL ON TABLE "public"."cliente_familiar" TO "anon";
GRANT ALL ON TABLE "public"."cliente_familiar" TO "authenticated";
GRANT ALL ON TABLE "public"."cliente_familiar" TO "service_role";



GRANT ALL ON TABLE "public"."cliente_ideas_viaje" TO "anon";
GRANT ALL ON TABLE "public"."cliente_ideas_viaje" TO "authenticated";
GRANT ALL ON TABLE "public"."cliente_ideas_viaje" TO "service_role";



GRANT ALL ON TABLE "public"."cliente_lealtad" TO "anon";
GRANT ALL ON TABLE "public"."cliente_lealtad" TO "authenticated";
GRANT ALL ON TABLE "public"."cliente_lealtad" TO "service_role";



GRANT ALL ON TABLE "public"."cliente_pagos" TO "anon";
GRANT ALL ON TABLE "public"."cliente_pagos" TO "authenticated";
GRANT ALL ON TABLE "public"."cliente_pagos" TO "service_role";



GRANT ALL ON TABLE "public"."cliente_referidos" TO "anon";
GRANT ALL ON TABLE "public"."cliente_referidos" TO "authenticated";
GRANT ALL ON TABLE "public"."cliente_referidos" TO "service_role";



GRANT ALL ON TABLE "public"."cliente_viajes" TO "anon";
GRANT ALL ON TABLE "public"."cliente_viajes" TO "authenticated";
GRANT ALL ON TABLE "public"."cliente_viajes" TO "service_role";



GRANT ALL ON TABLE "public"."clientes" TO "anon";
GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";



GRANT ALL ON TABLE "public"."colaborador_google_tokens" TO "anon";
GRANT ALL ON TABLE "public"."colaborador_google_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."colaborador_google_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."colaborador_presencia" TO "anon";
GRANT ALL ON TABLE "public"."colaborador_presencia" TO "authenticated";
GRANT ALL ON TABLE "public"."colaborador_presencia" TO "service_role";



GRANT ALL ON TABLE "public"."colaboradores" TO "anon";
GRANT ALL ON TABLE "public"."colaboradores" TO "authenticated";
GRANT ALL ON TABLE "public"."colaboradores" TO "service_role";



GRANT ALL ON TABLE "public"."email_attachments" TO "anon";
GRANT ALL ON TABLE "public"."email_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."email_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."email_drafts" TO "anon";
GRANT ALL ON TABLE "public"."email_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."email_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."gestion_attachments" TO "anon";
GRANT ALL ON TABLE "public"."gestion_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."gestion_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."gestion_comments" TO "anon";
GRANT ALL ON TABLE "public"."gestion_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."gestion_comments" TO "service_role";



GRANT ALL ON TABLE "public"."gestion_conversation_events" TO "anon";
GRANT ALL ON TABLE "public"."gestion_conversation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."gestion_conversation_events" TO "service_role";



GRANT ALL ON TABLE "public"."gestion_subtipos" TO "anon";
GRANT ALL ON TABLE "public"."gestion_subtipos" TO "authenticated";
GRANT ALL ON TABLE "public"."gestion_subtipos" TO "service_role";



GRANT ALL ON TABLE "public"."gestion_tareas" TO "anon";
GRANT ALL ON TABLE "public"."gestion_tareas" TO "authenticated";
GRANT ALL ON TABLE "public"."gestion_tareas" TO "service_role";



GRANT ALL ON TABLE "public"."gestion_tipos" TO "anon";
GRANT ALL ON TABLE "public"."gestion_tipos" TO "authenticated";
GRANT ALL ON TABLE "public"."gestion_tipos" TO "service_role";



GRANT ALL ON TABLE "public"."gestiones" TO "anon";
GRANT ALL ON TABLE "public"."gestiones" TO "authenticated";
GRANT ALL ON TABLE "public"."gestiones" TO "service_role";



GRANT ALL ON TABLE "public"."granola_meetings" TO "anon";
GRANT ALL ON TABLE "public"."granola_meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."granola_meetings" TO "service_role";



GRANT ALL ON TABLE "public"."granola_tasks" TO "anon";
GRANT ALL ON TABLE "public"."granola_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."granola_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."lat_bot_config" TO "anon";
GRANT ALL ON TABLE "public"."lat_bot_config" TO "authenticated";
GRANT ALL ON TABLE "public"."lat_bot_config" TO "service_role";



GRANT ALL ON TABLE "public"."lat_canales" TO "anon";
GRANT ALL ON TABLE "public"."lat_canales" TO "authenticated";
GRANT ALL ON TABLE "public"."lat_canales" TO "service_role";



GRANT ALL ON TABLE "public"."lat_cola_miembros" TO "anon";
GRANT ALL ON TABLE "public"."lat_cola_miembros" TO "authenticated";
GRANT ALL ON TABLE "public"."lat_cola_miembros" TO "service_role";



GRANT ALL ON TABLE "public"."lat_cola_usuarios" TO "anon";
GRANT ALL ON TABLE "public"."lat_cola_usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."lat_cola_usuarios" TO "service_role";



GRANT ALL ON TABLE "public"."lat_colas" TO "anon";
GRANT ALL ON TABLE "public"."lat_colas" TO "authenticated";
GRANT ALL ON TABLE "public"."lat_colas" TO "service_role";



GRANT ALL ON TABLE "public"."lat_conversaciones" TO "anon";
GRANT ALL ON TABLE "public"."lat_conversaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."lat_conversaciones" TO "service_role";



GRANT ALL ON TABLE "public"."lat_email_procesados" TO "anon";
GRANT ALL ON TABLE "public"."lat_email_procesados" TO "authenticated";
GRANT ALL ON TABLE "public"."lat_email_procesados" TO "service_role";



GRANT ALL ON TABLE "public"."lat_horarios" TO "anon";
GRANT ALL ON TABLE "public"."lat_horarios" TO "authenticated";
GRANT ALL ON TABLE "public"."lat_horarios" TO "service_role";



GRANT ALL ON TABLE "public"."lat_mensajes" TO "anon";
GRANT ALL ON TABLE "public"."lat_mensajes" TO "authenticated";
GRANT ALL ON TABLE "public"."lat_mensajes" TO "service_role";



GRANT ALL ON TABLE "public"."lat_reglas_asignacion" TO "anon";
GRANT ALL ON TABLE "public"."lat_reglas_asignacion" TO "authenticated";
GRANT ALL ON TABLE "public"."lat_reglas_asignacion" TO "service_role";



GRANT ALL ON TABLE "public"."lat_trazabilidad" TO "anon";
GRANT ALL ON TABLE "public"."lat_trazabilidad" TO "authenticated";
GRANT ALL ON TABLE "public"."lat_trazabilidad" TO "service_role";



GRANT ALL ON TABLE "public"."lat_troncales" TO "anon";
GRANT ALL ON TABLE "public"."lat_troncales" TO "authenticated";
GRANT ALL ON TABLE "public"."lat_troncales" TO "service_role";



GRANT ALL ON TABLE "public"."lat_v_agentes_disponibles" TO "anon";
GRANT ALL ON TABLE "public"."lat_v_agentes_disponibles" TO "authenticated";
GRANT ALL ON TABLE "public"."lat_v_agentes_disponibles" TO "service_role";



GRANT ALL ON TABLE "public"."lat_v_bandeja_colaborador" TO "anon";
GRANT ALL ON TABLE "public"."lat_v_bandeja_colaborador" TO "authenticated";
GRANT ALL ON TABLE "public"."lat_v_bandeja_colaborador" TO "service_role";



GRANT ALL ON TABLE "public"."lat_v_bandeja_supervisor" TO "anon";
GRANT ALL ON TABLE "public"."lat_v_bandeja_supervisor" TO "authenticated";
GRANT ALL ON TABLE "public"."lat_v_bandeja_supervisor" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline_stages" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_stages" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_stages" TO "service_role";



GRANT ALL ON TABLE "public"."process_areas" TO "anon";
GRANT ALL ON TABLE "public"."process_areas" TO "authenticated";
GRANT ALL ON TABLE "public"."process_areas" TO "service_role";



GRANT ALL ON TABLE "public"."process_sub_areas" TO "anon";
GRANT ALL ON TABLE "public"."process_sub_areas" TO "authenticated";
GRANT ALL ON TABLE "public"."process_sub_areas" TO "service_role";



GRANT ALL ON TABLE "public"."processes" TO "anon";
GRANT ALL ON TABLE "public"."processes" TO "authenticated";
GRANT ALL ON TABLE "public"."processes" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."stage_history" TO "anon";
GRANT ALL ON TABLE "public"."stage_history" TO "authenticated";
GRANT ALL ON TABLE "public"."stage_history" TO "service_role";



GRANT ALL ON TABLE "public"."stage_rules" TO "anon";
GRANT ALL ON TABLE "public"."stage_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."stage_rules" TO "service_role";



GRANT ALL ON TABLE "public"."sub_areas_empresa" TO "anon";
GRANT ALL ON TABLE "public"."sub_areas_empresa" TO "authenticated";
GRANT ALL ON TABLE "public"."sub_areas_empresa" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";

drop policy "Anyone can create activities" on "public"."activities";

drop policy "Anyone can delete activities" on "public"."activities";

drop policy "Anyone can update activities" on "public"."activities";

drop policy "Anyone can view activities" on "public"."activities";

drop policy "Anyone can insert chat_derivaciones" on "public"."chat_derivaciones";

drop policy "Anyone can view chat_derivaciones" on "public"."chat_derivaciones";

drop policy "Anyone can manage cliente_bancos" on "public"."cliente_bancos";

drop policy "Anyone can manage cliente_documentos" on "public"."cliente_documentos";

drop policy "Anyone can manage cliente_familiar" on "public"."cliente_familiar";

drop policy "Anyone can manage cliente_ideas_viaje" on "public"."cliente_ideas_viaje";

drop policy "Anyone can manage cliente_lealtad" on "public"."cliente_lealtad";

drop policy "Anyone can manage cliente_pagos" on "public"."cliente_pagos";

drop policy "Anyone can manage cliente_referidos" on "public"."cliente_referidos";

drop policy "Anyone can manage cliente_viajes" on "public"."cliente_viajes";

drop policy "Anyone can create clientes" on "public"."clientes";

drop policy "Anyone can delete clientes" on "public"."clientes";

drop policy "Anyone can update clientes" on "public"."clientes";

drop policy "Anyone can view clientes" on "public"."clientes";

drop policy "Anyone can insert colaborador_presencia" on "public"."colaborador_presencia";

drop policy "Anyone can update colaborador_presencia" on "public"."colaborador_presencia";

drop policy "Anyone can view colaborador_presencia" on "public"."colaborador_presencia";

drop policy "email_attachments_all" on "public"."email_attachments";

drop policy "email_drafts_all" on "public"."email_drafts";

drop policy "Anyone can insert gce" on "public"."gestion_conversation_events";

drop policy "Anyone can view gce" on "public"."gestion_conversation_events";

drop policy "Anyone can delete granola_meetings" on "public"."granola_meetings";

drop policy "Anyone can insert granola_meetings" on "public"."granola_meetings";

drop policy "Anyone can update granola_meetings" on "public"."granola_meetings";

drop policy "Anyone can view granola_meetings" on "public"."granola_meetings";

drop policy "Anyone can delete granola_tasks" on "public"."granola_tasks";

drop policy "Anyone can insert granola_tasks" on "public"."granola_tasks";

drop policy "Anyone can update granola_tasks" on "public"."granola_tasks";

drop policy "Anyone can view granola_tasks" on "public"."granola_tasks";

drop policy "Anyone can create profiles" on "public"."profiles";

drop policy "Anyone can update profiles" on "public"."profiles";

drop policy "Anyone can view profiles" on "public"."profiles";


  create policy "Anyone can create activities"
  on "public"."activities"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "Anyone can delete activities"
  on "public"."activities"
  as permissive
  for delete
  to anon, authenticated
using (true);



  create policy "Anyone can update activities"
  on "public"."activities"
  as permissive
  for update
  to anon, authenticated
using (true);



  create policy "Anyone can view activities"
  on "public"."activities"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Anyone can insert chat_derivaciones"
  on "public"."chat_derivaciones"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "Anyone can view chat_derivaciones"
  on "public"."chat_derivaciones"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Anyone can manage cliente_bancos"
  on "public"."cliente_bancos"
  as permissive
  for all
  to anon, authenticated
using (true);



  create policy "Anyone can manage cliente_documentos"
  on "public"."cliente_documentos"
  as permissive
  for all
  to anon, authenticated
using (true);



  create policy "Anyone can manage cliente_familiar"
  on "public"."cliente_familiar"
  as permissive
  for all
  to anon, authenticated
using (true);



  create policy "Anyone can manage cliente_ideas_viaje"
  on "public"."cliente_ideas_viaje"
  as permissive
  for all
  to anon, authenticated
using (true);



  create policy "Anyone can manage cliente_lealtad"
  on "public"."cliente_lealtad"
  as permissive
  for all
  to anon, authenticated
using (true);



  create policy "Anyone can manage cliente_pagos"
  on "public"."cliente_pagos"
  as permissive
  for all
  to anon, authenticated
using (true);



  create policy "Anyone can manage cliente_referidos"
  on "public"."cliente_referidos"
  as permissive
  for all
  to anon, authenticated
using (true);



  create policy "Anyone can manage cliente_viajes"
  on "public"."cliente_viajes"
  as permissive
  for all
  to anon, authenticated
using (true);



  create policy "Anyone can create clientes"
  on "public"."clientes"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "Anyone can delete clientes"
  on "public"."clientes"
  as permissive
  for delete
  to anon, authenticated
using (true);



  create policy "Anyone can update clientes"
  on "public"."clientes"
  as permissive
  for update
  to anon, authenticated
using (true);



  create policy "Anyone can view clientes"
  on "public"."clientes"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Anyone can insert colaborador_presencia"
  on "public"."colaborador_presencia"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "Anyone can update colaborador_presencia"
  on "public"."colaborador_presencia"
  as permissive
  for update
  to anon, authenticated
using (true);



  create policy "Anyone can view colaborador_presencia"
  on "public"."colaborador_presencia"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "email_attachments_all"
  on "public"."email_attachments"
  as permissive
  for all
  to anon, authenticated
using (true)
with check (true);



  create policy "email_drafts_all"
  on "public"."email_drafts"
  as permissive
  for all
  to anon, authenticated
using (true)
with check (true);



  create policy "Anyone can insert gce"
  on "public"."gestion_conversation_events"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "Anyone can view gce"
  on "public"."gestion_conversation_events"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Anyone can delete granola_meetings"
  on "public"."granola_meetings"
  as permissive
  for delete
  to anon, authenticated
using (true);



  create policy "Anyone can insert granola_meetings"
  on "public"."granola_meetings"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "Anyone can update granola_meetings"
  on "public"."granola_meetings"
  as permissive
  for update
  to anon, authenticated
using (true);



  create policy "Anyone can view granola_meetings"
  on "public"."granola_meetings"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Anyone can delete granola_tasks"
  on "public"."granola_tasks"
  as permissive
  for delete
  to anon, authenticated
using (true);



  create policy "Anyone can insert granola_tasks"
  on "public"."granola_tasks"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "Anyone can update granola_tasks"
  on "public"."granola_tasks"
  as permissive
  for update
  to anon, authenticated
using (true);



  create policy "Anyone can view granola_tasks"
  on "public"."granola_tasks"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Anyone can create profiles"
  on "public"."profiles"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "Anyone can update profiles"
  on "public"."profiles"
  as permissive
  for update
  to anon, authenticated
using (true);



  create policy "Anyone can view profiles"
  on "public"."profiles"
  as permissive
  for select
  to anon, authenticated
using (true);


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "Anyone can delete gestiones files"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated, anon
using ((bucket_id = 'gestiones-files'::text));



  create policy "Anyone can update lat-adjuntos"
  on "storage"."objects"
  as permissive
  for update
  to public
using ((bucket_id = 'lat-adjuntos'::text));



  create policy "Anyone can upload gestiones files"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated, anon
with check ((bucket_id = 'gestiones-files'::text));



  create policy "Anyone can upload lat-adjuntos"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'lat-adjuntos'::text));



  create policy "Anyone can view gestiones files"
  on "storage"."objects"
  as permissive
  for select
  to authenticated, anon
using ((bucket_id = 'gestiones-files'::text));



  create policy "Public read lat-adjuntos by path"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'lat-adjuntos'::text) AND (name IS NOT NULL) AND (name <> ''::text)));




// Edge Function: crm-create-gestion
// API pública para que otros sistemas del ecosistema estropical (Legal, HR, Finance, Hub360)
// puedan crear gestiones en el CRM sin acceso directo al schema crm.
//
// Solo escribe en: public.gestiones
// Requiere header: x-api-key con el valor de CRM_INTERNAL_API_KEY (env var en Supabase)
//
// Body esperado (ICreateGestionRequest):
//   title, type, priority, source_app, cliente_id?, proceso_id?, etapa_id?,
//   area_id?, responsable_id?, description?, fecha_compromiso?, metadata?

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRM_API_KEY       = Deno.env.get("CRM_INTERNAL_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type GestionType     = "comercial" | "proyecto" | "operativa" | "caso";
type GestionPriority = "low" | "medium" | "high" | "urgent";

interface ICreateGestionRequest {
  title:           string;
  type:            GestionType;
  priority:        GestionPriority;
  source_app:      string;   // ej: "legal" | "hr" | "finance" | "hub360"
  description?:    string;
  cliente_id?:     string;
  proceso_id?:     string;
  etapa_id?:       string;
  area_id?:        string;
  responsable_id?: string;
  fecha_compromiso?: string; // ISO 8601
  metadata?:       Record<string, unknown>;
}

const VALID_TYPES:     GestionType[]     = ["comercial", "proyecto", "operativa", "caso"];
const VALID_PRIORITIES: GestionPriority[] = ["low", "medium", "high", "urgent"];
const ALLOWED_SOURCES = ["legal", "hr", "finance", "hub360", "rrhh", "finanzas", "proyectos", "operaciones"];

function validate(body: Partial<ICreateGestionRequest>): string | null {
  if (!body.title?.trim())         return "title es requerido";
  if (!VALID_TYPES.includes(body.type as GestionType))
    return `type debe ser uno de: ${VALID_TYPES.join(", ")}`;
  if (!VALID_PRIORITIES.includes(body.priority as GestionPriority))
    return `priority debe ser uno de: ${VALID_PRIORITIES.join(", ")}`;
  if (!body.source_app?.trim())    return "source_app es requerido";
  if (!ALLOWED_SOURCES.includes(body.source_app.toLowerCase()))
    return `source_app no reconocido. Valores válidos: ${ALLOWED_SOURCES.join(", ")}`;
  if (body.fecha_compromiso && isNaN(Date.parse(body.fecha_compromiso)))
    return "fecha_compromiso debe ser fecha ISO 8601 válida";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Autenticación por API key interna
  const apiKey = req.headers.get("x-api-key");
  if (!CRM_API_KEY) {
    return new Response(JSON.stringify({ error: "CRM_INTERNAL_API_KEY no configurada en el servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!apiKey || apiKey !== CRM_API_KEY) {
    return new Response(JSON.stringify({ error: "No autorizado — x-api-key inválida o ausente" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as Partial<ICreateGestionRequest>;

    const validationError = validate(body);
    if (validationError) {
      return new Response(JSON.stringify({ error: validationError }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Determinar etapa inicial: si no se pasa, usar la primera etapa del proceso
    let etapa_id = body.etapa_id ?? null;
    if (!etapa_id && body.proceso_id) {
      const { data: firstStage } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("process_id", body.proceso_id)
        .order("order", { ascending: true })
        .limit(1)
        .maybeSingle();
      etapa_id = firstStage?.id ?? null;
    }

    const { data, error } = await supabase
      .from("gestiones")
      .insert({
        title:            body.title!.trim(),
        type:             body.type,
        priority:         body.priority,
        description:      body.description?.trim() ?? null,
        cliente_id:       body.cliente_id ?? null,
        proceso_id:       body.proceso_id ?? null,
        stage_id:         etapa_id,
        area_id:          body.area_id ?? null,
        responsable_id:   body.responsable_id ?? null,
        fecha_compromiso: body.fecha_compromiso ?? null,
        source_app:       body.source_app.toLowerCase(),
        status:           "to_do",
        metadata:         body.metadata ?? {},
      })
      .select("id, title, status, created_at")
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({ ok: true, gestion: data }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

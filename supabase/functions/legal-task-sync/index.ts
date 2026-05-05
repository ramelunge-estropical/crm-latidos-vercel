/**
 * legal-task-sync — Sincronización de tareas entre CRM Latidos y Hub Legal
 *
 * POST /legal-task-sync          → Recibe tareas desde Hub Legal (Legal → CRM)
 * POST /legal-task-sync?push=1   → Envía una tarea de CRM a Hub Legal (CRM → Legal)
 *
 * Secrets requeridos:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   LEGAL_API_KEY    → api_key del sistema Legal en integraciones.sistemas
 *
 * Si integraciones.sistemas.process_id_default está configurado para "legal",
 * los tasks entrantes crean una gestión (tarjeta kanban). Si no, crean una activity.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LEGAL_API_KEY = Deno.env.get("LEGAL_API_KEY") ?? "14ab9667-eb65-403e-a568-37db76dfbc7b";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const isPush = url.searchParams.get("push") === "1";

  try {
    const body = await req.json();

    // ── CRM → Legal (push) ──────────────────────────────────────────────────
    if (isPush) {
      const { activity_id, titulo, descripcion, estado, prioridad, fecha_vencimiento, colaborador_id } = body;

      if (!activity_id || !titulo) {
        return jsonResponse({ error: "activity_id y titulo son requeridos" }, 400);
      }

      // Verificar que no esté ya sincronizada
      const { data: existing } = await supabase
        .schema("integraciones")
        .from("tareas_sincronizadas")
        .select("id")
        .eq("origen", "crm")
        .eq("origen_id", activity_id)
        .eq("destino", "legal")
        .single();

      if (existing) {
        return jsonResponse({ message: "Tarea ya sincronizada", id: existing.id });
      }

      // Obtener webhook URL de Hub Legal
      const { data: sistema } = await supabase
        .schema("integraciones")
        .from("sistemas")
        .select("webhook_url, api_key")
        .eq("nombre", "legal")
        .single();

      let destino_id: string | null = null;
      let error_msg: string | null = null;

      if (sistema?.webhook_url) {
        try {
          const resp = await fetch(sistema.webhook_url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": sistema.api_key ?? "",
            },
            body: JSON.stringify({ titulo, descripcion, estado, prioridad, fecha_vencimiento, origen: "crm", origen_id: activity_id }),
          });
          const result = await resp.json();
          destino_id = result?.id ?? null;
        } catch (e) {
          error_msg = String(e);
        }
      } else {
        error_msg = "Hub Legal webhook_url no configurado";
      }

      // Registrar sincronización
      const { data: sync } = await supabase
        .schema("integraciones")
        .from("tareas_sincronizadas")
        .insert({
          origen: "crm",
          origen_id: activity_id,
          destino: "legal",
          destino_id,
          titulo,
          descripcion,
          estado,
          prioridad,
          fecha_vencimiento,
          colaborador_id,
          error: error_msg,
        })
        .select()
        .single();

      return jsonResponse({ success: !error_msg, sync, warning: error_msg });
    }

    // ── Legal → CRM (webhook inbound) ───────────────────────────────────────
    const apiKey = req.headers.get("x-api-key");
    if (apiKey !== LEGAL_API_KEY) {
      return jsonResponse({ error: "API key inválida" }, 401);
    }

    const { titulo, descripcion, estado, prioridad, fecha_vencimiento, origen_id, colaborador_email } = body;

    if (!titulo || !origen_id) {
      return jsonResponse({ error: "titulo y origen_id son requeridos" }, 400);
    }

    // Buscar colaborador por email si se provee
    let colaborador_id: string | null = null;
    if (colaborador_email) {
      const { data: colab } = await supabase
        .from("colaboradores")
        .select("id")
        .ilike("email", colaborador_email)
        .single();
      colaborador_id = colab?.id ?? null;
    }

    // Verificar duplicado
    const { data: existing } = await supabase
      .schema("integraciones")
      .from("tareas_sincronizadas")
      .select("id, destino_id")
      .eq("origen", "legal")
      .eq("origen_id", origen_id)
      .single();

    if (existing) {
      return jsonResponse({ message: "Ya procesada", crm_id: existing.destino_id });
    }

    // Leer config del sistema legal (si tiene process_id_default → crear gestión)
    const { data: sistemaLegal } = await supabase
      .schema("integraciones")
      .from("sistemas")
      .select("process_id_default, stage_id_default")
      .eq("nombre", "legal")
      .single();

    let crm_id: string | null = null;

    if (sistemaLegal?.process_id_default && sistemaLegal?.stage_id_default) {
      // ── Crear gestión (tarjeta kanban) ──────────────────────────────────
      const { data: gestion } = await supabase
        .from("gestiones")
        .insert({
          title: titulo,
          description: descripcion ?? null,
          process_id: sistemaLegal.process_id_default,
          stage_id: sistemaLegal.stage_id_default,
          due_date: fecha_vencimiento ?? null,
          responsable_id: colaborador_id,
          type: "operativa",
          canal_origen: "legal",
        })
        .select("id")
        .single();
      crm_id = gestion?.id ?? null;
    } else {
      // ── Crear activity (tarea en agenda) ────────────────────────────────
      const { data: activity } = await supabase
        .from("activities")
        .insert({
          title: titulo,
          description: descripcion ?? null,
          activity_type: "tarea",
          completed: estado === "completado" || estado === "done" ? true : false,
          scheduled_at: fecha_vencimiento ? new Date(fecha_vencimiento).toISOString() : null,
          assigned_to_id: colaborador_id,
          created_by: colaborador_id,
        })
        .select("id")
        .single();
      crm_id = activity?.id ?? null;
    }

    // Registrar sincronización
    await supabase
      .schema("integraciones")
      .from("tareas_sincronizadas")
      .insert({
        origen: "legal",
        origen_id,
        destino: "crm",
        destino_id: crm_id,
        titulo,
        descripcion,
        estado,
        prioridad,
        fecha_vencimiento,
        colaborador_id,
      });

    return jsonResponse({ success: true, crm_id });

  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});

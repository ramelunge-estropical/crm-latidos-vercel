/**
 * crm-ai-assistant — Asistente IA contextual del CRM
 * Entiende gestiones, clientes y actividades según el rol del colaborador.
 *
 * Secrets requeridos:
 *   OPENAI_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_KEY  = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MODEL        = "gpt-4o-mini";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Message { role: "user" | "assistant"; content: string; }

async function fetchContext(colaboradorId: string, rol: string): Promise<string> {
  const isAdmin    = ["admin", "gerente"].includes(rol);
  const isSupervisor = rol === "supervisor";

  // Colaboradores del equipo (para supervisor/admin)
  let teamIds: string[] = [colaboradorId];
  if (isSupervisor) {
    const { data: team } = await supabase
      .from("colaboradores")
      .select("id")
      .eq("supervisor_id", colaboradorId)
      .eq("activo", true);
    if (team) teamIds = [colaboradorId, ...team.map((c: any) => c.id)];
  }

  // Gestiones
  let gestionesQuery = supabase
    .from("gestiones")
    .select("id, titulo, estado, etapa, prioridad, created_at, cliente:clientes(nombre)")
    .order("created_at", { ascending: false })
    .limit(isAdmin ? 50 : 20);

  if (!isAdmin) {
    gestionesQuery = gestionesQuery.in("assigned_to_id", teamIds);
  }

  const { data: gestiones } = await gestionesQuery;

  // Clientes
  let clientesQuery = supabase
    .from("clientes")
    .select("id, nombre, email, telefono, canal_contacto")
    .eq("activo", true)
    .limit(isAdmin ? 50 : 20);

  if (!isAdmin) {
    clientesQuery = clientesQuery.in("asesor_id", teamIds);
  }

  const { data: clientes } = await clientesQuery;

  // Actividades recientes
  let actividadesQuery = supabase
    .from("activities")
    .select("id, titulo, tipo, estado, due_date, assigned_to_id")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!isAdmin) {
    actividadesQuery = actividadesQuery.in("assigned_to_id", teamIds);
  }

  const { data: actividades } = await actividadesQuery;

  const lines: string[] = ["=== CONTEXTO CRM ESTROPICAL ===\n"];

  if (gestiones?.length) {
    lines.push(`GESTIONES (${gestiones.length}):`);
    gestiones.forEach((g: any) => {
      lines.push(`- [${g.id.slice(0, 8)}] "${g.titulo}" | Estado: ${g.estado} | Etapa: ${g.etapa} | Prioridad: ${g.prioridad} | Cliente: ${g.cliente?.nombre ?? "—"}`);
    });
    lines.push("");
  }

  if (clientes?.length) {
    lines.push(`CLIENTES (${clientes.length}):`);
    clientes.forEach((c: any) => {
      lines.push(`- ${c.nombre} | ${c.email ?? "—"} | ${c.telefono ?? "—"} | Canal: ${c.canal_contacto ?? "—"}`);
    });
    lines.push("");
  }

  if (actividades?.length) {
    lines.push(`ACTIVIDADES RECIENTES (${actividades.length}):`);
    actividades.forEach((a: any) => {
      lines.push(`- "${a.titulo}" | Tipo: ${a.tipo} | Estado: ${a.estado} | Vence: ${a.due_date ?? "—"}`);
    });
  }

  return lines.join("\n");
}

function buildSystemPrompt(colaborador: any, context: string): string {
  const rolLabel: Record<string, string> = {
    admin: "Administrador (acceso total)",
    gerente: "Gerente (acceso total)",
    supervisor: "Supervisor (acceso a su equipo)",
    asesor: "Asesor (acceso a sus gestiones y clientes)",
  };

  return `Sos el asistente IA del CRM Latidos de Estropical, una agencia de viajes boliviana.
Tu función es ayudar a ${colaborador.nombre} (${rolLabel[colaborador.rol] ?? colaborador.rol}) a entender y gestionar su trabajo en el CRM.

Respondé siempre en español, de forma concisa y útil.
Solo usá la información del contexto proporcionado — no inventes datos.
Si te preguntan algo fuera de tu contexto, indicalo claramente.

${context}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { message, history = [], colaborador_id } = await req.json() as {
      message: string;
      history: Message[];
      colaborador_id: string;
    };

    if (!message || !colaborador_id) {
      return new Response(JSON.stringify({ error: "message y colaborador_id son requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch colaborador
    const { data: colaborador } = await supabase
      .from("colaboradores")
      .select("id, nombre, rol, email")
      .eq("id", colaborador_id)
      .single();

    if (!colaborador) {
      return new Response(JSON.stringify({ error: "Colaborador no encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const context = await fetchContext(colaborador_id, colaborador.rol);
    const systemPrompt = buildSystemPrompt(colaborador, context);

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10),
      { role: "user", content: message },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.4, max_tokens: 800 }),
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content ?? "No pude generar una respuesta.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

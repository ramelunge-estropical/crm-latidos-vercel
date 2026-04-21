/**
 * gupshup-templates — Lista plantillas de WhatsApp aprobadas en Gupshup.
 * GET /sm/api/v1/template/list/{appName}
 *
 * Secrets requeridos:
 *   GUPSHUP_API_KEY
 *   GUPSHUP_APP_NAME
 *   GUPSHUP_APP_ID  (opcional; si no se provee, se usa appName)
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const apiKey  = Deno.env.get("GUPSHUP_API_KEY")  ?? "";
    const appName = Deno.env.get("GUPSHUP_APP_NAME") ?? "";
    const appId   = Deno.env.get("GUPSHUP_APP_ID")   ?? "";

    if (!apiKey || !appName) {
      return new Response(
        JSON.stringify({ error: "Faltan GUPSHUP_API_KEY o GUPSHUP_APP_NAME" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Endpoint Gupshup: GET /sm/api/v2/template/list/{appId}
    // Fallback a v1 con appName si no hay appId
    const url = appId
      ? `https://api.gupshup.io/sm/api/v2/template/list/${appId}`
      : `https://api.gupshup.io/sm/api/v1/template/list/${appName}`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { "apikey": apiKey, "Accept": "application/json" },
        signal: ctrl.signal,
      });
    } catch (e: any) {
      clearTimeout(t);
      const msg = e?.name === "AbortError"
        ? "Timeout: Gupshup no respondió"
        : `Error de red: ${e?.message}`;
      return new Response(JSON.stringify({ error: msg }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    clearTimeout(t);

    const text = await res.text();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Gupshup ${res.status}`, detail: text }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    let data: any = {};
    try { data = JSON.parse(text); } catch { /* */ }

    // Gupshup devuelve { status, templates: [...] }
    const raw = (data?.templates ?? data?.data ?? []) as any[];

    // Normalizamos solo lo necesario para la UI
    const templates = raw
      .filter((t: any) => {
        const st = (t.status ?? "").toUpperCase();
        return st === "APPROVED" || st === "ENABLED";
      })
      .map((t: any) => {
        const body: string = t.data ?? t.containerMeta?.body ?? t.body ?? "";
        const variables = extractVariables(body);
        return {
          id:        t.id ?? t.elementName,
          name:      t.elementName ?? t.name ?? "—",
          category:  t.category ?? null,
          language:  t.languageCode ?? t.language ?? "es",
          status:    t.status ?? "APPROVED",
          body,
          variables,
          example:   t.example ?? null,
          buttons:   t.buttons ?? null,
        };
      });

    return new Response(JSON.stringify({ templates }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("gupshup-templates error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

// Extrae variables {{1}} {{2}} del body
function extractVariables(body: string): string[] {
  if (!body) return [];
  const re = /\{\{(\d+)\}\}/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) found.add(m[1]);
  return Array.from(found).sort((a, b) => Number(a) - Number(b));
}

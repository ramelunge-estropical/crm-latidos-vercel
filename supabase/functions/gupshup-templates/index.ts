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

    // Probamos varios endpoints de Gupshup en orden hasta encontrar uno que responda 2xx.
    // Diferentes cuentas/partners exponen distintas rutas (v1 con appName, v3 con appId, etc.)
    const candidates: string[] = [];
    if (appId)   candidates.push(`https://api.gupshup.io/wa/app/${appId}/template`);
    if (appId)   candidates.push(`https://api.gupshup.io/sm/api/v2/template/list/${appId}`);
    if (appName) candidates.push(`https://api.gupshup.io/sm/api/v1/template/list/${appName}`);
    if (appName) candidates.push(`https://api.gupshup.io/wa/api/v1/template/list/${appName}`);

    let res: Response | null = null;
    let text = "";
    let lastErr = "";
    let usedUrl = "";

    for (const url of candidates) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const r = await fetch(url, {
          method: "GET",
          headers: { "apikey": apiKey, "Accept": "application/json" },
          signal: ctrl.signal,
        });
        clearTimeout(t);
        const body = await r.text();
        if (r.ok) {
          res = r; text = body; usedUrl = url;
          break;
        }
        lastErr = `Gupshup ${r.status} en ${url}: ${body.slice(0, 200)}`;
      } catch (e: any) {
        clearTimeout(t);
        lastErr = e?.name === "AbortError"
          ? `Timeout en ${url}`
          : `Error de red en ${url}: ${e?.message}`;
      }
    }

    if (!res) {
      return new Response(JSON.stringify({ error: "No se pudo obtener plantillas de Gupshup", detail: lastErr }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    console.log("gupshup-templates OK via", usedUrl);

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

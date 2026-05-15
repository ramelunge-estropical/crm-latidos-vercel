/**
 * lat-gmail-oauth-url — Devuelve la URL de autorización OAuth de Gmail
 * con todos los scopes necesarios (lectura + envío).
 * El frontend la usa para el botón "Reconectar Gmail".
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GMAIL_CLIENT_ID  = Deno.env.get("GMAIL_CLIENT_ID")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const REDIRECT_URI     = `${SUPABASE_URL}/functions/v1/google-auth-callback`;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id",     GMAIL_CLIENT_ID);
  url.searchParams.set("redirect_uri",  REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope",         SCOPES);
  url.searchParams.set("access_type",   "offline");
  url.searchParams.set("prompt",        "consent");   // fuerza nuevo refresh_token
  url.searchParams.set("state",         "gmail-system");

  return new Response(
    JSON.stringify({ url: url.toString() }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});

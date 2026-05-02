import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID     = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const GMAIL_CLIENT_ID      = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET  = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REDIRECT_URI         = `${SUPABASE_URL}/functions/v1/google-auth-callback`;

// Frontend URL — redirect after auth
const APP_URL = Deno.env.get("APP_URL") || "https://crm-latidos-vercel.vercel.app";

serve(async (req) => {
  const url = new URL(req.url);
  const code          = url.searchParams.get("code");
  const state         = url.searchParams.get("state");
  const error         = url.searchParams.get("error");

  if (error) {
    return Response.redirect(`${APP_URL}/?google=error&msg=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return Response.redirect(`${APP_URL}/?google=error&msg=missing_params`);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();

    // Get Google user email
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleUser = await userRes.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const expiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

    // state = "gmail-system" → token for the email inbox account stored in lat_bot_config
    if (state === "gmail-system") {
      // Use Gmail-specific credentials for token exchange
      const gmailTokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id:     GMAIL_CLIENT_ID,
          client_secret: GMAIL_CLIENT_SECRET,
          redirect_uri:  REDIRECT_URI,
          grant_type:    "authorization_code",
        }),
      });
      const gmailTokens = await gmailTokenRes.json();
      const gmailExpiry = new Date(Date.now() + (gmailTokens.expires_in || 3600) * 1000).toISOString();
      const patch: any = {
        gmail_access_token:  gmailTokens.access_token,
        gmail_token_expiry:  gmailExpiry,
        gmail_email:         googleUser.email || "",
        updated_at:          new Date().toISOString(),
      };
      if (gmailTokens.refresh_token) patch.gmail_refresh_token = gmailTokens.refresh_token;
      await supabase.from("lat_bot_config").update(patch).eq("canal", "email");
      return Response.redirect(`${APP_URL}/?gmail=connected`);
    }

    // Normal flow: Calendar token for a colaborador
    const upsertData: any = {
      colaborador_id: state,
      google_email:   googleUser.email || "",
      access_token:   tokens.access_token,
      token_expiry:   expiry,
      updated_at:     new Date().toISOString(),
    };
    if (tokens.refresh_token) upsertData.refresh_token = tokens.refresh_token;
    await supabase.from("colaborador_google_tokens").upsert(upsertData, { onConflict: "colaborador_id" });

    return Response.redirect(`${APP_URL}/?google=connected`);
  } catch (err) {
    return Response.redirect(`${APP_URL}/?google=error&msg=${encodeURIComponent(String(err))}`);
  }
});

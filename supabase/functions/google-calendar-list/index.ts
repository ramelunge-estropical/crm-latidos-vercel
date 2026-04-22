import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID     = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { colaboradorId, startDate, endDate } = await req.json();
    if (!colaboradorId || !startDate || !endDate) {
      return new Response(JSON.stringify({ events: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: tokenRow } = await supabase
      .from("colaborador_google_tokens")
      .select("access_token, refresh_token, token_expiry")
      .eq("colaborador_id", colaboradorId)
      .single();

    if (!tokenRow) {
      return new Response(JSON.stringify({ events: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Refresh token if expired
    let accessToken = tokenRow.access_token;
    if (new Date() >= new Date(tokenRow.token_expiry)) {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id:     GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: tokenRow.refresh_token,
          grant_type:    "refresh_token",
        }),
      });
      const data = await res.json();
      accessToken = data.access_token;
      await supabase.from("colaborador_google_tokens").update({
        access_token: accessToken,
        token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
      }).eq("colaborador_id", colaboradorId);
    }

    const params = new URLSearchParams({
      timeMin:      new Date(startDate).toISOString(),
      timeMax:      new Date(endDate).toISOString(),
      singleEvents: "true",
      orderBy:      "startTime",
      maxResults:   "250",
    });

    const gcalRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const gcalData = await gcalRes.json();

    const events = (gcalData.items || []).map((e: any) => ({
      id:          e.id,
      title:       e.summary || "(Sin título)",
      start:       e.start?.dateTime || e.start?.date,
      end:         e.end?.dateTime   || e.end?.date,
      allDay:      !e.start?.dateTime,
      meetLink:    e.hangoutLink || e.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === "video")?.uri || null,
      location:    e.location || null,
      description: e.description || null,
      source:      "google",
    }));

    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ events: [], error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

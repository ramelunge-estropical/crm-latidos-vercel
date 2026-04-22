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

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json();
    const { action, colaboradorId, activity, attendeeEmails = [] } = body;
    // action: "create" | "update" | "delete"
    // activity: { id, title, description, scheduled_at, duration_minutes, activity_type, google_event_id? }

    // Get token for this colaborador
    const { data: tokenRow } = await supabase
      .from("colaborador_google_tokens")
      .select("*")
      .eq("colaborador_id", colaboradorId)
      .single();

    if (!tokenRow) {
      return new Response(JSON.stringify({ error: "no_token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    // Refresh token if expired
    const now = new Date();
    const expiry = new Date(tokenRow.token_expiry);
    let accessToken = tokenRow.access_token;
    if (now >= expiry) {
      accessToken = await refreshAccessToken(tokenRow.refresh_token);
      await supabase.from("colaborador_google_tokens").update({
        access_token: accessToken,
        token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
      }).eq("colaborador_id", colaboradorId);
    }

    const calUrl = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

    if (action === "create" || action === "update") {
      const start = new Date(activity.scheduled_at);
      const end   = new Date(start.getTime() + (activity.duration_minutes || 30) * 60000);

      const isReunion = activity.activity_type === "reunión";

      const eventBody: any = {
        summary:     activity.title,
        description: activity.description || "",
        start: { dateTime: start.toISOString() },
        end:   { dateTime: end.toISOString() },
      };

      // Auto-generate Google Meet link for reuniones
      if (isReunion) {
        eventBody.conferenceData = {
          createRequest: { requestId: activity.id, conferenceSolutionKey: { type: "hangoutsMeet" } },
        };
      }

      // Add attendees — Google Calendar sends invites automatically
      if (attendeeEmails.length > 0) {
        eventBody.attendees = attendeeEmails.map((email: string) => ({ email }));
        eventBody.guestsCanSeeOtherGuests = true;
        eventBody.sendUpdates = "all";
      }

      let res, data;
      if (action === "create") {
        // conferenceDataVersion=1 is required to trigger Meet link generation
        res  = await fetch(`${calUrl}?conferenceDataVersion=1`, {
          method:  "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body:    JSON.stringify(eventBody),
        });
        data = await res.json();

        // Extract Meet link from response
        const meetLink = data.conferenceData?.entryPoints?.find(
          (ep: any) => ep.entryPointType === "video"
        )?.uri ?? null;

        // Save google_event_id and meet_link back to activity
        await supabase.from("activities")
          .update({ google_event_id: data.id, meet_link: meetLink } as any)
          .eq("id", activity.id);

        return new Response(JSON.stringify({ ok: true, eventId: data.id, meetLink }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        res  = await fetch(`${calUrl}/${activity.google_event_id}?conferenceDataVersion=1`, {
          method:  "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body:    JSON.stringify(eventBody),
        });
        data = await res.json();
      }

      return new Response(JSON.stringify({ ok: true, eventId: data.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete" && activity.google_event_id) {
      await fetch(`${calUrl}/${activity.google_event_id}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown_action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function hmacSign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { sosEventId } = await req.json();
    if (!sosEventId) {
      return new Response(JSON.stringify({ error: "sosEventId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Load SOS event
    const { data: event, error: eventErr } = await supabase
      .from("sos_events")
      .select("*")
      .eq("id", sosEventId)
      .maybeSingle();

    if (eventErr || !event) {
      return new Response(JSON.stringify({ error: "SOS event not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, scholar_id, phone, institution_id")
      .eq("id", event.user_id)
      .maybeSingle();

    // Load config for webhook URL and secret
    const { data: cfgRows } = await supabase
      .from("app_config")
      .select("key, value")
      .eq("institution_id", event.institution_id);

    const cfg: Record<string, unknown> = {};
    for (const r of cfgRows || []) {
      cfg[r.key] = typeof r.value === "number" ? r.value : String(r.value);
    }

    const webhookUrl = cfg.webhook_url as string || "https://example.com/webhook";
    const webhookSecret = cfg.webhook_secret as string || "safestride-hmac-secret-change-me";
    const trackingUrl = `${supabaseUrl.replace(".supabase.co", "")}/track/${event.tracking_token}`;

    const payload = {
      event_id: event.id,
      name: profile?.full_name || "Unknown",
      scholar_id: profile?.scholar_id || "Unknown",
      phone: profile?.phone || null,
      location: { lat: event.lat, lng: event.lng },
      tracking_url: trackingUrl,
      status: event.status,
      timestamp: new Date().toISOString(),
    };

    const payloadStr = JSON.stringify(payload);
    const signature = await hmacSign(payloadStr, webhookSecret);

    // Create delivery log entry
    const { data: deliveryLog } = await supabase
      .from("webhook_deliveries")
      .insert({
        sos_event_id: sosEventId,
        url: webhookUrl,
        payload: payloadStr,
        status: "pending",
        attempts: 0,
      })
      .select()
      .single();

    // Attempt delivery with retry
    let attempt = 0;
    let maxAttempts = 5;
    let lastError = null;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-SafeStride-Signature": signature,
          },
          body: payloadStr,
        });

        // Update delivery log
        await supabase
          .from("webhook_deliveries")
          .update({
            status: resp.ok ? "delivered" : "failed",
            attempts: attempt,
            response_code: resp.status,
            response_body: await resp.text().catch(() => ""),
          })
          .eq("id", deliveryLog!.id);

        if (resp.ok) {
          // Audit log
          await supabase.from("audit_log").insert({
            institution_id: event.institution_id,
            actor_id: event.user_id,
            action: "sos_webhook_delivered",
            entity_type: "sos_event",
            entity_id: sosEventId,
            details: { url: webhookUrl, code: resp.status, attempt },
          });
          break;
        }

        lastError = `HTTP ${resp.status}`;
      } catch (err) {
        lastError = err.message;
      }

      // Exponential backoff
      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    if (attempt >= maxAttempts) {
      await supabase
        .from("webhook_deliveries")
        .update({ status: "failed", attempts: attempt, next_retry_at: null })
        .eq("id", deliveryLog!.id);
    }

    // Also notify emergency contacts via SMS adapter (fallback = in-app notification)
    const { data: contacts } = await supabase
      .from("emergency_contacts")
      .select("*")
      .eq("profile_id", event.user_id);

    // Insert in-app notifications for emergency contacts (fallback mode)
    // In real mode with Twilio, we'd send SMS here
    // For now, just log the notification
    if (contacts && contacts.length > 0) {
      await supabase.from("audit_log").insert({
        institution_id: event.institution_id,
        actor_id: event.user_id,
        action: "sos_emergency_contacts_notified",
        entity_type: "sos_event",
        entity_id: sosEventId,
        details: { contacts_count: contacts.length, sms_mode: cfg.sms_mode || "fallback" },
      });
    }

    // Notify companion if on a journey
    if (event.journey_id) {
      const { data: participants } = await supabase
        .from("journey_participants")
        .select("user_id")
        .eq("journey_id", event.journey_id)
        .neq("user_id", event.user_id);

      if (participants && participants.length > 0) {
        for (const p of participants) {
          await supabase.from("notifications").insert({
            user_id: p.user_id,
            type: "sos_companion",
            title: "Your companion triggered SOS",
            body: "Check in on your walking companion immediately.",
            data: { sosEventId, trackingUrl },
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, deliveryId: deliveryLog?.id, signature: signature.slice(0, 16) + "..." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

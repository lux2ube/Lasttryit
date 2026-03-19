import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Security: validate shared secret in URL — no headers needed
  const secret = url.searchParams.get("secret")?.trim();
  const expectedSecret = Deno.env.get("SMS_WEBHOOK_SECRET");
  if (!expectedSecret || secret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const slug = url.searchParams.get("slug")?.trim();
  // Accept multiple param names — Forward SMS uses {body} or {text} in URL templates
  const raw_message = (
    url.searchParams.get("message") ??
    url.searchParams.get("text") ??
    url.searchParams.get("body") ?? ""
  ).trim();
  const sender = (
    url.searchParams.get("sender") ??
    url.searchParams.get("phone") ??
    url.searchParams.get("from") ?? ""
  ).trim();

  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing ?slug= parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!raw_message) {
    return new Response(JSON.stringify({ error: "Missing ?message= parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: config } = await supabase
    .from("sms_webhook_configs")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!config) {
    return new Response(
      JSON.stringify({ error: `Unknown or inactive slug: ${slug}` }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const { error: insertError } = await supabase
    .from("sms_raw_inbox")
    .insert({ slug, raw_message, sender });

  if (insertError) {
    console.error("Insert error:", insertError);
    return new Response(JSON.stringify({ error: "Failed to store message" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`SMS stored — slug: ${slug}, sender: ${sender}`);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug")?.trim();

    if (!slug) {
      return new Response(JSON.stringify({ error: "Missing ?slug= parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let body: Record<string, string> = {};
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const raw_message = (
      body.raw_message ?? body.message ?? body.text ?? body.body ?? ""
    ).trim();
    const sender = (body.sender ?? body.phone ?? body.from ?? "").trim();

    if (!raw_message) {
      return new Response(JSON.stringify({ error: "Missing message content" }), {
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
    return new Response(JSON.stringify({ ok: true, slug }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

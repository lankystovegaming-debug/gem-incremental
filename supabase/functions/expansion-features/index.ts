import { withSupabase } from "npm:@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

function userId(ctx: any) {
  return ctx?.userClaims?.id ?? ctx?.userClaims?.sub ?? null;
}

const SECTION_TO_TYPE: Record<string,string> = {
  "artifact-archives": "artifact-archives",
  "gem-fusion": "gem-fusion",
  "enchanting-lab": "enchanting-lab",
  "collection-hall": "collection-hall",
  "mining-events": "mining-events",
  "merchant-caravan": "merchant-caravan",
  "research-tree": "research-tree"
};

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    try {
      if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

      const uid = userId(ctx);
      if (!uid) return json({ error: "unauthenticated" }, 401);

      let body: any = {};
      try { body = await req.json(); } catch {}

      const action = String(body.action ?? "list");
      if (action !== "list" && action !== "health") return json({ error: "read_only_feature_endpoint" }, 405);

      const { data: sections, error: sectionError } = await ctx.supabaseAdmin
        .from("game_section_settings")
        .select("id,label,short_label,icon,description,enabled,sort_order")
        .in("id", Object.keys(SECTION_TO_TYPE))
        .order("sort_order");

      if (sectionError) return json({ error: "section_load_failed", message: sectionError.message }, 500);

      const sectionRows: any[] = Array.isArray(sections) ? (sections as any[]) : [];
      const sectionMap = new Map(sectionRows.map((s: any) => [s.id, s]));
      const enabledTypes = Object.entries(SECTION_TO_TYPE)
        .filter(([sectionId]) => sectionMap.get(sectionId)?.enabled === true)
        .map(([, type]) => type);

      const { data: definitions, error } = await ctx.supabaseAdmin
        .from("expansion_feature_definitions")
        .select("*")
        .in("feature_type", enabledTypes.length ? enabledTypes : ["__none__"])
        .eq("enabled", true)
        .order("feature_type")
        .order("sort_order")
        .order("name");

      if (error) return json({ error: "definition_load_failed", message: error.message }, 500);

      const result = sectionRows.map((section: any) => ({
        ...section,
        featureType: SECTION_TO_TYPE[section.id],
        definitions: (definitions ?? []).filter((d: any) => d.feature_type === SECTION_TO_TYPE[section.id])
      }));

      if (action === "health") {
        return json({
          ok: true,
          userId: uid,
          sections: result.map((x: any) => ({ id: x.id, enabled: x.enabled, definitions: x.definitions.length }))
        });
      }

      return json({ sections: result, definitions: definitions ?? [] });
    } catch (error) {
      console.error("EXPANSION_FEATURES_ERROR", error);
      return json({
        error: "expansion_unhandled_error",
        message: error instanceof Error ? error.message : String(error)
      }, 500);
    }
  })
};

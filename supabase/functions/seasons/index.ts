import { withSupabase } from "npm:@supabase/server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", ...cors }
});

const uid = (ctx: any) =>
  ctx?.userClaims?.id ?? ctx?.userClaims?.sub ?? ctx?.jwtClaims?.sub ?? null;

async function sectionEnabled(ctx: any, id: string) {
  const { data, error } = await ctx.supabaseAdmin
    .from("game_section_settings").select("enabled").eq("id", id).maybeSingle();
  if (error) throw error;
  return data?.enabled === true;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    try {
      if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
      const playerId = uid(ctx);
      if (!playerId) return json({ error: "unauthenticated" }, 401);
      if (!(await sectionEnabled(ctx, "seasons"))) return json({ error: "feature_disabled" }, 403);
      let body: any = {}; try { body = await req.json(); } catch {}
      const action = body.action ?? "list";

      if (action === "list") {
        const { data: seasons, error } = await ctx.supabaseAdmin
          .from("season_definitions").select("*").eq("enabled", true).order("starts_at", { ascending: false });
        if (error) throw error;
        const ids = (seasons ?? []).map((s: any) => s.id);
        const { data: progress, error: pe } = ids.length
          ? await ctx.supabaseAdmin.from("player_seasons").select("*").eq("player_id", playerId).in("season_id", ids)
          : { data: [], error: null };
        if (pe) throw pe;
        return json({ seasons: seasons ?? [], progress: progress ?? [] });
      }

      if (action === "claim-tier") {
        const seasonId = String(body.seasonId ?? "");
        const tier = Math.max(1, Number(body.tier ?? 1));
        const { data: seasonRow, error: se } = await ctx.supabaseAdmin
          .from("season_definitions").select("*").eq("id", seasonId).eq("enabled", true).single();
        if (se) throw se;
        const { data: progress, error: pe } = await ctx.supabaseAdmin
          .from("player_seasons").select("*").eq("season_id", seasonId).eq("player_id", playerId).single();
        if (pe) throw pe;
        const xp = Number(progress.xp ?? 0);
        const needed = (tier - 1) * Number(seasonRow.tier_xp ?? 1000);
        if (xp < needed) return json({ error: "tier_locked", neededXp: needed, xp }, 409);
        const claimed = Array.isArray(progress.claimed_tiers) ? [...progress.claimed_tiers] : [];
        if (claimed.includes(tier)) return json({ error: "already_claimed" }, 409);
        const tierData = (Array.isArray(seasonRow.tiers) ? seasonRow.tiers : []).find((x: any) => Number(x.tier) === tier);
        if (!tierData) return json({ error: "tier_not_configured" }, 404);
        claimed.push(tier);
        const { data, error } = await ctx.supabaseAdmin.from("player_seasons")
          .update({ claimed_tiers: claimed, updated_at: new Date().toISOString() })
          .eq("id", progress.id).select("*").single();
        if (error) throw error;
        return json({ progress: data, reward: progress.premium ? tierData.premium : tierData.free });
      }

      return json({ error: "unknown_action" }, 400);
    } catch (error) {
      console.error("SEASONS", error);
      return json({ error: "seasons_error", message: error instanceof Error ? error.message : String(error) }, 500);
    }
  })
};

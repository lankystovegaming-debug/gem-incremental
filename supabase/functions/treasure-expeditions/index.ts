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
      if (!(await sectionEnabled(ctx, "treasure-expeditions"))) return json({ error: "feature_disabled" }, 403);
      let body: any = {}; try { body = await req.json(); } catch {}
      const action = body.action ?? "list";

      if (action === "list") {
        const { data: definitions, error } = await ctx.supabaseAdmin
          .from("treasure_expedition_definitions").select("*").eq("enabled", true).order("sort_order");
        if (error) throw error;
        const { data: active, error: ae } = await ctx.supabaseAdmin
          .from("player_treasure_expeditions").select("*, treasure_expedition_definitions(*)")
          .eq("player_id", playerId).order("started_at", { ascending: false });
        if (ae) throw ae;
        return json({ definitions: definitions ?? [], active: active ?? [] });
      }

      if (action === "start") {
        const expeditionId = String(body.expeditionId ?? "");
        const { data: expedition, error: ee } = await ctx.supabaseAdmin
          .from("treasure_expedition_definitions").select("*").eq("id", expeditionId).eq("enabled", true).single();
        if (ee) throw ee;
        const duration = Math.max(30, Number(expedition.duration_seconds ?? 3600));
        const finishes = new Date(Date.now() + duration * 1000).toISOString();
        const { data, error } = await ctx.supabaseAdmin.from("player_treasure_expeditions").insert({
          expedition_id: expedition.id, player_id: playerId, finishes_at: finishes,
          path: [], current_node: 0, state: "running"
        }).select("*").single();
        if (error) throw error;
        return json({ expedition: data });
      }

      if (action === "choose") {
        const id = String(body.id ?? "");
        const choice = String(body.choice ?? "").slice(0, 80);
        const { data: row, error: re } = await ctx.supabaseAdmin.from("player_treasure_expeditions")
          .select("*").eq("id", id).eq("player_id", playerId).single();
        if (re) throw re;
        const path = Array.isArray(row.path) ? [...row.path] : [];
        path.push({ node: row.current_node, choice, at: new Date().toISOString() });
        const { data, error } = await ctx.supabaseAdmin.from("player_treasure_expeditions")
          .update({ path, current_node: Number(row.current_node ?? 0) + 1, updated_at: new Date().toISOString() })
          .eq("id", id).select("*").single();
        if (error) throw error;
        return json({ expedition: data });
      }

      if (action === "claim") {
        const id = String(body.id ?? "");
        const { data: row, error: re } = await ctx.supabaseAdmin.from("player_treasure_expeditions")
          .select("*, treasure_expedition_definitions(*)").eq("id", id).eq("player_id", playerId).single();
        if (re) throw re;
        if (new Date(row.finishes_at).getTime() > Date.now()) return json({ error: "not_ready" }, 409);
        if (row.state === "claimed") return json({ error: "already_claimed" }, 409);
        const outcomes = Array.isArray(row.treasure_expedition_definitions?.outcomes)
          ? row.treasure_expedition_definitions.outcomes : [];
        const total = outcomes.reduce((s: number, x: any) => s + Math.max(0, Number(x.weight ?? 0)), 0);
        let roll = Math.random() * Math.max(1, total), selected = outcomes[outcomes.length - 1] ?? null;
        for (const outcome of outcomes) {
          roll -= Math.max(0, Number(outcome.weight ?? 0));
          if (roll <= 0) { selected = outcome; break; }
        }
        const { data, error } = await ctx.supabaseAdmin.from("player_treasure_expeditions")
          .update({ state: "claimed", result: selected ?? {}, updated_at: new Date().toISOString() })
          .eq("id", id).select("*").single();
        if (error) throw error;
        return json({ expedition: data, reward: selected });
      }

      return json({ error: "unknown_action" }, 400);
    } catch (error) {
      console.error("TREASURE_EXPEDITIONS", error);
      return json({ error: "treasure_expeditions_error", message: error instanceof Error ? error.message : String(error) }, 500);
    }
  })
};

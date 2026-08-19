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
      if (!(await sectionEnabled(ctx, "world-bosses"))) return json({ error: "feature_disabled" }, 403);
      let body: any = {}; try { body = await req.json(); } catch {}
      const action = body.action ?? "list";

      if (action === "list") {
        const { data: bosses, error } = await ctx.supabaseAdmin
          .from("world_boss_definitions").select("*").eq("enabled", true).order("sort_order");
        if (error) throw error;
        const { data: runs, error: re } = await ctx.supabaseAdmin
          .from("world_boss_runs").select("*").eq("player_id", playerId);
        if (re) throw re;
        return json({ bosses: bosses ?? [], runs: runs ?? [] });
      }

      if (action === "enter") {
        const bossId = String(body.bossId ?? "");
        const { data: boss, error } = await ctx.supabaseAdmin
          .from("world_boss_definitions").select("*").eq("id", bossId).eq("enabled", true).single();
        if (error) throw error;
        const { data, error: re } = await ctx.supabaseAdmin
          .from("world_boss_runs").upsert(
            { boss_id: boss.id, player_id: playerId },
            { onConflict: "boss_id,player_id" }
          ).select("*").single();
        if (re) throw re;
        return json({ run: data, boss });
      }

      if (action === "attack") {
        const bossId = String(body.bossId ?? "");
        const rawPower = Number(body.power ?? 100);
        const power = Math.max(1, Math.min(1000000, Number.isFinite(rawPower) ? rawPower : 100));
        const { data: boss, error: be } = await ctx.supabaseAdmin
          .from("world_boss_definitions").select("*").eq("id", bossId).eq("enabled", true).single();
        if (be) throw be;
        const { data: run, error: re } = await ctx.supabaseAdmin
          .from("world_boss_runs").select("*").eq("boss_id", bossId).eq("player_id", playerId).single();
        if (re) throw re;
        const currentDamage = Number(run.damage ?? 0);
        const nextDamage = Math.min(Number(boss.max_health), currentDamage + power);
        const nextStatus = nextDamage >= Number(boss.max_health) ? "defeated" : "active";
        const { data, error } = await ctx.supabaseAdmin
          .from("world_boss_runs")
          .update({
            damage: nextDamage,
            attempts: Number(run.attempts ?? 0) + 1,
            status: nextStatus,
            updated_at: new Date().toISOString()
          })
          .eq("id", run.id).select("*").single();
        if (error) throw error;
        return json({ run: data, remainingHealth: Math.max(0, Number(boss.max_health) - nextDamage) });
      }

      return json({ error: "unknown_action" }, 400);
    } catch (error) {
      console.error("WORLD_BOSSES", error);
      return json({ error: "world_bosses_error", message: error instanceof Error ? error.message : String(error) }, 500);
    }
  })
};

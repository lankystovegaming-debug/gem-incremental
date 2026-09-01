import { withSupabase } from "npm:@supabase/server";

const CACHE_TTL_MS = 30_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 6;

type CacheEntry = { expiresAt: number; payload: Record<string, unknown> };
type RateLimitEntry = { count: number; resetAt: number };

let leaderboardCache: CacheEntry | null = null;
const requestCounts = new Map<string, RateLimitEntry>();

function isRateLimited(playerId: string, now: number): boolean {
  const current = requestCounts.get(playerId);
  if (!current || current.resetAt <= now) {
    requestCounts.set(playerId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

function json(payload: Record<string, unknown>, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=15" }
  });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (_req, ctx) => {
    const playerId = String(ctx.userClaims?.sub ?? ctx.userClaims?.id ?? "");
    if (!playerId) return json({ error: "Authentication required." }, 401);

    const now = Date.now();
    if (isRateLimited(playerId, now)) {
      return json({ error: "Leaderboard refresh limit reached. Try again shortly." }, 429);
    }
    if (leaderboardCache && leaderboardCache.expiresAt > now) {
      return json(leaderboardCache.payload);
    }

    const [totalRolls, lifetimeEarnings, gemsFound, bestRoll, mostWeight,
      rawRareRoll, baseLuck, museumPrestige, rarestGem, mutations] = await Promise.all([
      ctx.supabaseAdmin.rpc("get_total_rolls_leaderboard", { p_limit: 100 }),
      ctx.supabaseAdmin.rpc("get_lifetime_earnings_leaderboard", { p_limit: 100 }),
      ctx.supabaseAdmin.rpc("get_gems_found_leaderboard"),
      ctx.supabaseAdmin.rpc("get_best_roll_leaderboard", { p_limit: 100 }),
      ctx.supabaseAdmin.rpc("get_most_weight_leaderboard", { p_limit: 100 }),
      ctx.supabaseAdmin.rpc("get_raw_rare_roll_leaderboard", { p_limit: 100 }),
      ctx.supabaseAdmin.rpc("get_base_luck_leaderboard", { p_limit: 100 }),
      ctx.supabaseAdmin.rpc("get_museum_prestige_leaderboard", { p_limit: 100 }),
      ctx.supabaseAdmin.rpc("get_rarest_gem_leaderboard", { p_limit: 100 }),
      ctx.supabaseAdmin.from("game_mutations")
        .select("id,name,chance,multiplier,description,icon,color")
        .eq("enabled", true).order("sort_order", { ascending: true })
    ]);

    const results = [totalRolls, lifetimeEarnings, gemsFound, bestRoll, mostWeight,
      rawRareRoll, baseLuck, museumPrestige, rarestGem, mutations];
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      console.error("Could not load leaderboard data:", failed.error);
      return json({ error: "Could not load leaderboards." }, 500);
    }

    const payload = {
      totalRolls: totalRolls.data ?? [], lifetimeEarnings: lifetimeEarnings.data ?? [],
      gemsFound: gemsFound.data ?? [], bestRoll: bestRoll.data ?? [],
      mostWeight: mostWeight.data ?? [], rawRareRoll: rawRareRoll.data ?? [],
      baseLuck: baseLuck.data ?? [], museumPrestige: museumPrestige.data ?? [],
      rarestGem: rarestGem.data ?? [], mutations: mutations.data ?? []
    };
    leaderboardCache = { payload, expiresAt: now + CACHE_TTL_MS };

    if (requestCounts.size > 2_000) {
      for (const [id, entry] of requestCounts) {
        if (entry.resetAt <= now) requestCounts.delete(id);
      }
    }
    return json(payload);
  })
};

import { withSupabase } from "npm:@supabase/server";
import { Redis } from "npm:@upstash/redis";
import { Ratelimit } from "npm:@upstash/ratelimit";
const redis = new Redis({
  url: Deno.env.get("UPSTASH_REDIS_REST_URL"),
  token: Deno.env.get("UPSTASH_REDIS_REST_TOKEN")
});
const sellRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "10 s"),
  prefix: "ratelimit:sell-gem",
  analytics: false
});
export default {
  fetch: withSupabase({
    auth: "user"
  }, async (req, ctx)=>{
    // =================================
    // IDENTIFY PLAYER
    // =================================
    const playerId = ctx.userClaims?.id;
    if (!playerId) {
      return Response.json({
        error: "Could not identify player."
      }, {
        status: 401
      });
    }
    // =================================
    // API RATE LIMIT
    // =================================
    let rateLimitResult;
    try {
      rateLimitResult = await sellRateLimit.limit(playerId);
    } catch (rateLimitError) {
      console.error("Rate limit check failed:", rateLimitError);
      return Response.json({
        error: "Rate limit service unavailable."
      }, {
        status: 503
      });
    }
    if (!rateLimitResult.success) {
      const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
      return Response.json({
        error: "rate_limited",
        message: "Too many sell requests.",
        limit: rateLimitResult.limit,
        remaining: rateLimitResult.remaining,
        reset: rateLimitResult.reset
      }, {
        status: 429,
        headers: {
          "Retry-After": retryAfterSeconds.toString()
        }
      });
    }
    // =================================
    // READ REQUEST
    // =================================
    let body;
    try {
      body = await req.json();
    } catch  {
      return Response.json({
        error: "Invalid request body."
      }, {
        status: 400
      });
    }
    const specimenId = Number(body.specimenId);
    if (!Number.isInteger(specimenId) || specimenId <= 0) {
      return Response.json({
        error: "Invalid specimen ID."
      }, {
        status: 400
      });
    }
    // =================================
    // VERIFY GEM OWNERSHIP
    // =================================
    const { data: gem, error: gemError } = await ctx.supabase.from("inventory_gems").select(`
            id,
            value,
            locked
          `).eq("id", specimenId).single();
    if (gemError || !gem) {
      return Response.json({
        error: "Gem not found."
      }, {
        status: 404
      });
    }
    if (gem.locked) {
      return Response.json({
        error: "gem_locked"
      }, {
        status: 409
      });
    }
    // =================================
    // SELL AT DATABASE LEVEL
    // =================================
    const { data: newMoney, error: sellError } = await ctx.supabaseAdmin.rpc("sell_inventory_gem", {
      p_player_id: playerId,
      p_specimen_id: specimenId
    });
    if (sellError) {
      console.error("Sell failed:", sellError);
      return Response.json({
        error: "Failed to sell gem."
      }, {
        status: 500
      });
    }
    // =================================
    // SUCCESS
    // =================================
    return Response.json({
      specimenId,
      soldValue: gem.value,
      money: newMoney
    });
  })
};

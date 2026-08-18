import { withSupabase } from "npm:@supabase/server";
export default {
  fetch: withSupabase({
    auth: "user"
  }, async (req, ctx)=>{
    // =================================
    // TOTAL ROLLS
    // =================================
    const { data: totalRollsData, error: totalRollsError } = await ctx.supabaseAdmin.from("players").select(`
            username,
            total_rolls
          `).not("username", "is", null).gt("total_rolls", 0).order("total_rolls", {
      ascending: false
    }).limit(50);
    if (totalRollsError) {
      console.error("Could not load Total Rolls leaderboard:", totalRollsError);
      return Response.json({
        error: "Could not load leaderboard."
      }, {
        status: 500
      });
    }
    // =================================
    // RAREST GEM
    // =================================
    const { data: rarestGemData, error: rarestGemError } = await ctx.supabaseAdmin.from("players").select(`
            username,
            rarest_gem_name,
            rarest_gem_rarity
          `).not("username", "is", null).not("rarest_gem_rarity", "is", null).gt("rarest_gem_rarity", 0).order("rarest_gem_rarity", {
      ascending: false
    }).limit(50);
    if (rarestGemError) {
      console.error("Could not load Rarest Gem leaderboard:", rarestGemError);
      return Response.json({
        error: "Could not load leaderboard."
      }, {
        status: 500
      });
    }
    // =================================
    // LIFETIME EARNINGS
    // =================================
    const { data: lifetimeEarningsData, error: lifetimeEarningsError } = await ctx.supabaseAdmin.from("players").select(`
            username,
            lifetime_earnings
          `).not("username", "is", null).gt("lifetime_earnings", 0).order("lifetime_earnings", {
      ascending: false
    }).limit(50);
    if (lifetimeEarningsError) {
      console.error("Could not load Lifetime Earnings leaderboard:", lifetimeEarningsError);
      return Response.json({
        error: "Could not load leaderboard."
      }, {
        status: 500
      });
    }
    // =================================
    // SAFE PUBLIC RESPONSE
    // =================================
    const totalRolls = totalRollsData.map((player, index)=>({
        rank: index + 1,
        username: player.username,
        totalRolls: Number(player.total_rolls ?? 0)
      }));
    const rarestGem = rarestGemData.map((player, index)=>({
        rank: index + 1,
        username: player.username,
        gemName: player.rarest_gem_name,
        rarity: Number(player.rarest_gem_rarity ?? 0)
      }));
    const lifetimeEarnings = lifetimeEarningsData.map((player, index)=>({
        rank: index + 1,
        username: player.username,
        lifetimeEarnings: Number(player.lifetime_earnings ?? 0)
      }));
    return Response.json({
      totalRolls,
      rarestGem,
      lifetimeEarnings
    });
  })
};

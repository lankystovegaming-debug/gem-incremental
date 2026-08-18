import { withSupabase } from "npm:@supabase/server";
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
    // VERIFY PLAYER OWNS GEM
    // =================================
    const { data: gem, error: gemError } = await ctx.supabase.from("inventory_gems").select("id, locked").eq("id", specimenId).single();
    if (gemError || !gem) {
      return Response.json({
        error: "Gem not found."
      }, {
        status: 404
      });
    }
    // =================================
    // TOGGLE LOCK
    // =================================
    const newLockedState = !gem.locked;
    const { data: updatedGem, error: updateError } = await ctx.supabaseAdmin.from("inventory_gems").update({
      locked: newLockedState
    }).eq("id", specimenId).eq("player_id", playerId).select("id, locked").single();
    if (updateError || !updatedGem) {
      console.error("Lock update failed:", updateError);
      return Response.json({
        error: "Failed to update gem."
      }, {
        status: 500
      });
    }
    // =================================
    // SUCCESS
    // =================================
    return Response.json({
      specimenId: updatedGem.id,
      locked: updatedGem.locked
    });
  })
};

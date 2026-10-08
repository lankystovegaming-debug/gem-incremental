import { withSupabase } from "npm:@supabase/server@^1";
export default {
  fetch: withSupabase({
    auth: "user"
  }, async (req, ctx)=>{
    const playerId = ctx.userClaims?.id;
    if (!playerId) {
      return Response.json({
        error: "Could not identify player."
      }, {
        status: 401
      });
    }
    let body;
    try {
      body = await req.json();
    } catch  {
      return Response.json({
        error: "Invalid request."
      }, {
        status: 400
      });
    }
    const recipeId = body.recipeId;
    // null = disable Auto Craft
    if (recipeId !== null && typeof recipeId !== "string") {
      return Response.json({
        error: "Invalid recipe ID."
      }, {
        status: 400
      });
    }
    // =================================
    // VALIDATE RECIPE
    // =================================
    if (recipeId !== null) {
      const { data: recipe, error: recipeError } = await ctx.supabaseAdmin.from("game_recipes").select("id").eq("id", recipeId).maybeSingle();
      if (recipeError || !recipe) {
        return Response.json({
          error: "Recipe not found."
        }, {
          status: 404
        });
      }
    }
    // =================================
    // SAVE AUTO CRAFT TARGET
    // =================================
    const { data: autoCraftState, error } = recipeId === "convergence-pickaxe"
      ? await ctx.supabaseAdmin.rpc("set_convergence_auto_craft_for_player", {
        p_uid: playerId,
        p_enabled: true
      })
      : await ctx.supabaseAdmin.rpc("replace_auto_craft_target", {
        p_uid: playerId,
        p_recipe_id: recipeId
      });
    if (error) {
      console.error("Failed to set Auto Craft:", error);
      return Response.json({
        error: "Could not update Auto Craft."
      }, {
        status: 500
      });
    }
    return Response.json({
      activeAutoCraftRecipeId: autoCraftState?.activeAutoCraftRecipeId ?? recipeId
    });
  })
};

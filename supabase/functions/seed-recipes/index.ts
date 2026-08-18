import { withSupabase } from "npm:@supabase/server";
// =========================================================
// DEV-ONLY ACCOUNT
// Delete this function after seeding.
// =========================================================
const ALLOWED_PLAYER_ID = "304ab45c-a793-4ef4-9164-e92f85874c98";
export default {
  fetch: withSupabase({
    auth: "user"
  }, async (req, ctx)=>{
    // =================================
    // VERIFY DEVELOPER
    // =================================
    const playerId = ctx.userClaims?.id;
    if (!playerId || playerId !== ALLOWED_PLAYER_ID) {
      return Response.json({
        error: "Not allowed."
      }, {
        status: 403
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
    const recipes = body.recipes;
    if (!Array.isArray(recipes)) {
      return Response.json({
        error: "Recipes must be an array."
      }, {
        status: 400
      });
    }
    // =================================
    // BASIC VALIDATION
    // =================================
    const rows = [];
    for (const recipe of recipes){
      if (!recipe || typeof recipe !== "object") {
        continue;
      }
      if (typeof recipe.id !== "string" || !recipe.id) {
        continue;
      }
      if (typeof recipe.name !== "string" || typeof recipe.category !== "string" || !Array.isArray(recipe.requirements) || typeof recipe.reward !== "object") {
        continue;
      }
      rows.push({
        id: recipe.id,
        recipe
      });
    }
    if (rows.length === 0) {
      return Response.json({
        error: "No valid recipes received."
      }, {
        status: 400
      });
    }
    // =================================
    // SAVE CANONICAL RECIPES
    // =================================
    const { data, error } = await ctx.supabaseAdmin.from("game_recipes").upsert(rows, {
      onConflict: "id"
    }).select("id");
    if (error) {
      console.error("Recipe seed failed:", error);
      return Response.json({
        error: "Failed to seed recipes."
      }, {
        status: 500
      });
    }
    return Response.json({
      seeded: data?.length ?? rows.length,
      recipeIds: data?.map((row)=>row.id) ?? []
    });
  })
};

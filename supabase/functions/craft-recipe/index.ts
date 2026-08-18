import { withSupabase } from "npm:@supabase/server@^1";
function getRequirementKey(requirement, index) {
  if (requirement.id) {
    return requirement.id;
  }
  if (requirement.type === "gem-count") {
    return requirement.gem;
  }
  return `${requirement.type}-${index}`;
}
function requirementComplete(progress, requirement, index) {
  if (requirement.type === "equipment") {
    return true;
  }
  const key = getRequirementKey(requirement, index);
  const value = progress[key];
  if (requirement.type === "gem-count") {
    return Number(value ?? 0) >= requirement.amount;
  }
  if (requirement.type === "gem-total-weight") {
    return Number(value ?? 0) >= requirement.totalWeight;
  }
  if (requirement.type === "specimen-value-total") {
    return Number(value ?? 0) >= requirement.totalValue;
  }
  if (requirement.type === "gem-min-weight-multiplier" || requirement.type === "gem-max-weight-multiplier" || requirement.type === "specimen-condition") {
    return Number(value ?? 0) >= (requirement.amount ?? 1);
  }
  if (requirement.type === "rarity-points") {
    const current = value ?? {
      points: 0,
      gemTypes: []
    };
    return Number(current.points ?? 0) >= requirement.points && (Array.isArray(current.gemTypes) ? current.gemTypes.length : 0) >= (requirement.minimumUniqueGemTypes ?? 0);
  }
  if (requirement.type === "gem-range") {
    const current = value ?? {};
    return requirement.gems.every((gemName)=>Number(current[gemName] ?? 0) >= (requirement.amountEach ?? 1));
  }
  return false;
}
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
    if (typeof recipeId !== "string") {
      return Response.json({
        error: "Invalid recipe."
      }, {
        status: 400
      });
    }
    // =================================
    // LOAD RECIPE
    // =================================
    const { data: recipeRow, error: recipeError } = await ctx.supabaseAdmin.from("game_recipes").select("recipe").eq("id", recipeId).single();
    if (recipeError || !recipeRow) {
      return Response.json({
        error: "Recipe not found."
      }, {
        status: 404
      });
    }
    const recipe = recipeRow.recipe;
    // =================================
    // LOAD PLAYER
    // =================================
    const { data: player, error: playerError } = await ctx.supabase.from("players").select("money").single();
    if (playerError || !player) {
      return Response.json({
        error: "Player not found."
      }, {
        status: 404
      });
    }
    if (player.money < recipe.moneyCost) {
      return Response.json({
        error: "not_enough_money"
      }, {
        status: 409
      });
    }
    // =================================
    // LOAD OWNED EQUIPMENT
    // =================================
    const { data: equipment, error: equipmentError } = await ctx.supabase.from("player_equipment").select(`
            equipment_id,
            category,
            tier
          `);
    if (equipmentError) {
      return Response.json({
        error: "Could not load equipment."
      }, {
        status: 500
      });
    }
    const ownedEquipment = equipment ?? [];
    // Already owns this tier or higher?
    const ownsSameOrHigher = ownedEquipment.some((item)=>item.category === recipe.reward.category && item.tier >= recipe.reward.tier);
    if (ownsSameOrHigher) {
      return Response.json({
        error: "already_owned"
      }, {
        status: 409
      });
    }
    // =================================
    // CHECK PREREQUISITE EQUIPMENT
    // =================================
    const equipmentRequirement = recipe.requirements.find((requirement)=>requirement.type === "equipment");
    if (equipmentRequirement) {
      const hasRequired = ownedEquipment.some((item)=>item.equipment_id === equipmentRequirement.equipmentId);
      if (!hasRequired) {
        return Response.json({
          error: "missing_required_equipment"
        }, {
          status: 409
        });
      }
    }
    // =================================
    // LOAD CRAFTING PROGRESS
    // =================================
    const { data: progressRow, error: progressError } = await ctx.supabase.from("crafting_progress").select("progress").eq("recipe_id", recipeId).maybeSingle();
    if (progressError) {
      return Response.json({
        error: "Could not load crafting progress."
      }, {
        status: 500
      });
    }
    const progress = progressRow?.progress ?? {};
    const requirementsComplete = recipe.requirements.every((requirement, index)=>{
      if (requirement.type === "equipment") {
        return true;
      }
      return requirementComplete(progress, requirement, index);
    });
    if (!requirementsComplete) {
      return Response.json({
        error: "requirements_incomplete"
      }, {
        status: 409
      });
    }
    // =================================
    // REWARD BONUSES
    // =================================
    const bonus = recipe.reward.bonus ?? {};
    // =================================
    // ATOMIC CRAFT
    // =================================
    const { data: result, error: craftError } = await ctx.supabaseAdmin.rpc("craft_equipment_recipe", {
      p_player_id: playerId,
      p_recipe_id: recipeId,
      p_money_cost: recipe.moneyCost,
      p_reward_id: recipe.reward.id,
      p_reward_name: recipe.reward.name,
      p_reward_category: recipe.reward.category,
      p_reward_tier: recipe.reward.tier,
      p_luck_bonus: Number(bonus.luck ?? 0),
      p_roll_speed_bonus: Number(bonus.rollSpeed ?? 0),
      p_weight_luck_bonus: Number(bonus.weightLuck ?? 0),
      p_weight_multiplier_bonus: Number(bonus.weightMultiplier ?? 0),
      p_required_equipment_id: equipmentRequirement?.equipmentId ?? null
    });
    if (craftError) {
      console.error("Craft RPC failed:", craftError);
      return Response.json({
        error: "craft_failed"
      }, {
        status: 500
      });
    }
    return Response.json({
      recipeId,
      reward: recipe.reward,
      money: result.money
    });
  })
};

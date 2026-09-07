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
function requirementComplete(progress, requirement, index, player) {
  if (requirement.type === "equipment") {
    return true;
  }
  if (requirement.type === "lifetime-rolls") {
    return Number(player.total_rolls) >= Number(requirement.rolls ?? 0);
  }
  if (requirement.type === "roll-history-condition") {
    const best = Number(requirement.minimumRarity >= 1000000
      ? player.best_rare_natural_weight_1m
      : player.best_rare_natural_weight_100k);
    return best >= Number(requirement.minimumWeightMultiplier ?? 0);
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
    if (recipe.includedSpecimens) {
      const { data, error } = await ctx.supabase.rpc("craft_equipment_recipe", { p_recipe_id: recipeId });
      if (error) return Response.json({ error: error.message }, { status: 409 });
      return Response.json(data);
    }

    // =================================
    // LOAD PLAYER
    // =================================
    const { data: player, error: playerError } = await ctx.supabase
      .from("players")
      .select("money, total_rolls, best_rare_natural_weight_100k, best_rare_natural_weight_1m")
      .eq("id", playerId)
      .single();
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
            tier,
            name,
            luck_bonus,
            roll_speed_bonus,
            weight_luck_bonus,
            weight_multiplier_bonus,
            enchant_id,
            enchant_grade,
            enchant_state,
            masterwork_level,
            masterwork_passive,
            masterwork_passive_rank,
            masterwork_attunement,
            masterwork_rerolls,
            masterwork_choices,
            masterwork_perfected_at
          `)
      .eq("player_id", playerId);
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
    const requiredEquipment = equipmentRequirement
      ? ownedEquipment.find((item)=>item.equipment_id === equipmentRequirement.equipmentId)
      : null;
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
    const { data: progressRow, error: progressError } = await ctx.supabase
      .from("crafting_progress")
      .select("progress")
      .eq("player_id", playerId)
      .eq("recipe_id", recipeId)
      .maybeSingle();
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
      return requirementComplete(progress, requirement, index, player);
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

    // Crafting equips the new reward. Store every other item in its category,
    // including a lower tier the player may have selected before crafting.
    const { error: storeOtherEquipmentError } = await ctx.supabaseAdmin
      .from("player_equipment")
      .update({ equipped: false })
      .eq("player_id", playerId)
      .eq("category", recipe.reward.category)
      .neq("equipment_id", recipe.reward.id);

    if (storeOtherEquipmentError) {
      console.error("Could not store previous category equipment:", storeOtherEquipmentError);
    }

    // The database crafting RPC historically consumes the prerequisite
    // equipment row. Restore it as stored equipment so players can switch
    // back to any tier they have unlocked. The newly crafted reward remains
    // equipped by the RPC.
    if (requiredEquipment) {
      const { error: restoreEquipmentError } = await ctx.supabaseAdmin
        .from("player_equipment")
        .upsert({
          player_id: playerId,
          ...requiredEquipment,
          equipped: false
        }, {
          onConflict: "player_id,equipment_id",
          ignoreDuplicates: true
        });

      // Crafting has already committed, so do not turn a restoration problem
      // into a retry that could charge the player twice.
      if (restoreEquipmentError) {
        console.error("Could not retain prerequisite equipment:", restoreEquipmentError);
      }
    }
    return Response.json({
      recipeId,
      reward: recipe.reward,
      money: result.money
    });
  })
};

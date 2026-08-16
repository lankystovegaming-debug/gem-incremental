import { supabase } from "./supabase.js";
import { invokeFunction } from "./invoke.js";


export async function loadCloudCraftingState() {
  const [craftingResult, progressResult] = await Promise.all([
    supabase
      .from("player_crafting")
      .select("active_auto_craft")
      .maybeSingle(),

    supabase
      .from("crafting_progress")
      .select("recipe_id, progress")
  ]);

  if (progressResult.error) {
    console.error(
      "Failed to load cloud crafting progress:",
      progressResult.error
    );

    return null;
  }

  // The player_crafting row is created server-side the first
  // time Auto Craft is set. Until then there is simply no row,
  // which is not an error worth blocking the page for.
  if (craftingResult.error) {
    console.warn(
      "Could not read Auto Craft target:",
      craftingResult.error
    );
  }

  const progress = {};

  for (const row of progressResult.data ?? []) {
    progress[row.recipe_id] = row.progress ?? {};
  }

  return {
    activeAutoCraftRecipeId:
      craftingResult.data?.active_auto_craft ?? null,

    progress
  };
}


export function manuallyDepositCloudRequirement(recipeId, requirementIndex) {
  return invokeFunction("manual-deposit", { recipeId, requirementIndex });
}


export async function craftCloudRecipe(recipeId) {
  // Primary path: the server-side Edge Function.
  const primary = await invokeFunction("craft-recipe", { recipeId });

  if (!primary.error) {
    return primary;
  }

  // Fallback: on this backend the craft-recipe function can fail with
  // "player not found". The atomic equipment craft is also exposed as
  // a self-scoped RPC (scoped to auth.uid(), recipe read server-side
  // from game_recipes), so use it when the function is unavailable.
  const fallback = await supabase.rpc("craft_equipment_recipe", {
    p_recipe_id: recipeId
  });

  if (!fallback.error) {
    return { data: fallback.data, error: null };
  }

  const message = String(fallback.error.message ?? "");

  const code = (message.match(
    /(not_enough_money|requirements_not_met|recipe_not_found|not_authenticated|player_not_found)/
  ) ?? [])[1];

  const friendly = {
    not_enough_money: "You cannot afford that yet.",
    requirements_not_met: "The requirements for that recipe are not complete.",
    recipe_not_found: "That recipe could not be found.",
    not_authenticated: "Your session expired. Refresh and try again.",
    player_not_found: "Your save could not be found."
  }[code];

  return {
    data: null,
    error: { code: code ?? "craft_failed", message: friendly ?? "Could not craft that recipe." }
  };
}


export function craftCloudConsumableRecipe(recipeId) {
  return supabase.rpc("craft_consumable_recipe", {
    p_recipe_id: recipeId
  });
}


export function setCloudAutoCraft(recipeId) {
  return invokeFunction("set-auto-craft", { recipeId });
}


export async function loadCloudConsumables() {
  const { data, error } = await supabase
    .from("player_consumables")
    .select("consumable_id, quantity");

  if (error) {
    console.error("Failed to load cloud consumables:", error);
    return null;
  }

  return data ?? [];
}

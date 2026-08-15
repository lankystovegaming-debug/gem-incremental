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
  // The primary path is the server-side Edge Function. Some deployments
  // of the backend expose the atomic equipment craft as an RPC instead,
  // so fall back to it when the function is unavailable.
  const primary = await invokeFunction("craft-recipe", { recipeId });

  if (!primary.error) {
    return primary;
  }

  const fallback = await supabase.rpc("craft_equipment_recipe", {
    p_recipe_id: recipeId
  });

  if (!fallback.error) {
    return { data: fallback.data, error: null };
  }

  return primary;
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

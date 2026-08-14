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


export function craftCloudRecipe(recipeId) {
  return invokeFunction("craft-recipe", { recipeId });
}


export function setCloudAutoCraft(recipeId) {
  return invokeFunction("set-auto-craft", { recipeId });
}

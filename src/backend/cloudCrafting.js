import {
  supabase
} from "./supabase.js";


export async function loadCloudCraftingState() {
  const [
    craftingResult,
    progressResult
  ] =
    await Promise.all([
      supabase
        .from("player_crafting")
        .select(`
          active_auto_craft
        `)
        .maybeSingle(),

      supabase
        .from("crafting_progress")
        .select(`
          recipe_id,
          progress
        `)
    ]);


  if (craftingResult.error) {
    console.error(
      "Failed to load cloud crafting state:",
      craftingResult.error
    );

    return null;
  }


  if (progressResult.error) {
    console.error(
      "Failed to load cloud crafting progress:",
      progressResult.error
    );

    return null;
  }


  const progress = {};


  for (
    const row
    of progressResult.data ?? []
  ) {
    progress[
      row.recipe_id
    ] =
      row.progress ?? {};
  }


  return {
    activeAutoCraftRecipeId:
      craftingResult.data
        ?.active_auto_craft ??
      null,

    progress
  };
}

export async function manuallyDepositCloudRequirement(
  recipeId,
  requirementIndex
) {
  const {
    data,
    error
  } =
    await supabase
      .functions
      .invoke(
        "manual-deposit",
        {
          body: {
            recipeId,
            requirementIndex
          }
        }
      );


  if (error) {
    console.error(
      "Cloud manual deposit failed:",
      error
    );

    return null;
  }


  return data;
}

export async function craftCloudRecipe(
  recipeId
) {
  const {
    data,
    error
  } =
    await supabase
      .functions
      .invoke(
        "craft-recipe",
        {
          body: {
            recipeId
          }
        }
      );

  if (error) {
    console.error(
      "Cloud craft failed:",
      error
    );

    return null;
  }

  return data;
}

export async function setCloudAutoCraft(
  recipeId
) {
  const {
    data,
    error
  } =
    await supabase
      .functions
      .invoke(
        "set-auto-craft",
        {
          body: {
            recipeId
          }
        }
      );


  if (error) {
    console.error(
      "Failed to set cloud Auto Craft:",
      error
    );

    return null;
  }


  return data;
}

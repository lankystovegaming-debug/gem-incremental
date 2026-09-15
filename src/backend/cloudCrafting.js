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
  // The primary path is the server-side Edge Function. On this backend
  // it can fail with "player not found"; the atomic equipment craft is
  // also exposed as a self-scoped RPC (scoped to auth.uid(), recipe read
  // server-side from game_recipes), so fall back to it.
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
export async function loadImpossiblePickaxeStatus() {
  const { data, error } = await supabase.rpc("get_impossible_pickaxe_status");
  if (error?.code === "42883") return null;
  if (error) throw error;
  return data;
}

export async function loadImpossibleDepositCandidates({ offset = 0, limit = 50, search = "" } = {}) {
  let query = supabase
    .from("inventory_gems")
    .select("id,gem_name,rarity,base_weight,final_weight,value,locked,created_at", { count: "exact" })
    .eq("locked", false)
    .eq("museum_locked", false)
    .not("gem_name", "in", '("Enchant Relic","Ancient Relic")')
    .order("value", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  const term = String(search ?? "").trim();
  if (term) query = query.ilike("gem_name", `%${term.replaceAll("%", "").replaceAll("_", "")}%`);
  const { data, error, count } = await query;
  return { data: data ?? [], error, count: Number(count ?? 0) };
}

export async function depositImpossiblePickaxeGems(gemIds) {
  const { data, error } = await supabase.rpc("deposit_impossible_pickaxe_gems", {
    p_gem_ids: gemIds
  });
  if (error) throw error;
  return data;
}

export async function prepareImpossiblePickaxeCraft() {
  const { data, error } = await supabase.rpc("prepare_impossible_pickaxe_craft");
  if (error) throw error;
  return data;
}

export async function craftImpossiblePickaxe(token) {
  const { data, error } = await supabase.rpc("craft_impossible_pickaxe", { p_token: token });
  if (error) throw error;
  return data;
}

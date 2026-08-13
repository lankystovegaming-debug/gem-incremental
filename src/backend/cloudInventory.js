import { supabase } from "./supabase.js";
import { invokeFunction } from "./invoke.js";


const DEFAULT_PLAYER_STATE = {
  inventory_capacity: 15,
  money: 0
};


export async function loadCloudGems() {
  const { data, error } = await supabase
    .from("inventory_gems")
    .select(`
      id,
      gem_name,
      rarity,
      base_weight,
      value_per_gram,
      rolled_weight_multiplier,
      rolled_weight,
      final_weight,
      value,
      locked,
      created_at
    `)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load cloud gems:", error);

    return null;
  }

  return data ?? [];
}


// A player who has just signed in may not have a row yet, so a
// missing one is the starting state rather than a failure.
export async function loadCloudPlayerState() {
  const { data, error } = await supabase
    .from("players")
    .select(`
      inventory_capacity,
      money,
      total_rolls
    `)
    .maybeSingle();

  if (error) {
    console.error("Failed to load cloud player state:", error);

    return null;
  }

  if (!data) {
    return { ...DEFAULT_PLAYER_STATE, total_rolls: 0 };
  }

  return {
    inventory_capacity: Number(
      data.inventory_capacity ?? DEFAULT_PLAYER_STATE.inventory_capacity
    ),

    money: Number(data.money ?? 0),

    total_rolls: Number(data.total_rolls ?? 0)
  };
}


export function toggleCloudGemLock(specimenId) {
  return invokeFunction("toggle-gem-lock", { specimenId });
}


export function sellCloudGem(specimenId) {
  return invokeFunction("sell-gem", { specimenId });
}


export function upgradeCloudInventory() {
  return invokeFunction("upgrade-inventory", {});
}

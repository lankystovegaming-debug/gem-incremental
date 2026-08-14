import { supabase } from "./supabase.js";


export async function loadCloudConsumables() {
  const { data, error } = await supabase
    .from("player_consumables")
    .select("consumable_id, quantity");

  if (error) {
    console.error("Failed to load consumables:", error);
    return null;
  }

  return data ?? [];
}


export async function buyCloudConsumable(consumableId) {
  const { data, error } = await supabase.rpc("buy_consumable", {
    p_consumable_id: consumableId
  });

  if (!error) {
    return { data, error: null };
  }

  const code = error.message?.match(/(insufficient_funds|consumable_[a-z_]+)/)?.[1];

  return {
    data: null,
    error: {
      code: code ?? error.code,
      message:
        code === "insufficient_funds"
          ? "You cannot afford that potion yet."
          : "The potion could not be purchased."
    }
  };
}


// Drinks one potion: the server decrements the quantity and
// records a timed boost in player_boosts, returning the boost it
// started (family, effectValue, expiresAt).
export async function useCloudConsumable(consumableId) {
  const { data, error } = await supabase.rpc("use_consumable", {
    p_consumable_id: consumableId
  });

  if (!error) {
    return { data, error: null };
  }

  const code = error.message?.match(
    /(consumable_[a-z_]+|not_owned|none_owned)/
  )?.[1];

  return {
    data: null,
    error: {
      code: code ?? error.code,
      message:
        code === "consumable_not_owned" || code === "none_owned"
          ? "You do not have that potion."
          : "The potion could not be used."
    }
  };
}


// Active boosts, one row per stat family, filtered to the ones
// that have not yet expired.
export async function loadActiveBoosts() {
  const { data, error } = await supabase
    .from("player_boosts")
    .select("family, tier, effect_value, expires_at")
    .gt("expires_at", new Date().toISOString());

  if (error) {
    console.error("Failed to load active boosts:", error);
    return null;
  }

  return data ?? [];
}

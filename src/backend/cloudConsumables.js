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


// Drinks one potion. Legendary and Mythic potions create a pending boost for
// exactly one successful roll; other potions create timed boosts.
export async function useCloudConsumable(consumableId) {
  const oneRoll = ["legendary-potion", "mythic-potion"].includes(consumableId);
  const { data, error } = await supabase.rpc(
    oneRoll ? "activate_one_roll_potion" : "use_consumable",
    {
      p_consumable_id: consumableId
    }
  );

  if (!error) {
    return { data, error: null };
  }

  const rollRequirement = error.message?.match(/lifetime_rolls_required:(\d+)/)?.[1];
  const code = rollRequirement
    ? "lifetime_rolls_required"
    : error.message?.match(
      /(consumable_[a-z_]+|not_owned|none_owned|one_roll_boost_already_active)/
    )?.[1];

  return {
    data: null,
    error: {
      code: code ?? error.code,
      message:
        code === "lifetime_rolls_required"
          ? `You need ${Number(rollRequirement).toLocaleString()} lifetime rolls to use this potion.`
          : code === "one_roll_boost_already_active"
          ? "Use your pending Legendary or Mythic boost before drinking another."
          : code === "consumable_not_owned" || code === "none_owned"
          ? "You do not have that potion."
          : "The potion could not be used."
    }
  };
}

export async function loadPendingOneRollBoost() {
  const { data, error } = await supabase
    .from("player_one_roll_boosts")
    .select("consumable_id, effect_value, activated_at")
    .maybeSingle();

  if (error) {
    console.error("Failed to load pending one-roll boost:", error);
    return null;
  }

  return data ?? null;
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

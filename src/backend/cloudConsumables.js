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

export async function loadDailyShop() {
  const { data, error } = await supabase.rpc("get_daily_shop");
  return { data: data ?? [], error };
}

export async function buyDailyShopOffer(slot) {
  const { data, error } = await supabase.rpc("buy_daily_shop_offer", { p_slot: slot });
  return { data, error: normaliseShopError(error) };
}

export async function refreshDailyShop() {
  const { data, error } = await supabase.rpc("refresh_daily_shop");
  return { data, error: normaliseShopError(error) };
}

function normaliseShopError(error) {
  if (!error) return null;
  const code = error.message?.match(/(insufficient_funds|daily_shop_sold_out|daily_shop_already_refreshed|invalid_shop_slot)/)?.[1] ?? error.code;
  const messages = {
    insufficient_funds: "You cannot afford that offer.",
    daily_shop_sold_out: "You have already purchased all available stock.",
    daily_shop_already_refreshed: "You have already refreshed today's Shop."
  };
  return { code, message: messages[code] ?? "The Shop could not complete that request." };
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
          ? "Finish your other pending one-roll boost before drinking this one."
          : code === "consumable_not_owned" || code === "none_owned"
          ? "You do not have that potion."
          : "The potion could not be used."
    }
  };
}

export async function loadPendingOneRollBoost() {
  const { data, error } = await supabase
    .from("player_one_roll_boosts")
    .select("consumable_id, effect_value, charges, activated_at")
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

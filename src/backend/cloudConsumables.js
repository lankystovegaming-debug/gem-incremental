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

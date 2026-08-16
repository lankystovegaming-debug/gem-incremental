import { supabase } from "./supabase.js";


// Box definitions are public (same source the server rolls from), so
// the odds shown in the UI are exactly the odds used.
export async function loadLootBoxes() {
  const { data, error } = await supabase
    .from("game_loot_boxes")
    .select("id, box, sort")
    .order("sort", { ascending: true });

  if (error) {
    console.error("Failed to load loot boxes:", error);
    return null;
  }

  return (data ?? []).map((row) => row.box);
}


export async function loadWallet() {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("players")
    .select("coins, money")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load wallet:", error);
    return null;
  }

  return { coins: Number(data?.coins ?? 0), money: Number(data?.money ?? 0) };
}


export async function buyCoins(count) {
  const { data, error } = await supabase.rpc("buy_coins_with_money", {
    p_count: count
  });

  if (error) {
    return { error: friendly(error) };
  }

  return { data };
}


export async function openLootBox(boxId) {
  const { data, error } = await supabase.rpc("open_loot_box", {
    p_box_id: boxId
  });

  if (error) {
    return { error: friendly(error) };
  }

  return { data };
}


function friendly(error) {
  const message = String(error?.message ?? "");

  const code = (message.match(
    /(not_enough_coins|not_enough_money|not_authenticated|box_not_found|invalid_count|player_not_found)/
  ) ?? [])[1];

  const map = {
    not_enough_coins: "You don't have enough coins.",
    not_enough_money: "You don't have enough money.",
    not_authenticated: "Your session expired — refresh and try again.",
    box_not_found: "That box no longer exists.",
    invalid_count: "Enter a valid number of coins.",
    player_not_found: "Your save could not be found."
  };

  return { code: code ?? "error", message: map[code] ?? "Something went wrong." };
}

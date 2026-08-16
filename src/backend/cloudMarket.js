import { supabase } from "./supabase.js";

// Must mirror the server (trade_shares) so the shown price matches
// what a trade will actually use.
const BASELINE = 10;
const HALF_LIFE_MS = 15 * 60 * 1000;
const BAND = [3, 30];


export function revertedPrice(price, updatedAtIso) {
  const elapsed = Date.now() - new Date(updatedAtIso).getTime();
  const factor = Math.pow(0.5, Math.max(0, elapsed) / HALF_LIFE_MS);
  const p = BASELINE + (Number(price) - BASELINE) * factor;
  return Math.min(BAND[1], Math.max(BAND[0], p));
}


export async function loadMarket() {
  const [stateRes, histRes] = await Promise.all([
    supabase.from("market_state").select("price, updated_at").eq("id", "coin").maybeSingle(),
    supabase.from("market_history").select("price, at").order("at", { ascending: false }).limit(40)
  ]);

  if (stateRes.error) {
    console.error("Failed to load market:", stateRes.error);
    return null;
  }

  const history = (histRes.data ?? []).map((row) => Number(row.price)).reverse();

  return {
    price: Number(stateRes.data?.price ?? BASELINE),
    updatedAt: stateRes.data?.updated_at ?? new Date().toISOString(),
    history
  };
}


export async function loadHoldings() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { shares: 0, money: 0 };

  const [sharesRes, playerRes] = await Promise.all([
    supabase.from("player_shares").select("shares").eq("player_id", user.id).maybeSingle(),
    supabase.from("players").select("money").eq("id", user.id).maybeSingle()
  ]);

  return {
    shares: Number(sharesRes.data?.shares ?? 0),
    money: Number(playerRes.data?.money ?? 0)
  };
}


export async function tradeShares(action, qty) {
  const { data, error } = await supabase.rpc("trade_shares", { p_action: action, p_qty: qty });
  if (error) return { error: friendly(error) };
  return { data };
}


export async function loadGemShop() {
  const { data, error } = await supabase
    .from("game_gems")
    .select("name, rarity, base_weight, value_per_gram, shop_price, sort")
    .order("sort", { ascending: true });

  if (error) {
    console.error("Failed to load gem shop:", error);
    return null;
  }

  return data ?? [];
}


export async function buyGem(name) {
  const { data, error } = await supabase.rpc("buy_gem", { p_gem_name: name });
  if (error) return { error: friendly(error) };
  return { data };
}


function friendly(error) {
  const message = String(error?.message ?? "");
  const code = (message.match(
    /(too_fast|not_enough_money|not_enough_shares|holding_cap|invalid_qty|not_authenticated|gem_not_found|player_not_found)/
  ) ?? [])[1];

  const map = {
    too_fast: "Slow down — a few seconds between trades.",
    not_enough_money: "You don't have enough money.",
    not_enough_shares: "You don't have that many shares.",
    holding_cap: "You've hit the maximum share holding.",
    invalid_qty: "Enter between 1 and 100 shares.",
    not_authenticated: "Your session expired — refresh and try again.",
    gem_not_found: "That gem isn't in the shop.",
    player_not_found: "Your save could not be found."
  };

  return { code: code ?? "error", message: map[code] ?? "Something went wrong." };
}

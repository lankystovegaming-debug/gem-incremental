import { supabase } from "./supabase.js";

// Must mirror the server (trade_shares) so the shown price matches
// what a trade will actually use.
const BASELINE = 10;
const FLOOR = 1;
const EMPTY_MARKET_HALF_LIFE_MS = 60 * 60 * 1000;


export function revertedPrice(price, decayUpdatedAt, holderCount = 0) {
  const storedPrice = Math.max(FLOOR, Number(price));
  const updatedAt = new Date(decayUpdatedAt).getTime();

  if (!Number.isFinite(updatedAt)) return storedPrice;

  // A single share held by anyone freezes the quote. Only an empty market
  // resets rapidly toward the $1 floor.
  if (Number(holderCount) > 0) return storedPrice;

  // Mirror the server's empty-market decay rule between refreshes.
  const elapsed = Math.max(0, Date.now() - updatedAt);
  const decay = Math.pow(0.5, elapsed / EMPTY_MARKET_HALF_LIFE_MS);
  return FLOOR + (storedPrice - FLOOR) * decay;
}


export async function loadMarket() {
  const { data, error } = await supabase
    .from("market_state")
    .select("price, updated_at, decay_updated_at, holder_count")
    .eq("id", "coin")
    .maybeSingle();

  if (error) {
    console.error("Failed to load market:", error);
    return null;
  }

  return {
    price: Number(data?.price ?? BASELINE),
    updatedAt: data?.updated_at ?? new Date().toISOString(),
    decayUpdatedAt: data?.decay_updated_at ?? data?.updated_at ?? new Date().toISOString(),
    holderCount: Math.max(0, Math.floor(Number(data?.holder_count) || 0))
  };
}


// Price points for the chart. `windowMs` limits to the recent window
// (null = all history). Returned oldest-first so it plots left→right.
export async function loadHistory(windowMs) {
  let query = supabase
    .from("market_history")
    .select("price, at")
    .order("at", { ascending: false })
    .limit(1000);

  if (windowMs) {
    query = query.gte("at", new Date(Date.now() - windowMs).toISOString());
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load history:", error);
    return [];
  }

  return (data ?? [])
    .map((row) => ({ price: Number(row.price), at: row.at }))
    .reverse();
}


export async function loadTrades() {
  const { data, error } = await supabase
    .from("market_history")
    .select("price, at, username, action, qty")
    .order("at", { ascending: false })
    .limit(15);

  if (error) {
    console.error("Failed to load trades:", error);
    return [];
  }

  return (data ?? [])
    .filter((row) => row.action)
    .map((row) => ({
      price: Number(row.price),
      at: row.at,
      username: row.username || "Someone",
      action: row.action,
      qty: Number(row.qty ?? 0)
    }));
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


export async function redeemSharesForCoin() {
  const { data, error } = await supabase.rpc("redeem_shares_for_coin");
  if (error) return { error: friendly(error) };
  return { data };
}


function friendly(error) {
  const message = String(error?.message ?? "");
  const code = (message.match(
    /(too_fast|not_enough_money|not_enough_shares|not_enough_shares_for_coin|holding_cap|invalid_qty|not_authenticated|player_not_found)/
  ) ?? [])[1];

  const map = {
    too_fast: "Slow down — a few seconds between trades.",
    not_enough_money: "You don't have enough money.",
    not_enough_shares: "You don't have that many shares.",
    not_enough_shares_for_coin: "You need 10,000 shares to redeem a coin.",
    holding_cap: "You've hit the maximum share holding.",
    invalid_qty: "Enter between 1 and 100,000 shares.",
    market_floor: "The market is at its floor. Try a smaller sale.",
    market_ceiling: "The market is at its ceiling. Try a smaller buy.",
    not_authenticated: "Your session expired — refresh and try again.",
    player_not_found: "Your save could not be found."
  };

  return { code: code ?? "error", message: map[code] ?? "Something went wrong." };
}

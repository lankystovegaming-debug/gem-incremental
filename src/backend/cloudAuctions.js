import { supabase } from "./supabase.js";

// =========================================================
// MARKET — LISTINGS (buy now) + BUY ORDERS
//
// Listings: a player lists a lot (gems / relics / potions) at a
// fixed price. Anyone can buy it outright at that price; if nobody
// buys before the timer ends, the lot returns to the seller.
//
// Buy orders: a player posts "I'll pay $X for a <gem>" and the
// money is escrowed. Any seller who owns that gem can fulfil the
// order for the money. Cancelling refunds the buyer.
//
// Every mutation goes through a SECURITY DEFINER RPC that re-checks
// ownership, funds and timing. The `auctions` / `gem_orders` tables
// are a public read; only the writes go through RPCs.
// =========================================================


const CREATE_MESSAGES = {
  not_authenticated: "You need to be signed in to list items.",
  invalid_price: "Enter a price of at least $1.",
  too_many_listings: "You can have at most 3 listings at once — wait for some to close.",
  gem_unavailable: "One of those gems is locked or no longer in your inventory.",
  potion_unavailable: "You do not have that many of one of those potions.",
  empty_lot: "Add at least one item to the lot first.",
  lot_too_large: "A lot can hold at most 25 different items.",
  not_auctionable: "That item cannot be listed.",
  price_below_lot_minimum: "The listing price is below 25% of the lot's reference value."
};

const BUY_MESSAGES = {
  not_authenticated: "You need to be signed in to buy.",
  auction_not_found: "That listing no longer exists.",
  auction_closed: "That listing has already closed.",
  cannot_buy_own: "You cannot buy your own listing.",
  not_enough_money: "You cannot afford that."
};

const CANCEL_MESSAGES = {
  not_authenticated: "You need to be signed in.",
  auction_not_found: "That listing no longer exists.",
  not_your_auction: "That is not your listing.",
  auction_closed: "That listing has already closed.",
  has_bids: "That listing can no longer be cancelled."
};

const ORDER_MESSAGES = {
  not_authenticated: "You need to be signed in.",
  invalid_gem: "Choose a gem to order.",
  invalid_price: "Enter a price of at least $1.",
  too_many_orders: "You can have at most 10 open orders at once.",
  not_enough_money: "You cannot afford that order.",
  order_not_found: "That order no longer exists.",
  order_closed: "That order is no longer open.",
  cannot_fill_own: "You cannot fulfil your own order.",
  not_your_order: "That is not your order.",
  gem_unavailable: "You do not have an unlocked gem that matches that order.",
  order_price_out_of_range: "The offer must be between 25% and 400% of the gem's base value.",
  gem_catalog_unavailable: "That gem is not available in the current catalog."
};


function friendly(error, table) {
  const raw = String(error?.message ?? "");
  const code = Object.keys(table).find((key) => raw.includes(key));
  return { code: code ?? null, message: table[code] ?? "Something went wrong. Try again." };
}


// Settle expired listings (return unsold lots) before a read.
export async function settleDueAuctions() {
  const { error } = await supabase.rpc("settle_due_auctions");
  if (error) console.warn("settle_due_auctions failed:", error.message);
}

// Refund buy orders that have remained unfilled for three days. A scheduled
// database job performs this automatically; this call keeps the market fresh
// immediately when somebody opens it after a quiet period.
export async function settleDueMarketOrders() {
  const { error } = await supabase.rpc("expire_stale_gem_orders");
  if (error) console.warn("expire_stale_gem_orders failed:", error.message);
}


// ---------- LISTINGS ----------

export async function loadActiveAuctions() {
  const { data, error } = await supabase
    .from("auctions").select("*").eq("status", "active")
    .order("ends_at", { ascending: true }).limit(200);
  if (error) { console.error("Failed to load listings:", error); return []; }
  return Array.isArray(data) ? data : [];
}

export async function loadMyAuctions() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("auctions").select("*").eq("seller_id", user.id)
    .order("created_at", { ascending: false }).limit(100);
  if (error) { console.error("Failed to load your listings:", error); return []; }
  return Array.isArray(data) ? data : [];
}

// List a bundle at a fixed buy-now price. `items` is an array of
//   { type: "gem", id }  or  { type: "potion", consumableId, quantity }
export async function createAuctionLot(items, price, durationHours) {
  const payload = (Array.isArray(items) ? items : []).map((item) =>
    item.type === "potion"
      ? { type: "potion", consumable_id: item.consumableId, quantity: Number(item.quantity) }
      : { type: "gem", id: Number(item.id) }
  );
  const { data, error } = await supabase.rpc("create_auction_lot", {
    p_items: payload, p_start_price: Number(price), p_duration_hours: Number(durationHours)
  });
  if (error) return { error: friendly(error, CREATE_MESSAGES) };
  return { data: { auctionId: data } };
}

export async function buyAuction(auctionId) {
  const { data, error } = await supabase.rpc("buy_auction", { p_auction_id: Number(auctionId) });
  if (error) return { error: friendly(error, BUY_MESSAGES) };
  return { data: data ?? null };
}

export async function cancelAuction(auctionId) {
  const { data, error } = await supabase.rpc("cancel_auction", { p_auction_id: Number(auctionId) });
  if (error) return { error: friendly(error, CANCEL_MESSAGES) };
  return { data: data ?? null };
}


// ---------- BUY ORDERS ----------

export async function loadOpenOrders() {
  const { data, error } = await supabase
    .from("gem_orders").select("*").eq("status", "open")
    .order("price", { ascending: false }).limit(200);
  if (error) { console.error("Failed to load orders:", error); return []; }
  return Array.isArray(data) ? data : [];
}

export async function loadMyOrders() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("gem_orders").select("*").eq("buyer_id", user.id)
    .order("created_at", { ascending: false }).limit(100);
  if (error) { console.error("Failed to load your orders:", error); return []; }
  return Array.isArray(data) ? data : [];
}

export async function createGemOrder(gemName, price) {
  const { data, error } = await supabase.rpc("create_gem_order", {
    p_gem_name: String(gemName), p_price: Number(price)
  });
  if (error) return { error: friendly(error, ORDER_MESSAGES) };
  return { data: { orderId: data } };
}

export async function fulfillGemOrder(orderId, specimenId) {
  const { data, error } = await supabase.rpc("fulfill_gem_order", {
    p_order_id: Number(orderId), p_specimen_id: Number(specimenId)
  });
  if (error) return { error: friendly(error, ORDER_MESSAGES) };
  return { data: data ?? null };
}

export async function cancelGemOrder(orderId) {
  const { data, error } = await supabase.rpc("cancel_gem_order", { p_order_id: Number(orderId) });
  if (error) return { error: friendly(error, ORDER_MESSAGES) };
  return { data: data ?? null };
}

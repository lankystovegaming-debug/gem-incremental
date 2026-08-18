import { supabase } from "./supabase.js";

// =========================================================
// AUCTION HOUSE
//
// Players list an owned gem with a starting price; others bid.
// The gem and the escrowed money are held by the server (the
// gem is removed from the seller's inventory while listed, the
// bid is deducted the moment it is placed and refunded when a
// higher bid arrives). Nothing here trusts the client — every
// mutation goes through a SECURITY DEFINER RPC that re-checks
// ownership, funds and timing. The `auctions` / `auction_bids`
// tables are a public read, so listings load straight from the
// table; only the writes go through RPCs.
// =========================================================


const CREATE_MESSAGES = {
  not_authenticated: "You need to be signed in to list a gem.",
  invalid_price: "Enter a starting price of at least $1.",
  too_many_listings: "You already have 10 active listings — wait for some to close.",
  gem_unavailable: "That gem is locked or no longer in your inventory.",
  not_auctionable: "Relics cannot be auctioned."
};

const BID_MESSAGES = {
  not_authenticated: "You need to be signed in to bid.",
  auction_not_found: "That auction no longer exists.",
  auction_closed: "Bidding on that auction has ended.",
  cannot_bid_own: "You cannot bid on your own auction.",
  already_highest: "You are already the highest bidder.",
  bid_too_low: "Your bid is below the minimum.",
  not_enough_money: "You cannot afford that bid."
};

const CANCEL_MESSAGES = {
  not_authenticated: "You need to be signed in.",
  auction_not_found: "That auction no longer exists.",
  not_your_auction: "That is not your auction.",
  auction_closed: "That auction has already closed.",
  has_bids: "You cannot cancel an auction once it has bids."
};


function friendly(error, table) {
  const raw = String(error?.message ?? "");
  const code = Object.keys(table).find((key) => raw.includes(key));
  return { code: code ?? null, message: table[code] ?? "Something went wrong. Try again." };
}


// Settle any expired auctions before we read the board, so a
// just-ended listing shows as sold rather than lingering. Safe
// for anyone to call — it only touches auctions past their timer.
export async function settleDueAuctions() {
  const { error } = await supabase.rpc("settle_due_auctions");
  if (error) {
    // Non-fatal: a read still works, the board is just a touch stale.
    console.warn("settle_due_auctions failed:", error.message);
  }
}


// Active listings, soonest-ending first.
export async function loadActiveAuctions() {
  const { data, error } = await supabase
    .from("auctions")
    .select("*")
    .eq("status", "active")
    .order("ends_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("Failed to load auctions:", error);
    return [];
  }
  return Array.isArray(data) ? data : [];
}


// The signed-in player's own listings (any status), newest first.
export async function loadMyAuctions() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("auctions")
    .select("*")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Failed to load your auctions:", error);
    return [];
  }
  return Array.isArray(data) ? data : [];
}


// Recent bid history for one auction (for the detail view).
export async function loadBidsFor(auctionId) {
  const { data, error } = await supabase
    .from("auction_bids")
    .select("bidder_name, amount, created_at")
    .eq("auction_id", auctionId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("Failed to load bids:", error);
    return [];
  }
  return Array.isArray(data) ? data : [];
}


export async function createAuction(specimenId, startPrice, durationHours) {
  const { data, error } = await supabase.rpc("create_auction", {
    p_specimen_id: Number(specimenId),
    p_start_price: Number(startPrice),
    p_duration_hours: Number(durationHours)
  });

  if (error) return { error: friendly(error, CREATE_MESSAGES) };
  return { data: { auctionId: data } };
}


export async function placeBid(auctionId, amount) {
  const { data, error } = await supabase.rpc("place_bid", {
    p_auction_id: Number(auctionId),
    p_amount: Number(amount)
  });

  if (error) return { error: friendly(error, BID_MESSAGES) };
  return { data: data ?? null };
}


export async function cancelAuction(auctionId) {
  const { data, error } = await supabase.rpc("cancel_auction", {
    p_auction_id: Number(auctionId)
  });

  if (error) return { error: friendly(error, CANCEL_MESSAGES) };
  return { data: data ?? null };
}

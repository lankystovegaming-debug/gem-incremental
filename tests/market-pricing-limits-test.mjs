import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import consumables, { MARKET_REFERENCE_PRICES } from "../src/data/consumables.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260930094319_auction_market_redesign.sql");
const market = read("auctions/auctions.js");
const cloudMarket = read("src/backend/cloudAuctions.js");
const page = read("auctions/index.html");

const requiredReferences = {
  "lucky-potion-1": 100, "lucky-potion-2": 40000, "lucky-potion-3": 150000, "lucky-potion-4": 500000,
  "speed-potion-1": 100, "speed-potion-2": 40000, "speed-potion-3": 150000, "speed-potion-4": 500000,
  "fortune-potion-1": 100, "fortune-potion-2": 40000, "fortune-potion-3": 150000, "fortune-potion-4": 500000,
  "mass-potion-1": 100, "mass-potion-2": 40000, "mass-potion-3": 150000, "mass-potion-4": 500000,
  "legendary-potion": 3000000, "mythic-potion": 15000000, "relic-potion": 50000,
  "seismic-potion": 1750000, "unstable-core": 10000000, "deepcore-catalyst": 300000,
  "pressurized-catalyst": 2500000, "deepcore-crate": 3000000, "diver": 1000000,
  "tidal-rush": 1250000, "pressure": 12500000, "offering": 3000000,
  "treasure-tonic": 2500000, "supply-crate": 4000000, "abyssal-potion": 60000000,
  "pet-luck-treat": 500000, "enchanted-pet-toy": 2000000, "celestial-pet-charm": 7500000,
  "mythic-pet-whistle": 20000000, "plastic-bag": 0.10
};
for (const [id, value] of Object.entries(requiredReferences)) assert.equal(MARKET_REFERENCE_PRICES[id], value, id);
assert.ok(consumables.every((item) => Number.isFinite(item.marketReferencePrice)), "every current consumable is explicitly market-priced");
assert.equal(MARKET_REFERENCE_PRICES["money-up-potion"], 25000);
assert.equal(MARKET_REFERENCE_PRICES["money-up-potion-2"], 100000);

assert.doesNotMatch(page, /ordersTab|ordersSection/i);
assert.match(page, /Black Market/);
assert.doesNotMatch(market, /buyAuction|createGemOrder|fulfillGemOrder|loadOpenOrders/);
assert.doesNotMatch(cloudMarket, /buy_auction|create_gem_order|fulfill_gem_order/);
assert.match(migration, /where id = p_auction_id for update/);
assert.match(migration, /auction_bids_bidder_cooldown_idx/);
assert.match(migration, /least\(600, v_extension_seconds \+ 120\)/);
assert.match(migration, /revoke all on function public\.buy_auction/);
assert.match(migration, /revoke all on function public\.create_auction/);

const db = new PGlite();
await db.exec(`
  create schema auth;
  create role anon;
  create role authenticated;
  create role service_role;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create table public.players (
    id uuid primary key references auth.users(id), username text, money double precision not null default 0
  );
  create table public.inventory_gems (
    id bigint generated always as identity primary key, player_id uuid not null,
    gem_name text not null, rarity integer not null default 0, value double precision,
    final_weight numeric not null default 1, locked boolean not null default false,
    created_at timestamptz not null default now()
  );
  create table public.player_consumables (
    player_id uuid not null, consumable_id text not null, quantity integer not null,
    updated_at timestamptz not null default now(), primary key (player_id, consumable_id)
  );
  create table public.auctions (
    id bigint generated always as identity primary key,
    seller_id uuid not null, seller_name text, gem jsonb, gem_name text not null,
    rarity integer not null, start_price double precision not null,
    current_bid double precision, current_bidder_id uuid, current_bidder_name text,
    bid_count integer not null default 0, status text not null default 'active',
    ends_at timestamptz not null, created_at timestamptz not null default now(), settled_at timestamptz,
    lot jsonb, item_count integer not null default 1, fee_rate numeric, fee_amount numeric
  );
  create table public.auction_bids (
    id bigint generated always as identity primary key, auction_id bigint not null,
    bidder_id uuid not null, bidder_name text, amount double precision not null,
    created_at timestamptz not null default now()
  );
  create table public.auction_transactions (
    id bigint generated always as identity primary key, auction_id bigint,
    player_id uuid, event_type text not null, amount numeric,
    details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
  );
  create table public.market_fee_transactions (
    id bigint generated always as identity primary key, market_type text not null,
    reference_id bigint not null, player_id uuid, amount numeric not null,
    rate numeric not null, created_at timestamptz not null default now()
  );
  create table public.gem_orders (
    id bigint generated always as identity primary key, buyer_id uuid not null,
    buyer_name text, gem_name text not null, price double precision not null,
    status text not null default 'open', filled_by_id uuid, filled_by_name text,
    created_at timestamptz not null default now(), filled_at timestamptz,
    expired_at timestamptz, fee_rate numeric, fee_amount numeric not null default 0
  );

  create function public._auction_restore_gem(p_owner uuid, p_gem jsonb)
  returns void language plpgsql security definer set search_path = '' as $$
  begin
    insert into public.inventory_gems(player_id, gem_name, rarity, value, final_weight, locked)
    values (p_owner, p_gem->>'gem_name', coalesce((p_gem->>'rarity')::int, 0),
      (p_gem->>'value')::double precision, coalesce((p_gem->>'final_weight')::numeric, 1), false);
  end $$;
  create function public._auction_restore_lot(p_owner uuid, p_lot jsonb)
  returns void language plpgsql security definer set search_path = '' as $$
  declare v_item jsonb;
  begin
    for v_item in select * from jsonb_array_elements(coalesce(p_lot, '[]'::jsonb)) loop
      if v_item->>'type' = 'potion' then
        insert into public.player_consumables(player_id, consumable_id, quantity)
        values (p_owner, v_item->>'consumable_id', (v_item->>'quantity')::int)
        on conflict (player_id, consumable_id) do update
          set quantity = public.player_consumables.quantity + excluded.quantity;
      else
        perform public._auction_restore_gem(p_owner, v_item - 'type');
      end if;
    end loop;
  end $$;

  create function public.buy_auction(bigint) returns jsonb language sql as $$ select '{}'::jsonb $$;
  create function public.create_auction(bigint, double precision, integer) returns bigint language sql as $$ select 1::bigint $$;
  create function public.create_gem_order(text, double precision) returns bigint language sql as $$ select 1::bigint $$;
  create function public.fulfill_gem_order(bigint, bigint) returns jsonb language sql as $$ select '{}'::jsonb $$;
  create function public.cancel_gem_order(bigint) returns jsonb language sql as $$ select '{}'::jsonb $$;
  create function public.expire_stale_gem_orders() returns integer language sql as $$ select 0 $$;
  grant execute on function public.buy_auction(bigint) to authenticated;
  grant execute on function public.create_auction(bigint, double precision, integer) to authenticated;
  grant execute on function public.create_gem_order(text, double precision) to authenticated;
  grant execute on function public.fulfill_gem_order(bigint, bigint) to authenticated;
  grant execute on function public.cancel_gem_order(bigint) to authenticated;
  grant execute on function public.expire_stale_gem_orders() to authenticated;
`);

const ids = Array.from({ length: 11 }, (_, index) => `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`);
const [seller, ...bidders] = ids;
for (const [index, id] of ids.entries()) {
  await db.query("insert into auth.users(id) values ($1)", [id]);
  await db.query("insert into players(id, username, money) values ($1, $2, 1000000000)", [id, index ? `Bidder ${index}` : "Seller"]);
}
const asUser = (id) => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
const stock = (id, quantity) => db.query(`
  insert into player_consumables(player_id, consumable_id, quantity) values ($1, $2, $3)
  on conflict (player_id, consumable_id) do update set quantity = excluded.quantity
`, [seller, id, quantity]);
const createAuction = async (items, price, hours = 24) => {
  await asUser(seller);
  const result = await db.query("select public.create_auction_lot($1::jsonb, $2::double precision, $3) as id", [JSON.stringify(items), price, hours]);
  return Number(result.rows[0].id);
};
const bid = async (who, auctionId, amount) => {
  await asUser(who);
  return db.query("select public.place_bid($1, $2::double precision) as result", [auctionId, amount]);
};
const cancel = async (auctionId) => {
  await asUser(seller);
  return db.query("select public.cancel_auction($1)", [auctionId]);
};

// Legacy fixed-price inventory and order escrow are safely unwound.
await stock("lucky-potion-1", 0);
await db.query(`insert into auctions(seller_id,seller_name,lot,item_count,gem_name,rarity,start_price,ends_at)
  values ($1,'Seller','[{"type":"potion","consumable_id":"lucky-potion-1","quantity":1}]',1,'Bundle',0,999999,now()+interval '1 day')`, [seller]);
await db.query("update players set money = money - 1000 where id = $1", [bidders[0]]);
await db.query("insert into gem_orders(buyer_id,gem_name,price) values ($1,'Legacy Gem',1000)", [bidders[0]]);

await db.exec(migration);

assert.equal((await db.query("select status from auctions where id=1")).rows[0].status, "returned");
assert.equal(Number((await db.query("select quantity from player_consumables where player_id=$1 and consumable_id='lucky-potion-1'", [seller])).rows[0].quantity), 1);
assert.equal((await db.query("select status from gem_orders where id=1")).rows[0].status, "cancelled");
assert.equal(Number((await db.query("select money from players where id=$1", [bidders[0]])).rows[0].money), 1000000000);

// Starting bid boundaries are inclusive and R is snapshotted server-side.
await stock("lucky-potion-1", 10);
const sellerBeforeCancel = Number((await db.query("select money from players where id=$1", [seller])).rows[0].money);
const minAuction = await createAuction([{ type: "potion", consumable_id: "lucky-potion-1", quantity: 1 }], 50, 6);
let row = (await db.query("select lot_reference_value,listing_fee_amount,original_ends_at=ends_at as original from auctions where id=$1", [minAuction])).rows[0];
assert.equal(Number(row.lot_reference_value), 100);
assert.equal(Number(row.listing_fee_amount), 0.5);
assert.equal(row.original, true);
await cancel(minAuction);
assert.equal(Number((await db.query("select money from players where id=$1", [seller])).rows[0].money), sellerBeforeCancel - 0.5, "cancellation does not refund the listing fee");
assert.equal(Number((await db.query("select quantity from player_consumables where player_id=$1 and consumable_id='lucky-potion-1'", [seller])).rows[0].quantity), 10, "cancellation restores the lot");

await assert.rejects(createAuction([{ type: "potion", consumable_id: "lucky-potion-1", quantity: 1 }], 49.99), /start_bid_below_minimum/);
const maxAuction = await createAuction([{ type: "potion", consumable_id: "lucky-potion-1", quantity: 1 }], 1000);
await cancel(maxAuction);
await assert.rejects(createAuction([{ type: "potion", consumable_id: "lucky-potion-1", quantity: 1 }], 1000.01), /start_bid_above_maximum/);
await assert.rejects(createAuction([{ type: "potion", consumable_id: "lucky-potion-1", quantity: 1 }], 50, 1), /invalid_duration/);

// Mixed lots, stacked quantities and small/large reference values retain precision.
const gem = await db.query("insert into inventory_gems(player_id,gem_name,rarity,value) values ($1,'Mixed Gem',1000,1000) returning id", [seller]);
await stock("lucky-potion-1", 2);
const mixed = await createAuction([{ type: "gem", id: Number(gem.rows[0].id) }, { type: "potion", consumable_id: "lucky-potion-1", quantity: 2 }], 600);
row = (await db.query("select lot_reference_value,item_count,lot->1->>'quantity' as stacked_quantity from auctions where id=$1", [mixed])).rows[0];
assert.equal(Number(row.lot_reference_value), 1200);
assert.equal(Number(row.item_count), 3);
assert.equal(row.stacked_quantity, "2");
await cancel(mixed);

await stock("plastic-bag", 3);
const plastic = await createAuction([{ type: "potion", consumable_id: "plastic-bag", quantity: 3 }], 0.15);
row = (await db.query("select lot_reference_value,listing_fee_amount from auctions where id=$1", [plastic])).rows[0];
assert.equal(Number(row.lot_reference_value), 0.3);
assert.equal(Number(row.listing_fee_amount), 0.003);
await cancel(plastic);

await stock("abyssal-potion", 1);
const abyssal = await createAuction([{ type: "potion", consumable_id: "abyssal-potion", quantity: 1 }], 30000000);
assert.equal(Number((await db.query("select lot_reference_value from auctions where id=$1", [abyssal])).rows[0].lot_reference_value), 60000000);
await cancel(abyssal);

await stock("future-consumable", 2);
await assert.rejects(createAuction([{ type: "potion", consumable_id: "future-consumable", quantity: 1 }], 1), /consumable_not_market_priced/);
assert.equal(Number((await db.query("select quantity from player_consumables where player_id=$1 and consumable_id='future-consumable'", [seller])).rows[0].quantity), 2);

// Bid escrow, increment bounds, self/consecutive checks and per-auction cooldown.
await stock("lucky-potion-1", 3);
const auctionId = await createAuction([{ type: "potion", consumable_id: "lucky-potion-1", quantity: 1 }], 50, 6);
const originalEnd = (await db.query("select ends_at from auctions where id=$1", [auctionId])).rows[0].ends_at;
await assert.rejects(bid(seller, auctionId, 50), /cannot_bid_own/);
await assert.rejects(bid(bidders[0], auctionId, 49.99), /bid_too_low/);
await assert.rejects(bid(bidders[0], auctionId, 50.01), /bid_too_high/);
await bid(bidders[0], auctionId, 50);
assert.equal((await db.query("select ends_at from auctions where id=$1", [auctionId])).rows[0].ends_at.toISOString(), originalEnd.toISOString(), "more than two minutes does not extend");
await assert.rejects(bid(bidders[0], auctionId, 60), /consecutive_bid_not_allowed/);

const bidderOneAfterEscrow = Number((await db.query("select money from players where id=$1", [bidders[0]])).rows[0].money);
assert.equal(bidderOneAfterEscrow, 999999950);
await assert.rejects(bid(bidders[1], auctionId, 59.99), /bid_too_low/);
await assert.rejects(bid(bidders[1], auctionId, 2550.01), /bid_too_high/);
await bid(bidders[1], auctionId, 60);
assert.equal(Number((await db.query("select money from players where id=$1", [bidders[0]])).rows[0].money), 1000000000, "previous escrow is refunded in full");
await assert.rejects(bid(bidders[0], auctionId, 70), /bid_cooldown/);

const otherAuction = await createAuction([{ type: "potion", consumable_id: "lucky-potion-1", quantity: 1 }], 50, 6);
await bid(bidders[0], otherAuction, 50);
await db.query("update auction_bids set created_at=now()-interval '1 hour' where auction_id=$1 and bidder_id=$2", [auctionId, bidders[0]]);
await bid(bidders[0], auctionId, 70);

await bid(bidders[2], auctionId, 2570); // exactly +25R
await assert.rejects(bid(bidders[3], auctionId, 5070.01), /bid_too_high/);

// Only valid bids extend, each by two minutes, capped at +10 minutes.
let current = 2570;
for (let index = 3; index <= 8; index += 1) {
  const before = await db.query("select anti_snipe_extension_seconds from auctions where id=$1", [auctionId]);
  const extension = Number(before.rows[0].anti_snipe_extension_seconds);
  await db.query(`update auctions set original_ends_at=now()+interval '2 minutes'-make_interval(secs=>$2), ends_at=now()+interval '2 minutes' where id=$1`, [auctionId, extension]);
  if (index === 3) {
    const moneyBefore = Number((await db.query("select money from players where id=$1", [bidders[index]])).rows[0].money);
    await assert.rejects(bid(bidders[index], auctionId, current + 9.99), /bid_too_low/);
    assert.equal(Number((await db.query("select money from players where id=$1", [bidders[index]])).rows[0].money), moneyBefore);
    assert.equal(Number((await db.query("select anti_snipe_extension_seconds from auctions where id=$1", [auctionId])).rows[0].anti_snipe_extension_seconds), extension);
  }
  current += 10;
  await bid(bidders[index], auctionId, current);
}
assert.equal(Number((await db.query("select anti_snipe_extension_seconds from auctions where id=$1", [auctionId])).rows[0].anti_snipe_extension_seconds), 600);

await asUser(seller);
await assert.rejects(db.query("select public.cancel_auction($1)", [auctionId]), /has_bids/);

// Settlement is idempotent: winner gets the lot, seller gets P minus tax, no winner surcharge.
const sellerBefore = Number((await db.query("select money from players where id=$1", [seller])).rows[0].money);
const winner = bidders[8];
const winnerBefore = Number((await db.query("select money from players where id=$1", [winner])).rows[0].money);
await db.query("update auctions set ends_at=now()-interval '1 second' where id=$1", [auctionId]);
await asUser(bidders[9]);
assert.equal(Number((await db.query("select public.settle_due_auctions() as count")).rows[0].count), 1);
assert.equal(Number((await db.query("select public.settle_due_auctions() as count")).rows[0].count), 0);
const sold = (await db.query("select status,fee_amount,current_bid from auctions where id=$1", [auctionId])).rows[0];
const expectedTax = Number((await db.query("select public._auction_seller_tax($1,100) as tax", [current])).rows[0].tax);
assert.equal(sold.status, "sold");
assert.equal(Number(sold.fee_amount), expectedTax);
assert.equal(Number((await db.query("select money from players where id=$1", [seller])).rows[0].money), sellerBefore + current - expectedTax);
assert.equal(Number((await db.query("select money from players where id=$1", [winner])).rows[0].money), winnerBefore, "settlement charges no bidder tax");
assert.equal(Number((await db.query("select quantity from player_consumables where player_id=$1 and consumable_id='lucky-potion-1'", [winner])).rows[0].quantity), 1);

// No-bid expiry restores the lot and never refunds its listing fee.
const sellerMoneyBeforeNoBid = Number((await db.query("select money from players where id=$1", [seller])).rows[0].money);
const noBid = await createAuction([{ type: "potion", consumable_id: "lucky-potion-1", quantity: 1 }], 50, 6);
const sellerMoneyAfterFee = Number((await db.query("select money from players where id=$1", [seller])).rows[0].money);
assert.equal(sellerMoneyAfterFee, sellerMoneyBeforeNoBid - 0.5);
await db.query("update auctions set ends_at=now()-interval '1 second' where id=$1", [noBid]);
await asUser(bidders[9]);
await db.query("select public.settle_due_auctions()");
assert.equal((await db.query("select status from auctions where id=$1", [noBid])).rows[0].status, "returned");
assert.equal(Number((await db.query("select money from players where id=$1", [seller])).rows[0].money), sellerMoneyAfterFee);

// Exact SQL boundaries for every progressive tax bracket and every listing duration.
for (const [hours, rate] of [[6, .005], [12, .0075], [24, .01], [48, .015], [72, .02]]) {
  assert.equal(Number((await db.query("select public._auction_listing_fee_rate($1) as rate", [hours])).rows[0].rate), rate);
}
for (const multiplier of [2, 5, 10, 25, 50]) {
  const at = Number((await db.query("select public._auction_seller_tax($1,100) as tax", [multiplier * 100])).rows[0].tax);
  const above = Number((await db.query("select public._auction_seller_tax($1,100) as tax", [multiplier * 100 + 0.01])).rows[0].tax);
  assert.ok(above > at && above - at < 0.002, `continuous marginal tax at ${multiplier}R`);
}

assert.equal((await db.query("select has_function_privilege('authenticated','public.buy_auction(bigint)','execute') as allowed")).rows[0].allowed, false);
assert.equal((await db.query("select has_function_privilege('authenticated','public.create_auction(bigint,double precision,integer)','execute') as allowed")).rows[0].allowed, false);
assert.equal((await db.query("select has_function_privilege('authenticated','public.create_gem_order(text,double precision)','execute') as allowed")).rows[0].allowed, false);

await db.close();
console.log("Auction reference, bidding, cooldown, escrow, anti-snipe, cancellation, settlement and compatibility checks passed.");

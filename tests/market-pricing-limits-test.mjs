import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import consumables, { MARKET_REFERENCE_PRICES, getConsumableById } from "../src/data/consumables.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260920021545_enforce_market_reference_value_caps.sql");
const market = read("auctions/auctions.js");
const cloudMarket = read("src/backend/cloudAuctions.js");
const page = read("auctions/index.html");

const expectedReferences = {
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

assert.deepEqual(MARKET_REFERENCE_PRICES, expectedReferences);
assert.equal(Object.keys(MARKET_REFERENCE_PRICES).length, 36);
assert.equal(consumables.length, 36);
assert.ok(consumables.every((item) => item.marketReferencePrice === expectedReferences[item.id]));
assert.equal(getConsumableById("plastic-bag").marketReferencePrice, 0.10);
assert.equal(getConsumableById("abyssal-potion").marketReferencePrice, 60000000);

for (const [id, value] of Object.entries(expectedReferences)) {
  assert.match(migration, new RegExp(`when '${id}' then ${String(value).replace(".", "\\.")}`));
}
assert.match(migration, /else null/);
assert.match(migration, /v_consumable_value \* v_qty/);
assert.match(migration, /coalesce\(v_gem\.value, 0\)::numeric/);
assert.match(migration, /v_maximum_price := floor\(v_reference_value \* 100\)/);
assert.match(migration, /consumable_not_market_priced/);
assert.match(migration, /price_above_lot_maximum/);
assert.match(market, /Allowed listing:.*25%–100× this lot's reference value/);
assert.match(market, /price < listingRange\.minimum \|\| price > listingRange\.maximum/);
assert.match(cloudMarket, /price_above_lot_maximum: "The listing price is above 100×/);
assert.match(page, /id="sellPriceMinimum"/);

const db = new PGlite();
await db.exec(`
  create schema auth;
  create role anon;
  create role authenticated;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table public.players (
    id uuid primary key,
    username text,
    money double precision not null default 0
  );
  create table public.inventory_gems (
    id bigint generated always as identity primary key,
    player_id uuid not null,
    gem_name text not null,
    rarity integer not null default 0,
    base_weight numeric not null default 1,
    final_weight numeric not null default 1,
    value double precision,
    locked boolean not null default false,
    created_at timestamptz not null default now()
  );
  create table public.player_consumables (
    player_id uuid not null,
    consumable_id text not null,
    quantity integer not null,
    updated_at timestamptz not null default now(),
    primary key (player_id, consumable_id)
  );
  create table public.auctions (
    id bigint generated always as identity primary key,
    seller_id uuid not null,
    seller_name text,
    gem jsonb,
    lot jsonb,
    item_count integer,
    gem_name text,
    rarity integer,
    start_price double precision not null,
    ends_at timestamptz not null,
    status text not null default 'active',
    created_at timestamptz not null default now()
  );
`);

const uid = "00000000-0000-0000-0000-000000000001";
await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
await db.query("insert into players(id, username) values ($1, 'Market Tester')", [uid]);
await db.query("insert into auctions(seller_id, seller_name, lot, item_count, gem_name, rarity, start_price, ends_at) values ($1, 'Market Tester', '[]', 1, 'Legacy', 1, 999999999, now() + interval '1 day')", [uid]);
await db.exec(migration);

const existing = await db.query("select start_price, status from auctions where gem_name = 'Legacy'");
assert.deepEqual(existing.rows, [{ start_price: 999999999, status: "active" }], "existing listings remain untouched");
await db.query("delete from auctions where seller_id = $1", [uid]);

const stock = async (id, quantity) => db.query(`
  insert into player_consumables(player_id, consumable_id, quantity)
  values ($1, $2, $3)
  on conflict (player_id, consumable_id) do update set quantity = excluded.quantity
`, [uid, id, quantity]);
const list = (items, price) => db.query(
  "select public.create_auction_lot($1::jsonb, $2::double precision, 24) as id",
  [JSON.stringify(items), price]
);
const clearListings = () => db.query("delete from auctions where seller_id = $1", [uid]);

await stock("lucky-potion-1", 1);
await list([{ type: "potion", consumable_id: "lucky-potion-1", quantity: 1 }], 25);
await clearListings();

await stock("lucky-potion-1", 1);
await assert.rejects(
  list([{ type: "potion", consumable_id: "lucky-potion-1", quantity: 1 }], 24.99),
  /price_below_lot_minimum/
);

await stock("lucky-potion-1", 1);
await list([{ type: "potion", consumable_id: "lucky-potion-1", quantity: 1 }], 10000);
await clearListings();

await stock("lucky-potion-1", 1);
await assert.rejects(
  list([{ type: "potion", consumable_id: "lucky-potion-1", quantity: 1 }], 10000.01),
  /price_above_lot_maximum/
);

const gem = await db.query("insert into inventory_gems(player_id, gem_name, rarity, value) values ($1, 'Mixed Gem', 1000, 1000) returning id", [uid]);
await stock("lucky-potion-1", 2);
await list([
  { type: "gem", id: Number(gem.rows[0].id) },
  { type: "potion", consumable_id: "lucky-potion-1", quantity: 2 }
], 300);
await clearListings();

await stock("mythic-potion", 3);
await list([{ type: "potion", consumable_id: "mythic-potion", quantity: 3 }], 4500000000);
const stacked = await db.query("select item_count, lot->0->>'quantity' as quantity from auctions");
assert.equal(stacked.rows[0].item_count, 3);
assert.equal(stacked.rows[0].quantity, "3");
await clearListings();

await stock("plastic-bag", 3);
await list([{ type: "potion", consumable_id: "plastic-bag", quantity: 3 }], 30);
await clearListings();
await stock("plastic-bag", 3);
await assert.rejects(
  list([{ type: "potion", consumable_id: "plastic-bag", quantity: 3 }], 30.01),
  /price_above_lot_maximum:30/
);

await stock("abyssal-potion", 1);
await list([{ type: "potion", consumable_id: "abyssal-potion", quantity: 1 }], 6000000000);
await clearListings();
await stock("abyssal-potion", 1);
await assert.rejects(
  list([{ type: "potion", consumable_id: "abyssal-potion", quantity: 1 }], 6000000000.01),
  /price_above_lot_maximum/
);

await stock("future-consumable", 2);
await assert.rejects(
  list([{ type: "potion", consumable_id: "future-consumable", quantity: 1 }], 1),
  /consumable_not_market_priced/
);
const unknownStock = await db.query("select quantity from player_consumables where player_id = $1 and consumable_id = 'future-consumable'", [uid]);
assert.equal(Number(unknownStock.rows[0].quantity), 2, "rejected unknown consumables stay in inventory");

await stock("lucky-potion-1", 1);
await list([{
  type: "potion",
  consumable_id: "lucky-potion-1",
  quantity: 1,
  reference_value: 999999999999
}], 25);

await db.close();
console.log("Market reference values, server boundaries, precision, stacking and compatibility checks passed.");

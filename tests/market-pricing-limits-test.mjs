import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import consumables, { getConsumableById } from "../src/data/consumables.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260831140308_enforce_market_pricing_limits.sql");
const market = read("auctions/auctions.js");
const page = read("auctions/index.html");

assert.match(migration, /v_reference_value := v_reference_value \+ greatest\(0, coalesce\(v_gem\.value, 0\)\)/);
assert.match(migration, /_market_consumable_shop_value\(v_cid\) \* v_qty/);
assert.match(migration, /v_minimum_price := greatest\(1, ceil\(v_reference_value \* 0\.25\)\)/);
assert.match(migration, /if p_start_price < v_minimum_price then raise exception 'price_below_lot_minimum/);
assert.match(migration, /coalesce\(g\.base_weight, 0\) \* coalesce\(g\.value_per_gram, 0\)/);
assert.match(migration, /v_minimum_price := ceil\(v_base_value \* 0\.25\)/);
assert.match(migration, /v_maximum_price := floor\(v_base_value \* 4\)/);
assert.match(migration, /public\.player_market_fee_rate\(v_uid, public\._market_order_fee_rate\(p_price\)\)/);

assert.equal(getConsumableById("lucky-potion-1").marketReferencePrice, 200);
assert.equal(getConsumableById("mass-potion-3").marketReferencePrice, 250000);
assert.equal(getConsumableById("mythic-potion").marketReferencePrice, 0);
assert.ok(consumables.every((item) => Number.isFinite(item.marketReferencePrice)));

assert.match(market, /Allowed offer:.*25%–400% of base value/);
assert.match(market, /Minimum allowed:.*25% of this lot's reference value/);
assert.match(market, /price < range\.minimum \|\| price > range\.maximum/);
assert.match(market, /price < minimumPrice/);
assert.match(page, /id="orderPriceRange"/);
assert.match(page, /id="sellPriceMinimum"/);

console.log("Market pricing limit checks passed.");

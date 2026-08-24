import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260824043835_add_market_fees.sql");
const market = read("auctions/auctions.js");
const page = read("auctions/index.html");
const admin = read("admin/admin.js");
const adminFunction = read("supabase/functions/admin/index.ts");

assert.match(migration, /least\(\s*0\.05::numeric/);
assert.match(migration, /0\.005::numeric \+ public\._market_price_surcharge/);
assert.match(migration, /when p_price < 100000 then 0\.01/);
assert.match(migration, /set money = money \+ v_seller_proceeds/);
assert.match(migration, /set money = money - v_total/);
assert.match(migration, /insert into public\.market_fee_transactions/);
assert.match(migration, /create or replace function public\.admin_market_fee_summary/);
assert.match(migration, /grant execute on function public\.admin_market_fee_summary\(\) to service_role/);

assert.match(market, /function saleFeeRate/);
assert.match(market, /function orderFeeRate/);
assert.match(market, /The order fee is not refunded/);
assert.match(market, /Fee if sold:/);
assert.match(page, /value="72">72 hours/);
assert.match(page, /id="orderFeePreview"/);
assert.match(page, /id="sellFeePreview"/);
assert.match(admin, /Market fees removed/);
assert.match(admin, /market_fee_analytics/);
assert.match(adminFunction, /action === "market_fee_analytics"/);

console.log("Progressive Market fee checks passed.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { feeAmount, orderFeeRate, saleFeeRate } from "../auctions/market-fees.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260824043835_add_market_fees.sql");
const rebalance = read("supabase/migrations/20260830120000_rebalance_market_fees.sql");
const orderMigration = read("supabase/migrations/20260820000001_auction_buynow_and_orders.sql");
const activeMarketFunctions = read("supabase/migrations/20260829034841_normal_abandoned_mine_v1_rebalance.sql");
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

const listingRates = new Map([
  [1, 0.025],
  [6, 0.035],
  [12, 0.045],
  [24, 0.06],
  [48, 0.08],
  [72, 0.10]
]);

for (const [hours, rate] of listingRates) {
  assert.equal(saleFeeRate(12345.67, hours), rate, `${hours}h listing rate`);
  assert.equal(feeAmount(12345.67, rate), Math.round(12345.67 * rate * 100) / 100, `${hours}h exact fee`);
  assert.match(rebalance, new RegExp(`when ${hours} then ${String(rate).replace(/^0\./, "0\\.")}`));
}

for (const price of [1, 99999, 1000000, 1000000000]) {
  assert.equal(orderFeeRate(price), 0.05, `fixed order rate at ${price}`);
  assert.equal(feeAmount(price, orderFeeRate(price)), Math.round(price * 0.05 * 100) / 100, `exact order fee at ${price}`);
}

assert.match(rebalance, /check \(rate >= 0 and rate <= 0\.10\)/);
assert.match(rebalance, /select 0\.05::numeric/);
assert.match(market, /import \{ saleFeeRate, orderFeeRate, feeAmount \} from "\.\/market-fees\.js"/);
assert.match(market, /The order fee is not refunded/);
assert.match(market, /Fee if sold:/);
assert.match(page, /value="72">72 hours/);
assert.match(page, /id="orderFeePreview"/);
assert.match(page, /id="sellFeePreview"/);
assert.match(admin, /Market fees removed/);
assert.match(admin, /market_fee_analytics/);
assert.match(adminFunction, /action === "market_fee_analytics"/);
assert.ok(
  adminFunction.indexOf('action === "market_fee_analytics"') < adminFunction.indexOf("if (!validUuid(targetId))"),
  "global fee analytics must run before player target validation"
);

const buyAuction = activeMarketFunctions.match(/create or replace function public\.buy_auction[\s\S]*?end \$\$/)?.[0] ?? "";
assert.match(buyAuction, /set money=money-v_price where id=v_uid/);
assert.doesNotMatch(buyAuction, /set money = money - \(v_price \+ v_fee/);
assert.match(buyAuction, /set money=money\+v_seller_proceeds where id=v_a\.seller_id/);
assert.match(buyAuction, /values\('listing',p_auction_id,v_a\.seller_id,v_fee,v_fee_rate\)/);

const fulfillOrder = orderMigration.match(/create or replace function public\.fulfill_gem_order[\s\S]*?end; \$function\$/)?.[0] ?? "";
assert.match(fulfillOrder, /set money = money \+ v_o\.price where id = v_uid/);
assert.doesNotMatch(fulfillOrder, /fee|market_fee_transactions/);

const createOrder = activeMarketFunctions.match(/create or replace function public\.create_gem_order[\s\S]*?end \$\$/)?.[0] ?? "";
assert.match(createOrder, /v_total:=p_price\+v_fee::double precision/);
assert.match(createOrder, /set money=money-v_total where id=v_uid/);
assert.match(createOrder, /values\('order',v_order_id,v_uid,v_fee,v_fee_rate\)/);

console.log("Market fee checks passed.");

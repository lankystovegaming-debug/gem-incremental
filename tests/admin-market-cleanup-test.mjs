import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const admin = read("admin/admin.js");
const adminCss = read("admin/admin.css");
const market = read("src/backend/cloudAuctions.js");
const marketUi = read("auctions/auctions.js");
const migration = read("supabase/migrations/20260824041630_expire_stale_market_orders.sql");
const redesign = read("supabase/migrations/20260930094319_auction_market_redesign.sql");

assert.match(admin, /<details class="admin-event-archive">/);
assert.match(admin, /Past events/);
assert.match(adminCss, /max-height:\s*520px/);

assert.doesNotMatch(market, /expire_stale_gem_orders|create_gem_order|buy_auction/);
assert.doesNotMatch(marketUi, /Expired — refunded|buy order/i);
assert.match(redesign, /select \* from public\.gem_orders where status = 'open' for update/);
assert.match(redesign, /set status = 'cancelled'/);
assert.match(redesign, /revoke all on function public\.expire_stale_gem_orders\(\)/);
assert.match(migration, /created_at <= now\(\) - interval '3 days'/);
assert.match(migration, /set money = money \+ v_order\.price/);
assert.match(migration, /set status = 'expired', expired_at = now\(\)/);
assert.match(migration, /cron\.schedule\(/);
assert.match(migration, /'7 \* \* \* \*'/);

console.log("Admin event archive and stale market order cleanup tests passed.");

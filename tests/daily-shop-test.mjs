import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260819000002_daily_rotating_shop.sql", import.meta.url), "utf8");
const rebalance = await readFile(new URL("../supabase/migrations/20260820000002_shop_masterwork_price_rebalance.sql", import.meta.url), "utf8");

assert.match(migration, /'special-mythic','specialist','Mythic Potion'.*10000000/);
assert.match(migration, /'rare-mythic','rare','Mythic Potion'.*30000000/);
assert.match(migration, /slot between 1 and 6/);
assert.match(migration, /daily_shop_already_refreshed/);
assert.match(migration, /money=money-2000000/);
assert.match(rebalance, /when 'mixed-forge-pack' then 2100000/);
assert.match(rebalance, /when 'rare-mythic' then 15000000/);
assert.match(rebalance, /when 'rare-mythic-2' then 28000000/);
assert.match(rebalance, /when 'perfect-forge-cache' then 14000000/);
assert.match(rebalance, /array\[1000000,2500000,6000000,15000000,25000000\]/);

console.log("Daily Shop tests passed.");

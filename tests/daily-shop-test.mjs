import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260819000002_daily_rotating_shop.sql", import.meta.url), "utf8");
const tier4Migration = await readFile(new URL("../supabase/migrations/20260905130000_daily_shop_tier4_potions.sql", import.meta.url), "utf8");
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
for (const potionId of ["lucky-potion-4", "speed-potion-4", "fortune-potion-4", "mass-potion-4"]) {
	assert.match(tier4Migration, new RegExp(`'rare-[^']+','rare'.*"id":"${potionId}"`));
}
assert.match(tier4Migration, /'rare-elite-pack'.*"id":"lucky-potion-3".*"id":"mass-potion-3"/);
assert.match(tier4Migration, /'rare-supreme-pack'.*"id":"lucky-potion-4".*"id":"mass-potion-4"/);
assert.match(tier4Migration, /'rare-turbo-pack'.*"id":"speed-potion-4".*"id":"speed-potion-3"/);
assert.equal((tier4Migration.match(/'rare-(?:elite|supreme|turbo)-pack'/g) ?? []).length, 3);

console.log("Daily Shop tests passed.");

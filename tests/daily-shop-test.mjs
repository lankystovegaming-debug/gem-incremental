import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260819000002_daily_rotating_shop.sql", import.meta.url), "utf8");

assert.match(migration, /'special-mythic','specialist','Mythic Potion'.*10000000/);
assert.match(migration, /'rare-mythic','rare','Mythic Potion'.*30000000/);
assert.match(migration, /slot between 1 and 6/);
assert.match(migration, /daily_shop_already_refreshed/);
assert.match(migration, /money=money-2000000/);

console.log("Daily Shop tests passed.");

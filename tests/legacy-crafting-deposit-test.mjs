import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manualDeposit = read("supabase/functions/manual-deposit/index.ts");
const migration = read("supabase/migrations/20260830010000_backfill_inventory_gem_lock_state.sql");

assert.match(manualDeposit, /\.or\(\s*"locked\.eq\.false,locked\.is\.null"\s*\)/);
assert.doesNotMatch(manualDeposit, /\.eq\(\s*"locked",\s*false\s*\)/);
assert.match(migration, /update public\.inventory_gems[\s\S]*set locked = false[\s\S]*where locked is null/i);
assert.match(migration, /alter column locked set default false/i);
assert.match(migration, /alter column locked set not null/i);

console.log("Legacy crafting deposit compatibility checks passed.");

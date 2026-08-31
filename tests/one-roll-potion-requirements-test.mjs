import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20260831024407_enforce_one_roll_potion_roll_requirements.sql", import.meta.url),
  "utf8"
);
const client = await readFile(
  new URL("../src/backend/cloudConsumables.js", import.meta.url),
  "utf8"
);

assert.match(migration, /when 'legendary-potion' then\s+v_effect := 1000;\s+v_required_rolls := 1000;/);
assert.match(migration, /when 'mythic-potion' then\s+v_effect := 10000;\s+v_required_rolls := 2500;/);
assert.match(migration, /select total_rolls\s+into v_total_rolls\s+from public\.players[\s\S]*for update/);
assert.match(migration, /if coalesce\(v_total_rolls, 0\) < v_required_rolls then\s+raise exception 'lifetime_rolls_required:%', v_required_rolls/);

const requirementCheck = migration.indexOf("if coalesce(v_total_rolls, 0) < v_required_rolls");
const inventoryUpdate = migration.indexOf("update public.player_consumables");
assert.ok(requirementCheck >= 0 && requirementCheck < inventoryUpdate, "roll gate must run before consuming inventory");

assert.match(client, /lifetime_rolls_required:\(\\d\+\)/);
assert.match(client, /You need \$\{Number\(rollRequirement\)\.toLocaleString\(\)\} lifetime rolls to use this potion/);

console.log("One-roll potion requirement checks passed.");

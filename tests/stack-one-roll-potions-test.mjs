import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20260831022012_repair_stack_one_roll_potion_charges.sql", import.meta.url),
  "utf8"
);
const roll = await readFile(
  new URL("../supabase/functions/roll/index.ts", import.meta.url),
  "utf8"
);
const cloud = await readFile(
  new URL("../src/backend/cloudConsumables.js", import.meta.url),
  "utf8"
);
const inventory = await readFile(
  new URL("../inventory/inventory.js", import.meta.url),
  "utf8"
);

// Schema: a charges counter drives how many rolls a stacked boost covers.
assert.match(migration, /add column if not exists charges integer not null default 1/);
assert.match(migration, /check \(charges > 0\)/);

// Drinking the same one-roll potion accumulates charges instead of blocking.
assert.match(migration, /on conflict \(player_id\) do update/);
assert.match(migration, /set charges = public\.player_one_roll_boosts\.charges \+ 1/);
// A different one-roll potion still must be spent first.
assert.match(migration, /if found and v_existing_id is distinct from p_consumable_id then/);
assert.match(migration, /raise exception 'one_roll_boost_already_active'/);
assert.match(migration, /'charges', v_charges/);

// spend_one_roll_charge removes a single charge and deletes the row at zero,
// and only the service role (the roll edge function) may call it.
assert.match(migration, /create or replace function public\.spend_one_roll_charge\(p_player_id uuid\)/);
assert.match(migration, /set charges = charges - 1/);
assert.match(migration, /select charges\s+into v_charges\s+from public\.player_one_roll_boosts[\s\S]*for update/);
assert.match(migration, /if v_charges <= 1 then\s+delete from public\.player_one_roll_boosts/);
assert.doesNotMatch(migration, /update public\.player_one_roll_boosts\s+set charges = charges - 1[\s\S]*if v_charges <= 0/);
assert.match(migration, /grant execute on function public\.spend_one_roll_charge\(uuid\) to service_role/);
assert.match(migration, /revoke execute on function public\.activate_one_roll_potion\(text\) from public, anon/);
assert.match(migration, /revoke execute on function public\.spend_one_roll_charge\(uuid\) from public, anon, authenticated/);

// The roll edge function spends one charge (not a blanket delete) after commit.
assert.match(roll, /"spend_one_roll_charge"/);
assert.doesNotMatch(roll, /"player_one_roll_boosts"\s*\)\s*\.delete\(\)/);
assert.match(roll, /"effect_value, consumable_id, charges"/);
assert.match(roll, /remainingOneRollCharges/);

// Client reads the charge count so the UI can show remaining charges.
assert.match(cloud, /consumable_id, effect_value, charges, activated_at/);

// Inventory stacks the same potion and surfaces the charge count.
assert.match(inventory, /sameTypePending/);
assert.match(inventory, /pendingCharges/);
assert.match(inventory, /charges: Number\(boost\.charges \?\? 1\)/);

console.log("Stack one-roll potions tests passed.");

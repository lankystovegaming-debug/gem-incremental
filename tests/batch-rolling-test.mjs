import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BATCH_ROLL_OPTIONS,
  batchCooldown,
  batchRollResults,
  isBatchSizeUnlocked,
  normalizeUiBatchSize
} from "../src/logic/batchRolling.js";
import { PICKAXE_STATS } from "../supabase/functions/roll/equipmentRules.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const edge = read("../supabase/functions/roll/index.ts");
const migration = read("../supabase/migrations/20260913033312_batch_rolling_and_all_in_balance.sql");
const settings = read("../src/ui/settings.js");
const main = read("../main.js");

assert.deepEqual(BATCH_ROLL_OPTIONS.map((option) => option.baseCooldownSeconds), [2.5, 5, 7.5, 10]);
assert.equal(normalizeUiBatchSize(99), 1);
assert.equal(isBatchSizeUnlocked(1), true);
assert.equal(isBatchSizeUnlocked(2), true);
assert.equal(isBatchSizeUnlocked(3, { genuineRolls: 99_999 }), false);
assert.equal(isBatchSizeUnlocked(3, { genuineRolls: 100_000 }), true);
assert.equal(isBatchSizeUnlocked(4, { genuineRolls: 500_000 }), false);
assert.equal(isBatchSizeUnlocked(4, { genuineRolls: 500_000, hasCelestialPickaxe: true }), true);
assert.deepEqual(batchRollResults({ results: [{ id: 1 }, { id: 2 }] }).map((result) => result.id), [1, 2]);
assert.equal(batchCooldown({ results: [{ cooldown: { durationMs: 5000 } }] }).durationMs, 5000);

assert.equal(PICKAXE_STATS["all-in-pickaxe"][1], 0.25);
assert.match(migration, /roll_speed_bonus = -0\.75/);
assert.match(migration, /\{reward,bonus,rollSpeed\}.*-0\.75/s);
assert.match(migration, /p_batch_size = 3 and v_genuine_rolls >= 100000/);
assert.match(migration, /p_batch_size = 4 and v_genuine_rolls >= 500000 and v_has_celestial/);
assert.match(migration, /equipment_id = 'celestial-pickaxe'/);
assert.match(migration, /revoke all on function public\.claim_equipment_roll_batch/);

assert.match(edge, /batchCooldownMs\(singleCooldownMs, batchExecution\.batchSize\)/);
assert.match(edge, /export function batchCooldownMs\(/);
assert.match(edge, /size >= 1 && size <= 4/);
assert.match(edge, /for \(let batchIndex = 0; batchIndex < batchSize; batchIndex \+= 1\)/);
assert.match(edge, /genuineRoll: Number\(batchExecution\.firstGenuineRoll\) \+ batchIndex/);
assert.match(edge, /batchExecution\.requestStartedAt/);
assert.match(edge, /roll_prepare_context/);
assert.match(edge, /const activeBoosts = batchExecution\.activeBoosts[\s\S]*rollContext\.activeBoosts/);
assert.match(edge, /if \(batchExecution\.batchSize > 1\) await backgroundPostCommitPromise/);
assert.match(edge, /claim_equipment_roll_batch/);
assert.match(edge, /finally \{[\s\S]*release_server_roll/);
assert.match(settings, /batchSize: normalizeUiBatchSize/);
assert.match(main, /invokeFunction\("roll", \{ batchSize: getSettings\(\)\.batchSize \}\)/);
assert.match(main, /appendBatchResults\(results, outcomes\)/);
assert.match(main, /All \$\{results\.length\} batch results/);
assert.match(main, /Each card is a separate genuine roll/);

console.log("Batch rolling rules, sequential edge architecture, UI wiring and All-In balance checks passed.");

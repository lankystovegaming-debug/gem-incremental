import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const edge = read("../supabase/functions/roll/index.ts");
const migration = read("../supabase/migrations/20260921052803_phase5_roll_hot_path_optimization.sql");
const budget = read("../docs/phase5-roll-hot-path.md");

// The hot path must not regress to a standalone surge request.
assert.doesNotMatch(edge, /supabaseAdmin\.rpc\(\s*["']claim_guild_mythic_surge["']/);
assert.match(migration, /claim_equipment_roll_batch[\s\S]*claim_guild_mythic_surge/);
assert.match(migration, /roll_begin_batch_subroll[\s\S]*claim_guild_mythic_surge[\s\S]*roll_refresh_context/);
assert.match(migration, /for update[\s\S]*previous_subroll_not_committed/);

// The first full context is reused; later calls refresh every state family
// changed by a preceding roll and merge it into that snapshot.
assert.match(edge, /batchIndex === 0[\s\S]*roll_prepare_context[\s\S]*roll_begin_batch_subroll/);
assert.match(edge, /initialRollContext[\s\S]*result\.data\.context/);
for (const field of [
  "player", "inventoryCount", "activeAutoCraft", "equipment", "qol",
  "activeBoosts", "oneRollBoost", "ban"
]) assert.match(migration, new RegExp(`'${field}'`), `refresh includes ${field}`);

// Critical bookkeeping is folded into the successful commit. Batch background
// work is folded too; singles keep the existing waitUntil request.
assert.match(edge, /p_bookkeeping: bookkeepingPayload/);
assert.match(edge, /p_include_background: batchExecution\.batchSize > 1/);
assert.doesNotMatch(edge, /p_phase:\s*["']critical["']/);
assert.match(edge, /p_phase:\s*["']background["']/);
assert.match(edge, /registerRollWaitUntil/);
assert.match(migration, /roll_finish_bookkeeping\(p_player_id, 'critical', p_bookkeeping\)/);
assert.match(migration, /if coalesce\(p_include_background, false\)[\s\S]*'background'/);

// Small player writes are allowlisted inside the commit, not sent as direct
// table updates. Total-roll response numbering continues to use total_rolls.
assert.doesNotMatch(edge, /from\(["']players["']\)\s*\.update/);
assert.match(edge, /const rollNumber = Number\(player\.total_rolls/);
assert.match(migration, /p_player_patch \? 'rarity_resonance'/);
assert.match(migration, /p_player_patch \? 'misty_mutation_boost_rolls'/);

assert.match(budget, /Core total/);
assert.match(budget, /Before ×4/);
assert.match(budget, /41\.5 million requests\/week/);
assert.match(budget, /verify_jwt=false/);

console.log("Phase 5 consolidation, refresh coverage, single/batch split and request budget guards passed.");

import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20260901112819_stop_retroactive_secret_achievement_backfill.sql",
  "utf8",
);

assert.match(migration, /secret_roll_backfill_config set cutoff_id = 0/);
assert.match(migration, /delete from public\.secret_roll_backfill_state/);
assert.match(migration, /delete from public\.player_secret_roll_signatures/);
assert.match(migration, /delete from public\.player_secret_roll_progress/);
for (const name of [
  "Déjà Vu", "Perfect Copy", "Against All Odds", "Pure Fortune",
  "Mutation Overflow", "Heavyweight Champion", "Pocket Mineral",
  "Wrong Side Jackpot", "Perfect Timing", "Two Birds", "Secret Within Secret",
]) {
  assert.ok(migration.includes(`'${name}'`), `missing reset for ${name}`);
}
assert.match(migration, /and not progress\.reward_granted/g);
assert.match(migration, /current_value\s*=\s*0/);
assert.match(migration, /sum\(progress\.achievement_points_awarded\)/);
assert.doesNotMatch(migration, /delete from public\.best_roll_history/);

console.log("non-retroactive secret achievement checks passed");

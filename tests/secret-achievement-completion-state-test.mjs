import assert from "node:assert/strict";
import fs from "node:fs";

const migrationPath = "supabase/migrations/20260901110804_repair_secret_achievement_completion_state.sql";
const migration = fs.readFileSync(migrationPath, "utf8");

assert.match(migration, /conditionVersion'\s*=\s*'secret-achievements-v1'/);
assert.match(migration, /and not progress\.reward_granted/g);
assert.match(migration, /current_progress\s*=\s*0/);
assert.match(migration, /completed\s*=\s*false/);
assert.match(migration, /completed_at\s*=\s*null/);
assert.match(migration, /achievement_points_awarded\s*=\s*0/);
assert.match(migration, /sum\(progress\.achievement_points_awarded\)/);
assert.match(migration, /on conflict\(player_id\) do update set/);
assert.doesNotMatch(migration, /reward_granted\s*=\s*false/);

console.log("secret achievement completion state repair checks passed");

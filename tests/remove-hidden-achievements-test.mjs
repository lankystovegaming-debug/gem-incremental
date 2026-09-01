import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(
  "supabase/migrations/20260901130319_remove_hidden_achievements_until_event_tracking.sql",
  "utf8",
);

assert.match(sql, /delete from public\.private_feature_definitions[\s\S]*metadata->>'hidden'/);
assert.match(sql, /drop trigger if exists track_secret_roll_progress_v1_trg/);
assert.match(sql, /truncate table public\.player_secret_roll_signatures/);
assert.match(sql, /perform public\.refresh_player_achievements_v013_pre_secret_rework\(p_uid\)/);
assert.match(sql, /sum\(progress\.achievement_points_awarded\)/);
assert.match(sql, /revoke all on function public\.backfill_secret_roll_progress_v1/);
assert.doesNotMatch(sql, /insert into public\.private_feature_definitions/);
assert.doesNotMatch(sql, /delete from public\.best_roll_history/);
assert.doesNotMatch(sql, /delete from public\.inventory_gems/);

console.log("hidden achievement removal checks passed");

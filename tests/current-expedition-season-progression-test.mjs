import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260901063529_current_expedition_research_and_season_progress.sql");
const refreshRepair = read("supabase/migrations/20260905162052_restore_current_expedition_achievement_refresh.sql");
const roll = read("supabase/functions/roll/index.ts");

// Retired daily/weekly expedition effects are replaced with a bonus consumed
// by every live expedition funding path.
for (const retired of ["preparedReroll", "flexiblePlanning", "expeditionPermit", "preparedSelection"]) {
  assert.doesNotMatch(migration, new RegExp(`"flag":"${retired}"`));
}
assert.match(migration, /apply_expedition_research_discount/);
assert.match(migration, /select effects\.expedition_discount[\s\S]*from public\.player_research_effects effects/);
for (const fundingFunction of ["fund_abandoned_mine", "fund_abandoned_mine_hell", "fund_crystal_depth"]) {
  assert.match(
    migration,
    new RegExp(`create or replace function public\\.${fundingFunction}[\\s\\S]*?apply_expedition_research_discount`),
    `${fundingFunction} must apply the research discount`,
  );
}

// Research Points and achievements follow the two current expedition tables.
assert.match(migration, /research_points_current_mine_v014_trg[\s\S]*abandoned_mine_runs/);
assert.match(migration, /research_points_current_crystal_v014_trg[\s\S]*crystal_cavern_runs/);
assert.match(migration, /sync_current_expedition_achievements_v013/);
assert.match(migration, /from public\.abandoned_mine_runs r where r\.player_id=p_uid and r\.status='settled'/);
assert.match(migration, /from public\.crystal_cavern_runs r where r\.player_id=p_uid and r\.status='settled'/);
assert.doesNotMatch(migration, /player_expeditions/);
assert.match(refreshRepair, /refresh_player_achievements_v013_pre_secret_rework\(p_uid\);[\s\S]*sync_current_expedition_achievements_v013\(p_uid\);/);
assert.doesNotMatch(refreshRepair, /from public\.player_expeditions/i);
for (const [name, target] of [
  ["First Expedition", 1], ["Expedition Regular", 5], ["Expedition Veteran", 15],
  ["Expedition Master", 25], ["Depth Explorer", 10], ["Voidwalker", 1],
]) {
  assert.match(migration, new RegExp(`achievement_set_progress_v013\\(p_uid,'${name}',[^;]+,${target}\\)`));
}

// Season achievements use XP-unlocked tiers, not claimed reward keys.
assert.match(migration, /sync_season_tier_achievements_v013/);
assert.match(migration, /jsonb_array_elements\(coalesce\(season\.tiers,'\[\]'::jsonb\)\)/);
assert.match(migration, /progress\.xp>=coalesce\(\(tier\.value->>'xp'\)::numeric,0\)/);
assert.match(migration, /season_tier_achievements_v013_trg after insert or update of xp/);
for (const tier of [10, 25, 50]) {
  assert.match(migration, new RegExp(`achievement_set_progress_v013\\(p_uid,'Season Tier ${tier}',season_level,${tier}\\)`));
}

assert.match(migration, /revoke all on function public\.apply_expedition_research_discount/);
assert.match(migration, /to service_role/);
assert.match(roll, /Run independent post-commit systems concurrently/);
assert.match(roll, /await Promise\.all\(\[/);

console.log("Current expedition research and season achievement checks passed.");

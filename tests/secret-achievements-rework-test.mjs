import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260901074910_restore_server_authoritative_secret_achievements.sql");
const originalCatalog = read("supabase/migrations/20260826000002_achievement_catalog_v0130.sql");
const achievementUi = read("achievements/achievements.js");
const roll = read("supabase/functions/roll/index.ts");

const names = [
  "Déjà Vu", "Perfect Copy", "Against All Odds", "Pure Fortune",
  "Mutation Overflow", "Heavyweight Champion", "Pocket Mineral",
  "Wrong Side Jackpot", "Perfect Timing", "Museum Piece", "Difficult Choice",
  "Two Birds", "Milestone Cascade", "From Nothing", "Full Circle",
  "Chosen One", "Exactly as Planned", "Secret Within Secret",
];

for (const name of names) {
  assert.match(migration, new RegExp(`\\('${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}',`));
  assert.match(migration, new RegExp(`achievement_set_progress_v013\\(p_uid, '${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`));
}
assert.equal(names.length, 18);
assert.match(originalCatalog, /array\[10,35,60,100,175,40,25,100,75,125,50,50,75,75,40,100,30,250\]/);
assert.doesNotMatch(migration, /'ap'\s*,|\{ap\}|metadata->>'ap'/i, "existing AP values must remain untouched");

assert.match(migration, /set enabled = true/);
assert.match(migration, /'hidden', true/);
assert.match(migration, /'conditionVersion', 'secret-achievements-v1'/);
assert.match(migration, /best_roll_history/);
assert.match(migration, /private_feature_gems catalog/);
assert.match(migration, /effective_rarity >= 1000000000/);
assert.match(migration, /cardinality\(coalesce\(h\.mutation_ids/);
assert.match(migration, /h\.final_weight \/ catalog\.base_weight >= 10/);
assert.match(migration, /mod\(h\.roll_number, 1000\) = 0/);
assert.match(migration, /museum_registrations/);
assert.match(migration, /abandoned_mine_runs/);
assert.match(migration, /crystal_cavern_runs/);
assert.match(migration, /reward_granted_at[\s\S]*interval '10 minutes'/);
assert.match(migration, /player_research_purchases/);
assert.match(migration, /node\.stage = 4/);
assert.match(migration, /equipment\.masterwork_level >= 5/);
assert.match(migration, /definition\.name <> 'Secret Within Secret'/);
assert.match(migration, /Secret Within Secret', other_secrets, 12/);

assert.match(migration, /perform public\.refresh_player_achievements_v013_pre_secret_rework\(p_uid\)/);
assert.doesNotMatch(migration, /for player in select id from public\.players/,
  "deployment must not eagerly rescan every player's complete roll history");
assert.match(migration, /revoke all on function public\.refresh_player_achievements_v013\(uuid\)/);
assert.match(migration, /to service_role/);

assert.match(achievementUi, /definition\.metadata\?\.hidden === true/);
assert.match(achievementUi, /Hidden achievement/);
assert.match(achievementUi, /progress\?\.completed/);
assert.match(roll, /Run independent post-commit systems concurrently/);
assert.match(roll, /await Promise\.all\(\[/);
assert.doesNotMatch(roll, /secret-achievements-v1/,
  "secret snapshot scans must stay out of the optimized Roll edge function");

console.log("Server-authoritative secret achievement rework checks passed.");

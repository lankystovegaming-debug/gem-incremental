import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/20260901124153_replace_hidden_achievements_v2.sql", "utf8");
const names = [
  "Echo in Stone", "Impossibly Familiar", "Low-Luck Miracle", "Natural Wonder",
  "Mutation Singularity", "Titan Specimen", "Quantum Pebble", "Cursed Common",
  "Ten-Thousandth Bell", "Crown Exhibit", "Twin Abysses", "Cataclysmic Find",
  "Claimstorm", "Last Dollar", "Four Corners", "Lucky 777", "Perfect Arsenal",
  "Keeper of Secrets",
];
for (const name of names) assert.ok(sql.includes(`'${name}'`), `missing ${name}`);
assert.equal(new Set(names).size, 18);
assert.match(sql, /delete from public\.private_feature_definitions[\s\S]*metadata->>'hidden'/);
assert.match(sql, /md5\('hidden-achievements-v2:' \|\| name\)::uuid/);
assert.match(sql, /'conditionVersion', 'hidden-achievements-v2'/);
assert.match(sql, /perform public\.refresh_player_achievements_v013_pre_secret_rework\(p_uid\)/);
assert.match(sql, /secret_roll_backfill_config set cutoff_id = 0/);
assert.match(sql, /round\(coalesce\(p_final_weight,0\)\/base_weight,3\)/);
assert.match(sql, /p_effective_rarity,0\)>=10000000000/);
assert.match(sql, /p_final_weight,0\)\/base_weight>=15/);
assert.match(sql, /mod\(p_roll_number,10000\)=0/);
assert.match(sql, /sum\(progress\.achievement_points_awarded\)/);
assert.doesNotMatch(sql, /delete from public\.best_roll_history/);
assert.doesNotMatch(sql, /delete from public\.inventory_gems/);

console.log("hidden achievements v2 checks passed");

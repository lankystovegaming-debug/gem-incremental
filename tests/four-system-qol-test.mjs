import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import recipes from "../src/data/recipes.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const seasonHtml = read("seasons/index.html");
const seasonClient = read("seasons/seasons.js");
const seasonEdge = read("supabase/functions/seasons/index.ts");
const rollEdge = read("supabase/functions/roll/index.ts");
const stats = read("src/backend/cloudDebug.js");
const crafting = read("crafting/index.html");
const migration = read("supabase/migrations/20260824022714_season_leaderboard_pickaxe_merge.sql");

assert.match(seasonHtml, /id="claimAll"/);
assert.match(seasonClient, /call\("claim-all"/);
assert.match(seasonEdge, /action==="claim-all"/);
assert.match(seasonEdge, /claim_season_tier/);

assert.match(stats, /masterwork_level/);
assert.match(stats, /equipmentTotals\(equippedItems/);
assert.match(read("supabase/functions/roll/equipmentRules.js"), /pick\?\.luck_bonus.*mw/);

assert.match(rollEdge, /record_roll_leaderboard_entry/);
assert.doesNotMatch(rollEdge, /\.rpc\("record_gems_found_score"/);
assert.match(migration, /create or replace function public\.record_roll_leaderboard_entry/);
assert.match(migration, /create or replace function public\.get_gems_found_leaderboard/);
assert.match(migration, /create or replace function public\.get_best_roll_leaderboard/);
assert.match(migration, /create or replace function public\.get_raw_rare_roll_leaderboard/);
assert.match(migration, /update public\.players p set gems_found_score/);

assert.match(crafting, /data-category="lantern"/);
assert.doesNotMatch(read("crafting/crafting.js"), /Lanterns have been deprecated\./);
assert.match(crafting, /data-category="clover"/);
assert.equal(recipes.some((recipe) => recipe.category === "lantern"), true);
for (const recipe of recipes.filter((entry) => entry.category === "pickaxe")) {
  assert.ok(Number(recipe.reward?.bonus?.luck) > 0, `${recipe.id} gives Luck`);
  assert.ok(Number(recipe.reward?.bonus?.rollSpeed) > -1, `${recipe.id} gives Roll Speed`);
}
assert.match(migration, /set equipped=false,roll_speed_bonus=0[\s\S]*category='lantern'/);
assert.match(migration, /delete from public\.game_recipes where recipe->>'category'='lantern'/);

console.log("Season claim-all, leaderboard repair, stats, and equipment merge tests passed.");

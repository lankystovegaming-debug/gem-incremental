import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const catalog = read("supabase/migrations/20260826000002_achievement_catalog_v0130.sql");
const repair = read("supabase/migrations/20260830075544_repair_achievement_catalog_tracking.sql");

const groups = [...catalog.matchAll(
  /seed_achievement_series_v013\('([^']+)',string_to_array\('([^']+)'/g
)];
const catalogNames = groups.flatMap((match) => match[2].split("|"));

assert.equal(catalogNames.length, 156);
assert.match(repair, /refresh_player_achievements_v013_pre_catalog_audit/);
assert.match(repair, /coalesce\(\(metadata->>'hidden'\)::boolean, false\)/);
assert.match(repair, /'Right Time Right Gem', 'Guaranteed Reward'/);

const repairedNames = [...repair.matchAll(
  /achievement_set_progress_v013\(p_uid, '([^']+)'/g
)].map((match) => match[1]);

for (const name of [
  "Index Expert", "The Complete Index", "Five Mutation Types", "Ten Mutation Types",
  "Mutation Mastery", "Patron", "Tier X Boots", "Tier VIII Bag",
  "Fully Equipped", "Masterwork Artisan", "Arcane Mastery",
  "Competition Contributor", "Three-Time Champion", "Trusted Trader",
  "Voidwalker", "Season Veteran", "Original",
  "One Hundred Achievements", "Gem Incremental"
]) {
  assert.ok(repairedNames.includes(name), `${name} must have authoritative tracking`);
}

assert.match(repair, /select count\(\*\) into v_catalog_total from public\.game_gems/);
assert.match(repair, /'The Complete Index', v, v_catalog_total/);
assert.match(repair, /from public\.game_mutations where enabled/);
assert.match(repair, /'Mutation Mastery', v, v_catalog_total/);
assert.match(repair, /'Fully Equipped', v_total, 12/);
assert.match(repair, /'Expedition Master', v, 25/);
assert.match(repair, /'Cache Connoisseur', v, 25/);
assert.match(repair, /'Living Museum', v, 10000/);
assert.match(repair, /from public\.daily_shop_purchases/);
assert.match(repair, /from public\.guild_competition_members/);
assert.match(repair, /from public\.player_season_missions/);
assert.match(repair, /from public\.museum_registrations/);
assert.doesNotMatch(repair, /grant execute[\s\S]*to authenticated/);

console.log("Achievement catalog audit checks passed.");

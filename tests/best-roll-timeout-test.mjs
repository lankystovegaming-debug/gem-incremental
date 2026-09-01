import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260830074327_optimize_best_roll_leaderboard.sql");
const leaderboard = read("leaderboards/leaderboards.js");

assert.match(migration, /add column if not exists effective_rarity numeric/i);
assert.match(migration, /before insert or update of rarity, mutation_ids/i);
assert.match(migration, /best_roll_history_effective_ranking_idx/i);

const rpc = migration.match(
  /create or replace function public\.get_best_roll_leaderboard[\s\S]*?\$function\$;/i
)?.[0] ?? "";

assert.match(rpc, /h\.effective_rarity/);
assert.doesNotMatch(rpc, /get_mutation_chance_product/);
assert.match(leaderboard, /bestRollLoadFailed: false/);
assert.match(leaderboard, /Best Roll is temporarily unavailable/);

console.log("Best Roll timeout regression checks passed.");

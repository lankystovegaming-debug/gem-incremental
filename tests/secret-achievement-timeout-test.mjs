import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260901083016_cache_secret_achievement_roll_progress.sql");
const roll = read("supabase/functions/roll/index.ts");

assert.match(migration, /create table public\.player_secret_roll_progress/);
assert.match(migration, /create table public\.player_secret_roll_signatures/);
assert.match(migration, /create table public\.secret_roll_backfill_state/);
assert.match(migration, /create table public\.secret_roll_backfill_config/);
assert.match(migration, /alter table public\.player_secret_roll_progress enable row level security/);
assert.match(migration, /revoke all on public\.player_secret_roll_progress/);
assert.match(migration, /grant all on public\.player_secret_roll_progress[\s\S]*to service_role/);

assert.match(migration, /create or replace function public\.accumulate_secret_roll_progress_v1/);
assert.match(migration, /after insert on public\.best_roll_history/);
assert.match(migration, /for each row execute function public\.track_secret_roll_progress_v1/);
assert.match(migration, /mutation_occurrences = public\.player_secret_roll_progress\.mutation_occurrences/);
assert.match(migration, /on conflict\(player_id, signature\) do nothing/);

assert.match(migration, /backfill_secret_roll_progress_v1/);
assert.match(migration, /least\(coalesce\(p_batch_size, 5000\), 10000\)/);
assert.match(migration, /h\.id <= state\.cutoff_id/);
assert.match(migration, /select cutoff_id from public\.secret_roll_backfill_config/);

const refreshStart = migration.indexOf("create or replace function public.refresh_player_achievements_v013(p_uid uuid)");
const refreshEnd = migration.indexOf("revoke all on function public.accumulate_secret_roll_progress_v1", refreshStart);
assert(refreshStart >= 0 && refreshEnd > refreshStart, "optimized refresh function must be present");
const refresh = migration.slice(refreshStart, refreshEnd);
assert.match(refresh, /from public\.player_secret_roll_progress where player_id = p_uid/);
assert.match(refresh, /backfill_secret_roll_progress_v1\(p_uid, 100\)/,
  "historical recognition must advance in a fixed-size resumable batch");
assert.doesNotMatch(refresh, /best_roll_history/,
  "opening Achievements must never scan complete roll history");
assert.doesNotMatch(refresh, /refresh_player_achievements_v013_pre_secret_timeout_fix/,
  "optimized refresh must skip the scan-heavy predecessor");
assert.match(refresh, /refresh_player_achievements_v013_pre_secret_rework/);

assert.match(migration, /revoke all on function public\.accumulate_secret_roll_progress_v1/);
assert.match(migration, /to service_role/);
assert.match(roll, /Run independent post-commit systems concurrently/);
assert.match(roll, /const bestRollHistoryPromise/);
assert.match(roll, /EdgeRuntime\.waitUntil\(backgroundPostCommitPromise\)/);

console.log("Secret achievement timeout hotfix checks passed.");

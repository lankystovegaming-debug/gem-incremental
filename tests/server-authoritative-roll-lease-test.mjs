import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260830140000_server_authoritative_roll_lease.sql', import.meta.url),
  'utf8',
);
const roll = readFileSync(
  new URL('../supabase/functions/roll/index.ts', import.meta.url),
  'utf8',
);
const progressionCpuMigration = readFileSync(
  new URL('../supabase/migrations/20260901043054_optimize_roll_progression_cpu.sql', import.meta.url),
  'utf8',
);
const hotPathMigration = readFileSync(
  new URL('../supabase/migrations/20260901050842_optimize_roll_hot_path.sql', import.meta.url),
  'utf8',
);

assert.match(migration, /roll_lease_id uuid/);
assert.match(migration, /roll_lease_expires_at timestamptz/);
assert.match(migration, /select \* into v_player[\s\S]*for update/);
assert.match(migration, /clock_timestamp\(\)/);
assert.match(migration, /v_player\.roll_lease_expires_at > v_now/);
assert.match(migration, /v_player\.next_roll_at > v_now/);
assert.match(migration, /and roll_lease_id = p_lease_id/);
assert.match(migration, /grant execute on function public\.claim_server_roll\(uuid, numeric\) to service_role/);
assert.match(migration, /revoke all on function public\.claim_server_roll\(uuid, numeric\) from public, anon, authenticated/);

assert.match(roll, /\.rpc\("claim_server_roll"/);
assert.match(roll, /p_cooldown_ms: cooldownMs/);
assert.match(roll, /rollClaim\?\.status !== "claimed"/);
assert.match(roll, /\.rpc\(\s*"release_server_roll"/);
assert.match(roll, /p_lease_id: rollLeaseId/);
assert.doesNotMatch(roll, /next_roll_at\.is\.null,next_roll_at\.lte/);

const backgroundBlock = roll.match(
  /const backgroundPostCommitPromise = Promise\.all\(\[[\s\S]*?EdgeRuntime\.waitUntil\(backgroundPostCommitPromise\);/,
)?.[0] ?? '';
const responseBlock = roll.match(
  /const \[\s*lifetimeStats,[\s\S]*?globalEventRollPromise\s*\n\s*\]\);/,
)?.[0] ?? '';

assert.ok(backgroundBlock, 'Roll should register post-commit background work');
assert.match(backgroundBlock, /progressionPromise/);
assert.match(backgroundBlock, /bestRollHistoryPromise/);
assert.match(backgroundBlock, /consumeBoostPromise/);
assert.doesNotMatch(backgroundBlock, /lifetimeStatsPromise,/);
assert.doesNotMatch(backgroundBlock, /mutationCombinationPromise/);

assert.ok(responseBlock, 'Roll should retain a small response-critical wait set');
assert.match(responseBlock, /lifetimeStatsPromise/);
assert.match(responseBlock, /mutationCombinationPromise/);
assert.match(responseBlock, /guildPromise/);
assert.match(responseBlock, /globalEventRollPromise/);
assert.doesNotMatch(responseBlock, /progressionPromise/);

assert.match(
  progressionCpuMigration,
  /create or replace function public\.process_private_feature_progress_event_incremental/i,
);
assert.match(progressionCpuMigration, /jsonb_path_exists\(d\.requirements, '\$\.\*\*\.eventType'/i);
assert.match(progressionCpuMigration, /@ == \$event/);
assert.match(progressionCpuMigration, /requirements->>'type'.*achievement_count/is);
assert.match(progressionCpuMigration, /current_value is distinct from v_value/i);
assert.match(progressionCpuMigration, /'progressEngine', 'incremental-v2'/);
assert.match(
  progressionCpuMigration,
  /revoke all on function public\.process_private_feature_progress_event_incremental[\s\S]*from public, anon, authenticated/i,
);

assert.match(hotPathMigration, /inventory_gems_player_non_relic_idx/i);
assert.match(
  hotPathMigration,
  /on public\.inventory_gems\(player_id\)[\s\S]*gem_name <> 'Enchant Relic'[\s\S]*gem_name <> 'Ancient Relic'/i,
);
assert.match(hotPathMigration, /if p_event_type <> 'roll' then[\s\S]*insert into public\.private_feature_progress_events/i);
assert.match(hotPathMigration, /'progressEngine', 'incremental-v3'/);
assert.match(roll, /const ROLL_CATALOG_CACHE_MS = 5_000/);
assert.match(roll, /async function loadMutationCatalog/);
assert.match(roll, /async function loadGemCatalog/);
assert.match(roll, /await loadMutationCatalog\(ctx\.supabaseAdmin\)/);
assert.match(roll, /await loadGemCatalog\(ctx\.supabaseAdmin, now\.toISOString\(\)\)/);

console.log('Server-authoritative roll lease checks passed.');

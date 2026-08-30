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

console.log('Server-authoritative roll lease checks passed.');

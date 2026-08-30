import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/20260830141000_fix_roll_lease_runtime_auth.sql', import.meta.url),
  'utf8',
);

assert.match(sql, /create or replace function public\.claim_server_roll/);
assert.match(sql, /create or replace function public\.release_server_roll/);
assert.doesNotMatch(sql, /request\.jwt\.claim\.role/);
assert.match(sql, /revoke all on function public\.claim_server_roll\(uuid, numeric\) from public, anon, authenticated/);
assert.match(sql, /revoke all on function public\.release_server_roll\(uuid, uuid\) from public, anon, authenticated/);
assert.match(sql, /grant execute on function public\.claim_server_roll\(uuid, numeric\) to service_role/);
assert.match(sql, /grant execute on function public\.release_server_roll\(uuid, uuid\) to service_role/);

console.log('Roll lease runtime authorization regression checks passed.');

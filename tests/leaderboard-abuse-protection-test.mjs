import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const client = read("leaderboards/leaderboards.js");
const edge = read("supabase/functions/leaderboards/index.ts");
const migration = read("supabase/migrations/20260901053720_protect_leaderboards_from_public_abuse.sql");

assert.match(client, /functions\.invoke\("leaderboards"\)/);
assert.doesNotMatch(client, /supabase\.rpc\("get_total_rolls_leaderboard"/);
assert.doesNotMatch(client, /bestRollError/);
assert.match(edge, /CACHE_TTL_MS = 30_000/);
assert.match(edge, /MAX_REQUESTS_PER_WINDOW = 6/);
assert.match(edge, /ctx\.userClaims/);
assert.match(edge, /ctx\.supabaseAdmin\.rpc\("get_best_roll_leaderboard"/);
assert.match(migration, /revoke all on function %s from public, anon, authenticated/);
assert.match(migration, /grant execute on function %s to service_role/);

console.log("leaderboard abuse protection regression checks passed");

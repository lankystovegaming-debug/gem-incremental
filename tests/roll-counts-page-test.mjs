import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const html = read("roll-counts/index.html");
const css = read("roll-counts/roll-counts.css");
const client = read("roll-counts/roll-counts.js");
const shell = read("src/ui/shell.js");
const migration = read("supabase/migrations/20260918120000_global_roll_count_rpc.sql");

assert.match(html, /id="rollCounter"/);
assert.match(html, /id="rollCounterAnnouncement" aria-live="polite"/);
assert.match(html, /mountShell\(\{ page: "roll-counts", base: "\.\.\/" \}\)/);
assert.match(client, /functions\.invoke\("leaderboards"\)/);
assert.match(client, /REFRESH_INTERVAL_MS = 15_000/);
assert.match(client, /get_leaderboard_avatars/);
assert.match(client, /get_profile_ids_for_usernames/);
assert.match(client, /document\.hidden/);
assert.match(css, /@keyframes digit-in/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(shell, /id: "roll-counts"/);

// Global roll counter sits above the top roller's count and is fed by a
// dedicated aggregate RPC, polled on its own faster cadence and animated with
// the same flip renderer as the top-roller counter.
assert.match(html, /id="globalRollCount"/);
assert.match(client, /supabase\.rpc\("get_global_roll_count"\)/);
assert.match(client, /GLOBAL_REFRESH_INTERVAL_MS = 3_000/);
assert.match(client, /globalTimer = window\.setInterval\(refreshGlobalCount, GLOBAL_REFRESH_INTERVAL_MS\)/);
assert.match(client, /renderFlipDigits\(globalRollCount,/);
assert.match(client, /renderFlipDigits\(rollCounter,/);
assert.match(migration, /create or replace function public\.get_global_roll_count\(\)/);
assert.match(migration, /grant execute on function public\.get_global_roll_count\(\) to anon, authenticated/);

// The "Server verified" / "Always catching up" detail cards were removed for
// a more minimal stage, and the per-digit boxes no longer carry a background.
assert.doesNotMatch(html, /counter-details/);
assert.doesNotMatch(html, /Server verified/);
assert.doesNotMatch(css, /\.detail-card\b/);

console.log("roll counts page regression checks passed");

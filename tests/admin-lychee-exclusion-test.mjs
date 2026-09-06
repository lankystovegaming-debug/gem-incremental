import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const analytics = read("supabase/migrations/20260905000000_admin_analytics_daily_online_series.sql");
const leaderboards = read("supabase/migrations/20260905000003_exclude_lychee_from_leaderboards.sql");
const roles = read("src/ui/roles.js");

// The exclusion keys on the username roles.js already uses to identify lychee.
assert.match(roles, /1248lychee1632/, "roles.js must still identify the lychee account by username");

// ── Analytics: money + inventory value exclude the lychee account ─────────
assert.match(analytics, /where username is distinct from '1248lychee1632'/,
  "money in economy must exclude the lychee account");
assert.match(analytics, /ply\.username = '1248lychee1632'/,
  "inventory value must exclude the lychee account's gems");
// Player count and total rolls must NOT be filtered — only money/value change.
assert.match(analytics, /select count\(\*\), coalesce\(sum\(total_rolls\),0\)\s*\n\s*into v_players, v_rolls from public\.players;/,
  "player count and total rolls must still include every account");

// ── Leaderboards: lychee hidden via the existing flag ────────────────────
assert.match(leaderboards, /update public\.players\s*\n\s*set leaderboard_hidden = true\s*\n\s*where username = '1248lychee1632'/,
  "migration must set leaderboard_hidden for lychee");
// The one board that didn't honour the flag now does.
assert.match(leaderboards, /create or replace function public\.get_museum_prestige_leaderboard/,
  "migration must redefine the museum prestige board");
assert.match(leaderboards, /coalesce\(p\.leaderboard_hidden,false\)=false/,
  "museum prestige board must honour leaderboard_hidden");

console.log("admin-lychee-exclusion-test passed");

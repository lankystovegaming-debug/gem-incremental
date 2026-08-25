import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

for (const path of [
  "museum/index.html", "museum/museum.css", "museum/museum.js",
  "src/backend/cloudMuseum.js", "supabase/functions/museum/index.ts",
  "supabase/migrations/20260825000005_museum_v0120_beta.sql"
]) assert.ok(existsSync(resolve(root, path)), `${path} should exist`);

const sql = read("supabase/migrations/20260825000005_museum_v0120_beta.sql");
assert.match(sql, /museum_locked boolean not null default false/);
assert.match(sql, /capacity between 4 and 10/);
assert.match(sql, /when 5 then 2000000 when 6 then 5000000 when 7 then 10000000 when 8 then 20000000 when 9 then 40000000 else 75000000/);
assert.match(sql, /20 \* log\(10, greatest/);
assert.match(sql, /least\(180::numeric, 15 \* log/);
assert.match(sql, /when 2 then \.5 when 3 then \.25 else \.1/);
assert.match(sql, /museum_specimen_protected/);
assert.match(sql, /revoke execute on function public\.museum_place_exhibit/);
assert.match(sql, /get_museum_prestige_leaderboard/);

const edge = read("supabase/functions/museum/index.ts");
assert.match(edge, /ctx\.userClaims\?\.id/);
assert.match(edge, /ctx\.supabaseAdmin\.rpc\(rpc, args\)/);
assert.doesNotMatch(edge, /body\.playerId/);

const page = read("museum/index.html");
assert.match(page, /v0\.12\.0 Beta/);
assert.match(page, /Public museum visits/);
assert.match(page, /deliberately disabled/);

const inventory = read("inventory/index.html");
assert.match(inventory, /href="\.\.\/museum\/"/);
const shell = read("src/ui/shell.js");
assert.doesNotMatch(shell, /href:\s*"museum\//, "Museum should not add another topbar destination");

const leaderboard = read("leaderboards/leaderboards.js");
assert.match(leaderboard, /get_museum_prestige_leaderboard/);
assert.match(read("leaderboards/index.html"), /museumPrestigeTab/);

const updates = read("updates/index.html");
assert.match(updates, /v0\.12\.0 Beta/);
assert.match(updates, /A long-empty hall has opened its doors/);

console.log("Gem Museum v0.12.0 Beta tests passed.");

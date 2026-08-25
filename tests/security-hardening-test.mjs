import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260825000004_security_deny_by_default.sql");
const playerCloud = read("src/backend/playerCloud.js");
const dungeons = read("supabase/functions/dungeons/index.ts");

assert.match(migration, /revoke insert, update, delete on table public\.players from anon, authenticated/i);
assert.match(migration, /_auction_restore_gem\(uuid,jsonb\).*public, anon, authenticated/is);
assert.match(migration, /_auction_restore_lot\(uuid,jsonb\).*public, anon, authenticated/is);
assert.match(migration, /create_guild_for_player\(text\).*public, anon, authenticated/is);
assert.match(migration, /alter default privileges in schema public[\s\S]*revoke execute on functions from public/i);
assert.match(migration, /revoke execute on all functions in schema public from public/i);
assert.match(migration, /grant select, insert, update, delete on all tables in schema public to service_role/i);
assert.match(migration, /grant execute on all functions in schema public to service_role/i);
assert.match(migration, /grant execute on functions to service_role/i);

assert.doesNotMatch(playerCloud, /\.from\(["']players["']\)[\s\S]{0,200}\.upsert\(/);
assert.doesNotMatch(dungeons, /b\.damage|body\.damage/);
assert.match(dungeons, /max_equipment_tier/);

console.log("Security hardening tests passed.");

import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const passiveMigration = read("supabase/migrations/20260829040000_hell_artifact_passives.sql");
const hotfix = read("supabase/migrations/20260829190000_fix_hell_doom_overload.sql");

assert.match(passiveMigration,
  /abandoned_mine_hell_add_doom\(p_state jsonb,p_amount integer,p_od integer,p_player_id uuid default null\)/,
  "regression fixture must contain the ambiguous defaulted overload");
assert.match(hotfix,
  /drop function if exists public\.abandoned_mine_hell_add_doom\(jsonb,integer,integer,uuid\)/);
assert.doesNotMatch(hotfix,
  /drop function[^;]*abandoned_mine_hell_add_doom\(jsonb,integer,integer\);/,
  "the established three-argument runtime function must remain available");

console.log("Hell Doom overload hotfix tests passed.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const adminHtml = read("admin/index.html");
const upcomingHtml = read("upcoming/index.html");
const upcomingJs = read("upcoming/upcoming.js");
const privateFeatures = read("supabase/functions/private-features/index.ts");
const roll = read("supabase/functions/roll/index.ts");
const gemIndex = read("gem-index/index.js");
const migration = read("supabase/migrations/20260826045253_flat_chance_gems.sql");

assert.match(adminHtml, /id="gemAffectedByLuck"[^>]*checked/);
assert.match(upcomingHtml, /id="gemAffectedByLuck"[^>]*checked/);
assert.match(upcomingJs, /affected_by_luck:\$\("gemAffectedByLuck"\)\.checked/);
assert.match(privateFeatures, /affected_by_luck: body\.affected_by_luck !== false/);
assert.match(roll, /gem\.affectedByLuck === false/);
assert.match(roll, /\? 1 \/ gem\.rarity/);
assert.match(gemIndex, /Flat chance · unaffected by Luck/);
assert.match(gemIndex, /affectedByLuck: gem\.affected_by_luck !== false/);
assert.match(migration, /affected_by_luck boolean not null default true/);
assert.match(migration, /drop function if exists public\.get_public_gem_catalog\(\)/);

console.log("Flat-chance gem checks passed.");

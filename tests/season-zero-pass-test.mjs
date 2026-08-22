import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260821000001_season_zero_pass.sql");
const edge = read("supabase/functions/seasons/index.ts");
const roll = read("supabase/functions/roll/index.ts");
const sell = read("supabase/functions/sell-gem/index.ts");
const ui = read("seasons/seasons.js");
const html = read("seasons/index.html");

const tierValues = migration.split("from (values")[1].split(") as x(tier")[0];
assert.equal((tierValues.match(/^ \(\d+,/gm) ?? []).length, 50);
assert.match(tierValues, /\(50,59500,/);
assert.match(migration, /premiumPrice\"\:5000000/);
assert.match(migration, /rollXpDailyCap\"\:1500/);
assert.match(migration, /interval '30 days'/);
assert.match(migration, /interval '7 days'/);
assert.match(migration, /array\[150,400,800\]/);
assert.match(migration, /array\[2000,5000,10000,15000\]/);
assert.match(migration, /least\(59500,xp\+allowed\)/);
assert.match(migration, /public\.record_season_roll\(uuid,numeric,numeric,integer,boolean\)[^;]+from public/s);
assert.match(migration, /public\.record_season_roll\(uuid,numeric,numeric,integer,boolean\)[^;]+to service_role/s);
assert.match(edge, /purchase-premium/);
assert.match(edge, /claim-tier/);
assert.match(edge, /reroll-daily/);
assert.match(roll, /record_season_roll/);
assert.match(sell, /record_season_sale/);
assert.match(ui, /data-claim/);
assert.match(ui, /dailyRerollUsed/);
assert.match(html, /50 MILESTONES/);

console.log("Season Zero pass tests passed.");

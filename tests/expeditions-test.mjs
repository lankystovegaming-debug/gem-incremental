import assert from "node:assert/strict";
import fs from "node:fs";

const migration=fs.readFileSync(new URL("../supabase/migrations/20260819000003_expeditions_v090_beta.sql",import.meta.url),"utf8");
const roll=fs.readFileSync(new URL("../supabase/functions/roll/index.ts",import.meta.url),"utf8");
const updates=fs.readFileSync(new URL("../updates/index.html",import.meta.url),"utf8");

assert.match(migration,/daily'.*standard'.*200000/s);
assert.match(migration,/daily'.*deep'.*1000000/s);
assert.match(migration,/daily'.*3500000/s);
assert.match(migration,/weekly'.*standard'.*2000000/s);
assert.match(migration,/rerolls_max/);
assert.match(migration,/record_expedition_roll/);
assert.match(migration,/record_expedition_relic_spend/);
assert.match(migration,/status='completed'/);
assert.match(roll,/record_expedition_roll/);
assert.match(updates,/v0\.9\.0 Beta/);
assert.doesNotMatch(updates,/Daily Standard Expedition/);
console.log("Expedition tests passed.");

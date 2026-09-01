import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const backend = read("src/backend/cloudDebug.js");
const ui = read("debug/debug.js");
const css = read("debug/debug.css");
const migration = read("supabase/migrations/20260901035933_stats_misc_buff_modifiers.sql");
const roll = read("supabase/functions/roll/index.ts");

assert.match(backend, /get_current_misc_buff_modifiers/);
assert.match(backend, /RESEARCH_MISC_BUFFS/);
assert.match(backend, /EQUIPMENT_PASSIVES/);
assert.match(backend, /MASTERWORK_PASSIVES/);
assert.match(backend, /enchantDescription/);
assert.match(backend, /miscellaneousBuffs: miscBuffs/);
assert.match(backend, /Crystal artifacts/);
assert.match(backend, /Hell artifacts/);
assert.match(ui, /function miscellaneousBuffsCard/);
assert.match(ui, /"Miscellaneous buffs"/);
assert.match(ui, /No miscellaneous buffs are currently active/);
assert.match(css, /\.misc-buff/);
assert.match(migration, /create or replace function public\.get_current_misc_buff_modifiers\(\)/i);
assert.match(migration, /where registration\.player_id = auth\.uid\(\)/i);
assert.match(migration, /security definer/i);
assert.match(migration, /set search_path = ''/i);
assert.match(migration, /revoke all on function public\.get_current_misc_buff_modifiers\(\) from public, anon/i);
assert.match(migration, /grant execute on function public\.get_current_misc_buff_modifiers\(\) to authenticated, service_role/i);
assert.match(roll, /Run independent post-commit systems concurrently/);
assert.match(roll, /await Promise\.all\(\[/);

console.log("Stats miscellaneous buff card checks passed.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const stats = read("src/backend/cloudDebug.js");
const migration = read("supabase/migrations/20260830100000_debug_roll_stat_modifiers.sql");
const roll = read("supabase/functions/roll/index.ts");

assert.match(stats, /player_research_effects/);
assert.match(stats, /potion_strength_multiplier/);
assert.match(stats, /luck \*= positiveNumber\(researchEffects\.luck_multiplier\)/);
assert.match(stats, /supabase\.rpc\("get_current_roll_stat_modifiers"\)/);
assert.match(stats, /guild_luck_multiplier/);
assert.match(stats, /artifact_roll_speed_bonus/);
assert.match(stats, /masterwork_passive === "fortune_walker"/);

assert.match(migration, /security definer/);
assert.match(migration, /membership\.player_id = auth\.uid\(\)/);
assert.match(migration, /eligible_at <= now\(\)/);
assert.match(migration, /guild_luck_multiplier/);
assert.match(migration, /museum_artifact_registrations/);
assert.match(migration, /grant execute on function public\.get_current_roll_stat_modifiers\(\) to authenticated/);

assert.match(roll, /luck \*= researchNumber\("luck_multiplier"\)/);
assert.match(roll, /guilds\(luck_tier,speed_tier,weight_luck_tier\)/);

console.log("Live stats include research, guild, and permanent roll modifiers.");

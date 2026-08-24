import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration=await readFile(new URL("../supabase/migrations/20260822000001_guild_rework_beta.sql",import.meta.url),"utf8");
const roll=await readFile(new URL("../supabase/functions/roll/index.ts",import.meta.url),"utf8");
const features=await readFile(new URL("../supabase/functions/features/index.ts",import.meta.url),"utf8");
const page=await readFile(new URL("../guilds/index.html",import.meta.url),"utf8");

assert.match(migration,/member_capacity integer not null default 3/);
assert.match(migration,/luck_tier between 0 and 10/);
assert.match(migration,/speed_tier between 0 and 10/);
assert.match(migration,/weight_luck_tier between 0 and 10/);
assert.match(migration,/interval '6 days'/);
assert.match(migration,/interval '7 days'/);
assert.match(migration,/date_trunc\('day',v_now at time zone 'utc'\)/);
assert.match(migration,/when p_rarity>=10000000 then 500 when p_rarity>=1000000 then 150/);
assert.equal((roll.match(/record_guild_roll_activity/g)||[]).length,1,"roll must record guild activity once");
assert.equal((roll.match(/record_guild_roll_points/g)||[]).length,0,"old double-award RPC must be gone from roll");
assert.match(features,/guild_manage_member/);
assert.match(features,/guild_purchase_upgrade/);
assert.match(features,/Ratelimit\.slidingWindow\(3,"10 m"\)/);
assert.match(features,/prefix:"ratelimit:guild-create"/);
assert.match(features,/guild_create_rate_limited/);
assert.match(features,/"Retry-After"/);
assert.match(features,/const limited=await limitGuildCreation\(userId\);if\(limited\)return limited;/);
assert.match(page,/data-tab="overview"/);
assert.match(page,/data-tab="competition"/);
assert.match(page,/data-tab="upgrades"/);
console.log("Guild rework tests passed.");

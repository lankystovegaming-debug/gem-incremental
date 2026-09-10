import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20260910002737_extend_guild_progression_and_capacity.sql", import.meta.url),
  "utf8"
);
const guildScript = await readFile(new URL("../guilds/guilds.js", import.meta.url), "utf8");

assert.match(migration, /when coalesce\(p_xp, 0\) >= 1700000 then 20/);
assert.match(migration, /member_capacity between 3 and 15/);
assert.match(migration, /v_next > 15/);
assert.match(migration, /array\[2,3,4,5,6,7,9,11,13,15,17,19\]/);
assert.match(migration, /26000/);
assert.match(migration, /p_track <> 'capacity' and v_next > 10/);
assert.match(migration, /revoke all on function public\.guild_purchase_upgrade/);
assert.match(migration, /grant execute on function public\.guild_purchase_upgrade\(uuid, text\) to service_role/);

assert.match(guildScript, /1700000/);
assert.match(guildScript, /Math\.min\(LEVELS\.length,level\)/);
assert.match(guildScript, /max:12,value:`\$\{guild\.member_capacity\}\/15`/);
assert.match(guildScript, /14:26000/);
assert.match(guildScript, /isMax=level===LEVELS\.length/);
assert.doesNotMatch(guildScript, /level===10\?100/);

console.log("Extended guild levels and 15-member capacity checks passed.");

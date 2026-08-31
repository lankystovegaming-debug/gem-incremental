import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const [migration,features,roll,page,script,stats]=await Promise.all([
  read("supabase/migrations/20260831100421_guild_shop.sql"),
  read("supabase/functions/features/index.ts"),read("supabase/functions/roll/index.ts"),
  read("guilds/index.html"),read("guilds/guilds.js"),read("src/backend/cloudDebug.js")
]);

assert.match(migration,/interval '30 minutes'/);
assert.match(migration,/round\(\(p_base_price \* \(1 \+ 0\.25 \* \(greatest\(1, p_member_count\) - 1\)\)\) \/ 50\.0\) \* 50/);
assert.match(migration,/v_member\.role not in \('owner','officer'\)/);
assert.match(migration,/delete from public\.guild_shop_buffs[\s\S]*potion_id in \('legendary','mythic'\)/);
assert.match(migration,/mythic_surge_progress = 0/);
assert.match(migration,/for update;[\s\S]*v_next := v_buff\.mythic_surge_progress \+ 1/);
assert.match(migration,/alter table public\.guild_shop_buffs enable row level security/);
assert.match(migration,/grant execute on function public\.guild_activate_shop_potion\(uuid,text\) to service_role/);
assert.equal((features.match(/id:"(?:lucky_brew|haste_brew|heavy_brew|prosperity_brew|greater_lucky|greater_haste|legendary|mythic)"/g)||[]).length,8);
assert.match(features,/a==="guild-shop-activate"/);
assert.match(roll,/claim_server_roll[\s\S]*claim_guild_mythic_surge/);
assert.match(roll,/if \(mythicSurge\?\.boosted === true\) luck \*= 2/);
assert.match(roll,/weightMultiplier \*= 1\.15/);
assert.match(stats,/weightMultiplier \*= positiveNumber\(permanentModifiers\.guild_weight_multiplier\)/);
assert.match(page,/data-tab="shop"/);
assert.match(script,/Remaining time will be lost/);
assert.match(script,/mythicSurgeBar/);

const price=(base,members)=>Math.round((base*(1+.25*(members-1)))/50)*50;
assert.equal(price(750,1),750);
assert.equal(price(750,2),950);
assert.equal(price(8000,10),26000);
console.log("Guild Shop tests passed.");

import assert from 'node:assert/strict';
import recipes from '../src/data/recipes.js';
import {PICKAXE_SPECIALTIES} from '../src/data/equipmentPassives.js';
export async function testPickaxeRebalanceDatabase({db,q,uid,read}) {
 const ids=Object.keys(PICKAXE_SPECIALTIES).filter(id=>id!=='celestial-pickaxe');
 const scalar=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
 const untouched=await q("select id,recipe from game_recipes where id not in (select jsonb_array_elements_text($1)) order by id",[ids]);
 await q('update players set roll_lease_expires_at=null where id=$1',[uid]);
 const saved=await scalar('select equipment_state from players where id=$1',[uid]);
 const progress=await q('select * from crafting_progress order by recipe_id');
 const owned=await q('select equipment_id,enchant_state,equipped from player_equipment order by equipment_id');
 await db.exec(read('../supabase/migrations/20260909100058_serious_pickaxe_desirability_rebalance.sql'));
 assert.deepEqual(await q("select id,recipe from game_recipes where id not in (select jsonb_array_elements_text($1)) order by id",[ids]),untouched);
 assert.deepEqual(await scalar('select equipment_state from players where id=$1',[uid]),saved);
 assert.deepEqual(await q('select * from crafting_progress order by recipe_id'),progress);
 assert.deepEqual(await q('select equipment_id,enchant_state,equipped from player_equipment order by equipment_id'),owned);
 for(const id of ids) {
  const expected=recipes.find(r=>r.id===id), actual=await scalar('select recipe from game_recipes where id=$1',[id]);
  assert.deepEqual(actual.requirements,expected.requirements,id);
  assert.deepEqual(actual.reward.bonus,expected.reward.bonus,id);
  assert.equal(actual.moneyCost,expected.moneyCost,id);
  assert.ok(!actual.requirements.some(r=>r.type==='equipment'));
 }
 // High total rolls cannot bypass the genuine-only gate; materials/cash survive failure.
 for(const [id,threshold] of [['empyrean-pickaxe',250000],['eternity-pickaxe',300000],['the-accelerator',250000]]) {
  const recipe=recipes.find(r=>r.id===id);
  const full=Object.fromEntries(recipe.requirements.filter(r=>r.id||r.gem).map(r=>[r.id??r.gem,r.amount]));
  await q('delete from player_equipment where player_id=$1 and equipment_id=$2',[uid,id]);
  await q('insert into crafting_progress values($1,$2,$3,now()) on conflict(player_id,recipe_id) do update set progress=excluded.progress',[uid,id,full]);
  await q('update players set money=1000000000,total_rolls=9999999,equipment_genuine_rolls=$2 where id=$1',[uid,threshold-1]);
  await assert.rejects(()=>q('select craft_equipment_recipe($1)',[id]),/requirements_not_met/);
  assert.equal(await scalar('select money from players where id=$1',[uid]),1000000000);
  assert.deepEqual(await scalar('select progress from crafting_progress where player_id=$1 and recipe_id=$2',[uid,id]),full);
  await q('update players set equipment_genuine_rolls=$2 where id=$1',[uid,threshold]);
  await q('select craft_equipment_recipe($1)',[id]);
  assert.equal(await scalar('select money from players where id=$1',[uid]),1000000000-recipe.moneyCost);
  assert.equal(await scalar('select equipment_genuine_rolls from players where id=$1',[uid]),threshold);
 }
 console.log('Pickaxe rebalance database: exact recipes, genuine-only gates, rollback, preserved deposits/passives/ownership, excluded recipes and idempotent migration passed.');
}

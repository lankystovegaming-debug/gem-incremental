import assert from 'node:assert/strict';
import {supersizerRecipes} from '../src/data/equipmentOverhaul.js';

export async function testSupersizerDatabase({db,q,uid,read}) {
  await db.exec(`create or replace function public.player_has_mine_artifact(uuid,text) returns boolean language sql stable as $$select false$$;
    create table if not exists public.global_cash_events(id bigint generated always as identity primary key,player_name text,gem_name text,amount numeric,created_at timestamptz default now());`);
  await db.exec(read('../supabase/migrations/20260914035343_supersizer_pickaxe.sql'));
  await db.exec(read('../supabase/migrations/20260914035343_supersizer_pickaxe.sql'));
  const [recipe]=supersizerRecipes;
  assert.deepEqual((await q("select recipe from game_recipes where id='supersizer-pickaxe'"))[0].recipe,recipe);
  assert.equal((await q("select count(*) n from game_mutations where id like 'supersizer-%' and enabled"))[0].n,7);

  const plan=async(index,specimen)=>(await q('select plan_equipment_material($1,$2,$3,$4) result',[recipe,{},specimen,index]))[0].result;
  const valueIndex=recipe.requirements.findIndex(x=>x.id==='supersizer-value-50m');
  const quartzIndex=recipe.requirements.findIndex(x=>x.id==='supersizer-quartz');
  assert.equal(await plan(valueIndex,{gem_name:'Test',rarity:100,base_weight:1,final_weight:1,value:49_999_999}),null);
  assert.ok(await plan(valueIndex,{gem_name:'Test',rarity:100,base_weight:1,final_weight:1,value:50_000_000}));
  assert.equal(await plan(quartzIndex,{gem_name:'Quartz',rarity:2,base_weight:100,final_weight:999,value:1}),null);
  assert.ok(await plan(quartzIndex,{gem_name:'Quartz',rarity:2,base_weight:100,final_weight:1000,value:1}));

  await q('update players set money=2000000000,equipment_genuine_rolls=300000,roll_lease_expires_at=null where id=$1',[uid]);
  await q("delete from equipment_ownership_history where player_id=$1 and equipment_id in ('fortune-pickaxe','empyrean-pickaxe','eternity-pickaxe','tectonic-pickaxe','the-accelerator','the-resonator','the-excavator','bedrock-pickaxe')",[uid]);
  for(const id of ['fortune-pickaxe','empyrean-pickaxe','bedrock-pickaxe'])
    await q('insert into equipment_ownership_history(player_id,equipment_id) values($1,$2)',[uid,id]);

  // Retained specimens backfill the historical counters for existing players.
  for(let i=0;i<5;i++) await q(`insert into inventory_gems(player_id,gem_name,rarity,base_weight,value_per_gram,rolled_weight_multiplier,rolled_weight,final_weight,value,mutation_multiplier,locked)
    values($1,$2,10000000,1,1,$3,$3,$3,1,1,false)`,[uid,`Qualification ${i}`,i<3?10:5]);
  let history=(await q('select equipment_batch_progress($1) p',[uid]))[0].p;
  assert.equal(history.supersizerSpecialists,3);
  assert.equal(history.supersizerHeavy10,3);
  assert.equal(history.supersizerRareHeavy5,5);
  await q("update players set equipment_state=jsonb_build_object('batchHistory',jsonb_build_object('supersizerHeavy10',3,'supersizerRareHeavy5',5)) where id=$1",[uid]);
  await q("delete from inventory_gems where gem_name like 'Qualification %'");
  history=(await q('select equipment_batch_progress($1) p',[uid]))[0].p;
  assert.equal(history.supersizerHeavy10,3);
  assert.equal(history.supersizerRareHeavy5,5);

  await q("insert into game_consumables(id,name,family,tier,effect_value,duration_seconds,purchasable,shop_price) values('legendary-potion','Legendary','luck',4,1000,1,false,0),('mythic-potion','Mythic','luck',4,10000,1,false,0) on conflict(id) do nothing");
  await q("insert into player_consumables(player_id,consumable_id,quantity,updated_at) values($1,'legendary-potion',25,now()),($1,'mythic-potion',10,now()) on conflict(player_id,consumable_id) do update set quantity=excluded.quantity",[uid]);
  const progress=Object.fromEntries(recipe.requirements.filter(x=>['gem-count','specimen-condition'].includes(x.type)).map(x=>[x.id??x.gem,x.amount]));
  await q("insert into crafting_progress(player_id,recipe_id,progress,updated_at) values($1,$2,$3,now()) on conflict(player_id,recipe_id) do update set progress=excluded.progress",[uid,recipe.id,progress]);
  await q("select craft_equipment_recipe('supersizer-pickaxe')");
  const equipment=(await q("select luck_bonus,roll_speed_bonus,mutation_chance_bonus,weight_luck_bonus,weight_multiplier_bonus,equipped from player_equipment where player_id=$1 and equipment_id='supersizer-pickaxe'",[uid]))[0];
  assert.deepEqual(equipment,{luck_bonus:18.91,roll_speed_bonus:1.75,mutation_chance_bonus:-.5,weight_luck_bonus:4.5,weight_multiplier_bonus:1.4,equipped:true});
  assert.equal(Number((await q('select money from players where id=$1',[uid]))[0].money),901000000);
  assert.equal((await q("select coalesce(sum(quantity),0) n from player_consumables where consumable_id in ('legendary-potion','mythic-potion')"))[0].n,0);
  assert.equal((await q("select count(*) n from inventory_gems where gem_name like 'Qualification %'"))[0].n,0);

  await q("update players set equipment_state=jsonb_build_object('supersizerBlessingUntil',(now()+interval '5 minutes')::text) where id=$1",[uid]);
  assert.equal(Number((await q('select equipment_gem_sell_multiplier($1) n',[uid]))[0].n),1.875);
  const sale=(await q(`insert into inventory_gems(player_id,gem_name,rarity,base_weight,value_per_gram,rolled_weight_multiplier,rolled_weight,final_weight,value,mutation_multiplier,locked)
    values($1,'Sale',2,1,100,1,1,1,100,1,false) returning id`,[uid]))[0].id;
  await q('select sell_inventory_gem($1,$2)',[uid,sale]);
  assert.equal(Number((await q('select money from players where id=$1',[uid]))[0].money),901000187.5);
  console.log('Supersizer database: canonical thresholds, historical qualifications, exact craft consumption/stats, ownership gate and final-sell blessing passed.');
}

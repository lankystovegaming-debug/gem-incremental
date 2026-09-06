import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { lateGameEquipment } from '../src/data/lateGameEquipment.js';
import { planIncludedMaterial } from '../src/logic/equipmentMaterials.js';
import { masterworkLevelCost, masterworkRerollCost } from '../src/data/masterwork.js';
const db = new PGlite();
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
await db.exec(read('./fixtures/late-game-live-schema.sql'));
await db.exec("insert into crafting_progress(player_id,recipe_id,progress) values('00000000-0000-0000-0000-000000000099','bottomless-singularity','{\"Sapphire\":10000,\"Painite\":250,\"Ringwoodite\":10,\"Pallasite Crystal\":7}')");
await db.exec(read('../supabase/migrations/20260906070703_late_game_equipment_expansion.sql'));
const legacy=(await db.query("select progress from crafting_progress where player_id='00000000-0000-0000-0000-000000000099'")).rows[0].progress;
assert.equal(legacy['bottomless-singularity-legendary'],590);
assert.equal(legacy.Sapphire,10000);
assert.equal(legacy['bottomless-singularity-specimen-0'],undefined);
const uid='00000000-0000-0000-0000-000000000001';
const result=async (sql,args=[]) => (await db.query(sql,args)).rows[0]?.result;
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
await db.query('insert into players(id,money,total_rolls) values($1,1000000000,1000000)',[uid]);
const gem=(rarity,weight)=>({gem_name:'Test gem',rarity,base_weight:1,final_weight:weight});
const planSql=(recipe,progress,specimen,index=null)=>result('select public.plan_equipment_material($1,$2,$3,$4) as result',[recipe,progress,specimen,index]);
// Replay each actual recipe: specimens first, then exact bulk counts.
for(const recipe of lateGameEquipment){
  const fromDb=await result('select recipe as result from game_recipes where id=$1',[recipe.id]);
  assert.deepEqual(fromDb,recipe);
  let progress={};
  for(const slot of recipe.requirements.filter(r=>r.includedInBulk).reverse()){
    for(let i=0;i<slot.amount;i++){
      const specimen=gem(slot.minimumRarity,slot.minimumWeightMultiplier);
      const plan=await planSql(recipe,progress,specimen);
      assert.ok(plan,recipe.id+' accepts a specimen');
      assert.deepEqual(plan,planIncludedMaterial(recipe,progress,specimen));
      assert.equal(plan.conservationEligible,false);
      const changed=recipe.requirements.filter(r=>r.includedInBulk && (plan.progress[r.id]??0)>(progress[r.id]??0));
      assert.equal(changed.length,1,'one specimen slot per gem');
      progress=plan.progress;
    }
  }
  for(const bulk of recipe.requirements.filter(r=>r.type==='gem-count')){
    // Set all but the last to keep this integration test fast at 10,000-gem scale.
    progress[bulk.id]=bulk.amount-1;
    const plan=await planSql(recipe,progress,gem(bulk.minimumRarity,1));
    assert.ok(plan); assert.equal(plan.progress[bulk.id],bulk.amount); assert.equal(plan.conservationEligible,true);
    progress=plan.progress;
  }
  assert.equal(await planSql(recipe,progress,gem(1000,8)),null,'completed bulk cannot consume extras');
}
// Reserved capacity stops ordinary gems from making the specimen requirements impossible.
const tiny={includedSpecimens:true,requirements:[
  {id:'bulk',type:'gem-count',minimumRarity:1000,maximumRarity:9999,amount:2},
  {id:'heavy',type:'specimen-condition',includedInBulk:true,minimumRarity:1000,minimumWeightMultiplier:5,amount:1}
]};
let p=(await planSql(tiny,{},gem(1000,1))).progress;
assert.equal(await planSql(tiny,p,gem(1000,1)),null);
assert.ok(await planSql(tiny,p,gem(1000,5)));
assert.equal(await planSql(tiny,{},gem(999,10)),null);
assert.equal(await planSql(tiny,{},gem(10000,10)),null,'higher rarity requires a corresponding bulk total');
// DB-owned manual selection handles >1,000 ineligible gems and lock flags.
const bag=lateGameEquipment[0];
await db.query('insert into inventory_gems(player_id,gem_name,rarity,base_weight,final_weight,locked) select $1,\'Pebble\',1,1,1,false from generate_series(1,1100)',[uid]);
await db.query('insert into inventory_gems(player_id,gem_name,rarity,base_weight,final_weight,locked) values($1,\'Heavy\',1000,1,4,true),($1,\'Heavy\',1000,1,4,false)',[uid]);
const deposit=await result('select public.deposit_equipment_material($1,$2,null,$3) as result',[uid,bag.id,bag.requirements.findIndex(r=>r.includedInBulk)]);
assert.equal(deposit.deposited,true); assert.equal(deposit.preserved,false); assert.ok(deposit.consumedSpecimen.id);
assert.equal(await result('select count(*)::int as result from inventory_gems where id=$1',[deposit.consumedSpecimen.id]),0);
assert.equal(await result('select (public.deposit_equipment_material($1,$2,null,$3)->>\'deposited\')::boolean as result',[uid,bag.id,bag.requirements.findIndex(r=>r.includedInBulk)]),false,'locked gem cannot satisfy second deposit');
// Failed cash/progression checks roll back the 67 plastic materials too.
const plastic=lateGameEquipment.find(r=>r.id==='plastic-shopping-bag');
await db.query('insert into player_consumables values($1,\'plastic-bag\',67,now())',[uid]);
await db.query('insert into player_equipment(player_id,equipment_id,category,tier,name,equipped) values($1,\'omnidimensional-vault\',\'bag\',15,\'Vault\',true)',[uid]);
const full=Object.fromEntries(plastic.requirements.filter(r=>r.id).map(r=>[r.id,r.amount]));
await db.query('insert into crafting_progress(player_id,recipe_id,progress) values($1,$2,$3)',[uid,plastic.id,full]);
await db.query('update players set money=500000000 where id=$1',[uid]);
await assert.rejects(()=>result('select craft_equipment_recipe($1) as result',[plastic.id]),/not_enough_money/);
assert.equal(await result('select quantity as result from player_consumables where player_id=$1',[uid]),67);
await db.query('update players set money=500000000.10,total_rolls=999999 where id=$1',[uid]);
await assert.rejects(()=>result('select craft_equipment_recipe($1) as result',[plastic.id]),/requirements_not_met/);
assert.equal(await result('select quantity as result from player_consumables where player_id=$1',[uid]),67);
await db.query('update players set total_rolls=1000000 where id=$1',[uid]);
await db.query('update players set money=500000000.10 where id=$1',[uid]);
assert.equal((await result('select craft_equipment_recipe($1) as result',[plastic.id])).money,0);
assert.equal(await result('select quantity as result from player_consumables where player_id=$1',[uid]),0);
assert.equal(await result('select equipped as result from player_equipment where equipment_id=\'omnidimensional-vault\''),false,'prerequisite remains stored');
// Serialized lease claims reject duplicate attempts and only completed primary rolls advance the counter.
const claim=await result('select claim_server_roll($1,100) as result',[uid]);
assert.equal(claim.genuineRoll,1);
assert.equal((await result('select claim_server_roll($1,100) as result',[uid])).status,'in_flight');
await result('select record_server_roll($1,\'Test\',1000,5) as result',[uid]);
assert.equal(await result('select equipment_genuine_rolls::int as result from players where id=$1',[uid]),1);
await db.query('update player_equipment set equipped=false where player_id=$1',[uid]);
await db.query('update players set next_roll_at=null,roll_lease_expires_at=null,roll_lease_id=null where id=$1',[uid]);
assert.equal((await result('select claim_server_roll($1,100) as result',[uid])).genuineRoll,2,'equipment switches and new sessions retain progress');
// Actual SQL Masterwork prices agree with the UI at every tier/level.
await db.query('delete from inventory_gems');
await db.query('insert into inventory_gems(player_id,gem_name,locked) select $1,\'Enchant Relic\',false from generate_series(1,2000)',[uid]);
await db.query('insert into inventory_gems(player_id,gem_name,locked) select $1,\'Ancient Relic\',false from generate_series(1,2000)',[uid]);
await db.query('update players set money=10000000000 where id=$1',[uid]);
for(let tier=10;tier<=17;tier++){
 const id=await result('insert into player_equipment(player_id,equipment_id,category,tier,name,equipped) values($1,$2,\'pickaxe\',$3,\'Test\',false) returning id as result',[uid,'test-'+tier,tier]);
 for(let level=1;level<=5;level++){
  const actual=await result('select masterwork_equipment_beta($1,\'upgrade\') as result',[id]);
  const cost=masterworkLevelCost(tier,level);
  assert.deepEqual([actual.spentMoney,actual.spentEnchantRelics,actual.spentAncientRelics],[cost.money,cost.enchant,cost.ancient]);
 }
 for(let n=0;n<6;n++){
  const actual=await result('select masterwork_equipment_beta($1,\'reroll\') as result',[id]);
  assert.equal(actual.spentMoney,masterworkRerollCost(tier,n).money);
 }
}
// Conservation rolls independently for ordinary count deposits, never special slots.
await db.query('delete from player_equipment where category=\'bag\'');
await db.query('insert into game_recipes(id,recipe) values(\'conservation-test\',$1)',[{requirements:[{id:'ordinary',type:'gem-count',gem:'Test gem',amount:100000}]}]);
for (const [bagId,chance] of [['omnidimensional-vault',0.1],['plastic-shopping-bag',0.125]]) {
 await db.query('delete from player_equipment where category=\'bag\'');
 await db.query('insert into player_equipment(player_id,equipment_id,category,equipped) values($1,$2,\'bag\',true)',[uid,bagId]);
 await db.query('select setseed(0.42)');
 let preserved=0;
 for(let i=0;i<1000;i++) {
  const deposited=await result('select deposit_equipment_material($1,\'conservation-test\',$2,0) as result',[uid,gem(1000,1)]);
  assert.equal(deposited.deposited,true);
  preserved+=Number(deposited.preserved);
 }
 assert.ok(Math.abs(preserved/1000-chance)<0.035);
}
const specialPlan=await planSql(bag,{},gem(1000,4));
assert.equal(specialPlan.conservationEligible,false);
// Service helpers cannot be called directly by browser roles.
assert.equal(await result("select has_function_privilege('authenticated','public.deposit_equipment_material(uuid,text,jsonb,integer)','EXECUTE') as result"),false);
assert.equal(await result("select has_function_privilege('anon','public.plan_equipment_material(jsonb,jsonb,jsonb,integer)','EXECUTE') as result"),false);
await db.close();
console.log('Late-game migration, crafting, specimen allocation, roll counters and Masterwork integration tests passed.');

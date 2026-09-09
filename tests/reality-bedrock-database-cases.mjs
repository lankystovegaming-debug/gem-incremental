import assert from 'node:assert/strict';
import {realityBedrockRecipes} from '../src/data/equipmentOverhaul.js';
export async function testRealityBedrockDatabase({db,q,uid,read,fund}) {
 await db.exec(`create table player_settings(player_id uuid primary key,settings jsonb not null default '{}',updated_at timestamptz default now());`);
 await db.exec(read('../supabase/migrations/20260908124328_qol_gem_filter_buffs_loadouts.sql'));
 await db.exec(read('../supabase/migrations/20260909060453_reality_shifter_bedrock_max_luck.sql'));
 await db.exec(read('../supabase/migrations/20260909100058_serious_pickaxe_desirability_rebalance.sql'));
 const scalar=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
 const [reality,bedrock]=realityBedrockRecipes;
 for(const recipe of realityBedrockRecipes)assert.deepEqual(await scalar('select recipe from game_recipes where id=$1',[recipe.id]),recipe);
 assert.equal(await scalar("select multiplier from game_mutations where id='shifted'"),'35');
 // Server validation and preservation across old full-document writes.
 await db.exec('set role authenticated');
 for(const value of [0,-1,.99,'NaN','Infinity','2',true,{},[],1e100])await assert.rejects(()=>q('select update_qol_settings($1)',[{maxLuck:value}]),/invalid_max_luck/);
 for(const value of [1,1.5,999999,null,'']) {
  const saved=await scalar('select update_qol_settings($1)',[{maxLuck:value}]);assert.equal(saved.maxLuck,value===''?null:value);
 }
 await q('select update_qol_settings($1)',[{maxLuck:7}]);
 await assert.rejects(()=>q('select deposit_equipment_material($1,$2,null,0)',[uid,bedrock.id]),/permission denied/);
 await db.exec('reset role');
 await q("update player_settings set settings='{\"autoRoll\":false}' where player_id=$1",[uid]);
 assert.equal((await scalar('select settings from player_settings where player_id=$1',[uid])).maxLuck,7);
 await assert.rejects(()=>q("update player_settings set settings='{\"maxLuck\":-1}' where player_id=$1",[uid]),/invalid_max_luck/);
 await q('select update_qol_settings($1)',[{maxLuck:null}]);
 assert.equal((await scalar('select settings from player_settings where player_id=$1',[uid])).maxLuck,null);
 await q('update players set money=1000000000,total_rolls=9999999,equipment_genuine_rolls=49999,roll_lease_expires_at=null where id=$1',[uid]);
 await fund(reality);
 await assert.rejects(()=>q("select craft_equipment_recipe('reality-shifter')"),/requirements_not_met/);
 await q('update players set equipment_genuine_rolls=50000 where id=$1',[uid]);
 const ownedBefore=await scalar('select count(*) from player_equipment where player_id=$1',[uid]);
 await q("select craft_equipment_recipe('reality-shifter')");
 assert.equal(await scalar('select count(*) from player_equipment where player_id=$1',[uid]),ownedBefore+1);
 assert.equal(await scalar("select mutation_chance_bonus from player_equipment where equipment_id='reality-shifter'"),-1);
 assert.equal(await scalar('select money from players where id=$1',[uid]),875000000);
 assert.equal(await scalar('select equipment_genuine_rolls from players where id=$1',[uid]),50000);
 // Single call consumes each full band. Locked and foreign specimens cannot pay.
 const other='00000000-0000-0000-0000-000000000003';await q('insert into players(id) values($1)',[other]);
 await q(`insert into inventory_gems(id,player_id,gem_name,rarity,base_weight,final_weight,locked)
 select 100000+n,$1,'Material',case when n<=10000 then 9 when n<=17500 then 49 when n<=22500 then 99 else 100 end,1,1,false from generate_series(1,25000) n`,[uid]);
 await q("insert into inventory_gems(id,player_id,gem_name,rarity,base_weight,final_weight,locked) values(200001,$1,'Locked',9,1,.01,true),(200002,$2,'Foreign',9,1,.01,false),(200003,$1,'Legendary',1000,1,1,false)",[uid,other]);
 await q("insert into inventory_gems(id,player_id,gem_name,rarity,base_weight,final_weight,locked,museum_locked) values(200004,$1,'Museum',9,1,.001,false,true)",[uid]);
 // Keep Plastic equipped: new recipes always consume their material costs.
 await q("update player_equipment set equipped=true where player_id=$1 and equipment_id='plastic-shopping-bag'",[uid]);
 for(let i=0;i<4;i++) {
  const result=await scalar('select deposit_equipment_material($1,$2,null,$3)',[uid,bedrock.id,i]);
  assert.equal(result.depositedCount,bedrock.requirements[i].amount);
  assert.equal(result.progress[bedrock.requirements[i].id],bedrock.requirements[i].amount);
  assert.equal(result.preserved,false);
 }
 assert.equal(await scalar('select count(*) from inventory_gems where id between 100001 and 125000'),0);
 assert.equal(await scalar('select count(*) from inventory_gems where id between 200001 and 200004'),4);
 assert.equal((await scalar('select deposit_equipment_material($1,$2,null,0)',[uid,bedrock.id])).deposited,false);
 await assert.rejects(()=>q('select deposit_equipment_material($1,$2,null,4)',[uid,bedrock.id]),/invalid_bulk_requirement/);
 await q('update players set equipment_genuine_rolls=249999 where id=$1',[uid]);
 await assert.rejects(()=>q("select craft_equipment_recipe('bedrock-pickaxe')"),/requirements_not_met/);
 assert.equal(await scalar('select money from players where id=$1',[uid]),875000000);
 await q('update players set equipment_genuine_rolls=250000 where id=$1',[uid]);
 await q("select craft_equipment_recipe('bedrock-pickaxe')");
 assert.equal(await scalar('select money from players where id=$1',[uid]),775000000);
 assert.equal(await scalar("select luck_bonus from player_equipment where equipment_id='bedrock-pickaxe'"),24);
 assert.equal(await scalar("select count(*) from player_equipment where equipment_id='reality-shifter'"),1);
 assert.equal(await scalar('select equipment_genuine_rolls from players where id=$1',[uid]),250000);
 // Auto Craft routes one genuine specimen into exactly the proper rarity band.
 for(const [rarity,label] of [[9,'common'],[10,'uncommon'],[49,'uncommon'],[50,'rare'],[99,'rare'],[100,'epic'],[999,'epic']]) {
  const result=await scalar('select plan_equipment_material($1,$2,$3,null)',[bedrock,{}, {gem_name:'X',rarity,base_weight:1,final_weight:1}]);
  assert.equal(result.progress['bedrock-pickaxe-'+label],1);assert.equal(result.conservationEligible,false);
 }
 assert.equal(await scalar('select plan_equipment_material($1,$2,$3,null)',[bedrock,{}, {gem_name:'X',rarity:1000,base_weight:1,final_weight:1}]),null);
 const auto=await scalar('select deposit_equipment_material($1,$2,$3,null)',[uid,bedrock.id,{gem_name:'X',rarity:50,base_weight:1,final_weight:1}]);
 assert.equal(auto.progress['bedrock-pickaxe-rare'],1);assert.equal(auto.preserved,false);
 // Existing leased state survives switching and cannot double-commit or be forged by a client.
 const state={rolls:{'reality-shifter':499},foundation:0,bedrockBurst:7};
 await q('update players set equipment_state=$2,equipment_state_roll=250000 where id=$1',[uid,state]);
 const row=await scalar("select id from player_equipment where equipment_id='bedrock-pickaxe'");
 await q('select set_overhaul_equipment_equipped($1,false)',[row]);
 assert.deepEqual(await scalar('select equipment_state from players where id=$1',[uid]),{...state,spool:0});
 await q('select set_overhaul_equipment_equipped($1,true)',[row]);
 const snapshot=await scalar('select equipment_state from players where id=$1',[uid]);
 const ids=(await q('select id from player_equipment where player_id=$1 and equipped',[uid])).map(r=>r.id);
 await q('update players set next_roll_at=null,roll_lease_expires_at=null where id=$1',[uid]);
 const claim=await scalar('select claim_equipment_roll($1,100,$2,$3)',[uid,snapshot,ids]);
 assert.equal(claim.status,'claimed');
 const args=[uid,claim.leaseId,claim.genuineRoll,{...snapshot,bedrockBurst:6},null,null,100];
 await q('select commit_equipment_roll($1,$2,$3,$4,$5,$6,$7)',args);
 await q('select commit_equipment_roll($1,$2,$3,$4,$5,$6,$7)',[...args.slice(0,3),{},...args.slice(4)]);
 assert.equal((await scalar('select equipment_state from players where id=$1',[uid])).bedrockBurst,6);
 assert.equal(await scalar("select has_function_privilege('authenticated','public.commit_equipment_roll(uuid,uuid,bigint,jsonb,text,jsonb,integer)','execute')"),false);
 console.log('Reality/Bedrock database: migration, 25,000 consumed bulk specimens, historical gates, exact costs, Auto Craft bands, validation, switch persistence and lease idempotency passed.');
}

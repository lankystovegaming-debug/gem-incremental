import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {PICKAXE_STATS} from '../supabase/functions/roll/equipmentRules.js';
const url=p=>new URL(p,import.meta.url).href;
let source=readFileSync(new URL('../supabase/functions/roll/index.ts',import.meta.url),'utf8')
 .replace(/import\s*\{\s*withSupabase\s*\}\s*from\s*"npm:@supabase\/server";/,'const withSupabase=(_options,handler)=>handler;')
 .replace('"./eventRules.ts"',JSON.stringify(url('../supabase/functions/roll/eventRules.ts')))
 .replace('"./equipmentRules.js"',JSON.stringify(url('../supabase/functions/roll/equipmentRules.js')));
source=stripTypeScriptTypes(source);
let forceProcs=false;
const bg=[];globalThis.EdgeRuntime={waitUntil:p=>bg.push(p)};
Object.defineProperty(globalThis,'crypto',{value:{getRandomValues(a){a[0]=forceProcs && /finishEquipmentRoll|exclusiveMutations/.test(new Error().stack)?0:2**31;return a;}},configurable:true});
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let player,equipment,boosts,oneRoll,admin,commits,saved,rpcs;
let qolSettings = { discoveryKeep:false }, bundleResponse = {status:"none"}, saleFailure=false, craftActive=false, craftResponse={deposited:false};
const uid='00000000-0000-0000-0000-000000000001';
class Query {
 constructor(table){this.table=table;this.mode='read';this.singleRow=false;this.payload=null;}
 select(){return this;}eq(){return this;}neq(){return this;}gt(){return this;}gte(){return this;}lte(){return this;}or(){return this;}order(){return this;}limit(){return this;}in(){return this;}is(){return this;}
 single(){this.singleRow=true;return this;}maybeSingle(){this.singleRow=true;return this;}
 insert(p){this.mode='insert';this.payload=p;return this;}update(p){this.mode='update';this.payload=p;return this;}upsert(p){this.mode='insert';this.payload=p;return this;}delete(){this.mode='delete';return this;}
 then(resolve,reject){
  let data=null;let count=0;
  if(this.mode==='insert'&&this.table==='inventory_gems'){data={id:101,...this.payload};saved=data;}
  else if(this.mode==='read') {
   const tables={players:player,player_crafting:{active_auto_craft:craftActive?'craft':null},game_recipes:{recipe:{equipmentOverhaul:true,requirements:[]}},crafting_progress:{progress:{}},player_equipment:equipment,player_boosts:boosts,player_one_roll_boosts:oneRoll,admin_events:admin,
    museum_artifact_registrations:[],player_gem_mutation_combinations:[],game_mutations:[{id:'polished',name:'Polished',chance:100,multiplier:1.5}],
    private_feature_gems:[{name:'Test gem',rarity:100000,base_weight:100,value_per_gram:2,affected_by_luck:true,availability_mode:'always',special_gem:false}]};
   data=tables[this.table]??(this.singleRow?null:[]);
  }
  return Promise.resolve({data,error:null,count}).then(resolve,reject);
 }
}
const client={from:t=>new Query(t),rpc:async(name,args)=>{
 rpcs.push(name);
 if(name==='sell_inventory_gem' && saleFailure)return {data:null,error:{message:"sale_failed"}};
 const responses={deposit_equipment_material:craftResponse,qol_roll_context:{settings:qolSettings,discoveries:['Test gem']},sell_inventory_gem:123,bundle_route_roll:bundleResponse,get_playtime_upgrades:{levels:{}},crystal_player_effects:{luckBonus:2,finalLuckMultiplier:3},player_expedition_artifact_effects:{luckBonus:3},
  claim_equipment_roll:{status:'claimed',genuineRoll:5001,leaseId:'lease',nextRollAt:new Date(Date.now()+1000).toISOString()},record_server_roll:{total_rolls:5001}};
 if(name==='commit_equipment_roll'){commits.push(args);return {data:{bonus:args.p_bonus?{id:102,...args.p_bonus}:null},error:null};}
 return {data:responses[name]??null,error:null};
}};
async function run(id,state={},enchant=null) {
 commits=[];saved=null;rpcs=[];
 player={id:uid,inventory_capacity:100,total_rolls:5000,next_roll_at:null,mutation_luck:1,equipment_state:state,rarity_resonance:0,player_research_effects:{luck_multiplier:1.2}};
 equipment=[{id:1,equipment_id:id,category:'pickaxe',enchant_id:enchant,enchant_state:{rolls:6},enchant_grade:'normal'},
 {id:2,category:'clover',luck_bonus:.1},{id:3,category:'lantern',mutation_chance_bonus:.25},{id:4,category:'boots',weight_luck_bonus:.15},{id:5,category:'bag',weight_multiplier_bonus:.15}];
 boosts=[{family:'luck',effect_value:7}];oneRoll={effect_value:1000};admin={luck_multiplier:2};
 const response=await handler.fetch(new Request('http://local/roll',{method:'POST'}),{userClaims:{id:uid},supabase:client,supabaseAdmin:client});
 const result=await response.json();await Promise.all(bg.splice(0));assert.equal(response.status,200,JSON.stringify(result));return result;
}
let result=await run('celestial-pickaxe');assert.equal(result.luckBreakdown.flat,12); // artifacts counted once + timed Luck
assert.equal(result.luckBreakdown.special,3);assert.equal(result.luckBreakdown.personal,1.2);
assert.ok(Math.abs(result.luckAtRoll-2277.92)<1e-8);assert.equal(saved.luck_at_roll,result.luckAtRoll);assert.equal(commits.length,1);
result=await run('empyrean-pickaxe',{rolls:{'empyrean-pickaxe':1000}},'deep_strike');assert.equal(result.equipmentPassives.alignmentRoll,true);assert.ok(Math.abs(result.luckBreakdown.personal-51.55)<1e-9);
result=await run('eternity-pickaxe',{rolls:{'eternity-pickaxe':1000}});assert.equal(result.equipmentPassives.eternityRoll,true);assert.ok(Math.abs(saved.mutation_chance_multiplier-51.375)<1e-9);
result=await run('silly-fun-happy-pickaxe');assert.equal(result.cooldown.durationMs,5000);assert.ok(Math.abs(saved.mutation_chance_multiplier-.625)<1e-9);
for(const id of Object.keys(PICKAXE_STATS)) {result=await run(id);assert.equal(commits[0].p_state.rolls[id],1);assert.ok(Number.isFinite(result.value));}
forceProcs=true;
result=await run('the-accelerator',{spool:200});assert.ok(commits[0].p_bonus);assert.equal(commits[0].p_state.spool,201);assert.equal(commits[0].p_state.rolls['the-accelerator'],1);assert.ok(commits[0].p_bonus.luck_at_roll<result.luckAtRoll);assert.equal(rpcs.filter(n=>n==='record_gem_mutation_combination').length,2);
result=await run('the-excavator');assert.equal(commits[0].p_loot,'lucky-potion-1');assert.equal(commits[0].p_state.excavations,1);
result=await run('silly-fun-happy-pickaxe');assert.ok(['silly-small','silly-large','happy'].every(id=>saved.mutation_ids.includes(id)));
console.log('Actual optimized roll handler: all nine builds, layered Luck, +50 burst components, sub-1 mutation and speed, and single state commit passed.');

forceProcs=false;
qolSettings={enableBuffs:false,discoveryKeep:false};
for(const id of Object.keys(PICKAXE_STATS)) {
 result=await run(id,{},'slow_starter');
 assert.deepEqual(result.finalStats,{luck:1,rollSpeed:1,weightLuck:1,weightMultiplier:1});
 assert.equal(result.cooldown.durationMs,2500);
 assert.equal(saved.luck_at_roll,1);
 assert.equal(saved.final_weight,saved.rolled_weight);
 assert.ok(!rpcs.includes('spend_one_roll_charge'),'disabled buffs retain one-roll charges');
}
qolSettings={autoKeep:false,discoveryKeep:false,gemFilter:{'Test gem':'SELL'}};
result=await run('celestial-pickaxe');assert.equal(result.gemFilter.sold,true);assert.equal(result.specimenId,null);
for(const status of ['ambiguous','protected']){
 bundleResponse={status,keepInInventory:true};result=await run('celestial-pickaxe');assert.equal(result.gemFilter.sold,false);assert.ok(!rpcs.includes('sell_inventory_gem'));
}
bundleResponse={status:'deposited'};result=await run('celestial-pickaxe');assert.equal(result.specimenId,null);assert.ok(!rpcs.includes('sell_inventory_gem'));
bundleResponse={status:'none'};saleFailure=true;result=await run('celestial-pickaxe');assert.equal(result.gemFilter.sold,false);assert.equal(result.specimenId,101);saleFailure=false;
qolSettings={autoKeep:false,gemFilter:{'Test gem':'KEEP'}};result=await run('celestial-pickaxe');assert.equal(result.gemFilter.keep,true);assert.ok(!rpcs.includes('bundle_route_roll'));assert.ok(!rpcs.includes('sell_inventory_gem'));
qolSettings={autoKeep:true,autoKeepEffectiveRarity:1,gemFilter:{'Test gem':'SELL'}};result=await run('celestial-pickaxe');assert.equal(result.gemFilter.reason,'auto-keep');assert.equal(result.gemFilter.sold,false);
console.log('QoL optimized-handler tests: all builds at base stats, cooldown, preserved charges, KEEP/SELL, bundle protections and sale failure passed.');

qolSettings={autoKeep:false,discoveryKeep:false,gemFilter:{'Test gem':'SELL'}};craftActive=true;
for(const preserved of [false,true]){
 craftResponse={deposited:true,preserved,requirementIndex:0};result=await run('celestial-pickaxe');
 assert.equal(result.autoCraft.deposited,true);assert.ok(!rpcs.includes('sell_inventory_gem'));
 assert.equal(result.specimenId,preserved?101:null);
}
qolSettings.gemFilter['Test gem']='KEEP';result=await run('celestial-pickaxe');assert.ok(!rpcs.includes('deposit_equipment_material'));assert.equal(result.specimenId,101);
console.log('QoL crafting integration: deposit before SELL, Conservation retention, and KEEP bypass passed.');

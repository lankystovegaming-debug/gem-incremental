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
let forceProcs=false, forceLoss=false;
const bg=[];globalThis.EdgeRuntime={waitUntil:p=>bg.push(p)};
Object.defineProperty(globalThis,'crypto',{value:{getRandomValues(a){a[0]=forceLoss && /jackpotRoll/.test(new Error().stack)?0:forceProcs && /finishEquipmentRoll|exclusiveMutations/.test(new Error().stack)?0:2**31;return a;}},configurable:true});
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
    private_feature_gems:[{name:'Test gem',rarity:100000,base_weight:100,value_per_gram:2,affected_by_luck:true,availability_mode:'always',special_gem:false},{name:'Quartz',rarity:2,base_weight:1,value_per_gram:1,affected_by_luck:true,availability_mode:'always',special_gem:false}]};
   data=tables[this.table]??(this.singleRow?null:[]);
  }
  return Promise.resolve({data,error:null,count}).then(resolve,reject);
 }
}
const client={from:t=>new Query(t),rpc:async(name,args)=>{
 rpcs.push(name);
 if(name==='sell_inventory_gem' && saleFailure)return {data:null,error:{message:"sale_failed"}};
 const responses={deposit_equipment_material:craftResponse,qol_roll_context:{settings:qolSettings,discoveries:['Test gem']},sell_inventory_gem:123,bundle_route_roll:bundleResponse,crystal_player_effects:{luckBonus:2,finalLuckMultiplier:3},player_expedition_artifact_effects:{luckBonus:3},
  claim_equipment_roll:{status:'claimed',genuineRoll:5001,leaseId:'lease',nextRollAt:new Date(Date.now()+1000).toISOString()},record_server_roll:{total_rolls:5001},commit_jackpot_loss:{total_rolls:5001}};
 if(name==='commit_equipment_roll'){commits.push(args);return {data:{bonus:args.p_bonus?{id:102,...args.p_bonus}:null},error:null};}
 return {data:responses[name]??null,error:null};
}};
async function run(id,state={},enchant=null) {
 commits=[];saved=null;rpcs=[];
 player={id:uid,inventory_capacity:100,total_rolls:5000,next_roll_at:null,mutation_luck:1,equipment_state:state,rarity_resonance:0,misty_mutation_boost_rolls:10,misty_mutation_boost_stacks:5,player_research_effects:{luck_multiplier:9,roll_speed_multiplier:7,mutation_chance_multiplier:30,weight_luck_multiplier:20,gem_value_multiplier:100,extreme_luck_multiplier:50,statistical_breakthrough:true}};
 equipment=[{id:1,equipment_id:id,category:'pickaxe',enchant_id:enchant,enchant_state:{rolls:6},enchant_grade:'normal'},
 {id:2,category:'clover',luck_bonus:.1},{id:3,category:'lantern',mutation_chance_bonus:.25},{id:4,category:'boots',weight_luck_bonus:.15},{id:5,category:'bag',weight_multiplier_bonus:.15}];
 boosts=[{family:'luck',effect_value:7}];oneRoll={effect_value:1000};admin={luck_bonus:5,luck_multiplier:2,roll_speed_bonus:.1,roll_speed_multiplier:3,weight_luck_bonus:.2,weight_luck_multiplier:2,weight_multiplier_bonus:.3,weight_multiplier_multiplier:2,mutation_luck_bonus:.2,mutation_luck_multiplier:2};
 const response=await handler.fetch(new Request('http://local/roll',{method:'POST'}),{userClaims:{id:uid},supabase:client,supabaseAdmin:client});
 const result=await response.json();await Promise.all(bg.splice(0));assert.equal(response.status,200,JSON.stringify(result));return result;
}

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
let result=await run('all-in-pickaxe',{},'deep_strike');
near(result.luckAtRoll,510);near(result.finalStats.rollSpeed,.9);near(result.finalStats.weightLuck,.6);near(result.finalStats.weightMultiplier,.8);
near(saved.mutation_chance_multiplier,.6);near(result.value,saved.final_weight*2*saved.mutation_multiplier);
assert.ok(!rpcs.includes('spend_one_roll_charge'));assert.equal(commits.length,1);
forceProcs=true;
result=await run('all-rounder-toy');assert.ok(saved.mutation_ids.includes('balanced'));near(saved.mutation_multipliers.balanced,1.2);assert.equal(result.effectiveRarityExact,'200000000');
forceProcs=false;
for(const settings of [{discoveryKeep:false},{enableBuffs:false,discoveryKeep:false}]) {
 qolSettings=settings;result=await run('money-pickaxe');assert.equal(result.gem.name,'Quartz');assert.ok(result.gem.rarity<100);
}
qolSettings={discoveryKeep:false};forceLoss=true;
result=await run('jackpot-slot',{rolls:{'jackpot-slot':76},batchHistory:{raw5m:3,heavy5:250}});
assert.equal(result.houseEdge,true);assert.equal(result.gem,null);assert.equal(saved,null);assert.equal(commits.length,0);
assert.equal(result.equipmentPassives.state.rolls['jackpot-slot'],77);assert.equal(result.equipmentPassives.state.batchHistory.heavy5,250);
assert.equal(result.lifetimeStats.totalRolls,5001);assert.ok(rpcs.includes('commit_jackpot_loss'));
for(const name of ['bundle_route_roll','record_server_roll','record_gem_mutation_combination','sell_inventory_gem']) assert.ok(!rpcs.includes(name),name);
assert.ok(rpcs.includes('spend_one_roll_charge'));assert.equal(rpcs.filter(n=>n==='record_guild_roll_activity').length,1);
assert.ok(rpcs.includes('record_season_roll'));assert.ok(rpcs.includes('record_abandoned_mine_roll'));
console.log('Five-item optimized handler: All-In isolation/admin modifiers, Balanced, hard rarity ceiling and reward-free House Edge passed.');

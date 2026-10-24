import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {PICKAXE_STATS} from '../supabase/functions/roll/equipmentRules.js';
const url=p=>new URL(p,import.meta.url).href;
let source=readFileSync(new URL('../supabase/functions/roll/index.ts',import.meta.url),'utf8')
 .replace(/import\s*\{\s*withSupabase\s*\}\s*from\s*"npm:@supabase\/server";/,'const withSupabase=(_options,handler)=>(req)=>handler(req,globalThis.__rollTestCtx);')
 .replace(/import\s*\{\s*Redis\s*\}\s*from\s*"npm:@upstash\/redis@1\.38\.4";/,'class Redis { constructor() {} }')
 .replace(/import\s*\{\s*Ratelimit\s*\}\s*from\s*"npm:@upstash\/ratelimit@2\.1\.0";/,'class Ratelimit { static slidingWindow(){return null;} async limit(){return {success:true};} }')
 .replace('"./availabilityRules.ts"',JSON.stringify(url('../supabase/functions/roll/availabilityRules.ts')))
 .replace('"./eventRules.ts"',JSON.stringify(url('../supabase/functions/roll/eventRules.ts')))
 .replace('"./equipmentRules.js"',JSON.stringify(url('../supabase/functions/roll/equipmentRules.js')));
source=stripTypeScriptTypes(source);
let forceProcs=false, forceOrdinaryProcs=false, forceLoss=false;
const bg=[];globalThis.EdgeRuntime={waitUntil:p=>bg.push(p)};
globalThis.Deno={env:{get:()=>''}};
Object.defineProperty(globalThis,'crypto',{value:{getRandomValues(a){const stack=new Error().stack;a[0]=forceLoss && /jackpotRoll/.test(stack)?0:forceProcs && /finishEquipmentRoll|exclusiveMutations/.test(stack)?0:forceOrdinaryProcs && /rollGemMutations/.test(stack)?0:2**31;return a;}},configurable:true});
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(source+'\n//# sourceURL=roll-handler-under-test.mjs').toString('base64'));
let player,equipment,boosts,oneRoll,admin,commits,saved,rpcs,rpcCalls;
const defaultMutationCatalog=[{id:'polished',name:'Polished',chance:100,multiplier:1.5},{id:'shifted',name:'Shifted',chance:5,multiplier:35}];
let activeMutationCatalog=defaultMutationCatalog;
let activeMutationCatalogVersion=1;
let activeBiomeSnapshot=null,extraBiomeGems=[];
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
    museum_artifact_registrations:[],player_gem_mutation_combinations:[],game_mutations:activeMutationCatalog,
    private_feature_gems:[{name:'Test gem',rarity:100000,base_weight:100,value_per_gram:2,affected_by_luck:true,availability_mode:'always',special_gem:false},{name:'Quartz',rarity:2,base_weight:1,value_per_gram:1,affected_by_luck:true,availability_mode:'always',special_gem:false}]};
   data=tables[this.table]??(this.singleRow?null:[]);
  }
  return Promise.resolve({data,error:null,count}).then(resolve,reject);
 }
}
const rollContext=()=>({
 player,ban:null,inventoryCount:0,activeAutoCraft:craftActive?'craft':null,equipment,mineArtifacts:[],
 qol:{settings:qolSettings,discoveries:['Test gem']},activeBoosts:boosts,oneRollBoost:oneRoll,
 activeAdminEvent:admin,globalEvent:null,crystalEffects:{luckBonus:2,finalLuckMultiplier:3},
 expeditionArtifactEffects:{luckBonus:3},guild:{membership:null,shopBuffIds:[]},
 deepcoreContext:null,deepSeaContext:null,pets:[],equipmentBonusRows:equipment,contextWarnings:[],
 catalogVersions:{gems:1,mutations:activeMutationCatalogVersion},
 gemCatalog:[...extraBiomeGems,{name:'Test gem',rarity:100000,base_weight:100,value_per_gram:2,affected_by_luck:true,availability_mode:'always',special_gem:false},{name:'Quartz',rarity:2,base_weight:1,value_per_gram:1,affected_by_luck:true,availability_mode:'always',special_gem:false}],
 mutationCatalog:activeMutationCatalog
});
const client={from:t=>new Query(t),rpc:async(name,args)=>{
 rpcs.push(name);rpcCalls.push({name,args:structuredClone(args)});
 if(name==='sell_inventory_gem' && saleFailure)return {data:null,error:{message:"sale_failed"}};
 if(name==='roll_prepare_context_v2')return {data:rollContext(),error:null};
 if(name==='roll_begin_batch_subroll_v2')return {data:{context:rollContext(),mythicSurge:{active:false,boosted:false,progress:0}},error:null};
 if(name==='roll_finish_bookkeeping'){
  if(args.p_phase==='critical'){
   player.total_rolls+=1;
   return {data:{lifetimeStats:{total_rolls:player.total_rolls},mutationCombination:{},guildPoints:null,globalEventProgress:null,errors:[]},error:null};
  }
  if((args.p_phase==='background'||args.p_phase==='loss')&&args.p_payload.consumeOneRollCharge)oneRoll=null;
  return {data:{errors:[]},error:null};
 }
 const responses={qol_roll_context:{settings:qolSettings,discoveries:['Test gem']},crystal_player_effects:{luckBonus:2,finalLuckMultiplier:3},player_expedition_artifact_effects:{luckBonus:3},
  claim_equipment_roll_batch:{biomeSnapshot:structuredClone(activeBiomeSnapshot),status:'claimed',genuineRoll:5001,leaseId:'lease',nextRollAt:new Date(Date.now()+1000).toISOString(),mythicSurge:{active:false,boosted:false,progress:0}},record_server_roll:{total_rolls:5001}};
 if(name==='roll_route_result'){
  const bundle=args.p_external_deposit?{status:args.p_external_deposit,keepInInventory:false}:args.p_filter_keep?{status:'kept',keepInInventory:true}:bundleResponse;
  const autoCraft=craftActive&&bundle.status!=='deposited'&&!bundle.keepInInventory?craftResponse:{deposited:false,preserved:false};
  return {data:{bundle,autoCraft},error:null};
 }
 if(name==='roll_commit_result'){
  activeBiomeSnapshot=null; // ambient state changes after the accepted batch starts
  commits.push(args);player.equipment_state=structuredClone(args.p_state);Object.assign(player,args.p_player_patch);
  player.total_rolls+=1;
  if(args.p_include_background&&args.p_bookkeeping.consumeOneRollCharge)oneRoll=null;
  saved=args.p_save_primary&&!args.p_relic_drop?{id:101,...args.p_primary_specimen}:null;
  const sold=args.p_auto_sell&&!saleFailure;
  return {data:{primary:saved,duplicate:args.p_duplicate?{id:103,...args.p_duplicate}:null,leaseReleased:args.p_release_on_success,sale:{sold,money:sold?123:null,error:args.p_auto_sell&&saleFailure?'sale_failed':null},equipment:{bonus:args.p_bonus?{id:102,...args.p_bonus}:null,bookkeeping:{lifetimeStats:{total_rolls:player.total_rolls},mutationCombination:{},guildPoints:null,globalEventProgress:null,errors:[]},backgroundBookkeeping:args.p_include_background?{errors:[]}:null}},error:null};
 }
 if(name==='commit_jackpot_loss'){player.equipment_state=structuredClone(args.p_state);player.total_rolls+=1;return {data:{total_rolls:player.total_rolls},error:null};}
 if(name==='record_server_roll'){player.total_rolls+=1;return {data:{total_rolls:player.total_rolls},error:null};}
 if(name==='spend_one_roll_charge'){oneRoll=null;return {data:0,error:null};}
 return {data:responses[name]??null,error:null};
}};
async function run(id,state={},enchant=null,batchSize=1,options={}) {
 commits=[];saved=null;rpcs=[];rpcCalls=[];
 activeBiomeSnapshot=options.biomeSnapshot??null;extraBiomeGems=options.biomeGems??[];
 activeMutationCatalog=options.mutationCatalog??defaultMutationCatalog;
 activeMutationCatalogVersion+=1;
 player={id:uid,inventory_capacity:100,total_rolls:5000,next_roll_at:null,mutation_luck:1,equipment_state:state,rarity_resonance:0,misty_mutation_boost_rolls:options.mistyRolls??0,misty_mutation_boost_stacks:options.mistyStacks??0,player_research_effects:{luck_multiplier:9,roll_speed_multiplier:7,mutation_chance_multiplier:30,weight_luck_multiplier:20,gem_value_multiplier:100,extreme_luck_multiplier:50,statistical_breakthrough:true}};
 equipment=[{id:1,equipment_id:id,category:'pickaxe',enchant_id:enchant,enchant_state:{rolls:6},enchant_grade:'normal'},
 {id:2,category:'clover',luck_bonus:.1},{id:3,category:'lantern',mutation_chance_bonus:.25},{id:4,category:'boots',weight_luck_bonus:.15},{id:5,category:'bag',weight_multiplier_bonus:.15}];
 boosts=[{family:'luck',effect_value:7}];oneRoll={effect_value:1000,charges:1,consumable_id:'mythic-potion'};admin={luck_bonus:5,luck_multiplier:2,roll_speed_bonus:.1,roll_speed_multiplier:3,weight_luck_bonus:.2,weight_luck_multiplier:2,weight_multiplier_bonus:.3,weight_multiplier_multiplier:2,mutation_luck_bonus:.2,mutation_luck_multiplier:2};
 globalThis.__rollTestCtx={userClaims:{id:uid},supabase:client,supabaseAdmin:client};
 const response=await handler.fetch(new Request('http://local/roll',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({batchSize})}));
 const result=await response.json();await Promise.all(bg.splice(0));assert.equal(response.status,200,JSON.stringify(result));return result;
}

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
let result=await run('all-in-pickaxe',{},'deep_strike');
near(result.luckAtRoll,1010);near(result.finalStats.rollSpeed,1.29);near(result.finalStats.weightLuck,.7);near(result.finalStats.weightMultiplier,.9);
near(saved.mutation_chance_multiplier,.7);near(result.value,saved.final_weight*2*saved.mutation_multiplier);
assert.ok(!rpcs.includes('spend_one_roll_charge'));assert.equal(commits.length,1);
forceProcs=true;
forceOrdinaryProcs=true;
result=await run('all-in-pickaxe');
assert.deepEqual(saved.mutation_ids.sort(),['polished','tryhard']);
near(saved.mutation_multipliers.tryhard,10);near(saved.mutation_multipliers.polished,1.5);
near(saved.mutation_multiplier,15);near(result.value,saved.final_weight*2*15);

const exactCapCatalog=[{id:'cap-a',name:'Cap A',chance:1,multiplier:1000},{id:'cap-b',name:'Cap B',chance:1,multiplier:100}];
result=await run('money-pickaxe',{},null,1,{mutationCatalog:exactCapCatalog});
assert.equal(saved.mutation_multiplier,100000,'an exactly ×100,000 combination is unchanged');

const oversizedCatalog=[{id:'huge-a',name:'Huge A',chance:1,multiplier:1000},{id:'huge-b',name:'Huge B',chance:1,multiplier:1000}];
const anomalyWarnings=[];
const originalWarn=console.warn;
console.warn=(...args)=>anomalyWarnings.push(args);
try {
 result=await run('money-pickaxe',{},null,1,{mutationCatalog:oversizedCatalog});
} finally {
 console.warn=originalWarn;
}
assert.equal(saved.mutation_multiplier,100000,'an oversized combination is stored at the applied cap');
assert.equal(result.mutationMultiplier,100000,'the response exposes the applied cap');
assert.equal(anomalyWarnings.length,1);
assert.equal(anomalyWarnings[0][0],'MUTATION_VALUE_MULTIPLIER_CAP');
assert.deepEqual(anomalyWarnings[0][1].mutationIds,['huge-a','huge-b']);
assert.equal(anomalyWarnings[0][1].rawCalculatedMultiplier,1000000);
assert.equal(anomalyWarnings[0][1].appliedMultiplier,100000);
assert.equal(anomalyWarnings[0][1].playerId,uid);
assert.equal(anomalyWarnings[0][1].gemName,result.gem.name);
assert.equal(anomalyWarnings[0][1].rollNumber,5001);
assert.ok(Number.isNaN(Date.parse(anomalyWarnings[0][1].timestamp))===false);

console.warn=()=>{throw new Error('simulated logging outage');};
try {
 result=await run('money-pickaxe',{},null,1,{mutationCatalog:oversizedCatalog});
 assert.equal(result.mutationMultiplier,100000,'logging failures do not fail successful rolls');
} finally {
 console.warn=originalWarn;
}
console.log('Mutation-value safeguard: below/equal cap preservation, oversized cap, diagnostics and fail-open logging passed.');

const mistyOnlyCatalog=[{id:'misty',name:'Misty',chance:1,multiplier:2}];
const mistyBatch=await run('money-pickaxe',{},null,4,{mutationCatalog:mistyOnlyCatalog});
assert.deepEqual(
 mistyBatch.results.map(entry=>entry.activeMutationEffects.find(effect=>effect.id==='misty')?.multiplier),
 [2.5,6.25,15.625,15.625],
 'Misty stacks 1→2→3 and never creates stack 4'
);
assert.deepEqual(
 commits.map(call=>[call.p_player_patch.misty_mutation_boost_stacks,call.p_player_patch.misty_mutation_boost_rolls]),
 [[1,10],[2,10],[3,10],[undefined,undefined]],
 'each genuine batch subroll persists the required Misty state without a redundant fourth write'
);
assert.ok(mistyBatch.results.every(entry=>entry.activeMutationEffects.find(effect=>effect.id==='misty')?.rollsRemaining===10));
assert.equal(player.misty_mutation_boost_stacks,3);
assert.equal(player.misty_mutation_boost_rolls,10);
const cappedMistyRefresh=await run('money-pickaxe',{},null,1,{mutationCatalog:mistyOnlyCatalog,mistyRolls:4,mistyStacks:3});
assert.equal(cappedMistyRefresh.activeMutationEffects.find(effect=>effect.id==='misty')?.multiplier,15.625);
assert.equal(commits[0].p_player_patch.misty_mutation_boost_stacks,3);
assert.equal(commits[0].p_player_patch.misty_mutation_boost_rolls,10);
console.log('Misty safeguard: normal stacking, stack-three refresh and batch genuine-roll persistence passed.');

forceOrdinaryProcs=false;
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
assert.equal(rpcCalls.filter(call=>call.name==='roll_finish_bookkeeping'&&call.args.p_phase==='loss').length,1);
console.log('Five-item optimized handler: All-In isolation/admin modifiers, Balanced, hard rarity ceiling and reward-free House Edge passed.');

// Next batch runs through this same production-handler harness and live-shaped layers.
forceLoss=false;forceProcs=false;qolSettings={discoveryKeep:false};
const baseReality=await run('reality-shifter',{rolls:{'reality-shifter':498}});
assert.equal(saved.mutation_chance_multiplier,0);assert.deepEqual(saved.mutation_ids,[]);
assert.equal(baseReality.equipmentPassives.state.rolls['reality-shifter'],499);
forceProcs=true;
const shifted=await run('reality-shifter',{rolls:{'reality-shifter':499}});
assert.deepEqual(saved.mutation_ids,['shifted']);near(saved.mutation_multiplier,35);
assert.equal(saved.mutation_chance_multiplier,0);
assert.equal(shifted.equipmentPassives.state.rolls['reality-shifter'],500);
near(shifted.luckBreakdown.ordinary,baseReality.luckBreakdown.ordinary*400);
near(shifted.luckBreakdown.oneRoll,baseReality.luckBreakdown.oneRoll);
near(shifted.luckAtRoll,(shifted.luckBreakdown.ordinary+shifted.luckBreakdown.oneRoll)*shifted.luckBreakdown.world);
const postShift=await run('reality-shifter',{rolls:{'reality-shifter':500}});
assert.deepEqual(saved.mutation_ids,[]);near(postShift.luckAtRoll,baseReality.luckAtRoll);
forceProcs=false;
const baseBedrock=await run('bedrock-pickaxe',{foundation:95});
const burstBedrock=await run('bedrock-pickaxe',{foundation:0,bedrockBurst:10});
near(burstBedrock.luckBreakdown.base/baseBedrock.luckBreakdown.base,1.5);
assert.equal(burstBedrock.equipmentPassives.state.bedrockBurst,9);
assert.equal(burstBedrock.equipmentPassives.state.foundation,0);
qolSettings={discoveryKeep:false,maxLuck:1};
const capped=await run('bedrock-pickaxe',{foundation:98});
assert.equal(capped.gem.name,'Quartz');assert.equal(capped.finalStats.luck,1);
assert.equal(capped.luckAtRoll,1);assert.equal(saved.luck_at_roll,1);
assert.equal(capped.equipmentPassives.state.foundation,0);assert.equal(capped.equipmentPassives.state.bedrockBurst,10);
near(capped.finalStats.rollSpeed,baseBedrock.finalStats.rollSpeed);
near(capped.finalStats.weightLuck,baseBedrock.finalStats.weightLuck);
near(capped.finalStats.weightMultiplier,baseBedrock.finalStats.weightMultiplier);
qolSettings={discoveryKeep:false,maxLuck:7};forceProcs=true;
const cappedShift=await run('reality-shifter',{rolls:{'reality-shifter':499}});
assert.equal(cappedShift.luckAtRoll,7);assert.deepEqual(saved.mutation_ids,['shifted']);
qolSettings={discoveryKeep:false,maxLuck:1};forceProcs=false;
result=await run('all-in-pickaxe');assert.equal(result.finalStats.luck,1);assert.equal(result.finalStats.uncappedLuck,1010);
near(result.finalStats.rollSpeed,1.29);assert.equal(result.gem.flatChanceMultiplier,4);
for(const invalid of [-1,'NaN','Infinity',false,{},1e100]) {
 qolSettings={discoveryKeep:false,maxLuck:invalid};result=await run('all-in-pickaxe');assert.equal(result.luckAtRoll,1010);
}
console.log('Reality/Bedrock optimized handler: exclusive zero-mutation bypass, 499/500/501, authoritative Luck order, burst state, capped low-tier acquisition, independent stats and All-In passed.');

qolSettings={discoveryKeep:false};forceProcs=false;
const batch=await run('money-pickaxe',{},null,4);
assert.equal(batch.batchSize,4);assert.equal(batch.results.length,4);
assert.deepEqual(batch.results.map(entry=>entry.equipmentPassives.genuineRoll),[5001,5002,5003,5004]);
assert.deepEqual(batch.results.map(entry=>entry.equipmentPassives.state.rolls['money-pickaxe']),[1,2,3,4]);
assert.deepEqual(batch.results.map(entry=>entry.lifetimeStats.total_rolls),[5001,5002,5003,5004]);
assert.deepEqual(batch.results.map(entry=>entry.luckBreakdown.oneRoll),[1000,0,0,0]);
assert.ok(batch.results[0].luckAtRoll>batch.results[1].luckAtRoll);
assert.equal(player.total_rolls,5004);
assert.equal(rpcs.filter(name=>name==='claim_equipment_roll_batch').length,1);
assert.equal(rpcs.filter(name=>name==='roll_commit_result').length,4);
assert.equal(rpcCalls.filter(call=>call.name==='roll_prepare_context_v2').length,1);
assert.equal(rpcCalls.filter(call=>call.name==='roll_begin_batch_subroll_v2').length,3);
assert.equal(rpcs.filter(name=>name==='roll_route_result').length,4);
assert.equal(rpcs.filter(name=>name==='release_server_roll').length,0);
assert.equal(rpcCalls.filter(call=>call.name==='claim_guild_mythic_surge').length,0);
assert.equal(rpcCalls.filter(call=>call.name==='roll_finish_bookkeeping'&&call.args.p_phase==='critical').length,0);
assert.equal(rpcCalls.filter(call=>call.name==='roll_finish_bookkeeping'&&call.args.p_phase==='background').length,0);
assert.equal(commits.filter(call=>call.p_include_background).length,4);
assert.deepEqual(commits.map(call=>call.p_bookkeeping.progressPayload.usedOneRollPotion),[true,false,false,false]);
assert.deepEqual(commits.map(call=>call.p_bookkeeping.progressPayload.usedMythicPotion),[true,false,false,false]);
near(batch.cooldown.durationMs,batch.results[0].cooldown.durationMs);
console.log('Optimized handler batch: one Mythic-boosted roll, three ordinary rolls, one spent charge, four counters and state commits passed.');

const allInBatch=await run('all-in-pickaxe',{},'deep_strike',4);
assert.equal(allInBatch.results.length,4);
for(const entry of allInBatch.results) {
 near(entry.luckAtRoll,1010);near(entry.finalStats.rollSpeed,1.29);
 near(entry.finalStats.weightLuck,.7);near(entry.finalStats.weightMultiplier,.9);
 assert.equal(entry.gem.flatChanceMultiplier,4);
}
assert.deepEqual(allInBatch.results.map(entry=>entry.luckBreakdown.oneRoll),[0,0,0,0]);
assert.equal(rpcs.filter(name=>name==='roll_commit_result').length,4);
console.log('Optimized handler All-In batch: approved stats, restrictions and 4× flat chance apply independently to every subroll.');

forceLoss=true;
const lossBatch=await run('jackpot-slot',{},null,4);
assert.equal(lossBatch.results.length,4);assert.ok(lossBatch.results.every(entry=>entry.houseEdge));
assert.deepEqual(lossBatch.results.map(entry=>entry.equipmentPassives.genuineRoll),[5001,5002,5003,5004]);
assert.deepEqual(lossBatch.results.map(entry=>entry.lifetimeStats.totalRolls),[5001,5002,5003,5004]);
assert.equal(player.total_rolls,5004);
assert.equal(rpcs.filter(name=>name==='commit_jackpot_loss').length,4);
assert.equal(rpcs.filter(name=>name==='record_server_roll').length,0);
assert.equal(rpcCalls.filter(call=>call.name==='roll_finish_bookkeeping'&&call.args.p_phase==='loss').length,4);
forceLoss=false;
console.log('Optimized handler House Edge batch: four genuine losses and four total-roll increments passed.');

// Run the actual handler through a stale (but accepted) occurrence boundary.
qolSettings={discoveryKeep:false};
const biomeGems=[{name:'Permafrost',rarity:12000000,base_weight:850,value_per_gram:8000,affected_by_luck:true,availability_mode:'always'}];
const acceptedSnapshot={version:'biomes-v1.1',tournament:false,acceptedAt:'2026-01-01T00:00:00Z',occurrence:{id:'frozen-1',key:'Frozen',startsAt:'2026-01-01T00:00:00Z',endsAt:'2026-01-01T00:05:00Z',denominators:{Permafrost:1}}};
const frozenBatch=await run('all-in-pickaxe',{},null,4,{biomeSnapshot:acceptedSnapshot,biomeGems});
assert.ok(frozenBatch.results.every(r=>r.gem.name==='Permafrost'));
assert.ok(frozenBatch.results.every(r=>r.biome.occurrence.id==='frozen-1'));
assert.ok(frozenBatch.results.every(r=>r.gem.rarity===12000000));
assert.equal(rpcs.filter(n=>n==='claim_equipment_roll_batch').length,1);
const noRetrospective=await run('all-in-pickaxe',{},null,4,{biomeGems});
assert.ok(noRetrospective.results.every(r=>r.gem.name==='Test gem'));
const neutralBatch=await run('all-in-pickaxe',{},null,4,{biomeSnapshot:{...acceptedSnapshot,tournament:true},biomeGems});
assert.ok(neutralBatch.results.every(r=>r.gem.name==='Test gem'));
near(neutralBatch.results[0].luckAtRoll,noRetrospective.results[0].luckAtRoll);
console.log('Biome actual-handler batch: frozen acceptance survives ambient expiry, no retrospective effects, canonical storage, single claim, and neutral mode retains personal Luck.');

qolSettings={discoveryKeep:false,maxLuck:1};
forceProcs=true;
const biomeBreakneck=await run('the-accelerator',{spool:200},null,1,{biomeSnapshot:acceptedSnapshot,biomeGems});
assert.equal(biomeBreakneck.equipmentPassives.breakneck.gem_name,'Permafrost');
assert.equal(biomeBreakneck.equipmentPassives.breakneck.rarity,12000000);
assert.equal(commits.length,1,'bonus specimen never creates another genuine commit');
const closedExclusive={name:'Absolute Zero',rarity:125000000,base_weight:.01,value_per_gram:5000000000,affected_by_luck:true,availability_mode:'always',metadata:{requiredBiome:'Frozen'}};
const outsideBreakneck=await run('the-accelerator',{spool:200},null,1,{biomeGems:[closedExclusive]});
assert.notEqual(outsideBreakneck.equipmentPassives.breakneck.gem_name,'Absolute Zero');
forceProcs=false;
console.log('Breakneck bonus uses accepted biome eligibility and cannot leak a closed exclusive; no extra genuine commit.');

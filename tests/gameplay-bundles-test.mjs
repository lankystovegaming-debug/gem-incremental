import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleBundles} from '../supabase/functions/bundles/handler.js';
import {bundleProgress,requirementLabel} from '../src/logic/bundles.js';
const uid='00000000-0000-0000-0000-000000000001';
let calls=[];
const admin={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})}),rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true},error:null};}};
const request=(body,method='POST')=>new Request('https://test.invalid/bundles',{method,...(method==='POST'?{body:JSON.stringify(body)}:{})});
assert.equal((await handleBundles(request({}),null,admin)).status,401);
assert.equal((await handleBundles(request({},'GET'),uid,admin)).status,405);
assert.equal((await handleBundles(request({},'OPTIONS'),null,admin)).status,204);
for(const body of [null,[],{action:'route_roll',specimen:{}},{action:'set_auto',requirementId:'x',enabled:'true'},
 {action:'contribute',requirementId:'x',specimenIds:[]},{action:'contribute',requirementId:'x',specimenIds:[9007199254740992]},
 {action:'contribute',requirementId:'x',specimenIds:['9223372036854775808']},{action:'candidates',requirementId:'x',offset:-1}]){
 assert.equal((await handleBundles(request(body),uid,admin)).status,400);
}
assert.equal(calls.length,0);
await handleBundles(request({action:'contribute',playerId:'attacker',requirementId:'master-crown',specimenIds:['9007199254740993'],confirmCrown:true,rarity:999999999,progress:100000}),uid,admin);
assert.deepEqual(calls.pop(),{name:'bundle_contribute',args:{p_player_id:uid,p_requirement_id:'master-crown',p_specimen_ids:['9007199254740993'],p_confirm_crown:true}});
await handleBundles(request({action:'set_auto',playerId:'attacker',requirementId:'jewellers-01',enabled:false}),uid,admin);
assert.equal(calls.pop().args.p_player_id,uid);
const denied={...admin,rpc:async()=>({data:null,error:{message:'bundle_locked'}})};
assert.equal((await handleBundles(request({}),uid,denied)).status,409);
assert.equal(bundleProgress({requirements:[{contributed:10000,required_amount:10000},{contributed:0,required_amount:1}]}).complete,false);
assert.equal(bundleProgress({requirements:[{contributed:1,required_amount:2}]}).percent,50);
assert.equal(bundleProgress({requirements:[]}).complete,false);
assert.match(requirementLabel({gem_name:'Diamond',minimum_weight_multiplier:10}),/10× final weight/);
// Execute the real roll outcome function. Donated/ambiguous/Crown results never invoke Auto Sell.
const main=readFileSync(new URL('../main.js',import.meta.url),'utf8');
const start=main.indexOf('async function resolveOutcome(data) {');
const end=main.indexOf('\n\n// =========================================================',start);
const resolve=new Function('icons','recipes','rarityTier','shouldAutoKeep','shouldAutoSell','sellCloudGem',main.slice(start,end)+';return resolveOutcome;')(
 {book:'book',shield:'shield',anvil:'anvil'},[],()=>({id:'common'}),()=>false,()=>true,()=>{throw Error('must not sell');});
for(const bundle of [{status:'deposited'},{status:'ambiguous',keepInInventory:true},{status:'protected',keepInInventory:true}]){
 const out=await resolve({bundle,specimenId:123,gem:{rarity:2300}});assert.notEqual(out.type,'auto-sold');
}
console.log('Gameplay Bundle endpoint and presentation tests passed.');

// Background rolling on other pages honors exactly the same protection.
const automation=readFileSync(new URL('../src/ui/globalAutomation.js',import.meta.url),'utf8');
const aa=automation.indexOf('async function processRoll(data) {'),bb=automation.indexOf('\nasync function run()',aa);
const recorded=[];
const processRoll=new Function('rarityTier','shouldAutoKeep','getSettings','shouldAutoSell','sellCloudGem','recordSessionRoll','window','CustomEvent','showGlobalRollEffect',automation.slice(aa,bb)+';return processRoll;')(
 ()=>({id:'common'}),()=>false,()=>({autoSell:true}),()=>true,()=>{throw Error('must not sell');},(_,o)=>recorded.push(o),{dispatchEvent(){}},class{},()=>{});
for(const bundle of [{status:'deposited'},{status:'ambiguous',keepInInventory:true},{status:'protected',keepInInventory:true}])await processRoll({bundle,specimenId:1,gem:{rarity:2300}});
assert.deepEqual(recorded.map(o=>o.type),['bundle-contributed','auto-kept','auto-kept']);

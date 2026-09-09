import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import * as rules from '../supabase/functions/roll/equipmentRules.js';
import {realityBedrockRecipes,applyEquipmentOverhaul} from '../src/data/equipmentOverhaul.js';
const {prepareEquipmentRoll:prepare,finishEquipmentRoll:finish,exclusiveMutations,sanitizeMaxLuck,capGemLuck}=rules;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
for(const n of [0,498,499,500,998,999]) {
 const context=prepare('reality-shifter',{rolls:{'reality-shifter':n}});
 assert.equal(context.flags.realityShift,(n+1)%500===0);
 assert.equal(exclusiveMutations(context.id,()=>.199999,true,context.flags).length,(n+1)%500===0?1:0);
 assert.deepEqual(exclusiveMutations(context.id,()=>.2,true,context.flags),[]);
 assert.deepEqual(exclusiveMutations(context.id,()=>0,false,context.flags),[]);
 assert.equal(prepare(context.id,context.state,()=>0,false).flags.realityShift,false);
 assert.deepEqual(finish(context,{genuine:false}).state,context.state);
}
// Other equipment advances only its own count, and switching preserves progress.
let state={rolls:{'reality-shifter':499},foundation:98,bedrockBurst:0};
state=finish(prepare('fortune-pickaxe',state),{gem:{rarity:2}}).state;
assert.equal(prepare('reality-shifter',state).flags.realityShift,true);
assert.equal(state.foundation,98);
for(const [rarity,gain] of [[1,2],[9,2],[10,3],[49,3],[50,5],[99,5],[100,0],[999,0],[1000,0],[1e9,0]]) {
 assert.equal(finish(prepare('bedrock-pickaxe',{}),{gem:{rarity}}).state.foundation,gain);
}
state=finish(prepare('bedrock-pickaxe',state),{gem:{rarity:2}}).state;
assert.equal(state.foundation,0);assert.equal(state.bedrockBurst,10);
for(let remaining=10;remaining>0;remaining--) {
 const context=prepare('bedrock-pickaxe',state);
 assert.equal(context.flags.foundationBurst,true);near(context.stats[0],37.5);near(context.stats[3],6.25);near(context.stats[4],1.705);
 assert.equal(prepare('bedrock-pickaxe',state,()=>0,false).flags.foundationBurst,false);
 assert.deepEqual(finish(context,{genuine:false,gem:{rarity:2}}).state,state);
 state=finish(context,{gem:{rarity:2}}).state;
 assert.equal(state.bedrockBurst,remaining-1);assert.equal(state.foundation,0);
}
assert.equal(prepare('bedrock-pickaxe',state).flags.foundationBurst,false);
assert.equal(finish(prepare('bedrock-pickaxe',state),{gem:{rarity:99}}).state.foundation,5);
for(const v of [null,undefined,'',' ',NaN,Infinity,-1,0,.9,false,true,{},[],1e100])assert.equal(sanitizeMaxLuck(v),null);
for(const v of [1,1.5,100,Number.MAX_SAFE_INTEGER]) {assert.equal(sanitizeMaxLuck(v),v);assert.equal(capGemLuck(v*2,v),v);}
assert.equal(capGemLuck(.01,1),.01);
const source=readFileSync(new URL('../supabase/functions/roll/index.ts',import.meta.url),'utf8');
assert.ok(source.includes(readFileSync(new URL('../supabase/functions/roll/equipmentRules.js',import.meta.url),'utf8').trim()),'single-file build stays in sync');
const selection=source.slice(source.indexOf('function rollGemWithPickaxePassives('),source.indexOf('// MUTATION RNG'));
let rng=.5;
const catalog=[{name:'Common',rarity:2},{name:'Uncommon',rarity:10},{name:'Rare',rarity:50},{name:'Epic',rarity:100},{name:'Ultra',rarity:1e9},{name:'Flat',rarity:500,affectedByLuck:false}];
const choose=new Function('gems','random01','eligibleEquipmentGems','flatEquipmentChance','specialChance','eventGemIsEligible','eventGemLuckFactor','capGemLuck','fortuneLuckFactor',stripTypeScriptTypes(selection)+';return rollGemWithPickaxePassives;');
const roll=choose(catalog,()=>rng,rules.eligibleEquipmentGems,rules.flatEquipmentChance,rules.specialChance,()=>true,()=>1e6,capGemLuck,rules.fortuneLuckFactor);
assert.equal(roll(1e12,new Set(),1e12,1e12,1e12,1e12,{},null,1).name,'Common');
assert.notEqual(roll(1e12,new Set(),1,1,1,1,null,null,null).name,'Common');
for(const cap of [null,1,7]) {
 rng=.007999;assert.equal(roll(250,new Set(),1,1,1,1,null,{id:'all-in-pickaxe'},cap).name,'Flat');
 rng=.008001;assert.notEqual(roll(250,new Set(),1,1,1,1,null,{id:'all-in-pickaxe'},cap).name,'Flat');
}
const [reality,bedrock]=realityBedrockRecipes;
assert.equal(reality.craftingTab,'toys');assert.equal(bedrock.craftingTab,'pickaxe');
assert.equal(bedrock.requirements.filter(q=>q.type==='gem-count').reduce((n,q)=>n+q.amount,0),25000);
assert.deepEqual(bedrock.requirements.slice(0,4).map(q=>[q.minimumRarity,q.maximumRarity]),[[1,9],[10,49],[50,99],[100,999]]);
for(const r of realityBedrockRecipes) {assert.equal(r.requirements.at(-1).consume,false);assert.ok(!r.requirements.some(q=>q.type==='equipment'));assert.ok(applyEquipmentOverhaul([]).some(q=>q.id===r.id));}
console.log('Reality/Bedrock pure rules: exact boundaries, ten-roll burst, bonus exclusion, switching, cap sanitization and authoritative selection passed.');

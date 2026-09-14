import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  PICKAXE_STATS,
  SUPERSIZER_SIZE_MUTATIONS,
  prepareEquipmentRoll,
  supersizerSizeMutation,
  supersizerBlessingMultipliers,
  finishEquipmentRoll
} from '../supabase/functions/roll/equipmentRules.js';
import {supersizerRecipes,applyEquipmentOverhaul} from '../src/data/equipmentOverhaul.js';
import {planIncludedMaterial} from '../src/logic/equipmentMaterials.js';

assert.deepEqual(PICKAXE_STATS['supersizer-pickaxe'],[19.91,2.75,.5,5.5,2.4]);
assert.deepEqual(SUPERSIZER_SIZE_MUTATIONS.map(x=>[x.name,x.chance,x.multiplier]),[
 ['Small',1/3,.75],['Big',1/10,1.25],['Giant',1/100,2],['Massive',1/1000,5],
 ['Colossal',1/10000,10],['Titanic',1/100000,20],['Gargantuan',1/1000000,25]
]);
const total=SUPERSIZER_SIZE_MUTATIONS.reduce((n,x)=>n+x.chance,0);
let cumulative=0;
for(const expected of SUPERSIZER_SIZE_MUTATIONS){
 assert.equal(supersizerSizeMutation('supersizer-pickaxe',()=>cumulative)?.id,expected.id);
 cumulative+=expected.chance;
 assert.equal(supersizerSizeMutation('supersizer-pickaxe',()=>cumulative-Number.EPSILON)?.id,expected.id);
}
assert.equal(supersizerSizeMutation('supersizer-pickaxe',()=>total),null);
assert.equal(supersizerSizeMutation('supersizer-pickaxe',()=>0,false),null);
assert.equal(supersizerSizeMutation('fortune-pickaxe',()=>0),null);

const start=Date.parse('2026-09-14T00:00:00Z');
let context=prepareEquipmentRoll('supersizer-pickaxe',{},()=>0,true,start);
assert.equal(context.flags.supersizerBlessing,false);
let state=finishEquipmentRoll(context,{sizeMutation:SUPERSIZER_SIZE_MUTATIONS.at(-1),now:start}).state;
assert.equal(state.supersizerBlessedRolls,0);
assert.equal(state.supersizerBlessingUntil,'2026-09-14T00:05:00.000Z');

// Triggering roll is excluded. Only each tenth genuine blessed roll checks the
// independent proc, and refresh keeps the cadence while extending real time.
for(let i=1;i<=9;i++){
 context=prepareEquipmentRoll('supersizer-pickaxe',state,()=>0,true,start+i);
 assert.equal(context.flags.supersizerBlessedRoll,false);
 state=finishEquipmentRoll(context,{now:start+i}).state;
}
context=prepareEquipmentRoll('supersizer-pickaxe',state,()=>.049999,true,start+10);
assert.equal(context.flags.supersizerBlessedRoll,true);
state=finishEquipmentRoll(context,{sizeMutation:SUPERSIZER_SIZE_MUTATIONS.at(-1),now:start+10}).state;
assert.equal(state.supersizerBlessedRolls,10);
assert.equal(state.supersizerBlessingUntil,'2026-09-14T00:05:00.010Z');
assert.deepEqual(finishEquipmentRoll(context,{genuine:false,sizeMutation:SUPERSIZER_SIZE_MUTATIONS.at(-1),now:start+20}).state,context.state);
assert.equal(prepareEquipmentRoll('supersizer-pickaxe',state,()=>0,true,start+300011).flags.supersizerBlessing,false);
assert.deepEqual(supersizerBlessingMultipliers({supersizerBlessing:true,supersizerBlessedRoll:false}),{luck:2,weightMultiplier:2.25,rollSpeed:.75,finalSell:1.5});
assert.deepEqual(supersizerBlessingMultipliers({supersizerBlessing:true,supersizerBlessedRoll:true}),{luck:10000,weightMultiplier:2.25,rollSpeed:.75,finalSell:1.5});

const [recipe]=supersizerRecipes;
assert.equal(recipe.moneyCost,1_099_000_000);
assert.equal(recipe.reward.bonus.finalSell,.25);
assert.equal(recipe.requirements.filter(x=>x.consume===false).length,4);
assert.equal(recipe.requirements.find(x=>x.metric==='genuineRolls').amount,300_000);
assert.equal(recipe.description,'The mining industry said this was excessive. We made it bigger.');
assert.ok(applyEquipmentOverhaul([]).some(x=>x.id===recipe.id));

const value50=recipe.requirements.findIndex(x=>x.id==='supersizer-value-50m');
const quartz=recipe.requirements.findIndex(x=>x.id==='supersizer-quartz');
const specimen=(name,value,finalWeight)=>({gem:{name,rarity:100,baseWeight:100},value,finalWeight});
assert.equal(planIncludedMaterial(recipe,{},specimen('Test',49_999_999,100),value50),null);
assert.equal(planIncludedMaterial(recipe,{},specimen('Test',50_000_000,100),value50).requirementIndex,value50);
assert.equal(planIncludedMaterial(recipe,{},specimen('Quartz',1,999.999),quartz),null);
assert.equal(planIncludedMaterial(recipe,{},specimen('Quartz',1,1000),quartz).requirementIndex,quartz);

const edge=readFileSync(new URL('../supabase/functions/roll/index.ts',import.meta.url),'utf8');
const rules=readFileSync(new URL('../supabase/functions/roll/equipmentRules.js',import.meta.url),'utf8').trim();
assert.ok(edge.includes(rules),'optimized single-file roll stays synchronized with pure equipment rules');
assert.match(edge,/supersizerSizeWeight/);
assert.match(edge,/luck:flags\.supersizerBlessedRoll\?10000:2/);
assert.match(edge,/sizeMutation: supersizerSize/);
assert.match(edge,/history\.supersizerHeavy10=/);
assert.match(edge,/history\.supersizerRareHeavy5=/);
console.log('Supersizer rules: exact stats, exclusive size boundaries, genuine-only blessing cadence/refresh, recipe and threshold allocation passed.');

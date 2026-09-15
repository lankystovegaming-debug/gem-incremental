import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  PICKAXE_STATS,prepareEquipmentRoll,finishEquipmentRoll,impossibleProcMultipliers
} from '../supabase/functions/roll/equipmentRules.js';
import {impossibleRecipes,applyEquipmentOverhaul} from '../src/data/equipmentOverhaul.js';

assert.deepEqual(PICKAXE_STATS['impossible-pickaxe'],[1,1,1,1,1]);
assert.deepEqual(impossibleProcMultipliers({impossible:true}),{
  luck:1_000_000,mutationChance:100,weightLuck:100,weightMultiplier:10
});
assert.deepEqual(impossibleProcMultipliers({}),{luck:1,mutationChance:1,weightLuck:1,weightMultiplier:1});
assert.equal(prepareEquipmentRoll('impossible-pickaxe',{},()=>0,true).flags.impossible,true);
assert.equal(prepareEquipmentRoll('impossible-pickaxe',{},()=>1/1_000_000,true).flags.impossible,false);
assert.equal(prepareEquipmentRoll('impossible-pickaxe',{},()=>0,false).flags.impossible,false);

let state={};
for(let i=0;i<67;i++) state=finishEquipmentRoll(
  prepareEquipmentRoll('impossible-pickaxe',state,()=>1,true),
  {naturalWeight:1,gem:{rarity:1},genuine:true}
).state;
assert.equal(state.rolls['impossible-pickaxe'],67,'counter advances only for equipped genuine rolls');
const paused=finishEquipmentRoll(prepareEquipmentRoll('fortune-pickaxe',state,()=>1,true),{naturalWeight:1,gem:{rarity:1}}).state;
assert.equal(paused.rolls['impossible-pickaxe'],67,'counter survives switching');
assert.equal(finishEquipmentRoll(prepareEquipmentRoll('impossible-pickaxe',state,()=>1,false),{genuine:false}).state.rolls['impossible-pickaxe'],67);

const [recipe]=impossibleRecipes;
assert.equal(recipe.description,'Congratulations. Now explain why.');
assert.equal(recipe.moneyCost,2_500_000_000);
assert.equal(recipe.craftingTab,'toys');
assert.equal(recipe.manualReviewOnly,true);
assert.equal(recipe.requirements.find(x=>x.type==='lifetime-rolls').rolls,1_000_000);
assert.ok(applyEquipmentOverhaul([]).some(x=>x.id==='impossible-pickaxe'));

const edge=readFileSync(new URL('../supabase/functions/roll/index.ts',import.meta.url),'utf8');
const rules=readFileSync(new URL('../supabase/functions/roll/equipmentRules.js',import.meta.url),'utf8').trim();
const migration=readFileSync(new URL('../supabase/migrations/20260915020842_impossible_pickaxe.sql',import.meta.url),'utf8');
const crafting=readFileSync(new URL('../crafting/crafting.js',import.meta.url),'utf8');
const appCss=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');
assert.ok(edge.includes(rules),'optimized roll embeds the exact shared equipment rules');
assert.match(edge,/luck \*= impossibleProc\.luck/);
assert.match(edge,/mutationChanceMultiplier \*= impossibleProc\.mutationChance/);
assert.match(edge,/weightLuck \*= impossibleProc\.weightLuck/);
assert.match(edge,/weightMultiplier \*= impossibleProc\.weightMultiplier/);
assert.match(migration,/'totalRolls',coalesce\(p\.total_rolls,0\)/);
assert.doesNotMatch(migration,/impossibleLifetimeRolls[^]*equipment_genuine_rolls/);
assert.match(migration,/on conflict\(singleton\) do nothing/);
assert.match(migration,/cardinality\(plan\.specimen_ids\)/);
assert.match(crafting,/I understand that all listed resources and every selected gem will be permanently consumed/);
assert.match(crafting,/WORLD FIRST BOUNTY —/);
assert.match(appCss,/is-impossible-world-first::before[^}]*width:auto; height:auto;[^}]*transform:none;/,
  'world-first perimeter must reset the base roll bloom pseudo-element geometry');
console.log('Impossible Pickaxe rules, genuine counter, final stat integration, safe-review UI and singleton claim structure passed.');

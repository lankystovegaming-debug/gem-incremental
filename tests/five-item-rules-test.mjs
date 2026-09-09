import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {PICKAXE_STATS,jackpotRoll,exclusiveMutations,equipmentTotals,finishEquipmentRoll,prepareEquipmentRoll} from '../supabase/functions/roll/equipmentRules.js';
import {fiveItemRecipes} from '../src/data/equipmentOverhaul.js';
import {isRequirementComplete} from '../src/logic/crafting.js';
import {getGemMutation} from '../src/data/mutations.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10);
for(const [id,stats] of Object.entries({'fortune-pickaxe':[33,2.7,.95,4,1.4],'all-in-pickaxe':[250,.2,.1,.1,.1],'all-rounder-toy':[2,2,2,2,2],'jackpot-slot':[7.77,1.77,.77,1.77,.77],'money-pickaxe':[.01,.3,2,10,200]}))assert.deepEqual(PICKAXE_STATS[id],stats);
const draw=(values)=>()=>values.shift();
near(jackpotRoll('jackpot-slot',777,draw([0,0,1])).luck,.77*1.77*.77*7.77);
near(jackpotRoll('jackpot-slot',7,()=>1).luck,.77);
near(jackpotRoll('jackpot-slot',6,()=>1).luck,1);
assert.equal(jackpotRoll('jackpot-slot',777,()=>0,false).houseEdge,false);
assert.equal(jackpotRoll('jackpot-slot',1,draw([1,1,.0077])).houseEdge,false);
assert.equal(jackpotRoll('jackpot-slot',1,draw([1,1,.007699])).houseEdge,true);
assert.equal(exclusiveMutations('all-rounder-toy',()=>.04999)[0].id,'balanced');
assert.deepEqual(exclusiveMutations('all-rounder-toy',()=>.05),[]);
assert.deepEqual(exclusiveMutations('all-rounder-toy',()=>0,false),[]);
const saved={rolls:{'jackpot-slot':776},batchHistory:{raw5m:3,heavy5:250}};
assert.deepEqual(finishEquipmentRoll(prepareEquipmentRoll('jackpot-slot',saved),{genuine:false}).state,saved);
assert.equal(getGemMutation('balanced').multiplier,1.2);
const rows=[{category:'pickaxe',equipment_id:'all-in-pickaxe',masterwork_level:5},...['clover','boots','lantern','bag'].map(category=>({category,equipment_id:category==='bag'?'plastic-shopping-bag':category,luck_bonus:999,weight_luck_bonus:999,mutation_chance_bonus:999,weight_multiplier_bonus:999}))];
assert.deepEqual(equipmentTotals(rows,true),{pickaxe:250,clover:1,luck:250,rollSpeed:.2,mutation:.1,weightLuck:.1,weightMultiplier:.1});
assert.equal(fiveItemRecipes.length,5);
for(const recipe of fiveItemRecipes) {
 assert.ok(!recipe.requirements.some(r=>r.type==='equipment'));
 for(const req of recipe.requirements.filter(r=>r.type==='equipment-history')) {
  assert.ok(!isRequirementComplete({progress:{}},recipe,req,0,{specialDiscoveries:{batchHistory:{[req.metric]:req.amount-1}}}));
  assert.ok(isRequirementComplete({progress:{}},recipe,req,0,{specialDiscoveries:{batchHistory:{[req.metric]:req.amount}}}));
 }
}
// Execute the production selection function, including floor and fallback behavior.
let source=readFileSync(new URL('../supabase/functions/roll/index.ts',import.meta.url),'utf8');
const selection=source.slice(source.indexOf('function rollGemWithPickaxePassives('),source.indexOf('// MUTATION RNG'));
let random=.5;
const {eligibleEquipmentGems,flatEquipmentChance,specialChance}=await import('../supabase/functions/roll/equipmentRules.js');
const choose=new Function('gems','random01','eligibleEquipmentGems','flatEquipmentChance','specialChance','eventGemIsEligible','eventGemLuckFactor',stripTypeScriptTypes(selection)+';return rollGemWithPickaxePassives;');
const catalog=[{name:'Common',rarity:2},{name:'Rare',rarity:99},{name:'Epic',rarity:100},{name:'Ultra',rarity:1e9},{name:'Flat',rarity:50,affectedByLuck:false}];
const roll=choose(catalog,()=>random,eligibleEquipmentGems,flatEquipmentChance,specialChance,()=>true,()=>1);
for(const luck of [.01,1,250,1e12])for(const rng of [0,.001,.5,.999999]) {random=rng;assert.ok(roll(luck,new Set(),1e12,1e12,1e12,1e12,null,{id:'money-pickaxe'}).rarity<100);}
random=.07999;assert.equal(roll(250,new Set(),1,1,1,1,null,{id:'all-in-pickaxe'}).name,'Flat');
random=.08001;assert.notEqual(roll(250,new Set(),1,1,1,1,null,{id:'all-in-pickaxe'}).name,'Flat');
random=.07999;assert.notEqual(roll(250,new Set(),1,1,1,1,null,{id:'fortune-pickaxe'}).name,'Flat');
console.log('Five-item rules: exact stats, Jackpot boundaries/stacking, genuine-only procs, historical UI gates, production selection ceiling and flat 4× probability passed.');

globalThis.sessionStorage={getItem:()=>null,setItem:()=>{}};
globalThis.window={dispatchEvent:()=>{}};
const {recordSessionRoll}=await import('../src/ui/sessionInsights.js');
const session=recordSessionRoll({houseEdge:true,gem:null});
assert.equal(session.rolls,1);assert.equal(session.kept,0);assert.equal(session.bestEffective,null);assert.deepEqual(session.rarities,{});

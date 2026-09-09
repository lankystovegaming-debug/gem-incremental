import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import * as rules from '../supabase/functions/roll/equipmentRules.js';
import recipes from '../src/data/recipes.js';
const expected={
 'fortune-pickaxe':[35,2.8,1,4.25,1.45], 'empyrean-pickaxe':[28,3,1,4.25,1.5],
 'eternity-pickaxe':[25,3,1.25,4.25,1.5], 'tectonic-pickaxe':[24,2.8,1,7,1.9],
 'the-accelerator':[24,3.4,1,4,1.4], 'the-resonator':[24,2.9,1,4,1.45],
 'the-excavator':[24,3,1,4,1.4], 'bedrock-pickaxe':[25,3,1,5,1.55],
 'celestial-pickaxe':[26,2.8,1,4.5,1.5]
};
for(const [id,stats] of Object.entries(expected)) assert.deepEqual(rules.PICKAXE_STATS[id],stats);
const source=readFileSync(new URL('../supabase/functions/roll/index.ts',import.meta.url),'utf8');
const selection=source.slice(source.indexOf('function rollGemWithPickaxePassives('),source.indexOf('// MUTATION RNG'));
const catalog=[{name:'Target',rarity:1e6},{name:'Fallback',rarity:100}];
let rng=0;
const choose=new Function('gems','random01','eventGemIsEligible','eventGemLuckFactor',...Object.keys(rules),stripTypeScriptTypes(selection)+';return rollGemWithPickaxePassives;');
const roll=choose(catalog,()=>rng,()=>true,()=>1,...Object.values(rules));
const select=(id,cap=null)=>roll(35,new Set(),1,1,1,1,null,{id,state:{}},cap).name;
rng=36/1e6;assert.equal(select('fortune-pickaxe'),'Target');assert.equal(select('celestial-pickaxe'),'Fallback');
assert.equal(select('fortune-pickaxe',35),'Fallback');
assert.equal(roll(35,new Set(),1,1,1,1,{buffsDisabled:true},{id:'fortune-pickaxe',state:{}}).name,'Fallback');
rng=38.499/1e6;assert.equal(select('fortune-pickaxe'),'Target');rng=38.501/1e6;assert.equal(select('fortune-pickaxe'),'Fallback');
catalog[0].rarity=999999;rng=36/999999;assert.equal(select('fortune-pickaxe'),'Fallback');
catalog[0].rarity=1e6;catalog[0].affectedByLuck=false;rng=1.05/1e6;assert.equal(select('fortune-pickaxe'),'Fallback');rng=.999/1e6;assert.equal(select('fortune-pickaxe'),'Target');
// The Toy's random borrowed outcome remains exactly as it was before the rebalance.
for(const [id,oldStats] of Object.entries({'fortune-pickaxe':[33,2.4,.95,4,1.4],'bedrock-pickaxe':[25,2.4,1.05,5,1.55],'empyrean-pickaxe':[24,2.4,1,3.5,1.4]})) {
 const draws=[0,1,(rules.SERIOUS_PICKAXES.indexOf(id)+.5)/rules.SERIOUS_PICKAXES.length];
 assert.deepEqual(rules.prepareEquipmentRoll('toy-shovel',{},()=>draws.shift()).stats,oldStats);
}
for(const [rarity,gain] of [[999999,1],[1e6,2],[1e7,3],[1e8,5],[5e8,10]]) {
 const state=rules.finishEquipmentRoll(rules.prepareEquipmentRoll('the-resonator'),{gem:{name:'X',rarity,specialGem:true},random:()=>1}).state;
 assert.equal(state.resonance.X,gain);
}
assert.equal(rules.specialChance('the-resonator',{name:'X',specialGem:true},{resonance:{X:7}}),1.6875);
for(const [excavations,level] of [[0,0],[24,0],[25,1],[99,1],[100,2],[249,2],[250,3],[499,3],[500,4]]) {
 const table=rules.EXCAVATION_LOOT[level];let start=0;
 for(let tier=0;tier<7;tier++) {
  const draws=[0,(start+table[tier]/2)/100,0];start+=table[tier];
  const result=rules.finishEquipmentRoll(rules.prepareEquipmentRoll('the-excavator',{excavations}),{random:()=>draws.shift()});
  assert.equal(result.loot,tier<4?`lucky-potion-${tier+1}`:['legendary-potion','relic-potion','mythic-potion'][tier-4]);
  assert.equal(result.state.excavations,excavations+1);
 }
 assert.equal(rules.finishEquipmentRoll(rules.prepareEquipmentRoll('the-excavator',{excavations}),{random:()=>1/40}).loot,null);
}
for(const id of Object.keys(expected)) {
 const context=rules.prepareEquipmentRoll(id,{rolls:{[id]:1000},spool:200,excavations:500,pressure:99,foundation:99});
 assert.deepEqual(rules.finishEquipmentRoll(context,{genuine:false,gem:{rarity:2},random:()=>0}).state,context.state);
}
for(const [id,rolls] of [['empyrean-pickaxe',250000],['eternity-pickaxe',300000],['the-accelerator',250000],['bedrock-pickaxe',250000]]) {
 const r=recipes.find(r=>r.id===id);assert.ok(r.requirements.some(q=>q.type==='lifetime-rolls'&&q.rolls===rolls));
}
console.log('Pickaxe rebalance: exact stats, production Fortune probability/cap boundaries, unchanged Toy borrowing, resonance bands, all Archaeology loot tiers and generated-roll guards passed.');

const inventory=readFileSync(new URL('../inventory/inventory.js',import.meta.url),'utf8');
const progressSource=inventory.slice(inventory.indexOf('function specialistProgress('),inventory.indexOf('function specialistProgress(')+inventory.slice(inventory.indexOf('function specialistProgress(')).indexOf('\n}')+2);
const progress=new Function('state',progressSource+';return specialistProgress;')({equipmentMechanics:{resonance:{Test:7},excavations:100}});
assert.match(progress({equipment_id:'the-resonator'}),/Resonance 7\/10 — Special Gem Chance ×1.6875/);
assert.match(progress({equipment_id:'the-excavator'}),/level 2\/4.*Next milestone: 250/);

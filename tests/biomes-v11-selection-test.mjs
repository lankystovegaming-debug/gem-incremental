import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {gemTimeAvailable} from '../supabase/functions/roll/availabilityRules.ts';
import {biomeSelectionPool,biomeSelectionOrder} from '../supabase/functions/roll/biomeRules.ts';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const design=JSON.parse(read('../docs/biomes-v11-design.json'));
const source=read('../supabase/functions/roll/index.ts');
const extract=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
assert.equal(extract('// Request-local only.','import { gemTimeAvailable').trim(),read('../supabase/functions/roll/biomeRules.ts').trim());
const helpers=extract('export const eligibleEquipmentGems','export function normalizeRequestedBatchSize')+
 extract('export function specialChance','export function exclusiveMutations')+
 extract('export function eventGemLuckFactor','export function eventMutationFactor')+
 extract('export function rollDeepSeaGem','// =========================================================\n// MUTATION RNG');
const selector=extract('function rollGemWithPickaxePassives(','export function rollDeepSeaGem(');
let seed=20261024;
const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const ctx={random01:rng,Math,biomeSelectionOrder,positive:(v,f=1)=>Number(v)>0?Number(v):f};
vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes((helpers+selector).replaceAll('export ','')),ctx);
// Instrument the real check expressions to compute exact sequential marginals.
const observer=selector.replace('function rollGemWithPickaxePassives(','function observe(')
 .replace(/if \(random01\(\) < (.*?)\) return gem;/g,'observed.push({name:gem.name,p:$1});')
 .replace('return pool[pool.length - 1];','return {checks:observed,fallback:pool[pool.length - 1]?.name};')
 .replace('  const safeLuck =','  const observed = [];\n  const safeLuck =');
vm.runInContext(stripTypeScriptTypes(observer),ctx);
const rows=JSON.parse(read('./fixtures/biomes-v11-catalog.json'));
for(const [name,g] of Object.entries(design.new_gems))rows.push({name,rarity:g.canonical,base_weight:g.weight,value_per_gram:g.value_per_gram,affected_by_luck:true,sort_order:400+rows.length,metadata:{requiredBiome:g.exclusive?g.biome:undefined}});
const catalog=rows.filter(g=>gemTimeAvailable(g,new Date('2026-10-23T15:05:00Z'))).filter(g=>!g.metadata?.sourceExclusive&&!g.required_event_key&&!g.metadata?.deepcore_stage)
 .map(g=>({name:g.name,rarity:Number(g.rarity),baseWeight:Number(g.base_weight),valuePerGram:Number(g.value_per_gram),affectedByLuck:g.affected_by_luck!==false,specialGem:g.special_gem===true,metadata:g.metadata??{},timeWindow:['daily','date_range_daily'].includes(g.availability_mode),biomeTieOrder:g.sort_order??0}));
const snap=(key,tournament=false)=>({exclusiveBiomes:Object.fromEntries(Object.entries(design.new_gems).filter(([,g])=>g.exclusive).map(([n,g])=>[n,g.biome])),tournament,occurrence:key?{key,denominators:design.boosts[key]}:null});
const vector=(pool,luck=1000,id='none',event=null)=>{
 const {checks,fallback}=ctx.observe(luck,new Set(),1,1,1,1,event,{id,state:{}},null,pool);
 let survival=1;const out={};for(const c of checks){out[c.name]=survival*c.p;survival*=1-c.p;}
 if(fallback)out[fallback]=(out[fallback]??0)+survival;
 assert.ok(Math.abs(Object.values(out).reduce((a,b)=>a+b,0)-1)<1e-12);
 return out;
};
assert.equal(Object.values(design.boosts).flatMap(Object.keys).length,69);
assert.equal(biomeSelectionPool([{name:'Aberration',rarity:750000000}],snap(null)).length,0,'authoritative rules gate exclusives even if catalogue metadata is removed');

const tied=[{name:'B',rarity:200,selectionDenominator:25,biomeTieOrder:1},{name:'A',rarity:100,selectionDenominator:25,biomeTieOrder:1}];
assert.deepEqual([...tied].sort(biomeSelectionOrder),[...tied].reverse().sort(biomeSelectionOrder));
// Event/research bands stay canonical after denominator reduction.
const bandGem={name:'Band',rarity:10000000,selectionDenominator:1000,affectedByLuck:true};
const bandEvent={eventKey:'gem_rush',config:{rarityMin:1000000,rarityLuckMultiplier:2}};
const bandCheck=ctx.observe(100,new Set(),1,1,1,1,bandEvent,{id:'fortune-pickaxe',state:{}},null,[bandGem]).checks[0];
assert.ok(Math.abs(bandCheck.p-.22)<1e-12);
for(const key of [null,'Volcanic','Heavenly','Distortion']){
 const mode=biomeSelectionPool(catalog,snap(key,true));
 assert.deepEqual(vector(mode,1000,'fortune-pickaxe',bandEvent),vector(biomeSelectionPool(catalog,snap(null,true)),1000,'fortune-pickaxe',bandEvent));
}

for(const luck of [.01,1,35,100,500,1000,25000,100000,1000000,1e9]){
 for(const id of ['none','fortune-pickaxe','all-in-pickaxe','money-pickaxe']){
  const neutral=vector(biomeSelectionPool(catalog,snap(null,true)),luck,id);
  for(const b of design.biomes){
   const pool=biomeSelectionPool(catalog,snap(b.name));
   for(const gem of pool) assert.equal(gem.rarity,catalog.find(g=>g.name===gem.name).rarity);
   vector(pool,luck,id);
   assert.deepEqual(vector(biomeSelectionPool(catalog,snap(b.name,true)),luck,id),neutral);
  }
 }
}
assert.equal(biomeSelectionPool(catalog,snap('Oceanic')).find(g=>g.name==='Thalassa').selectionDenominator,31122819);
assert.equal(biomeSelectionPool(catalog,snap('Distortion')).find(g=>g.name==='Glitched Gem').selectionDenominator,110100111);
assert.equal(vector(biomeSelectionPool(catalog,snap('Void')),100000)['Void Pearl'],0,'intentional saturation reversal retained');
for(const b of [null,...design.biomes.map(b=>b.name)]){
 const pool=biomeSelectionPool(catalog,snap(b));
 for(const [name,g] of Object.entries(design.new_gems))assert.equal(pool.some(x=>x.name===name),!g.exclusive||g.biome===b);
}
// No mutation to warm catalogue objects; requests with opposite snapshots stay independent.
assert.ok(catalog.every(g=>g.selectionDenominator===undefined));
const a=biomeSelectionPool(catalog,snap('Heavenly')),b=biomeSelectionPool(catalog,snap('Distortion'));
assert.notDeepEqual(vector(a),vector(b));
assert.deepEqual(vector(a),vector(biomeSelectionPool(catalog,snap('Heavenly'))));
// Daily alternatives and half-open independent time gates.
const aurorite=rows.find(g=>g.name==='Aurorite');
assert.equal(gemTimeAvailable(aurorite,new Date('2026-10-23T15:00:00Z')),true);
assert.equal(gemTimeAvailable(aurorite,new Date('2026-10-23T16:00:00Z')),false);
const aurorium=rows.find(g=>g.name==='Aurorium');
for(const [iso,expected] of [['2026-10-22T21:00:00Z',true],['2026-10-23T09:00:00Z',true],['2026-10-23T11:00:00Z',false]])assert.equal(gemTimeAvailable(aurorium,new Date(iso)),expected);
// Seeded actual sampler vs its exact probability vector, including event coexistence.
for(const key of [null,'Volcanic','Distortion']){
 const pool=biomeSelectionPool(catalog,snap(key));const expected=vector(pool,1000);const counts={};const n=50000;
 for(let i=0;i<n;i++){const g=ctx.rollGemWithPickaxePassives(1000,new Set(),1,1,1,1,null,{id:'none',state:{}},null,pool);counts[g.name]=(counts[g.name]??0)+1;}
 for(const [name,p] of Object.entries(expected))if(p*n>25)assert.ok(Math.abs((counts[name]??0)-p*n)<7*Math.sqrt(n*p*(1-p)),name);
}
const sea=[{name:'Water',rarity:1,base_weight:1,value_per_gram:1},{name:'Sea gem',rarity:1000,base_weight:1,value_per_gram:1}];
for(const divisor of [1,10,20]){
 seed=8;const names=Array.from({length:1000},()=>ctx.rollDeepSeaGem(sea,35,divisor,rng).name);
 biomeSelectionPool(catalog,snap('Distortion'));seed=8;
 assert.deepEqual(names,Array.from({length:1000},()=>ctx.rollDeepSeaGem(sea,35,divisor,rng).name));
}
// Neutral sale-value sensitivity: actual selection marginals times unchanged
// catalogue weight/value products; no assumption that players sell specimens.
const occupancy=design.biomes.reduce((n,b)=>n+b.duration_minutes/b.interval_minutes,0);
for(const luck of [1,35,500,1000,100000]){
 const gross=pool=>Object.entries(vector(pool,luck)).reduce((sum,[name,p])=>{
  const g=pool.find(g=>g.name===name);return sum+p*g.baseWeight*g.valuePerGram;
 },0);
 const normal=gross(biomeSelectionPool(catalog,snap(null)));
 const calendar=(1-occupancy)*normal+design.biomes.reduce((sum,b)=>sum+b.duration_minutes/b.interval_minutes*gross(biomeSelectionPool(catalog,snap(b.name))),0);
 assert.ok(Number.isFinite(calendar)&&calendar>0);
 assert.equal(gross(biomeSelectionPool(catalog,snap('Distortion',true))),gross(biomeSelectionPool(catalog,snap(null,true))));
}
console.log('Biome selector: 440 neutral-mode vectors; saturation, canonical floors/thresholds, exclusives, gates, ties, immutable request pools, 150k sampler draws and dedicated pool isolation pass.');

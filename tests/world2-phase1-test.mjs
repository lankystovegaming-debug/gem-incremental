import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { adaptationFactor,adaptMultiplier,adaptAdditive,adaptOpportunity,adaptProbabilityReplacement,
  adaptSupersizerSize,epochStartMs,requireWorld1,questSpecimenQualifies } from '../world2/contracts.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const m=JSON.parse(read('world2/manifest.v1.json'));
const registry=JSON.parse(read('world2/equipment.v1.json'));
execFileSync(process.execPath,['world2/build-migration.mjs','--check'],{stdio:'inherit'});
assert.equal(m.gameplayEnabled,false);assert.equal(m.questEnabled,false);
assert.equal(m.lawEffectsEnabled,false);assert.equal(m.adaptationEnabled,false);
const groups=Object.fromEntries(['A','B','C'].map(c=>[c,m.laws.filter(l=>l.category===c)]));
assert.deepEqual(Object.values(groups).map(g=>g.length),[11,3,8]);
assert.deepEqual(Object.values(groups).map(g=>g.reduce((s,l)=>s+l.weight,0)),[11,3,300]);
assert(groups.C.every(l=>l.weight===(['grace','abundance'].includes(l.id)?9:47)));
const law=id=>m.laws.find(l=>l.id===id).contract;
assert.deepEqual(law('envy').legendaryDuration,[1,2,3,4,5,6]);
assert.deepEqual(law('envy').legendaryWeights,[25,25,20,15,10,5]);
assert.deepEqual(law('envy').mythicWeights,[5,10,20,25,20,10,7,3]);
assert.equal(law('envy').mythicWeights.reduce((a,b)=>a+b),100);
assert.deepEqual(law('inequality').thresholdWeights,[90,9,1]);
assert.deepEqual(law('fragility').refreshGenuineRolls,[100,250]);
assert.deepEqual(law('unstable-fortune').branchWeights,[60,40]);
assert.equal(law('repetition').gemK,.15);assert.equal(law('stagnation').gemK,.025);
assert.equal(law('distortion').mutationK,.5);assert.equal(law('distortion').mutationFloor,.25);
assert.deepEqual(m.quest.stages.map(s=>s.stage),[1,2,3,4,5,6]);
assert.equal(m.quest.stages[4].count,3000);assert.equal(m.quest.stages[3].eligibleProceeds,5000000);
assert.equal(m.quest.prerequisites.minimumLifetimeRolls,250000);assert.equal(m.quest.prerequisites.craftPickaxeMinimumTier,12);
const combinations=new Set(groups.A.flatMap(a=>groups.B.flatMap(b=>groups.C.map(c=>a.id+'/'+b.id+'/'+c.id))));
assert.equal(combinations.size,264);
// Exhaust every categorical ticket, rather than a flaky random-frequency test.
for(const g of Object.values(groups)) {
 const hits=new Map(g.map(l=>[l.id,0]));
 for(let ticket=0;ticket<g.reduce((s,l)=>s+l.weight,0);ticket++) {
  let cumulative=0;const chosen=[...g].sort((a,b)=>a.id.localeCompare(b.id)).find(l=>(cumulative+=l.weight)>ticket);
  hits.set(chosen.id,hits.get(chosen.id)+1);
 }
 for(const l of g)assert.equal(hits.get(l.id),l.weight);
}
for(const hour of [0,12]) {
 const boundary=Date.parse(`2026-10-29T${String(hour).padStart(2,'0')}:00:00Z`);
 assert.equal(epochStartMs(boundary),boundary);
 assert.equal(epochStartMs(boundary-1),boundary-43200000);
 assert.equal(epochStartMs(boundary+43199999),boundary);
}
assert.deepEqual(m.adaptation.levels.map(l=>l.qualifyingRolls),[0,2500,7500,20000,45000,100000]);
for(let level=0;level<=5;level++) {
 const a=m.adaptation.levels[level].factor;
 assert.equal(adaptationFactor(level),a);
 assert.equal(adaptMultiplier(35,level),1+a*34);
 for(const x of [0,.15,.33,.5,.8,1])assert.equal(adaptMultiplier(x,level),x);
 assert.equal(adaptAdditive(50,level),50*a);assert.equal(adaptAdditive(-2,level),-2);
 assert.equal(adaptOpportunity(.05,level),.05*a);
 assert(Math.abs(adaptProbabilityReplacement(.25,.40,level)-(.25+a*.15))<1e-14);
 assert.equal(adaptProbabilityReplacement(.5,.4,level),.4);
 assert.equal(adaptSupersizerSize(.75,level),.75);
 assert(Math.abs(adaptSupersizerSize(25,level)**2-(1+a*624))<1e-10);
 // Compose Bedrock first; two independent attenuation passes differ.
 assert.equal(adaptMultiplier(25*1.5,level),1+a*36.5);
}
for(const bad of [-1,6,1.5,NaN])assert.throws(()=>adaptationFactor(bad));
for(const bad of [-1,NaN,Infinity])assert.throws(()=>adaptMultiplier(bad,0));
for(const bad of [2,'2',null,0,99])assert.throws(()=>requireWorld1(bad),/world2_disabled/);
assert.equal(requireWorld1(),1);
const o={acceptedGenuine:true,sourceWorld:1,isBonus:false,sequence:101,activationSequence:100,gemName:'Quartz',allMutationIds:[],ordinaryFinalWeightRatio:.99,rawRolledWeightMultiplier:6};
assert(questSpecimenQualifies(1,o));
assert(!questSpecimenQualifies(1,{...o,ordinaryFinalWeightRatio:1}));
assert(!questSpecimenQualifies(1,{...o,ordinaryFinalWeightRatio:2,rawRolledWeightMultiplier:.5}));
assert(!questSpecimenQualifies(1,{...o,allMutationIds:['glossy']}));
assert(questSpecimenQualifies(2,o));
assert(!questSpecimenQualifies(2,{...o,rawRolledWeightMultiplier:5}));
assert(questSpecimenQualifies(3,{...o,gemName:'Black Opal',allMutationIds:['glossy']}));
for(const override of [{isBonus:true},{sourceWorld:2},{sequence:100},{acceptedGenuine:false}])
 assert(!questSpecimenQualifies(1,{...o,...override}));
const equipmentRecipes=JSON.parse(read('docs/world2/authority/equipment-recipes.json'));
const owned=JSON.parse(read('docs/world2/authority/owned-equipment-ids.json'));
const byId=new Map(registry.entries.map(e=>[e.id,e]));
for(const {equipment_id} of owned)assert.equal(byId.get(equipment_id)?.verification,'verified',equipment_id);
for(const r of equipmentRecipes)assert.equal(byId.get(r.recipe.reward.id)?.verification,'verified',r.id);
assert.equal(registry.entries.filter(e=>e.category==='pickaxe'&&e.verification==='verified').length,35);
assert.equal(byId.get('evergrowth').verification,'unverified');
assert.equal(byId.get('neptune').effects.find(e=>e.id==='deep-sea-divisor').type,'selector_divisor');
for(const entry of registry.entries.filter(e=>e.verification==='verified')) {
 assert.equal(entry.nativeWorld,1);assert(entry.effects.length);
 for(const effect of entry.effects)for(const field of ['id','type','layer','neutralBaseline','eligibility','counterDomain','adaptationPolicy','rewardProvenance','exceptions'])assert(field in effect,entry.id+': '+field);
}
const source=read('docs/world2/authority/roll-v179.ts');
const snapshot=JSON.parse(read('docs/world2/authority/snapshot.json'));
for(const [file,hash] of Object.entries(snapshot.files))
 assert.equal(createHash('sha256').update(read('docs/world2/authority/'+file)).digest('hex'),hash,file);
assert.equal(createHash('sha256').update(source+'\n').digest('hex'),'6921873aaef65246a1aedec55d93056f2b236f5880aaf8ebd504ba04ffe227a7');
assert.equal(source.trimEnd(),read('supabase/functions/roll/index.ts').trimEnd(),'execution code matches deployed v179; only trailing blank line differs');
// Strong disabled W1 parity: no pre-existing execution file changes in this work.
// The pinned weekly commit differs from live v179; retain each byte-for-byte.
const baseline='e49a6ca732c3038973e9b1a33b4d8ad17a789ab1';
const changed=execFileSync('git',['diff','--name-only',baseline,'--','supabase/functions/roll','src','main.js'],{encoding:'utf8'}).trim();
assert.equal(changed,'','W1 execution files must remain untouched');
console.log(`Phase 1 configuration/arithmetic/quest/registry/W1 parity passed: ${byId.size} entries, 264 triples, all six levels.`);

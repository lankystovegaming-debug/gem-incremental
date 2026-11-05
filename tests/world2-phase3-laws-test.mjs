import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import * as laws from '../supabase/functions/roll/world2Laws.js';
import {createWorld2LawEvaluator} from '../supabase/functions/roll/world2LawPipeline.js';
const epoch=(a='misfortune',b='distortion',c='grace',starts_at='2026-11-05T00:00:00+00:00')=>({a_id:a,b_id:b,c_id:c,starts_at,version:1});
const seeded=(seed=4)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const zero=()=>0,high=()=>1-Number.EPSILON;
const near=(a,b)=>assert(Math.abs(a-b)<1e-12,`${a} != ${b}`);
const begin=(e,state={},random=zero)=>laws.beginLawRoll({epoch:e,state,random});
const ordinary={kind:'ordinary',rarity:1e5,rawWeight:4,naturalMutationCount:3};
const blank={kind:'loss'};
const next=(r,o=blank,random=zero)=>laws.finishLawRoll(r,o,random);
const continuation=(r,o=blank,random=zero)=>begin(r.epoch,next(r,o,random).lawState,random);
const manifest=JSON.parse(readFileSync(new URL('../world2/manifest.v1.json',import.meta.url)));
for(const category of ['A','B','C'])assert.deepEqual(new Set(laws.LAW_IDS[category]),new Set(manifest.laws.filter(x=>x.category===category).map(x=>x.id)));
const hist=[{outcome_kind:'ordinary',gem_identity:'a',natural_mutation_ids:['m1']},...Array.from({length:249},()=>({outcome_kind:'loss'}))];
const hazards=[{id:'special',rarity:1e4,hazard:.02,mutable:false,specialGem:true},{id:'a',rarity:1100,hazard:.1,mutable:true},{id:'b',rarity:1200,hazard:.2,mutable:true},{id:'fallback',rarity:1,hazard:.5,mutable:true}];
const masses=laws.finalWinningMass(hazards,'fallback');near(masses.reduce((n,r)=>n+r.mass,0),1);near(masses[3].mass,.98*.9*.8);
for(const b of [null,...laws.LAW_IDS.B]) {
 const transformed=laws.inverseGemMass(masses,hist,b);
 near(transformed[0].mass,masses[0].mass);
 near(transformed[1].mass+transformed[2].mass,masses[1].mass+masses[2].mass);
 assert(transformed[1].mass<masses[1].mass);near(transformed[3].mass,masses[3].mass);
}
// All bands, scarce/zero-mass/singleton tiers and individually protected specials.
for(const rarity of [1,10,50,100,1000,10000,100000,1000000,10000000,100000000]) {
 const rows=[{id:'a',rarity,mass:.2,mutable:true},{id:'b',rarity:rarity+1,mass:.3,mutable:true},{id:'flat',rarity,mass:.1,mutable:true,affectedByLuck:false},{id:'special',rarity,mass:.1,mutable:true,specialGem:true}];
 for(const b of laws.LAW_IDS.B) {
  const t=laws.inverseGemMass(rows,hist,b);near(t[0].mass+t[1].mass,.5);assert.equal(t[2].mass,.1);assert.equal(t[3].mass,.1);
  near(laws.inverseGemMass([rows[0]],hist,b)[0].mass,.2);
 }
}
assert.equal(laws.numericTier(999.9),3);assert.equal(laws.numericTier(1000),4);assert.equal(laws.numericTier(1e9),null);
// Independent Bernoulli census: singleton mass and protected identities for p=1.
for(const ps of [[.1,.2,.3,.4],[1,.2,0,.4],[1,1,.3,0],[0,0,0,0]]) {
 const cat=ps.map((p,i)=>({id:['m1','m2','misty','ancient'][i],multiplier:2,rolledChance:p,chance:.1}));
 const singleton=laws.singletonMass(cat);const exact=Array(4).fill(0);
 for(let bits=0;bits<16;bits++) {
  let p=1,ids=[];for(let i=0;i<4;i++){const yes=!!(bits&(1<<i));p*=yes?ps[i]:1-ps[i];if(yes)ids.push(i);}
  if(ids.length===1)exact[ids[0]]+=p;
 }
 singleton.forEach((row,i)=>near(row.mass,exact[i]));
 const changed=laws.redistributeMass(singleton,laws.historyCounts(hist).mutations,.5,.25);
 near(changed[0].mass+changed[1].mass,exact[0]+exact[1]);near(changed[2].mass,exact[2]);near(changed[3].mass,exact[3]);
}
const cat=[{id:'m1',multiplier:2,rolledChance:.2},{id:'m2',multiplier:3,rolledChance:.3},{id:'other-band',multiplier:10,rolledChance:.4},{id:'misty',multiplier:2,rolledChance:.5}];
assert.deepEqual(laws.distortSingleton([],cat,hist,zero),[]);
const stack=[cat[0],cat[1]];assert.equal(laws.distortSingleton(stack,cat,hist,zero),stack);
assert.equal(laws.distortSingleton([cat[3]],cat,hist,zero)[0],cat[3]);
assert.equal(laws.distortSingleton([cat[0]],cat,hist,high)[0].id,'m2');
// Multiplier band endpoints and guaranteed singleton cannot become a multistack.
for(const value of [1,9.999,10,99.999,100,999.999,1000,1e6]) {
 const only={id:'certain',multiplier:value,rolledChance:1};
 assert.equal(laws.distortSingleton([only],[only,{id:'zero',multiplier:value,rolledChance:0}],[],high)[0].id,'certain');
}
// All 264 triples execute deterministic streams, retain nonnegative finite stats,
// independent states and valid timers, and reset at a repeated-tuple epoch.
let combinations=0;
for(const a of laws.LAW_IDS.A)for(const b of laws.LAW_IDS.B)for(const c of laws.LAW_IDS.C) {
 const e=epoch(a,b,c);let state={};const random=seeded(17);
 for(let i=0;i<550;i++) {
  const r=begin(e,state,random);const stats=laws.applyLawStats({luck:1e12,mutation:0,speed:1,weightLuck:3},r);
  assert.equal(stats.mutation,0);assert(Object.values(stats).every(x=>Number.isFinite(x)&&x>=0));
  const w=laws.lawFinalWeight({baseWeight:2,ordinaryFinalWeight:12,rawWeight:4},r,random);assert(w.finalWeight>=0);near(w.ordinaryFinalWeightRatio,6);
  state=next(r,i%7?ordinary:blank,random).lawState;
 }
 const reset=begin(epoch(a,b,c,'2026-11-05T12:00:00+00:00'),state,zero);assert.equal(reset.next.epochStart,'2026-11-05T12:00:00+00:00');
 if(a==='envy')assert.equal(reset.next.A.remaining,'0');
 combinations++;
}
assert.equal(combinations,264);
// Exact wait/active boundaries at both range endpoints, genuine loss positions
// included, and the triggering position remains unaffected.
for(const [id,wait,duration] of [['impermanence',60,8],['unstable-fortune',40,5],['reversal',50,10]]) {
 let r=begin(id==='impermanence'?epoch(id,'distortion','exchange'):epoch('austerity','distortion',id));
 for(let i=0;i<wait;i++){near(r.modifiers.luck,id==='impermanence'?1.3:1);r=continuation(r);}
 for(let i=0;i<duration;i++){assert(r.modifiers.luck<(id==='impermanence'?1.3:1));r=continuation(r);}
 near(r.modifiers.luck,id==='impermanence'?1.3:1);
}
for(const [id,maxWait,maxDuration] of [['impermanence',150,25],['unstable-fortune',120,20],['reversal',150,30]]) {
 let r=begin(id==='impermanence'?epoch(id,'distortion','exchange'):epoch('austerity','distortion',id),{},high);
 assert.equal((id==='impermanence'?r.next.A:r.next.C).wait,maxWait);
 for(let i=0;i<maxWait;i++)r=continuation(r,blank,high);
 assert.equal((id==='impermanence'?r.next.A:r.next.C).active,maxDuration);
 if(id==='unstable-fortune')near(r.modifiers.luck,1.5);
}
for(const id of ['aftershock','inequality']) {
 let r=begin(epoch(id,'distortion','exchange'));
 near(id==='aftershock'?r.modifiers.weightLuck:r.modifiers.mutation,1);
 r=continuation(r,ordinary);assert.equal(r.next.A.active,id==='aftershock'?5:4);
 const count=r.next.A.active;
 for(let i=0;i<count;i++){assert((id==='aftershock'?r.modifiers.weightLuck:r.modifiers.mutation)<1);r=continuation(r,ordinary);}
 assert.equal(r.next.A.recovery,5);
 for(let i=0;i<5;i++){near(id==='aftershock'?r.modifiers.weightLuck:r.modifiers.mutation,1);r=continuation(r,ordinary);}
 assert.equal(r.next.A.active,0);r=continuation(r,ordinary);assert(r.next.A.active>0);
}
let frag=begin(epoch('fragility'));
assert.equal(frag.next.A.remaining,100);
near(laws.lawFinalWeight({baseWeight:1,ordinaryFinalWeight:10,rawWeight:1.5},frag,zero).finalWeight,10);
near(laws.lawFinalWeight({baseWeight:1,ordinaryFinalWeight:10,rawWeight:1.50001},frag,zero).finalWeight,7);
near(laws.lawFinalWeight({baseWeight:1,ordinaryFinalWeight:10,rawWeight:2},frag,high).finalWeight,8);
for(let i=0;i<99;i++)frag=continuation(frag);assert.equal(frag.next.A.remaining,1);frag=continuation(frag,blank,high);assert.equal(frag.next.A.remaining,250);near(frag.next.A.threshold,3);
const burden=begin(epoch('compression','distortion','burden-of-fortune'));
for(const f0 of [0,.5,1,2,10,100])near(laws.lawFinalWeight({baseWeight:2,ordinaryFinalWeight:2*f0,rawWeight:4},burden,zero).finalWeight,2*f0*Math.max(.55,1/(1+.08*Math.max(0,f0-1)))*.75);
assert.equal(laws.lawFinalWeight({baseWeight:0,ordinaryFinalWeight:0,rawWeight:4},burden,zero).ordinaryFinalWeightRatio,null);
// Envy uses observed tier, resamples on every trigger, holds strength during a
// last-active-position trigger, and grows beyond safe JS integer without a cap.
let envy=begin(epoch('envy','distortion','exchange'));
near(envy.modifiers.luck,1.3);envy=continuation(envy,ordinary);assert.equal(envy.next.A.remaining,'25');near(envy.modifiers.luck,.7*1.3);
for(let i=0;i<2000;i++)envy=continuation(envy,ordinary);assert.equal(envy.next.A.remaining,'48025');
let state={...envy.next,A:{threshold:1000,remaining:'9007199254740993',luck:.77}};
let large=begin(envy.epoch,state);let end=next(large,ordinary);assert.equal(end.envyRemaining,'9007199254741017');near(end.lawState.A.luck,.77);
for(const [rarity,expected] of [[1000,'1'],[10000,'3'],[100000,'25']]) {
 const r=begin(envy.epoch,{...envy.next,A:{threshold:1000,remaining:'0',luck:1}});
 const n=next(r,{...ordinary,rarity});assert.equal(n.envyRemaining,expected);
}
state={...envy.next,A:{threshold:1000,remaining:'1',luck:.82}};
end=next(begin(envy.epoch,state),ordinary,high);near(end.lawState.A.luck,.82);assert.equal(end.lawState.A.threshold,100000);assert.equal(end.envyRemaining,'75');
// Exhaust exact categorical tickets, including Unstable Fortune's 60/40 split.
for(const weights of [[90,9,1],[25,25,20,15,10,5],[5,10,20,25,20,10,7,3],[1,1,1]]) {
 const total=weights.reduce((a,b)=>a+b),hits=weights.map(()=>0);
 for(let i=0;i<total;i++)hits[laws.weightedIndex(weights,()=> (i+.5)/total)]++;
 assert.deepEqual(hits,weights);
}
// Explicit ordinary-law factors and replacement coefficients, independently
// checked against the versioned design contract.
for(const a of laws.LAW_IDS.A)for(const c of laws.LAW_IDS.C) {
 const r=begin(epoch(a,'distortion',c));
 const ac=manifest.laws.find(l=>l.id===a).contract,cc=manifest.laws.find(l=>l.id===c).contract;
 const actual=laws.applyLawStats({luck:1,mutation:1,speed:1,weightLuck:1},r);
 for(const [field,contract] of [['luck','luck'],['mutation','mutationChance'],['speed','rollSpeed'],['weightLuck','weightLuck']]) {
  const staticValue=x=>typeof x==='number'?x:1;
  near(actual[field],staticValue(ac[contract])*staticValue(cc[contract]));
 }
 near(laws.lawSpeedFactor(r.epoch),actual.speed);
}
for(const [b,k,floor] of [['repetition',.15,.60],['stagnation',.025,.75],['distortion',.05,.75]]) {
 for(const count of [1,250]) {
  const h=Array.from({length:count},()=>hist[0]);
  const t=laws.inverseGemMass([{id:'a',rarity:1000,mass:.5,mutable:true},{id:'b',rarity:1001,mass:.5,mutable:true}],h,b);
  const suppression=Math.max(floor,Math.exp(-k*count));near(t[0].mass,suppression/(suppression+1));
 }
}
let negative=0,positive=0;
for(let ticket=0;ticket<100;ticket++) {
 const e=epoch('austerity','distortion','unstable-fortune');
 const r=begin(e,{epochStart:e.starts_at,A:{},C:{wait:1,active:0}});
 const draws=[0,(ticket+.5)/100,0];const n=next(r,blank,()=>draws.shift());
 if(n.lawState.C.luck<1)negative++;else positive++;
}
assert.equal(negative,60);assert.equal(positive,40);
const benchmarkHistory=Array.from({length:250},()=>hist[0]);
const benchmarkRows=Array.from({length:1000},(_,i)=>({id:String(i),rarity:1000+i,mass:1/1000,mutable:true}));
const distributionStart=performance.now();
for(let i=0;i<1000;i++)near(laws.inverseGemMass(benchmarkRows,benchmarkHistory,'distortion').reduce((n,r)=>n+r.mass,0),1);
const distributionMs=performance.now()-distributionStart;assert(distributionMs<5000);
console.log(`1000 transforms × 1000 catalogue rows + 250 history positions: ${distributionMs.toFixed(1)}ms`);
// Existing transaction executor receives the law adapter and refuses silently
// omitted hooks. Trusted ordinary engine consumes laws before value calculation.
const evaluate=createWorld2LawEvaluator(async ({stages})=>{
 const stats=stages.stats({luck:1,mutation:0,speed:1,weightLuck:1});assert.equal(stats.mutation,0);
 const gem=stages.gem(hazards,'fallback');const mutations=stages.mutations([],cat);
 const w=stages.weight({baseWeight:2,ordinaryFinalWeight:20,rawWeight:3});
 return {kind:'ordinary',primary:{gem_name:gem.id,rarity:gem.rarity,final_weight:w.finalWeight,value:w.finalWeight*12,natural_mutation_ids:mutations.map(m=>m.id)},extras:[],bucket:{}};
});
const e=epoch('compression','distortion','burden-of-fortune');
const result=await evaluate({context:{epochStart:e.starts_at,lawState:{},history:[]},epoch:e,random:zero});near(result.primary.final_weight,20*(1/(1+.08*9))*.75);near(result.primary.ordinary_final_weight_ratio,10);
await assert.rejects(createWorld2LawEvaluator(async()=>({kind:'ordinary',primary:null}))({context:{epochStart:e.starts_at},epoch:e,random:zero}),/missing_backend_stages/);
await assert.rejects(createWorld2LawEvaluator(async({stages})=>{stages.stats({luck:1});stages.stats({luck:1});})({context:{epochStart:e.starts_at},epoch:e,random:zero}),/duplicate_stage_stat_luck/);
await assert.rejects(createWorld2LawEvaluator(async({stages})=>{stages.gem(hazards,'fallback');})({context:{epochStart:e.starts_at},epoch:e,random:zero}),/backend_stage_order/);
const lost=await createWorld2LawEvaluator(async()=>({kind:'loss',primary:null,extras:[],bucket:{}}))({context:{epochStart:e.starts_at,lawState:{}},epoch:e,random:zero});assert.equal(lost.kind,'loss');
assert.throws(()=>begin({...e,version:2}),/unknown_manifest/);
assert.throws(()=>begin(epoch('fragility'),{},()=>1),/invalid_random/);
const start=performance.now();let r=begin(epoch('envy'));for(let i=0;i<100000;i++)r=continuation(r,ordinary);const ms=performance.now()-start;assert(ms<5000,`law budget ${ms}`);
console.log(`Phase 3: ${combinations} triples × 550 positions, tier/singleton conservation, p=1, clocks, Envy, ordering, adapter passed; 100k transitions ${ms.toFixed(1)}ms.`);

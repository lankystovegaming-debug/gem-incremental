// Server-only Phase 3 law layer. Never imported by the World 1 HTTP path.
// The DB supplies the pinned tuple; no local epoch selection or browser stats.
export const WORLD2_LAWS_RELEASED = false;
export const LAW_IDS = Object.freeze({
 A: ['fatigue','misfortune','imperfection','gravity','compression','austerity','fragility','impermanence','aftershock','inequality','envy'],
 B: ['repetition','stagnation','distortion'],
 C: ['sacrifice','extremes','exchange','unstable-fortune','reversal','burden-of-fortune','grace','abundance']
});
const draw = random => { const x=random(); if(!Number.isFinite(x)||x<0||x>=1)throw new Error('world2_invalid_random');return x; };
const real = (random,a,b) => a+(b-a)*draw(random);
const integer = (random,a,b) => a+Math.floor(draw(random)*(b-a+1));
export function weightedIndex(weights,random) {
 let x=draw(random)*weights.reduce((a,b)=>a+b,0);
 for(let i=0;i<weights.length;i++){x-=weights[i];if(x<0)return i;}
 return weights.length-1;
}
function tuple(epoch) {
 if(!epoch?.starts_at || Number(epoch.version)!==1)throw new Error('world2_unknown_manifest');
 for(const c of ['A','B','C'])if(!LAW_IDS[c].includes(epoch[c.toLowerCase()+'_id']))throw new Error('world2_invalid_law');
 return epoch;
}
const cycle = (id,random) => ({wait: id==='impermanence'?integer(random,60,150):id==='reversal'?integer(random,50,150):integer(random,40,120),active:0});
const threshold = (id,random) => id==='aftershock'?real(random,2,3):1+weightedIndex([90,9,1],random);
const envyThreshold = random => [1000,10000,100000][integer(random,0,2)];
function initial(id,random) {
 if(['impermanence','unstable-fortune','reversal'].includes(id))return cycle(id,random);
 if(id==='fragility')return {threshold:real(random,1.5,3),remaining:integer(random,100,250)};
 if(id==='aftershock'||id==='inequality')return {threshold:threshold(id,random),active:0,recovery:0};
 if(id==='envy')return {threshold:envyThreshold(random),remaining:'0',luck:1};
 return {};
}
function queue(value) {
 // JSON bigint strings avoid JavaScript's 2^53 precision limit. No gameplay cap.
 if(typeof value==='number'&&!Number.isSafeInteger(value))throw new Error('world2_invalid_envy_queue');
 if(!/^(0|[1-9][0-9]*)$/.test(String(value)))throw new Error('world2_invalid_envy_queue');
 return BigInt(value);
}
export function beginLawRoll({epoch,state={},envyRemaining='0',random}) {
 tuple(epoch);
 const fresh=state.epochStart!==epoch.starts_at;
 const next=fresh?{epochStart:epoch.starts_at,A:initial(epoch.a_id,random),C:initial(epoch.c_id,random)}:structuredClone(state);
 if(!next.A||!next.C)throw new Error('world2_invalid_law_state');
 if(epoch.a_id==='envy') {
  // DB resets its legacy separate queue too; the state owns the precise value.
  next.A.remaining=String(queue(fresh?'0':(next.A.remaining??envyRemaining)));
 }
 const modifiers={luck:1,mutation:1,speed:1,weightLuck:1};
 const a=next.A,c=next.C;
 if(epoch.a_id==='fatigue')modifiers.speed*=.75;
 if(epoch.a_id==='misfortune')modifiers.luck*=.70;
 if(epoch.a_id==='imperfection')modifiers.mutation*=.75;
 if(epoch.a_id==='gravity')modifiers.weightLuck*=.70;
 if(epoch.a_id==='impermanence'&&a.active>0)modifiers.luck*=a.luck;
 if(epoch.a_id==='aftershock'&&a.active>0)modifiers.weightLuck*=a.factor;
 if(epoch.a_id==='inequality'&&a.active>0)modifiers.mutation*=a.factor;
 if(epoch.a_id==='envy'&&queue(a.remaining)>0n)modifiers.luck*=a.luck;
 switch(epoch.c_id) {
  case 'sacrifice':modifiers.luck*=.70;modifiers.mutation*=1.40;break;
  case 'extremes':modifiers.speed*=.80;modifiers.weightLuck*=1.25;break;
  case 'exchange':modifiers.luck*=1.30;break;
  case 'burden-of-fortune':modifiers.luck*=1.35;break;
  case 'grace':modifiers.luck*=1.25;modifiers.mutation*=1.15;break;
  case 'abundance':modifiers.speed*=1.20;modifiers.weightLuck*=1.25;break;
  case 'unstable-fortune':if(c.active>0)modifiers.luck*=c.luck;break;
  case 'reversal':if(c.active>0){modifiers.luck*=c.luck;modifiers.mutation*=c.mutation;}break;
 }
 return {epoch,next,modifiers};
}
// Ordinary backend resolves hard overrides first (All-In/Reality Shifter etc.).
// Apply law before the backend's existing per-gem Luck/probability/value caps.
// Multiplication preserves a hard zero; no neutral/positive fallback resurrects it.
export function applyLawStats(ordinary,roll) {
 const out={...ordinary};
 for(const [key,factor] of Object.entries(roll.modifiers)) {
  if(!Object.hasOwn(out,key))continue;
  if(!Number.isFinite(out[key])||out[key]<0)throw new Error('world2_invalid_ordinary_stat');
  out[key]*=factor;
 }
 return out;
}
export function lawSpeedFactor(epoch) {
 tuple(epoch);
 return (epoch.a_id==='fatigue'?.75:1)*(epoch.c_id==='extremes'?.80:epoch.c_id==='abundance'?1.20:1);
}
export function lawFinalWeight({baseWeight,ordinaryFinalWeight,rawWeight,kind='ordinary'},roll,random) {
 if(kind!=='ordinary')return {finalWeight:ordinaryFinalWeight,ordinaryFinalWeightRatio:null,npcLiquidationFactor:1};
 if(![baseWeight,ordinaryFinalWeight,rawWeight].every(x=>Number.isFinite(x)&&x>=0))throw new Error('world2_invalid_weight');
 const f0=baseWeight>0?ordinaryFinalWeight/baseWeight:null;
 let final=ordinaryFinalWeight;
 if(roll.epoch.c_id==='burden-of-fortune'&&f0!==null)final*=Math.max(.55,1/(1+.08*Math.max(0,f0-1)));
 if(roll.epoch.c_id==='exchange')final*=.70;
 if(roll.epoch.a_id==='compression')final*=.75;
 if(roll.epoch.a_id==='fragility'&&rawWeight>roll.next.A.threshold)final*=real(random,.70,.80);
 return {finalWeight:final,ordinaryFinalWeightRatio:f0,npcLiquidationFactor:roll.epoch.a_id==='austerity'?.80:1};
}
function advanceCycle(id,s,random) {
 if(s.active>0) {if(--s.active===0)Object.assign(s,cycle(id,random));return;}
 if(--s.wait>0)return;
 if(id==='impermanence'){s.active=integer(random,8,25);s.luck=real(random,.70,.90);}
 else if(id==='reversal'){s.active=integer(random,10,30);s.luck=real(random,.70,.85);s.mutation=real(random,1.40,1.80);}
 else {s.active=integer(random,5,20);s.luck=draw(random)<.60?real(random,.60,.85):real(random,1.15,1.50);}
}
export function finishLawRoll(roll,observed,random) {
 // Call once after evaluation of a genuine position, before its atomic commit.
 // Loss/relic positions age clocks; no-specimen positions cannot trigger laws.
 const s=structuredClone(roll.next),a=s.A,c=s.C,id=roll.epoch.a_id;
 const ordinary=observed.kind==='ordinary';
 if(id==='fragility'&&--a.remaining===0)Object.assign(a,initial(id,random));
 if(id==='impermanence')advanceCycle(id,a,random);
 if(id==='aftershock'||id==='inequality') {
  if(a.active>0) {if(--a.active===0)a.recovery=integer(random,5,15);}
  else if(a.recovery>0) {if(--a.recovery===0)a.threshold=threshold(id,random);}
  else if(ordinary&&(id==='aftershock'?observed.rawWeight>a.threshold:observed.naturalMutationCount>=a.threshold)) {
   a.active=id==='aftershock'?integer(random,5,10):integer(random,4,8);
   a.factor=id==='aftershock'?real(random,.50,.75):real(random,.70,.80);
  }
 }
 if(id==='envy') {
  const before=queue(a.remaining);let remaining=before>0n?before-1n:0n;
  if(ordinary&&observed.rarity>=a.threshold) {
   const n=observed.rarity>=100000?integer(random,25,75):observed.rarity>=10000?
    3+weightedIndex([5,10,20,25,20,10,7,3],random):1+weightedIndex([25,25,20,15,10,5],random);
   if(before===0n)a.luck=real(random,.70,.85);
   remaining+=BigInt(n);a.threshold=envyThreshold(random);
  }
  a.remaining=String(remaining);if(remaining===0n)a.luck=1;
 }
 if(['unstable-fortune','reversal'].includes(roll.epoch.c_id))advanceCycle(roll.epoch.c_id,c,random);
 return {lawState:s,envyRemaining:id==='envy'?s.A.remaining:'0'};
}

// Same canonical numeric tiers as manifest v1, including noninteger denominators.
const tierEdges=[1,10,50,100,1000,10000,100000,1000000,10000000,100000000,1000000000];
export function numericTier(rarity) {
 if(!Number.isFinite(rarity)||rarity<1||rarity>=1e9)return null;
 return tierEdges.findIndex((n,i)=>rarity>=n&&rarity<tierEdges[i+1]);
}
const mutationBand = value => Number.isFinite(value)&&value>=1?value<10?0:value<100?1:value<1000?2:3:null;
const protectedMutation = row => ['misty','ancient','enchanted'].includes(String(row.id).toLowerCase())||['misty','ancient','enchanted'].includes(String(row.name).toLowerCase());
export function historyCounts(history) {
 if(!Array.isArray(history)||history.length>250)throw new Error('world2_invalid_history');
 const gems=new Map(),mutations=new Map();
 for(const p of history) {
  if(p.outcome_kind!=='ordinary')continue;
  if(p.gem_identity)gems.set(p.gem_identity,(gems.get(p.gem_identity)??0)+1);
  for(const id of new Set(p.natural_mutation_ids??[]))mutations.set(id,(mutations.get(id)??0)+1);
 }
 return {gems,mutations};
}
// Inputs are backend FINAL winning masses, never sequential hazards. Protected
// masses stay unchanged; only explicitly mutable numeric bands normalize.
export function redistributeMass(rows,counts,k,floor) {
 const out=rows.map(r=>({...r})),groups=new Map();
 for(let i=0;i<rows.length;i++) {
  const r=rows[i];if(!Number.isFinite(r.mass)||r.mass<0)throw new Error('world2_invalid_mass');
  if(r.mutable!==true||r.band===null||r.band===undefined)continue;
  const list=groups.get(r.band)??[];list.push(i);groups.set(r.band,list);
 }
 for(const indices of groups.values()) {
  const total=indices.reduce((n,i)=>n+rows[i].mass,0);
  const scaled=indices.map(i=>rows[i].mass*Math.max(floor,Math.exp(-k*(counts.get(rows[i].id)??0))));
  const denominator=scaled.reduce((a,b)=>a+b,0);if(!denominator)continue;
  indices.forEach((i,j)=>{out[i].mass=total*scaled[j]/denominator;});
 }
 return out;
}
export function inverseGemMass(rows,history,typeB) {
 if(typeB!=null&&!LAW_IDS.B.includes(typeB))throw new Error('world2_invalid_law');
 const [k,floor]=typeB==='repetition'?[.15,.60]:typeB==='stagnation'?[.025,.75]:[.05,.75];
 return redistributeMass(rows.map(r=>({...r,band:numericTier(r.rarity),mutable:r.mutable===true&&r.affectedByLuck!==false&&r.special!==true&&r.specialGem!==true})),historyCounts(history).gems,k,floor);
}
// Convert the optimized selector's ordered hazards, including its deterministic
// fallback, into final-winning mass ONCE. Residual belongs to the real fallback.
export function finalWinningMass(ordered,fallbackId) {
 let survival=1;
 const rows=ordered.map(row=>{
  if(!Number.isFinite(row.hazard)||row.hazard<0||row.hazard>1)throw new Error('world2_invalid_hazard');
  const mass=survival*row.hazard;survival*=1-row.hazard;return {...row,mass};
 });
 const fallback=rows.find(r=>r.id===fallbackId);
 if(!fallback)throw new Error('world2_missing_fallback');
 fallback.mass+=survival;return rows;
}
export function sampleMass(rows,random) {
 const total=rows.reduce((n,r)=>n+r.mass,0);if(!(total>0))throw new Error('world2_empty_distribution');
 let x=draw(random)*total;let last;
 for(const row of rows){if(row.mass<=0)continue;last=row;x-=row.mass;if(x<0)return row;}
 return last;
}
// Product excluding each index handles zero/one probabilities without 0/0 or
// division by (1-p). Prefix/suffix keeps this O(n), even for large catalogues.
export function singletonMass(catalog) {
 const ps=catalog.map(r=>r.rolledChance);
 if(ps.some(p=>!Number.isFinite(p)||p<0||p>1))throw new Error('world2_invalid_mutation_chance');
 const prefix=[1],suffix=Array(ps.length+1).fill(1);
 for(let i=0;i<ps.length;i++)prefix.push(prefix[i]*(1-ps[i]));
 for(let i=ps.length-1;i>=0;i--)suffix[i]=suffix[i+1]*(1-ps[i]);
 return catalog.map((r,i)=>({...r,mass:ps[i]*prefix[i]*suffix[i+1],band:mutationBand(r.multiplier),mutable:!protectedMutation(r)}));
}
export function distortSingleton(natural,catalog,history,random) {
 if(natural.length!==1||protectedMutation(natural[0]))return natural;
 const rows=singletonMass(catalog),current=rows.find(r=>r.id===natural[0].id);
 if(!current||!current.mutable||current.band===null||current.mass===0)return natural;
 const transformed=redistributeMass(rows,historyCounts(history).mutations,.50,.25);
 const chosen=sampleMass(transformed.filter(r=>r.mutable&&r.band===current.band),random);
 // Preserve canonical chance and actual Bernoulli rolledChance of the chosen
// identity; singleton mass is also provided for truthful conditional reporting.
 const result=catalog.find(r=>r.id===chosen.id);
 return [{...result,singletonWinningMass:chosen.mass}];
}

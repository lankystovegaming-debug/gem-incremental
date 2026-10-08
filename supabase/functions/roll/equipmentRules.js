// Pure rules shared with the browser. Only the server supplies RNG and saved state.
export const PICKAXE_STATS = {
 'neptune':[30,.7,1.5,1.2,1.2],
 'reality-shifter':[40,.4,0,.8,.8], 'bedrock-pickaxe':[25,3,1,5,1.55],
 'supersizer-pickaxe':[19.91,2.75,.5,5.5,2.4],
 'paradox-pickaxe':[34,3.1,1.5,5.5,1.7],
 'convergence-pickaxe':[32,3,1.5,5,1.75],
 'impossible-pickaxe':[1,1,1,1,1],
 'fortune-pickaxe':[35,2.8,1,4.25,1.45], 'all-in-pickaxe':[500,.33,.15,.15,.15],
 'all-rounder-toy':[2,2,2,2,2], 'jackpot-slot':[7.77,1.77,.77,1.77,.77], 'money-pickaxe':[.01,.3,2,10,200],
 'celestial-pickaxe':[26,2.8,1,4.5,1.5], 'empyrean-pickaxe':[28,3,1,4.25,1.5],
 'eternity-pickaxe':[25,3,1.25,4.25,1.5], 'tectonic-pickaxe':[24,2.8,1,7,1.9],
 'the-accelerator':[24,3.4,1,4,1.4], 'the-resonator':[24,2.9,1,4,1.45],
 'the-excavator':[24,3,1,4,1.4], 'toy-shovel':[17,2.4,.8,2.5,1.2],
 'silly-fun-happy-pickaxe':[11,.5,.5,2,.5]
};
// Toy Shovel retains its pre-rebalance borrowed stats.
const TOY_BORROWED_STATS = {
 'fortune-pickaxe':[33,2.7,.95,4,1.4],
 'empyrean-pickaxe':[24,3,1,3.5,1.4],
 'eternity-pickaxe':[22,3,1.1,4,1.45],
 'tectonic-pickaxe':[20,2.6,1,7,1.85],
 'the-accelerator':[21,3.4,.9,3,1.3],
 'the-resonator':[20,2.8,1,3.5,1.35],
 'the-excavator':[19,2.9,.95,3.25,1.3],
 'bedrock-pickaxe':[25,3.1,1.05,5,1.55]
};
export const ASCENDED_VALUE = 2;
export const SERIOUS_PICKAXES = ['bedrock-pickaxe','celestial-pickaxe','paradox-pickaxe','empyrean-pickaxe','eternity-pickaxe','tectonic-pickaxe','the-accelerator','the-resonator','the-excavator','fortune-pickaxe','supersizer-pickaxe','all-in-pickaxe'];
export const SUPERSIZER_SIZE_MUTATIONS = [
 {id:'supersizer-small',name:'Small',chance:1/3,multiplier:.75,weightMultiplier:.75,sizeMutation:true},
 {id:'supersizer-big',name:'Big',chance:1/10,multiplier:1.25,weightMultiplier:1.25,sizeMutation:true},
 {id:'supersizer-giant',name:'Giant',chance:1/100,multiplier:2,weightMultiplier:2,sizeMutation:true},
 {id:'supersizer-massive',name:'Massive',chance:1/1000,multiplier:5,weightMultiplier:5,sizeMutation:true},
 {id:'supersizer-colossal',name:'Colossal',chance:1/10000,multiplier:10,weightMultiplier:10,sizeMutation:true},
 {id:'supersizer-titanic',name:'Titanic',chance:1/100000,multiplier:20,weightMultiplier:20,sizeMutation:true},
 {id:'supersizer-gargantuan',name:'Gargantuan',chance:1/1000000,multiplier:25,weightMultiplier:25,sizeMutation:true}
];
export const POTION_FAMILIES = ['lucky','speed','fortune','mass'];
export const EXCAVATION_LOOT = [
 [34,27,20,10,6,2,1], [29,29,22,11,6,2,1],
 [24,28,25,13,7,2,1], [19,26,28,16,8,2,1], [14,24,30,19,9,2,2]
];
export const relicSecondary = (total, active) => 1 + (total - 1) * (active ? 1.5 : 1);
export const PARADOX_CONTRADICTION_GAINS = [0,1,3,10,40,250];
export function paradoxConditionCount({rarity=0,naturalWeight=0,naturalMutationCount=0,value=0,effectiveRarity=0}={}) {
 return [Number(rarity)>=1e6,Number(naturalWeight)>=3,Number(naturalMutationCount)>=1,Number(value)>=25e6,Number(effectiveRarity)>=1e9].filter(Boolean).length;
}
function normalizedParadoxState(saved={}) {
 const paradox=saved.paradox&&typeof saved.paradox==='object'?structuredClone(saved.paradox):{};
 paradox.contradiction=Math.max(0,Math.trunc(Number(paradox.contradiction??0))||0);
 paradox.mode=['normal','critical','resolved'].includes(paradox.mode)?paradox.mode:'normal';
 paradox.criticalRoll=Math.min(10,Math.max(1,Math.trunc(Number(paradox.criticalRoll??1))||1));
 if(paradox.mode==='normal'&&paradox.contradiction>=1000){paradox.contradiction-=1000;paradox.mode='critical';paradox.criticalRoll=1;}
 return paradox;
}
function finishParadoxSequence(paradox) {
 if(paradox.contradiction>=1000){paradox.contradiction-=1000;paradox.mode='critical';paradox.criticalRoll=1;}
 else {paradox.mode='normal';paradox.criticalRoll=1;}
}
export function paradoxPassiveMultiplier(state={}) {
 const paradox=normalizedParadoxState(state);
 return paradox.mode==='resolved'?3:paradox.mode==='critical'?1+paradox.criticalRoll/10:1;
}
export function advanceParadoxTrial(state,rarity) {
 const trial=state.paradoxTrial;
 if(!trial?.active||trial.completed)return;
 trial.rolls=Math.min(10000,Math.max(0,Number(trial.rolls??0))+1);
 trial.checkpoints={legendary:false,mythic:false,exotic:false,exalted:false,cosmic:false,...trial.checkpoints};
 const thresholds=[['cosmic',1e7],['exalted',1e6],['exotic',1e5],['mythic',1e4],['legendary',1e3]];
 const checkpoint=thresholds.find(([key,minimum])=>!trial.checkpoints[key]&&Number(rarity)>=minimum);
 if(checkpoint)trial.checkpoints[checkpoint[0]]=true;
 trial.completed=trial.rolls>=10000&&thresholds.every(([key])=>trial.checkpoints[key]);
}
export function luckLayers({pickaxe=1,clover=1,enchant=1,guild=1,research=1,focused=1,flat=0,special=1,oneRoll=0,world=1}) {
 const base=pickaxe*clover;
 const personal=1+(enchant-1)+(guild-1)+(research-1)+(focused-1);
 const ordinary=(base*personal+flat)*special;
 return {base,personal,flat,special,oneRoll,world,ordinary,final:(ordinary+oneRoll)*world};
}
export function acceleratorSpeed(spool) {return spool>=200?3.8:spool>=100?3.7:spool>=50?3.6:spool>=25?3.5:3.4;}
export function convergenceEchoGain(rarity=0) {
 const r=Number(rarity);return r>=1e9?250:r>=1e8?150:r>=1e7?75:r>=1e6?40:r>=1e5?20:r>=1e4?10:r>=1e3?5:r>=100?3:r>=50?2:r>=1?1:0;
}
export function normalizedConvergenceState(saved={}) {
 const current=saved.convergence&&typeof saved.convergence==='object'?saved.convergence:{};
 return {echo:Math.min(999,Math.max(0,Math.trunc(Number(current.echo??0))||0)),
  resonanceRolls:Math.min(5,Math.max(0,Math.trunc(Number(current.resonanceRolls??0))||0)),
  momentumCharges:Math.min(3,Math.max(0,Math.trunc(Number(current.momentumCharges??0))||0)),
  surgeRolls:Math.min(10,Math.max(0,Math.trunc(Number(current.surgeRolls??0))||0)),
  convergenceRolls:Math.max(0,Math.trunc(Number(current.convergenceRolls??0))||0)};
}
export function prepareEquipmentRoll(id,saved={},random=Math.random,genuine=true,now=Date.now()) {
 const state=structuredClone(saved);
 const rolls=Math.max(0,Number(state.rolls?.[id]??0));
 let stats=PICKAXE_STATS[id]?.slice()??null;
 const blessingUntil=Date.parse(String(state.supersizerBlessingUntil??''));
 const blessingActive=id==='supersizer-pickaxe'&&genuine&&Number.isFinite(blessingUntil)&&blessingUntil>Number(now);
 const blessedRolls=Math.max(0,Number(state.supersizerBlessedRolls??0));
 const flags={ascension:id==='empyrean-pickaxe'&&rolls>=1000&&rolls%1000<10,
  surge:id==='eternity-pickaxe'&&rolls>=1000&&rolls%1000<10,
  crushing:id==='tectonic-pickaxe'&&Number(state.crushing??0)>0,
  wrongTool:false,closeEnough:false,borrowed:null,
  realityShift:genuine&&id==='reality-shifter'&&(rolls+1)%500===0,
  foundationBurst:genuine&&id==='bedrock-pickaxe'&&Number(state.bedrockBurst??0)>0,
  supersizerBlessing:blessingActive,
  supersizerBlessedRoll:blessingActive&&(blessedRolls+1)%10===0&&random()<1/20,
  convergence:null,
  impossible:genuine&&id==='impossible-pickaxe'&&random()<1/1000000};
 if(flags.foundationBurst) {stats[0]*=1.5;stats[3]*=1.25;stats[4]*=1.1;}
 if(id==='paradox-pickaxe'&&genuine) {
  const paradox=normalizedParadoxState(state);state.paradox=paradox;
  const multiplier=paradoxPassiveMultiplier(state);
  flags.paradox={mode:paradox.mode,criticalRoll:paradox.mode==='critical'?paradox.criticalRoll:null,multiplier,contradiction:paradox.contradiction};
  stats[0]*=multiplier;stats[2]*=multiplier;stats[3]*=multiplier;stats[4]*=multiplier;
 }
 if(id==='convergence-pickaxe'&&genuine) {
  const convergence=normalizedConvergenceState(state);state.convergence=convergence;
  const surge=convergence.surgeRolls>0;
  const resonance=!surge&&convergence.resonanceRolls>0;
  const multiplier=surge?2:resonance?1.5:1;
  flags.convergence={surge,resonance,multiplier,oneBecomesMany:(convergence.convergenceRolls+1)%250===0};
  stats[0]*=multiplier;stats[2]*=multiplier;stats[3]*=multiplier;stats[4]*=multiplier;
 }
 if(id==='the-accelerator') stats[1]=acceleratorSpeed(Number(state.spool??0));
 if(id==='toy-shovel'&&random()<1/67) {
  flags.wrongTool=true;
  if(random()<1/67) {flags.closeEnough=true;stats=[67,2.4,6.7,6.7,2.67];}
  else {flags.borrowed=SERIOUS_PICKAXES[Math.floor(random()*SERIOUS_PICKAXES.length)];stats=(TOY_BORROWED_STATS[flags.borrowed]??PICKAXE_STATS[flags.borrowed]).slice();stats[1]=2.4;}
 }
 return {id,state,stats,flags};
}
export function supersizerSizeMutation(id,random=Math.random,genuine=true) {
 if(id!=='supersizer-pickaxe'||!genuine)return null;
 const draw=random();let cumulative=0;
 for(const mutation of SUPERSIZER_SIZE_MUTATIONS){cumulative+=mutation.chance;if(draw<cumulative)return {...mutation};}
 return null;
}
export function supersizerBlessingMultipliers(flags={}) {
 if(!flags.supersizerBlessing)return {luck:1,weightMultiplier:1,rollSpeed:1,finalSell:1};
 return {luck:flags.supersizerBlessedRoll?10000:2,weightMultiplier:2.25,rollSpeed:.75,finalSell:1.5};
}
export function impossibleProcMultipliers(flags={}) {
 return flags.impossible
  ? {luck:1000000,mutationChance:100,weightLuck:100,weightMultiplier:10}
  : {luck:1,mutationChance:1,weightLuck:1,weightMultiplier:1};
}
export function specialChance(id,gem,state) {
 return id==='the-resonator'&&gem.specialGem===true ? 1.25*(1+.05*Math.min(10,Number(state.resonance?.[gem.name]??0))) : 1;
}
export function exclusiveMutations(id,random=Math.random,genuine=true,flags={}) {
 if(!genuine) return [];
 if(id==='all-in-pickaxe') return random()<1/2000?[{id:'tryhard',name:'Tryhard',chance:1/2000,multiplier:10}]:[];
 if(id==='reality-shifter') return flags.realityShift&&random()<.2?[{id:'shifted',name:'Shifted',chance:.2,multiplier:35}]:[];
 if(id==='all-rounder-toy') return random()<1/20?[{id:'balanced',name:'Balanced',chance:1/20,multiplier:1.2}]:[];
 if(id==='empyrean-pickaxe') return random()<1/400?[{id:'ascended',name:'Ascended',chance:1/400,multiplier:ASCENDED_VALUE}]:[];
 if(id!=='silly-fun-happy-pickaxe') return [];
 return [[.5,'silly-small','Silly',.5],[.1,'silly-large','Silly',10],[.005,'happy','Happy',50]].flatMap(([chance,id,name,multiplier])=>random()<chance?[{id,name,chance,multiplier}]:[]);
}
export function finishEquipmentRoll(context,{naturalWeight,gem,sizeMutation=null,naturalMutationCount=0,value=0,effectiveRarity=0,now=Date.now(),random=Math.random,genuine=true}) {
 const {id,flags}=context;const state=structuredClone(context.state);
 if(!genuine) return {state,loot:null,breakneck:false};
 state.rolls={...state.rolls,[id]:Number(state.rolls?.[id]??0)+1};
 if(id==='celestial-pickaxe') advanceParadoxTrial(state,gem?.rarity);
 if(id==='paradox-pickaxe') {
  const paradox=normalizedParadoxState(state);
  const conditions=paradoxConditionCount({rarity:gem?.rarity,naturalWeight,naturalMutationCount,value,effectiveRarity});
  paradox.lastConditions=conditions;
  if(context.flags.paradox?.mode==='critical') {
   const criticalRoll=Number(context.flags.paradox.criticalRoll??1);
   if(criticalRoll>=10) {
    if(conditions===5){paradox.mode='resolved';paradox.criticalRoll=1;}
    else finishParadoxSequence(paradox);
   } else {paradox.mode='critical';paradox.criticalRoll=criticalRoll+1;}
  } else if(context.flags.paradox?.mode==='resolved') finishParadoxSequence(paradox);
  else {
   paradox.contradiction+=PARADOX_CONTRADICTION_GAINS[conditions]??0;
   if(paradox.contradiction>=1000){paradox.contradiction-=1000;paradox.mode='critical';paradox.criticalRoll=1;}
   else paradox.mode='normal';
  }
  state.paradox=paradox;
 }
 if(id==='convergence-pickaxe') {
  const convergence=normalizedConvergenceState(state);
  convergence.convergenceRolls+=1;
  if(flags.convergence?.surge) convergence.surgeRolls=Math.max(0,convergence.surgeRolls-1);
  else if(flags.convergence?.resonance) convergence.resonanceRolls=Math.max(0,convergence.resonanceRolls-1);
  else {
   convergence.echo+=convergenceEchoGain(gem?.rarity??0);
   if(convergence.echo>=1000){convergence.echo-=1000;convergence.resonanceRolls=5;}
  }
  state.convergence=convergence;
 }
 if(id==='supersizer-pickaxe') {
  if(flags.supersizerBlessing) state.supersizerBlessedRolls=Math.max(0,Number(state.supersizerBlessedRolls??0))+1;
  else state.supersizerBlessedRolls=0;
  if(sizeMutation?.id==='supersizer-gargantuan') {
   // Refresh to five minutes from this roll. An already-active blessing keeps
   // its ten-roll cadence; a newly-started blessing begins at zero AFTER it.
   if(!flags.supersizerBlessing) state.supersizerBlessedRolls=0;
   state.supersizerBlessingUntil=new Date(Number(now)+300000).toISOString();
  }
 }
 if(id==='bedrock-pickaxe') {
  if(flags.foundationBurst) state.bedrockBurst=Math.max(0,Number(state.bedrockBurst)-1);
  else if(gem) {
   const rarity=Number(gem.rarity);
   // Matches public.expedition_rarity_rank: Common <10, Uncommon <50, Rare <100.
   const gain=rarity>=1&&rarity<10?2:rarity>=10&&rarity<50?3:rarity>=50&&rarity<100?5:0;
   state.foundation=Math.min(100,Math.max(0,Number(state.foundation??0))+gain);
   if(state.foundation===100) {state.foundation=0;state.bedrockBurst=10;}
  }
 }
 if(id==='the-accelerator') state.spool=Number(state.spool??0)+1;
 if(id==='tectonic-pickaxe') {
  if(flags.crushing) state.crushing=Math.max(0,Number(state.crushing)-1);
  else if(naturalWeight!=null) {
   state.pressure=Number(state.pressure??0)+(naturalWeight<.85?4:naturalWeight<1.1?3:naturalWeight<1.5?2:naturalWeight<2?1:0);
   if(state.pressure>=100){state.pressure=0;state.crushing=5;}
  }
 }
 if(id==='the-resonator'&&gem?.specialGem===true) {
  const rarity=Number(gem.rarity);const gain=rarity>=5e8?10:rarity>=1e8?5:rarity>=1e7?3:rarity>=1e6?2:1;
  state.resonance={...state.resonance,[gem.name]:Math.min(10,Number(state.resonance?.[gem.name]??0)+gain)};
 }
 let loot=null;
 if(id==='the-excavator'&&random()<1/40) {
  const mastery=Number(state.excavations??0);
  const level=[25,100,250,500].filter(n=>mastery>=n).length;
  let draw=random()*100;let tier=6;
  for(let i=0;i<7;i++){draw-=EXCAVATION_LOOT[level][i];if(draw<0){tier=i;break;}}
  loot=tier<4?`${POTION_FAMILIES[Math.floor(random()*4)]}-potion-${tier+1}`:['legendary-potion','relic-potion','mythic-potion'][tier-4];
  state.excavations=mastery+1;
 }
 return {state,loot,breakneck:id==='the-accelerator'&&Number(context.state.spool??0)>=200&&random()<1/100};
}
export function equipmentTotals(equipment=[],relic=false,override=null) {
 const pick=equipment.find(e=>e.category==='pickaxe');
 const mw=1+Math.min(5,Math.max(0,Number(pick?.masterwork_level??0)))/100;
 const stats=override??(PICKAXE_STATS[pick?.equipment_id]??[1+Number(pick?.luck_bonus??0)*mw,1+Number(pick?.roll_speed_bonus??0)*mw,1,1,1]);
 if(pick?.equipment_id==='all-in-pickaxe') return {pickaxe:500,clover:1,luck:500,rollSpeed:.33,mutation:.15,weightLuck:.15,weightMultiplier:.15};
 const secondary=(category,column)=>relicSecondary(1+Number(equipment.find(e=>e.category===category)?.[column]??0),relic);
 const plastic=equipment.find(e=>e.category==='bag'&&e.equipment_id==='plastic-shopping-bag');
 // Plastic's old additive bonus/masterwork behavior is deliberately retained.
 const wm=plastic?stats[4]+Number(plastic.weight_multiplier_bonus??1.55)*(1+Math.min(5,Math.max(0,Number(plastic.masterwork_level??0)))/100):stats[4]*secondary('bag','weight_multiplier_bonus');
 const rollBulk = Math.max(0, equipment.reduce((sum, item) => sum + Number(item.roll_bulk_bonus ?? 0), 0));
 const petLuck = Math.max(0, equipment.reduce((sum, item) => sum + Number(item.pet_luck_bonus ?? 0), 0));
 return {pickaxe:stats[0],clover:secondary('clover','luck_bonus'),luck:stats[0]*secondary('clover','luck_bonus'),rollSpeed:stats[1],mutation:stats[2]*secondary('lantern','mutation_chance_bonus'),weightLuck:stats[3]*secondary('boots','weight_luck_bonus'),weightMultiplier:wm,rollBulk,petLuck};
}

// Called only after the server has accepted a genuine roll, before any gem RNG.
export function jackpotRoll(id, genuineRoll, random=Math.random, genuine=true) {
 if(id!=='jackpot-slot'||!genuine) return {luck:1,houseEdge:false};
 const unlucky=random()<1/77, jackpot=random()<1/777;
 const seventh=genuineRoll%7===0, sevenSeventySeventh=genuineRoll%777===0;
 return {unlucky,jackpot,seventh,sevenSeventySeventh,
  luck:(unlucky ? .77 : 1) * (jackpot ? 1.77 : 1) * (seventh ? .77 : 1) * (sevenSeventySeventh ? 7.77 : 1),houseEdge:random()<.0077};
}
export const eligibleEquipmentGems = (gems,id) => id==='money-pickaxe' ? gems.filter(g=>Number(g.rarity)<100) : gems;
export const flatEquipmentChance = id => id==='all-in-pickaxe'?4:1;

// Persisted settings are still checked at the authoritative selection boundary.
export function sanitizeMaxLuck(value) {
 if(value==null || (typeof value==='string' && value.trim()==='')) return null;
 if(!['number','string'].includes(typeof value)) return null;
 const n=Number(value);
 return Number.isFinite(n)&&n>=1&&n<=Number.MAX_SAFE_INTEGER?n:null;
}
export function capGemLuck(luck,maxLuck) {
 const cap=sanitizeMaxLuck(maxLuck);return cap==null?luck:Math.min(luck,cap);
}

export const fortuneLuckFactor = (id,gem) => id==='fortune-pickaxe' && gem.affectedByLuck!==false && Number(gem.rarity)>=1000000 ? 1.1 : 1;

// Pure rules shared with the browser. Only the server supplies RNG and saved state.
export const PICKAXE_STATS = {
 'fortune-pickaxe':[33,2.7,.95,4,1.4], 'all-in-pickaxe':[250,.2,.1,.1,.1],
 'all-rounder-toy':[2,2,2,2,2], 'jackpot-slot':[7.77,1.77,.77,1.77,.77], 'money-pickaxe':[.01,.3,2,10,200],
 'celestial-pickaxe':[26,2.8,1,4.5,1.5], 'empyrean-pickaxe':[24,3,1,3.5,1.4],
 'eternity-pickaxe':[22,3,1.1,4,1.45], 'tectonic-pickaxe':[20,2.6,1,7,1.85],
 'the-accelerator':[21,3.4,.9,3,1.3], 'the-resonator':[20,2.8,1,3.5,1.35],
 'the-excavator':[19,2.9,.95,3.25,1.3], 'toy-shovel':[17,2.4,.8,2.5,1.2],
 'silly-fun-happy-pickaxe':[11,.5,.5,2,.5]
};
export const ASCENDED_VALUE = 2;
export const SERIOUS_PICKAXES = ['celestial-pickaxe','empyrean-pickaxe','eternity-pickaxe','tectonic-pickaxe','the-accelerator','the-resonator','the-excavator','fortune-pickaxe','all-in-pickaxe'];
export const POTION_FAMILIES = ['lucky','speed','fortune','mass'];
export const EXCAVATION_LOOT = [
 [34,27,20,10,6,2,1], [29,29,22,11,6,2,1],
 [24,28,25,13,7,2,1], [19,26,28,16,8,2,1], [14,24,30,19,9,2,2]
];
export const relicSecondary = (total, active) => 1 + (total - 1) * (active ? 1.5 : 1);
export function luckLayers({pickaxe=1,clover=1,enchant=1,guild=1,research=1,focused=1,flat=0,special=1,oneRoll=0,world=1}) {
 const base=pickaxe*clover;
 const personal=1+(enchant-1)+(guild-1)+(research-1)+(focused-1);
 const ordinary=(base*personal+flat)*special;
 return {base,personal,flat,special,oneRoll,world,ordinary,final:(ordinary+oneRoll)*world};
}
export function acceleratorSpeed(spool) {return spool>=200?3.8:spool>=100?3.7:spool>=50?3.6:spool>=25?3.5:3.4;}
export function prepareEquipmentRoll(id,saved={},random=Math.random) {
 const state=structuredClone(saved);
 const rolls=Math.max(0,Number(state.rolls?.[id]??0));
 let stats=PICKAXE_STATS[id]?.slice()??null;
 const flags={ascension:id==='empyrean-pickaxe'&&rolls>=1000&&rolls%1000<10,
  surge:id==='eternity-pickaxe'&&rolls>=1000&&rolls%1000<10,
  crushing:id==='tectonic-pickaxe'&&Number(state.crushing??0)>0,
  wrongTool:false,closeEnough:false,borrowed:null};
 if(id==='the-accelerator') stats[1]=acceleratorSpeed(Number(state.spool??0));
 if(id==='toy-shovel'&&random()<1/67) {
  flags.wrongTool=true;
  if(random()<1/67) {flags.closeEnough=true;stats=[67,2.4,6.7,6.7,2.67];}
  else {flags.borrowed=SERIOUS_PICKAXES[Math.floor(random()*SERIOUS_PICKAXES.length)];stats=PICKAXE_STATS[flags.borrowed].slice();stats[1]=2.4;}
 }
 return {id,state,stats,flags};
}
export function specialChance(id,gem,state) {
 return id==='the-resonator'&&gem.specialGem===true ? 1.25*(1+.05*Math.min(10,Number(state.resonance?.[gem.name]??0))) : 1;
}
export function exclusiveMutations(id,random=Math.random,genuine=true) {
 if(!genuine) return [];
 if(id==='all-rounder-toy') return random()<1/20?[{id:'balanced',name:'Balanced',chance:1/20,multiplier:1.2}]:[];
 if(id==='empyrean-pickaxe') return random()<1/400?[{id:'ascended',name:'Ascended',chance:1/400,multiplier:ASCENDED_VALUE}]:[];
 if(id!=='silly-fun-happy-pickaxe') return [];
 return [[.5,'silly-small','Silly',.5],[.1,'silly-large','Silly',10],[.005,'happy','Happy',50]].flatMap(([chance,id,name,multiplier])=>random()<chance?[{id,name,chance,multiplier}]:[]);
}
export function finishEquipmentRoll(context,{naturalWeight,gem,random=Math.random,genuine=true}) {
 const {id,flags}=context;const state=structuredClone(context.state);
 if(!genuine) return {state,loot:null,breakneck:false};
 state.rolls={...state.rolls,[id]:Number(state.rolls?.[id]??0)+1};
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
 if(pick?.equipment_id==='all-in-pickaxe') return {pickaxe:250,clover:1,luck:250,rollSpeed:.2,mutation:.1,weightLuck:.1,weightMultiplier:.1};
 const secondary=(category,column)=>relicSecondary(1+Number(equipment.find(e=>e.category===category)?.[column]??0),relic);
 const plastic=equipment.find(e=>e.category==='bag'&&e.equipment_id==='plastic-shopping-bag');
 // Plastic's old additive bonus/masterwork behavior is deliberately retained.
 const wm=plastic?stats[4]+Number(plastic.weight_multiplier_bonus??1.55)*(1+Math.min(5,Math.max(0,Number(plastic.masterwork_level??0)))/100):stats[4]*secondary('bag','weight_multiplier_bonus');
 return {pickaxe:stats[0],clover:secondary('clover','luck_bonus'),luck:stats[0]*secondary('clover','luck_bonus'),rollSpeed:stats[1],mutation:stats[2]*secondary('lantern','mutation_chance_bonus'),weightLuck:stats[3]*secondary('boots','weight_luck_bonus'),weightMultiplier:wm};
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

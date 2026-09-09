// Total multipliers. Database bonus columns continue storing total minus one.
import { PICKAXE_STATS } from '../../supabase/functions/roll/equipmentRules.js';
export { PICKAXE_STATS };
const bands = [['Rare',100,999],['Legendary',1000,9999],['Mythic',10000,99999],['Exotic',100000,999999],['Exalted',1000000,9999999],['Cosmic',10000000,99999999]];
const gem = (name,amount) => ({type:'gem-count',gem:name,amount});
const bulk = (id,counts) => Object.entries(counts).map(([name,amount]) => {
  const [,minimumRarity,maximumRarity] = bands.find(b=>b[0]===name);
  return {id:`${id}-${name.toLowerCase()}`,type:'gem-count',label:name,minimumRarity,maximumRarity,amount};
});
const specimen = (id,weight,amount,maximum=false) => ({id,type:'specimen-condition', [maximum?'maximumWeightMultiplier':'minimumWeightMultiplier']:weight,amount,label:`${amount} specimens ${maximum?'≤':'≥'}${weight}×`});
export const SECONDARY_ROWS = {
 clover: [
 ['three-leaf-clover','Three-Leaf Clover',1.01,'Peridot',3,5000],
 ['four-leaf-clover','Four-Leaf Clover',1.02,'Aventurine',4,25000],
 ['silver-clover','Silver Clover',1.035,'Emerald',3,100000,{Rare:5}],
 ['golden-clover','Golden Clover',1.05,'Demantoid',3,500000,{Legendary:15}],
 ['prismatic-clover','Prismatic Clover',1.07,'Tsavorite',2,2000000,{Legendary:30,Mythic:5}],
 ['astral-clover','Astral Clover',1.085,'Kyawthuite',1,7500000,{Legendary:60,Mythic:10}],
 ['celestial-clover','Celestial Clover',1.10,'Hibonite',1,20000000,{Legendary:100,Mythic:20,Exotic:2}]],
 lantern: [
 ['dim-lantern','Dim Lantern',1.02,'Pyrite',3,2500],
 ['bright-lantern','Bright Lantern',1.035,'Opal',3,10000],
 ['radiant-lantern','Radiant Lantern',1.05,'Sapphire',3,35000],
 ['beacon-lantern','Beacon Lantern',1.07,'Diamond',2,100000],
 ['eternal-lantern','Eternal Lantern',1.09,'Black Opal',2,300000,{Legendary:5}],
 ['celestial-lantern','Celestial Lantern',1.115,'Titanite',2,750000,{Legendary:10}],
 ['aether-lantern','Aether Lantern',1.14,'Void Pearl',2,2000000,{Legendary:20}],
 ['void-lantern','Void Lantern',1.17,'Carletonite',1,5000000,{Legendary:35,Mythic:5}],
 ['event-horizon-lantern','Event Horizon Lantern',1.205,'Aether Quartz',1,10000000,{Legendary:60,Mythic:10}],
 ['singularity-lantern','Singularity Lantern',1.25,'Void Opal',1,20000000,{Legendary:100,Mythic:20,Exotic:2}]],
 boots: [
 ['miners-boots',"Miner's Boots",1.01,'Pyrite',5,2500],
 ['reinforced-boots','Reinforced Boots',1.02,'Bloodstone',4,10000],
 ['prospectors-boots',"Prospector's Boots",1.03,'Diamond',3,30000],
 ['fortune-boots','Fortune Boots',1.04,'Mythril',3,75000],
 ['gravity-boots','Gravity Boots',1.05,'Lodestone',2,200000,{Legendary:5}],
 ['astral-boots','Astral Boots',1.06,'Titanite',2,500000,{Legendary:10}],
 ['aetherstep-boots','Aetherstep Boots',1.075,'Diaspore',2,1000000,{Legendary:15}],
 ['voidwalker-boots','Voidwalker Boots',1.09,'Void Pearl',1,2500000,{Legendary:25}],
 ['eventide-boots','Eventide Boots',1.105,'Red Diamond',1,5000000,{Legendary:35,Mythic:5}],
 ['singularity-striders','Singularity Striders',1.12,'Natural Moissanite',1,7500000,{Legendary:50,Mythic:8}],
 ['event-horizon-boots','Event Horizon Boots',1.135,'Hibonite',1,12500000,{Legendary:75,Mythic:12}],
 ['gravitational-boots','Gravitational Boots',1.15,'Magnesiochloritoid',1,20000000,{Legendary:100,Mythic:20,Exotic:2}]],
 bag: [
 ['worn-bag','Worn Bag',1.01,'Pyrite',5,2500],
 ['sturdy-bag','Sturdy Bag',1.02,'Aventurine',4,10000],
 ['reinforced-bag','Reinforced Bag',1.03,'Sapphire',3,30000],
 ['gemkeeper-bag','Gemkeeper Bag',1.04,'Diamond',3,75000],
 ['bottomless-bag','Bottomless Bag',1.05,'Black Opal',2,200000,{Legendary:5}],
 ['colossal-bag','Colossal Bag',1.065,'Titanite',2,500000,{Legendary:10}],
 ['aetherwoven-bag','Aetherwoven Bag',1.08,'Tsavorite',2,1000000,{Legendary:15}],
 ['dimensional-bag','Dimensional Bag',1.095,'Void Pearl',1,2500000,{Legendary:25}],
 ['riftwoven-bag','Riftwoven Bag',1.11,'Chambersite',1,5000000,{Legendary:40,Mythic:5}],
 ['vault-of-plenty','Vault of Plenty',1.13,'Natural Moissanite',1,10000000,{Legendary:60,Mythic:10}],
 ['dimensional-vault','Dimensional Vault',1.15,'Black Diamond',1,20000000,{Legendary:100,Mythic:20,Exotic:2}]]
};
export const secondaryRecipes = Object.entries(SECONDARY_ROWS).flatMap(([category,rows])=>rows.map(([id,name,total,named,count,moneyCost,counts={}],i)=>({
 id,name,category,moneyCost,equipmentOverhaul:true,
 requirements:[...(i?[{type:'equipment',equipmentId:rows[i-1][0]}]:[]),gem(named,count),...bulk(id,counts)],
 reward:{id,name,category,tier:i+1,bonus:{[{clover:'luck',lantern:'mutationChance',boots:'weightLuck',bag:'weightMultiplier'}[category]]:Number((total-1).toFixed(6))}}
})));
export function pickaxeBonus(id) {
 const [luck,rollSpeed,mutationChance,weightLuck,weightMultiplier]=PICKAXE_STATS[id];
 return Object.fromEntries(Object.entries({luck,rollSpeed,mutationChance,weightLuck,weightMultiplier}).map(([key,total])=>[key,Number((total-1).toFixed(6))]));
}
function pick(id,name,cost,requirements,toy=false) {return {id,name,category:'pickaxe',craftingTab:toy?'toys':'pickaxe',horizontal:true,equipmentOverhaul:true,moneyCost:cost,requirements,reward:{id,name,category:'pickaxe',tier:15,bonus:pickaxeBonus(id)}};}
export const specialistRecipes = [
 pick('tectonic-pickaxe','Tectonic Pickaxe',150000000,[...['Ringwoodite','Paraershovite','Vesuvianite','Fluorcalciobritholite','Singularity Shard'].map((n,i)=>gem(n,[5,3,2,1,1][i])),...bulk('tectonic-pickaxe',{Legendary:750,Mythic:200,Exotic:10}),...[5,6,7,8].map((w,i)=>specimen(`tectonic-specimen-${w}`,w,[40,15,4,1][i]))]),
 pick('the-accelerator','The Accelerator',175000000,[gem('Chronite',3),...bulk('the-accelerator',{Legendary:1000,Mythic:300,Exotic:15}),{type:'lifetime-rolls',rolls:400000}]),
 pick('the-resonator','The Resonator',150000000,[...bulk('the-resonator',{Legendary:750,Mythic:250,Exotic:10}),...['daily_window','global_event','special'].map((classification,i)=>({type:'special-discoveries',classification,amount:[5,3,10][i]}))]),
 pick('the-excavator','The Excavator',125000000,[...bulk('the-excavator',{Legendary:750,Mythic:250,Exotic:10}),...[100,75,40,15].map((amount,i)=>({type:'potion-tier',tier:i+1,amount})),{type:'consumable',consumableId:'legendary-potion',amount:3},{type:'consumable',consumableId:'mythic-potion',amount:1}]),
 pick('toy-shovel','Toy Shovel',670000000.67,[{type:'equipment',equipmentId:'plastic-shopping-bag',consume:false},...bulk('toy-shovel',{Legendary:6700,Mythic:2067,Exotic:67,Exalted:6}),gem('random rock I found outside',67),gem('Quartz',67),{type:'consumable',consumableId:'plastic-bag',amount:67},specimen('toy-shovel-specimens',6.7,67)],true),
 pick('silly-fun-happy-pickaxe','Silly Fun Happy Pickaxe',6767676.76,[gem('random rock I found outside',10),gem('Quartz',50),...bulk('silly-fun-happy-pickaxe',{Rare:100,Legendary:67,Mythic:10,Exotic:1}),specimen('silly-light-specimens',.6,10,true)],true)
];
const batchBands={Common:[1,9],Uncommon:[10,49],Rare:[50,99],Epic:[100,999],Legendary:[1000,9999],Mythic:[10000,99999],Exotic:[100000,999999],Exalted:[1000000,9999999]};
const batchBulk=(id,counts)=>Object.entries(counts).map(([label,amount])=>({id:`${id}-${label.toLowerCase()}`,type:'gem-count',label,amount,minimumRarity:batchBands[label][0],maximumRarity:batchBands[label][1]}));
const history=(metric,amount,label)=>({type:'equipment-history',metric,amount,label,consume:false});
export const fiveItemRecipes=[
 {...pick('fortune-pickaxe','Fortune Pickaxe',200000000,[...batchBulk('fortune-pickaxe',{Legendary:1500,Mythic:500,Exotic:25,Exalted:2}),history('raw5m',3,'Raw-rarity ≥1/5M rolls'),history('raw10m',1,'Raw-rarity ≥1/10M rolls')]),description:'A pickaxe made for miners who believe you can never have too much luck. Sacrifices a little of everything else for a simple advantage: more Luck.'},
 pick('all-in-pickaxe','All-In Pickaxe',250000000,[...batchBulk('all-in-pickaxe',{Legendary:5000,Mythic:1500,Exotic:100,Exalted:5}),history('endgamePickaxes',3,'Distinct post-Celestial endgame Pickaxes ever owned'),history('raw10m',1,'Raw-rarity ≥1/10M rolls')]),
 {...pick('all-rounder-toy','All Rounder Toy',50000000,[...batchBulk('all-rounder-toy',{Epic:200,Mythic:100}),gem('Uranium',50),...batchBulk('all-rounder-toy',{Exotic:20}),gem('Cryoshock',5),...batchBulk('all-rounder-toy',{Exalted:3})],true),description:'Tired of unbalanced stats and broken abilities? Well, wish no more—introducing the All Rounder Toy with balanced stats.'},
 {...pick('jackpot-slot','Jackpot Slot',77700000,[...batchBulk('jackpot-slot',{Common:7777,Mythic:777,Exotic:77,Exalted:7}),history('genuineRolls',77700,'Lifetime genuine rolls')],true),description:'Slots slots slots, I bet everything on slots. Ain’t no body taking my spot, I just hit the jackpotttt'},
 {...pick('money-pickaxe','Money Pickaxe',100000000,[...batchBulk('money-pickaxe',{Common:10000,Rare:5000}),gem('Quartz',2500),gem('Calcite',1000),gem('Feldspar',500),history('heavy5',250,'Specimens ≥5× natural weight'),history('lifetimeEarnings',1000000000,'Lifetime earnings ($)')],true),description:"Rarity doesn't pay the bills. 200× more rock does."}
];
export const realityBedrockRecipes=[
 {...pick('reality-shifter','Reality Shifter',125000000,[gem('Eternal Glowstone',1000),gem('Nyx Obsidian',1000),gem('Solarion',1),gem('Polaris',1),history('genuineRolls',50000,'Lifetime genuine rolls')],true),consumeMaterials:true,description:'Reality shall conform before our power. Kneel, for you are in the presence of a god.'},
 {...pick('bedrock-pickaxe','Bedrock Pickaxe',150000000,[...batchBulk('bedrock-pickaxe',{Common:10000,Uncommon:7500,Rare:5000,Epic:2500}),history('genuineRolls',250000,'Lifetime genuine rolls')]),consumeMaterials:true}
];
export function applyEquipmentOverhaul(recipes) {
 const replacements=new Map([...secondaryRecipes,...specialistRecipes,...fiveItemRecipes,...realityBedrockRecipes].map(r=>[r.id,r]));
 const retired = new Set(['neutron-boots','spacetime-walkers','reality-breakers','singularity-vault','bottomless-singularity','event-horizon-vault','omnidimensional-vault']);
 const result=recipes.filter(r=>!replacements.has(r.id)&&!retired.has(r.id)).map(original=>{
  const r=structuredClone(original);
  if(r.id==='plastic-shopping-bag') {r.craftingTab='toys';return r;}
  if(PICKAXE_STATS[r.id]) {
   r.reward.bonus=pickaxeBonus(r.id);r.equipmentOverhaul=true;
   if(r.id!=='celestial-pickaxe') {r.horizontal=true;r.requirements=r.requirements.filter(q=>q.type!=='equipment');}
  }
  return r;
 });
 return [...result,...replacements.values()];
}

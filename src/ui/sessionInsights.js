const KEY="gemIncremental.sessionInsights.v1";

function fresh(){return{startedAt:new Date().toISOString(),rolls:0,kept:0,autoKept:0,autoSold:0,autoSoldValue:0,autoCrafted:0,relics:0,rarities:{},mutations:{},bestEffective:null,bestBase:null,heaviest:null,mostValuable:null,notable:[]};}
function load(){try{return{...fresh(),...JSON.parse(sessionStorage.getItem(KEY)||"null")};}catch{return fresh();}}
function save(value){try{sessionStorage.setItem(KEY,JSON.stringify(value));}catch{} window.dispatchEvent(new CustomEvent("session-insights:change",{detail:value}));return value;}
function mutations(data){return Array.isArray(data?.mutations)?data.mutations:[];}
function result(data,outcome){const multiplier=Math.max(1,Number(data?.mutationMultiplier||1)),base=Number(data?.gem?.rarity||0);return{name:String(data?.gem?.name||"Unknown"),baseRarity:base,effectiveRarity:base*multiplier,weight:Number(data?.finalWeight||0),value:Number(data?.value||0),mutations:mutations(data).map(item=>item.id),decision:outcome?.type||"kept",reason:outcome?.reason||"Stored",at:new Date().toISOString()};}
function rarer(current,item,key){return!current||Number(item[key])>Number(current[key])?item:current;}

export function recordSessionRoll(data,outcome={type:"kept"}){
  const state=load(),item=result(data,outcome),tier=String(outcome.tier||"unknown");state.rolls+=1;state.rarities[tier]=(state.rarities[tier]||0)+1;
  for(const id of item.mutations)state.mutations[id]=(state.mutations[id]||0)+1;
  if(data?.gem?.dropType==="relic")state.relics+=1;
  if(outcome.type==="auto-sold"){state.autoSold+=1;state.autoSoldValue+=Number(outcome.soldValue||data?.value||0);}else if(outcome.type==="auto-crafted")state.autoCrafted+=1;else{state.kept+=1;if(outcome.type==="auto-kept")state.autoKept+=1;}
  state.bestEffective=rarer(state.bestEffective,item,"effectiveRarity");state.bestBase=rarer(state.bestBase,item,"baseRarity");state.heaviest=rarer(state.heaviest,item,"weight");state.mostValuable=rarer(state.mostValuable,item,"value");
  if(item.effectiveRarity>=100000||item.mutations.length||data?.gem?.dropType==="relic")state.notable=[item,...state.notable].slice(0,20);
  return save(state);
}
export function getSessionInsights(){return load();}
export function clearSessionInsights(){return save(fresh());}

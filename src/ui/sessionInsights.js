import { getGemMutation } from "../data/mutations.js";

const KEY="gemIncremental.sessionInsights.v1";

function fresh(){return{startedAt:new Date().toISOString(),rolls:0,kept:0,autoKept:0,autoSold:0,autoSoldValue:0,autoCrafted:0,relics:0,rarities:{},mutations:{},bestEffective:null,bestBase:null,heaviest:null,mostValuable:null,notable:[]};}
function isRelic(item){return item?.dropType==="relic"||item?.name==="Enchant Relic"||item?.name==="Ancient Relic";}
function mutationChanceProduct(ids=[]){return ids.reduce((total,id)=>total*Math.max(1,Number(getGemMutation(id)?.chance||1)),1);}
function normalizeItem(item){
  if(!item)return item;
  const ids=Array.isArray(item.mutations)?item.mutations:[];
  const supplied=Number(item.effectiveRarity);
  return{...item,mutations:ids,mutationNames:Array.isArray(item.mutationNames)&&item.mutationNames.length?item.mutationNames:ids.map(id=>getGemMutation(id)?.name||id),effectiveRarity:Number.isFinite(supplied)&&supplied>0?supplied:Number(item.baseRarity||0)*mutationChanceProduct(ids)};
}
function load(){try{const state={...fresh(),...JSON.parse(sessionStorage.getItem(KEY)||"null")};state.bestEffective=normalizeItem(state.bestEffective);state.bestBase=normalizeItem(state.bestBase);state.heaviest=normalizeItem(state.heaviest);state.mostValuable=normalizeItem(state.mostValuable);state.notable=(Array.isArray(state.notable)?state.notable:[]).map(normalizeItem).filter(item=>!isRelic(item));const candidates=[state.bestEffective,state.bestBase,state.heaviest,state.mostValuable,...state.notable].filter(Boolean);state.bestEffective=candidates.reduce((best,item)=>rarer(best,item,"effectiveRarity"),null);return state;}catch{return fresh();}}
function save(value){try{sessionStorage.setItem(KEY,JSON.stringify(value));}catch{} window.dispatchEvent(new CustomEvent("session-insights:change",{detail:value}));return value;}
function mutations(data){return Array.isArray(data?.mutations)?data.mutations:[];}
function result(data,outcome){const mutationList=mutations(data),ids=mutationList.map(item=>item.id),base=Number(data?.gem?.rarity||0),supplied=Number(data?.effectiveRarity??data?.effective_rarity);return{name:String(data?.gem?.name||"Unknown"),baseRarity:base,effectiveRarity:Number.isFinite(supplied)&&supplied>0?supplied:base*mutationChanceProduct(ids),weight:Number(data?.finalWeight||0),value:Number(data?.value||0),mutations:ids,mutationNames:mutationList.map(item=>item.name||getGemMutation(item.id)?.name||item.id),dropType:data?.gem?.dropType||"gem",decision:outcome?.type||"kept",reason:outcome?.reason||"Stored",at:new Date().toISOString()};}
function rarer(current,item,key){return!current||Number(item[key])>Number(current[key])?item:current;}

export function recordSessionRoll(data,outcome={type:"kept"}){
  const state=load(),item=result(data,outcome),tier=String(outcome.tier||"unknown");state.rolls+=1;state.rarities[tier]=(state.rarities[tier]||0)+1;
  for(const id of item.mutations)state.mutations[id]=(state.mutations[id]||0)+1;
  if(data?.gem?.dropType==="relic")state.relics+=1;
  if(outcome.type==="auto-sold"){state.autoSold+=1;state.autoSoldValue+=Number(outcome.soldValue||data?.value||0);}else if(outcome.type==="auto-crafted")state.autoCrafted+=1;else{state.kept+=1;if(outcome.type==="auto-kept")state.autoKept+=1;}
  state.bestEffective=rarer(state.bestEffective,item,"effectiveRarity");state.bestBase=rarer(state.bestBase,item,"baseRarity");state.heaviest=rarer(state.heaviest,item,"weight");state.mostValuable=rarer(state.mostValuable,item,"value");
  if(!isRelic(item)&&(item.effectiveRarity>=100000||item.mutations.length))state.notable=[item,...state.notable].slice(0,20);
  return save(state);
}
export function getSessionInsights(){return load();}
export function clearSessionInsights(){return save(fresh());}

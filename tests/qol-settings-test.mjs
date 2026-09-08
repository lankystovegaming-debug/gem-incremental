import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const saved=new Map([['gemIncremental.settings',JSON.stringify({autoSell:true,autoSellTier:'mythic',autoKeepEffectiveRarity:234567})]]);
globalThis.localStorage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};
let cloud={},inFlight=0,maxInFlight=0,fail=false,notices=[];
globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
globalThis.window={addEventListener(){},dispatchEvent(event){notices.push(event)}};
globalThis.__backend={
 from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{settings:structuredClone(cloud)},error:null}}}},
 async rpc(name,{p_patch}){
  assert.equal(name,'update_qol_settings');inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
  await new Promise(r=>setTimeout(r,5));inFlight--;
  if(fail){fail=false;return {data:null,error:{message:'offline'}};}
  cloud={...cloud,...p_patch,gemFilter:{...cloud.gemFilter,...p_patch.gemFilter}};
  return {data:structuredClone(cloud),error:null};
 }
};
const source=readFileSync(new URL('../src/ui/settings.js',import.meta.url),'utf8')
.replace('import { supabase } from "../backend/supabase.js";','const supabase=globalThis.__backend;')
.replace('import { ensurePlayerAuth } from "../backend/auth.js";','const ensurePlayerAuth=async()=>({id:"test"});')
.replace('"../data/mutations.js"',JSON.stringify(new URL('../src/data/mutations.js',import.meta.url).href));
const store=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
await Promise.all([store.hydrateSettingsFromCloud(),store.hydrateSettingsFromCloud()]);
assert.equal(cloud.legacyAutoSell,true);assert.equal(cloud.legacyAutoSellTier,'mythic');assert.equal(cloud.autoKeepEffectiveRarity,234567);
assert.equal(store.getSettings().enableBuffs,true);
await Promise.all([store.updateSettings({gemFilter:{Quartz:'KEEP'}}),store.updateSettings({enableBuffs:false}),store.updateSettings({gemFilter:{Diamond:'SELL'}})]);
assert.equal(maxInFlight,1);assert.deepEqual(store.getSettings().gemFilter,{Quartz:'KEEP',Diamond:'SELL'});assert.equal(store.getSettings().enableBuffs,false);
fail=true;await assert.rejects(()=>store.updateSettings({enableBuffs:true}));assert.equal(store.getSettings().enableBuffs,false);assert.equal(notices.at(-1).type,'gem:settings-error');
await store.updateSettings({enableBuffs:true});assert.equal(store.getSettings().enableBuffs,true);
assert.equal(store.shouldAutoSell('common'),false,'the browser never independently auto-sells');
const copy=store.getSettings();copy.gemFilter.Quartz='SELL';assert.equal(store.getSettings().gemFilter.Quartz,'KEEP');
console.log('QoL settings: device migration, Auto Keep preservation, shared hydration, serialized patches, independent rules, failed saves and recovery passed.');

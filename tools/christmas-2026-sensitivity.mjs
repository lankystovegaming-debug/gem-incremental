import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {START,END,PRESENT_ODDS,PRESENT_POINTS,GEMS} from '../supabase/functions/_shared/christmas2026.js';

// Read the verified roll implementation rather than copying an assumed
// throughput model. Displayed batches scale their cooldown by batch size.
const source=await readFile(new URL('../supabase/functions/roll/index.ts',import.meta.url),'utf8');
const baseMatch=source.match(/const baseCooldownSeconds\s*=\s*([\d.]+)\s*;/);
assert(baseMatch,'backend cooldown formula missing');
const baseSeconds=Number(baseMatch[1]);assert.equal(baseSeconds,2.5);
const normalize=source.match(/export function normalizeRequestedBatchSize[\s\S]*?\n}/)?.[0];
const cooldown=source.match(/export function batchCooldownMs[\s\S]*?\n}/)?.[0];
assert(normalize&&cooldown,'backend batch formula missing');
const rules=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(`${normalize}\n${cooldown}`)).toString('base64'));
const oldEnd=Date.parse('2026-12-31T00:00:00Z'),oldHours=(oldEnd-START)/3600000,newHours=(END-START)/3600000;
assert.equal(newHours-oldHours,16);
const tiers=Object.keys(PRESENT_POINTS);
const rows=[1,5,20].flatMap(speed=>[1,10,100].map(batch=>{
  const cooldownMs=rules.batchCooldownMs(baseSeconds*1000/speed,batch);
  const additionalRolls=Math.floor((END-oldEnd)/cooldownMs)*batch;
  const expectedPresents=Object.fromEntries(tiers.map((tier,i)=>[tier,additionalRolls/PRESENT_ODDS.normal[i]]));
  return {speed,batch,additionalRolls,expectedPresents,expectedPP:tiers.reduce((sum,tier,i)=>sum+additionalRolls/PRESENT_ODDS.normal[i]*PRESENT_POINTS[tier],0)};
}));
const db=new PGlite();let windows;
try{
  await db.exec('create role anon;create role authenticated;create role service_role;create table public.players(id uuid primary key);');
  for(const path of ['20261014052101_christmas_2026_foundation.sql','20261014060812_christmas_2026_approved_quests_and_schedule.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+path,import.meta.url),'utf8'));
  windows=(await db.query('select event_key,starts_at,ends_at from christmas_2026_private.event_windows order by starts_at')).rows;
}finally{await db.close();}
const exposure=(key,end)=>windows.filter(w=>w.event_key===key).reduce((sum,w)=>sum+Math.max(0,Math.min(Date.parse(w.ends_at),end)-Date.parse(w.starts_at)),0)/3600000;
const oldBoost=exposure('present_rush',oldEnd)+exposure('present_storm',oldEnd),newBoost=exposure('present_rush',END)+exposure('present_storm',END);
const oldAurora=exposure('christmas_aurora',oldEnd),newAurora=exposure('christmas_aurora',END);
assert.equal(oldBoost,31);assert.equal(newBoost,32);assert.equal(oldAurora,10);
const profiles=[['Casual',60,1.7,1],['Regular',180,4.1,3],['Hardcore',360,11,7],['Extreme',540,20.4,13],['24/7',720,31,20]].map(([name,hours,boost,aurora])=>({
  name,original:{activeHours:hours,rushStormHours:boost,auroraHours:aurora},
  extraActiveHoursAssumingUniformAttendance:hours/720*16,
  extraRushStormHoursAssumingSameWindowCapture:boost/oldBoost*(newBoost-oldBoost),
  normalizedAuroraHoursForApprovedOldSchedule:aurora/20*oldAurora,
  extraAuroraHoursAssumingSameWindowCapture:aurora/20*(newAurora-oldAurora)
}));

// Reuse the actual backend selection and relic passes with declared no-passive
// scenarios. This includes competition from the audited ordinary catalogue.
const extract=name=>{const text=source.match(new RegExp(`(?:export )?function ${name}\\([\\s\\S]*?\\n}`))?.[0];assert(text,`${name} backend rule missing`);return text;};
const constants=['eligibleEquipmentGems','flatEquipmentChance','fortuneLuckFactor'].map(name=>{const text=source.match(new RegExp(`export const ${name}[^\\n]+`))?.[0];assert(text);return text;});
const relics=source.match(/const relics = \{[\s\S]*?\n};/)?.[0];assert(relics);
const selection=stripTypeScriptTypes(`${constants.join('\n')}\n${['sanitizeMaxLuck','capGemLuck','specialChance','rollGemWithPickaxePassives','rollRelic'].map(extract).join('\n')}\n${relics}\nlet gems=[],seed=7319;const random01=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);export function sample(catalog,luck,n){gems=catalog;let found=0;for(let i=0;i<n;i++){const g=rollGemWithPickaxePassives(luck,new Set());if(!rollRelic()&&g?.christmas)found++;}return found/n;}`);
const sampler=await import('data:text/javascript;base64,'+Buffer.from(selection).toString('base64'));
const normal=JSON.parse(await readFile(new URL('../docs/christmas-2026-normal-catalog-audit.json',import.meta.url),'utf8')).catalog;
const catalogue=[...normal,...GEMS.filter(g=>g.wave===1&&g.source==='roll').map(g=>({...g,affectedByLuck:true,christmas:true}))];
function atLeast20(n,p){let term=(1-p)**n,total=term;for(let k=1;k<20;k++){term*=((n-k+1)/k)*(p/(1-p));total+=term;}return Math.max(0,Math.min(1,1-total));}
const dailyScenarios=[{luck:1,speed:1},{luck:18,speed:2.6},{luck:50,speed:2.8},{luck:100,speed:3}].map(({luck,speed})=>{
  const trials=20000,p=sampler.sample(catalogue,luck,trials),rolls=Math.floor(1800/(baseSeconds/speed));
  return {luck,speed,selectionSamples:trials,estimatedChristmasGemProbability:p,probabilityStandardError:Math.sqrt(p*(1-p)/trials),rollsIn30Minutes:rolls,expectedChristmasAcquisitionsIn30Minutes:rolls*p,estimatedChanceOfAtLeast20:atLeast20(rolls,p),minutesFor300Rolls:300*baseSeconds/speed/60};
});
const report={
  scope:'Approved-schedule +16-hour sensitivity and illustrative 30-minute daily quest check; not a reproduction of simulation #2 Tree completion rates.',
  source:'Supabase roll v178, checked against repository on 2026-10-14; roll/index.ts unchanged.',
  baseSeconds,oldHours,newHours,extraHours:16,uniformParticipationIncreasePercent:(newHours/oldHours-1)*100,
  assumptions:['Throughput rows assume continuous participation in the extra 16 hours, constant final Roll Speed, and no network overhead.','Throughput rows use normal Present odds without bonuses. Schedule exposure and original attendance profiles are analyzed separately.','Profile extensions assume uniform active attendance and unchanged proportional window capture, not known player login times.','Original Aurora attendance is explicitly rescaled from the published 20-hour maximum to the approved schedule’s 10-hour old-window budget. This is an assumption, not a claim that the old simulation has been reproduced.','Daily scenarios reuse the backend selector/relic pass with 256 audited always-available ordinary gems plus Wave I; no other events, equipment passives, extra drops, research, consumables or gem-specific bonuses. Luck and final speed are illustrative inputs, not measured player profiles.','Batch cooldown is taken from the backend; batching does not multiply throughput.'],
  rows,
  approvedSchedule:{oldRushStormHours:oldBoost,newRushStormHours:newBoost,oldAuroraHours:oldAurora,newAuroraHours:newAurora,originalSimulationAuroraHours:20,windows:windows.length},profiles,dailyScenarios,
  resetChanges:{dailyQuestReset:1,weeklyWorkshopReset:0,adventDoors:0,waves:0},
  additionalDailyRewardsIfCompleted:{shillings:1100,small:3,festive:1},
  emergencySupplyMaximum:{snowflakes:3000,ornaments:120,lights:24,costCS:30000,presentPoints:45},
  finalPartialWeek:{days:3,maximumDailyQuests:9,weeklyDailyQuestTarget:12,allFiveBonusReachable:false,anyFourBonusReachable:true,note:'Fixed approved targets are retained; no unapproved prorating or extra daily quests.'},
  limits:['Original profile hours are now known, but original RNG seeds, loadouts, attendance timestamps and simulation code remain unavailable; the 88.1% Tree completion claim cannot be reproduced from hours alone.','The approved Aurora schedule offers 10 baseline hours, not the original profile’s 20. Its Celestine opportunity estimate must be revised rather than described as a small +16-hour-only change.','Daily estimates are Monte Carlo scenario checks; they do not guarantee 20 acquisitions within 30 minutes for every account. Base equipment is substantially slower.','Present reward-chain resource output, quests, spending choices and specimen-value distributions are not combined into a new full Tree completion simulation here.'],
  conclusion:'Keep frozen Tree/economy values. The extra interval adds one daily quest set, 1 boosted hour and 40 Aurora minutes. The 30-minute target is equipment-dependent; the approved Aurora budget and unreachable final partial-week all-five bonus are material limitations recorded explicitly.'
};
if(process.argv.includes('--write'))await writeFile(new URL('../docs/christmas-2026-sensitivity.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

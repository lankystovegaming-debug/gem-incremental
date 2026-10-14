import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {START,END,PRESENT_ODDS,PRESENT_POINTS} from '../supabase/functions/_shared/christmas2026.js';

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
const report={
  scope:'Analytical marginal-throughput check, not a rerun of the missing simulation #2 profiles.',
  source:'Supabase roll v178, checked against repository on 2026-10-14; roll/index.ts unchanged.',
  baseSeconds,oldHours,newHours,extraHours:16,uniformParticipationIncreasePercent:(newHours/oldHours-1)*100,
  assumptions:['Continuous participation during the extra 16 hours, constant final Roll Speed, no cooldown/network overhead.','Normal Present probabilities, no equipment, consumables or Rush/Storm boosts.','Batch cooldown is taken from the backend; batching does not multiply throughput.'],
  rows,
  resetChanges:{dailyQuestReset:0,weeklyWorkshopReset:0,adventDoors:0,waves:0},
  limits:['Rush frequency/duration/spacing and Aurora spacing remain unconfirmed, so boosted-window exposure cannot be calculated.','Original player profiles, attendance distributions and balance simulation are unavailable. Tree completion probabilities and CS exchange percentiles cannot be reproduced.','Snowflakes/Ornaments/Lights and Shillings rewards from new Present chains, quests and final specimens are not modeled here.'],
  conclusion:'The active interval rises from 720 to 736 hours (+2.2222%). No frozen economy value was changed. A full balance conclusion requires the missing schedules and baseline simulation inputs.'
};
if(process.argv.includes('--write'))await writeFile(new URL('../docs/christmas-2026-sensitivity.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

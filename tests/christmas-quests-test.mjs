import assert from 'node:assert/strict';
import {test} from 'node:test';
import {START,END,STORM_START,GOLDEN_COSMETICS,STORY_REQUIREMENTS} from '../supabase/functions/_shared/christmas2026.js';
import {initialState,grant,applyAction,resolveRewardTokens,publicSnapshot} from '../supabase/functions/_shared/christmasActions.js';
import {recordQuestFacts,questSnapshot} from '../supabase/functions/_shared/christmasQuests.js';
const rng=()=>.5;
test('300 genuine subrolls and 20 repeated acquisitions complete the approved dailies',()=>{
  const s=initialState();for(let i=0;i<300;i++)recordQuestFacts(s,START,{rolls:1,gems:i<20?1:0});
  const view=questSnapshot(s,START);assert(view.daily.every(q=>q.complete));assert.equal(view.weekly.find(q=>q.id==='dailies').progress,3);
  let state=s;for(const id of ['rolling','christmas','activities','bonus'])state=applyAction(state,{action:'quest',kind:'daily',id,period:'1'},START,rng).state;
  assert.equal(state.shillings,1100);assert.equal(state.inventory.small,3);assert.equal(state.inventory.festive,1);
  assert.throws(()=>applyAction(state,{action:'quest',kind:'daily',id:'bonus',period:'1'},START,rng),/already_claimed/);
  recordQuestFacts(state,START,{rolls:100,gems:20});assert.equal(questSnapshot(state,START).weekly.find(q=>q.id==='dailies').progress,3);
});
test('Activities supports each independent alternative; no Rush, opening or timer dependency',()=>{
  for(const facts of [{rolls:300},{opened:3},{points:15}]){const s=initialState();recordQuestFacts(s,START,facts);assert(questSnapshot(s,START).daily.find(q=>q.id==='activities').complete);}
  for(const facts of [{rolls:299,opened:2,points:14},{}]){const s=initialState();recordQuestFacts(s,START,facts);assert(!questSnapshot(s,START).daily.find(q=>q.id==='activities').complete);}
});
test('daily reset uses 08:00 SGT, weekly Tuesday; missed days do not create streak requirements',()=>{
  const s=initialState();recordQuestFacts(s,START,{rolls:300,gems:20});
  assert(questSnapshot(s,START+86400000-1).daily.every(q=>q.complete));
  assert(questSnapshot(s,START+86400000).daily.every(q=>!q.complete));
  recordQuestFacts(s,START+3*86400000,{rolls:300,gems:20});
  assert.equal(questSnapshot(s,START+3*86400000).weekly.find(q=>q.id==='dailies').progress,6);
  assert.equal(questSnapshot(s,START+7*86400000).periods.weekly,'1');
  assert(questSnapshot(s,START+7*86400000).weekly.every(q=>q.progress===0));
  assert.throws(()=>applyAction(s,{action:'quest',kind:'daily',id:'rolling',period:'1'},START+86400000,rng),/quest_period_expired/);
});
test('weekly any-four and all-five bonuses are independent and each claimable once',()=>{
  let s=initialState();recordQuestFacts(s,START,{rolls:2000,gems:125,ordinaryOpened:20,shillings:7500});
  assert(questSnapshot(s,START).bonuses.weeklyFour.complete);assert(!questSnapshot(s,START).bonuses.weeklyAll.complete);
  s=applyAction(s,{action:'quest',kind:'weekly',id:'four',period:'0'},START,rng).state;assert.equal(s.shillings,2500);assert.equal(s.inventory.large,1);
  for(let d=1;d<=3;d++)recordQuestFacts(s,START+d*86400000,{rolls:300,gems:20});
  assert(questSnapshot(s,START+3*86400000).bonuses.weeklyAll.complete);
  s=applyAction(s,{action:'quest',kind:'weekly',id:'all',period:'0'},START+3*86400000,rng).state;assert.equal(s.shillings,3500);assert.equal(s.inventory.festive,1);
  assert.throws(()=>applyAction(s,{action:'quest',kind:'weekly',id:'four',period:'0'},START+3*86400000,rng),/already_claimed/);
});
test('ordinary openings count individually; Packages/Crates do not count as Presents',()=>{
  let s={...initialState(),inventory:{small:20,'supply-crate':1,christmas:1}};
  s=applyAction(s,{action:'open',tier:'small',quantity:20},START,rng).state;
  assert.equal(questSnapshot(s,START).weekly.find(q=>q.id==='ordinaryOpened').progress,20);
  assert.equal(questSnapshot(s,START).activityAlternatives.opened,3);
  const before=s.quests.days['1'].opened;s=applyAction(s,{action:'open',tier:'supply-crate',quantity:1},START,rng).state;assert.equal(s.quests.days['1'].opened,before);
  s=applyAction(s,{action:'open',tier:'christmas',quantity:1},Date.parse('2026-12-25T00:00:00Z'),()=>0).state;
  assert.equal(s.quests.days['25'].opened,1);assert.equal(s.quests.weeks['3'].ordinaryOpened,0);
});
test('PP comes from acquisition, combining adds none; gross CS earnings survive spending',()=>{
  let s=initialState();grant(s,{small:15,shillings:8000},START);assert(questSnapshot(s,START).daily.find(q=>q.id==='activities').complete);
  s=applyAction(s,{action:'combine',tier:'small',quantity:3},START,rng).state;assert.equal(s.quests.days['1'].points,15);
  s=applyAction(s,{action:'buy',id:'cocoa'},START,rng).state;assert.equal(s.shillings,4000);assert.equal(s.quests.weeks['0'].shillings,8000);
});
test('approved Emergency Supply has deterministic resources, limits and no exclusive drops',()=>{
  let s={...initialState(),shillings:30000};assert.throws(()=>applyAction(s,{action:'buy',id:'emergency-supply'},STORM_START-1,rng),/not_available/);
  s=applyAction(s,{action:'buy',id:'emergency-supply',quantity:3},STORM_START,rng).state;
  assert.deepEqual([s.snowflakes,s.ornaments,s.lights,s.shillings],[3000,120,24,0]);assert.deepEqual(s.inventory,{small:15,festive:6});assert.equal(s.presentPoints,45);
  assert.throws(()=>applyAction(s,{action:'buy',id:'emergency-supply'},STORM_START,rng),/invalid_quantity/);
});
test('Golden cosmetics protect duplicates across a bulk opening and exhaust to 5000 CS',()=>{
  const owned=new Set(),r=resolveRewardTokens({'golden-cosmetic':5},owned,()=>0);
  for(const id of GOLDEN_COSMETICS)assert.equal(r[id],1);assert.equal(r.shillings,5000);assert.equal(owned.size,4);
  assert.deepEqual(resolveRewardTokens({'cocoa-utility-bundle':2},owned,rng),{cocoa:4,cookie:4,rations:4});
  assert.equal(STORY_REQUIREMENTS.II.presentPoints,50);assert.equal(STORY_REQUIREMENTS.III.auroraFallbackRollsAfterUnlock,500);assert.equal(STORY_REQUIREMENTS.IV.exchangeShillingsAfterUnlock,5000);
});
test('client credit actions are rejected and archive claims remain closed',()=>{
  assert.throws(()=>applyAction(initialState(),{action:'credit',rolls:300,gems:20},START,rng),/unknown_action/);
  const s=initialState();recordQuestFacts(s,END,{rolls:999,gems:999});assert.equal(s.quests,undefined);
  assert.throws(()=>applyAction(s,{action:'quest',kind:'daily',id:'rolling',period:'31'},END,rng),/event_closed/);
  assert.equal(publicSnapshot(s,END).quests.periods.daily,'31');
});

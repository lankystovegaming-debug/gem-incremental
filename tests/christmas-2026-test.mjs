import assert from 'node:assert/strict';
import {test} from 'node:test';
import {START,END,MORNING,FINALE_END,phase,wave,eligibleGems,finaleEligible,TREE_COSTS,GEMS,shillingsForValue,presentMultiplier,openPresent,openSupplyCrate,naturalPresents,bottleUseOutcome,combinePlan} from '../supabase/functions/_shared/christmas2026.js';
import {initialState,grant,applyAction,publicSnapshot} from '../supabase/functions/_shared/christmasActions.js';
const at=iso=>Date.parse(iso), random=()=>.5;
const stateWith=r=>({...initialState(),...r});

test('SGT boundaries, cumulative waves, Dec25-only availability and finale cutoff',()=>{
  assert.equal(phase(START-1),'teaser');assert.equal(phase(START),'active');assert.equal(phase(END-1),'active');assert.equal(phase(END),'archived');
  for(const [date,w] of [['2026-12-07T23:59:59Z',1],['2026-12-08T00:00:00Z',2],['2026-12-15T00:00:00Z',3],['2026-12-25T00:00:00Z',4]])assert.equal(wave(at(date)),w);
  assert(eligibleGems(MORNING).some(g=>g.name==='Wrapped Miracle'));
  assert(!eligibleGems(at('2026-12-25T16:00:00Z')).some(g=>g.name==='Wrapped Miracle'));
  assert.deepEqual(eligibleGems(END),[]);
  assert(finaleEligible(END,1,false));assert(finaleEligible(FINALE_END-1,1,false));assert(!finaleEligible(FINALE_END,1,false));assert(!finaleEligible(END,0,false));assert(!finaleEligible(END,1,true));
});
test('frozen Tree totals, all 25 rewards and atomic immutable action failure',()=>{
  assert.deepEqual(TREE_COSTS.reduce((a,c)=>a.map((v,i)=>v+Object.values(c)[i]),[0,0,0]),[30000,1100,225]);
  let state=stateWith({snowflakes:30000,ornaments:1100,lights:225});
  for(let i=0;i<25;i++)state=applyAction(state,{action:'decorate'},START,random).state;
  assert.equal(state.tree,25);assert.deepEqual([state.snowflakes,state.ornaments,state.lights],[0,0,0]);
  assert(state.unlocks.evergreen);assert(state.unlocks['christmas-tree-2026']);
  assert.throws(()=>applyAction(state,{action:'decorate'},START,random),/tree_complete/);
  const poor=stateWith({snowflakes:99}),copy=structuredClone(poor);
  assert.throws(()=>applyAction(poor,{action:'decorate'},START,random),/insufficient_resources/);assert.deepEqual(poor,copy);
});
test('Present Points are awarded on acquisition and never again on combination',()=>{
  let state=initialState();grant(state,{small:1000},START);assert.equal(state.presentPoints,1000);assert(state.unlocks['santa-sack']);
  state=applyAction(state,{action:'combine',tier:'small',quantity:'max'},START,random).state;
  assert.equal(state.presentPoints,1000);assert.equal(state.inventory.festive,200);assert.equal(state.inventory.small,undefined);
  assert.equal(combinePlan('festive',14,'max').consume,10);
  for(const n of [0,-1,1.5,Infinity,NaN])assert.throws(()=>combinePlan('small',10,n));
  assert.throws(()=>combinePlan('golden',10,1));
});
test('independent natural drops, additive bonuses and fixed Storm-only check',()=>{
  assert.equal(presentMultiplier([.25,.35,1]),2.6);
  assert.deepEqual(naturalPresents({},()=>0).rewards,{small:1,festive:1,large:1,golden:1});
  assert.deepEqual(naturalPresents({sack:true,toolkit:true,listCharges:10},()=>0),{rewards:{festive:1,large:1,golden:2},listChargesConsumed:4});
  let calls=0;assert.deepEqual(naturalPresents({storm:true,bonuses:[100]},()=>{calls++;return .9;}).rewards,{});assert.equal(calls,5);
});
test('Bottled Christmas acquisition stores it; only explicit genuine use draws Singularity',()=>{
  const draws=[.5,.5,.5,.5,0,0];let calls=0;
  const rewards=openPresent('christmas',()=>{calls++;return draws.shift();});
  assert.equal(rewards['bottled-christmas'],1);assert.equal(calls,6);assert.equal(rewards['christmas-singularity'],undefined);
  let state=stateWith({inventory:{christmas:1}});
  state=applyAction(state,{action:'open',tier:'christmas',quantity:1},MORNING,()=>0).state;
  assert.equal(state.inventory['bottled-christmas'],1);assert.equal(state.effects['bottled-christmas'],undefined);
  const noDraw=()=>{throw Error('unexpected random draw');};
  assert.deepEqual(bottleUseOutcome({},noDraw),{singularity:false});
  assert.deepEqual(bottleUseOutcome({explicitUse:true,genuineRoll:false},noDraw),{singularity:false});
  assert.deepEqual(bottleUseOutcome({explicitUse:true,genuineRoll:true},()=>0),{singularity:true});
  assert.deepEqual(bottleUseOutcome({explicitUse:true,genuineRoll:true},()=>1/25),{singularity:false});
});
test('all loot outcomes preserve guaranteed ranges; Crates cannot produce premium exclusive sources',()=>{
  let seed=1024;const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const ranges={small:[8,25],festive:[30,50],large:[100,160],golden:[400,600],christmas:[750,1250]};
  for(const [tier,[lo,hi]] of Object.entries(ranges))for(let i=0;i<10000;i++){
    const r=openPresent(tier,rng);assert(r.snowflakes>=lo&&r.snowflakes<=hi);
    assert(Object.values(r).every(v=>Number.isInteger(v)&&v>0));
    if(tier==='christmas')assert(r.golden>=1);
  }
  for(let i=0;i<1000;i++)assert(Object.keys(openSupplyCrate(rng)).every(id=>['cocoa','cookie','rations','peppermint','toolkit','tonic','bell','coin','miracle'].includes(id)));
});
test('bulk opening is aggregate, immutable, nonrecursive; Christmas is single only',()=>{
  const before=stateWith({inventory:{festive:100}});
  const state=applyAction(before,{action:'open',tier:'festive',quantity:'all'},START,random).state;
  assert.equal(before.inventory.festive,100);assert.equal(state.presentsOpened,100);assert.equal(state.inventory.festive,undefined);
  const draws=[.5,.5,.5,.99];const result=applyAction(stateWith({inventory:{festive:1}}),{action:'open',tier:'festive',quantity:1},START,()=>draws.shift());
  assert.equal(result.state.inventory.large,1);assert.equal(result.state.presentsOpened,1);
  assert.throws(()=>applyAction(stateWith({inventory:{christmas:2}}),{action:'open',tier:'christmas',quantity:2},MORNING,random),/one_at_a_time/);
});
test('Advent late claims, future redaction, conversion once, weekly resets and capped shop prices',()=>{
  let state=initialState();assert.throws(()=>applyAction(state,{action:'advent',day:2},START,random),/door_locked/);
  assert(!('reward' in publicSnapshot(state,START).advent[1]));
  state=applyAction(state,{action:'advent',day:10},MORNING,random).state;
  assert.equal(state.inventory.christmas,1);assert.equal(state.inventory.mysterious,undefined);
  assert.throws(()=>applyAction(state,{action:'advent',day:10},MORNING,random),/already_claimed/);
  const mystery=stateWith({inventory:{mysterious:6}});assert.equal(publicSnapshot(mystery,MORNING).state.inventory.christmas,6);assert.equal(mystery.inventory.mysterious,6);
  state=stateWith({shillings:275000});state=applyAction(state,{action:'buy',id:'christmas',quantity:6},MORNING,random).state;
  assert.equal(state.shillings,0);assert.equal(state.inventory.christmas,6);assert.throws(()=>applyAction(state,{action:'buy',id:'christmas'},MORNING,random));
  state=stateWith({shillings:100000});state=applyAction(state,{action:'buy',id:'small',quantity:10},START,random).state;
  assert.throws(()=>applyAction(state,{action:'buy',id:'small'},START,random));
  assert.equal(applyAction(state,{action:'buy',id:'small',quantity:10},START+7*86400000,random).state.inventory.small,20);
});
test('workshop uses complete packages and never silently exchanges leftovers',()=>{
  const state=applyAction(stateWith({tree:25,snowflakes:2500,ornaments:65,lights:11}),{action:'craft',quantity:'max'},START,random).state;
  assert.deepEqual([state.snowflakes,state.ornaments,state.lights,state.shillings],[500,5,1,0]);assert.equal(state.inventory['workshop-package'],2);
  assert.throws(()=>applyAction(initialState(),{action:'exchange',resource:'lights'},START,random),/workshop_locked/);
});
test('collection does not expose hidden anomalies, future waves or total count while active',()=>{
  assert.equal(GEMS.length,28);let snap=publicSnapshot(initialState(),START);
  assert.equal(snap.gems.length,8);assert.equal(snap.totalGems,undefined);assert.equal(snap.state.chapters.VI,undefined);
  const state=stateWith({discoveries:{'Celestine Veil':{}}});snap=publicSnapshot(state,START+14*86400000);
  const veil=snap.gems.find(g=>g.name==='Celestine Veil');assert(veil);assert.equal(veil.rarity,undefined);assert(!JSON.stringify(veil).includes('75000'));
  assert.equal(publicSnapshot(state,END).totalGems,28);
});
test('archive rejects spending, crafting, claiming and opening at the exact endpoint',()=>{
  for(const action of ['decorate','advent','open','combine','buy','exchange','craft','preference'])assert.throws(()=>applyAction(initialState(),{action},END,random),/event_closed/);
});
test('Shillings use final specimen value without rarity factors',()=>{
  assert.equal(shillingsForValue(0),1);assert.equal(shillingsForValue(1000),2);assert.equal(shillingsForValue(16000),16);
  for(const bad of [-1,NaN,Infinity])assert.throws(()=>shillingsForValue(bad));
});

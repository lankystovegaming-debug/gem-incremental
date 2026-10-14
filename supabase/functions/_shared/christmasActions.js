import {START,END,MORNING,phase,eventDay,eventWeek,TREE_COSTS,TREE_REWARDS,ADVENT,PRESENT_POINTS,SHOP,CONSUMABLES,GEMS,GOLDEN_COSMETICS,CHRISTMAS_COSMETICS,CHRISTMAS_COLLECTIBLES,collection,finaleEligible,openPresent,openPackage,openSupplyCrate,combinePlan} from './christmas2026.js';
import {recordQuestFacts,claimQuest,questSnapshot} from './christmasQuests.js';

export function initialState() {
  return {version:0,tree:0,snowflakes:0,ornaments:0,lights:0,shillings:0,presentPoints:0,inventory:{},unlocks:{},advent:[],purchases:{},preferences:{},genuineRolls:0,presentsOpened:0,combined:0,exchanged:0,discoveries:{},chapters:{},receipts:{},effects:{}};
}
const resources=new Set(['snowflakes','ornaments','lights','shillings']);
const permanent=new Set([...GOLDEN_COSMETICS,...CHRISTMAS_COSMETICS,...CHRISTMAS_COLLECTIBLES,...TREE_REWARDS.flatMap(r=>Object.keys(r)),...ADVENT.flatMap(r=>Object.keys(r)),...SHOP.filter(i=>i.limit===1&&!i.weekly).map(i=>i.id)].filter(id=>!resources.has(id)&&!PRESENT_POINTS[id]&&!CONSUMABLES[id]&&!['mysterious','christmas'].includes(id)));
export function grant(state,rewards,now,{points=true}={}) {
  let earnedPoints=0,earnedShillings=0;
  for(let [id,n] of Object.entries(rewards)) {
    if(!Number.isSafeInteger(n)||n<0)throw new Error('invalid_reward');
    if(id==='mysterious'&&now>=MORNING)id='christmas';
    if(resources.has(id)){state[id]+=n;if(id==='shillings')earnedShillings+=n;}
    else if(permanent.has(id))state.unlocks[id]=true;
    else state.inventory[id]=(state.inventory[id]||0)+n;
    if(points&&PRESENT_POINTS[id]){state.presentPoints+=PRESENT_POINTS[id]*n;earnedPoints+=PRESENT_POINTS[id]*n;}
  }
  if(state.presentPoints>=1000)state.unlocks['santa-sack']=true;
  if(earnedPoints||earnedShillings)recordQuestFacts(state,now,{points:earnedPoints,shillings:earnedShillings});
}
export function resolveRewardTokens(rewards,owned,random){
  const resolved={};const add=(id,n)=>resolved[id]=(resolved[id]||0)+n;
  for(const [id,n] of Object.entries(rewards)){
    if(id==='cocoa-utility-bundle'){for(const item of ['cocoa','cookie','rations'])add(item,n*2);continue;}
    const pool=id==='golden-cosmetic'?GOLDEN_COSMETICS:id==='christmas-cosmetic'?CHRISTMAS_COSMETICS:id==='christmas-collectible'?CHRISTMAS_COLLECTIBLES:null;
    if(!pool){add(id,n);continue;}
    for(let i=0;i<n;i++){
      const available=pool.filter(item=>!owned.has(item));
      if(!available.length&&id==='golden-cosmetic'){add('shillings',5000);continue;}
      const choices=available.length?available:pool,draw=random();
      if(!Number.isFinite(draw)||draw<0||draw>=1)throw new Error('invalid_random');
      const selected=choices[Math.floor(draw*choices.length)];owned.add(selected);add(selected,1);
    }
  }
  return resolved;
}
function take(state,id,n) {
  if(!Number.isSafeInteger(n)||n<1)throw new Error('invalid_quantity');
  const target=resources.has(id)?state:state.inventory;
  if((target[id]||0)<n)throw new Error('insufficient_resources');
  target[id]-=n;
}
function amount(value,max) {
  if(value==='all'||value==='max')return max;
  if(!Number.isSafeInteger(value)||value<1||value>max)throw new Error('invalid_quantity');
  return value;
}
export function convertPresents(state,now) {
  if(now<MORNING||!state.inventory.mysterious)return;
  state.inventory.christmas=(state.inventory.christmas||0)+state.inventory.mysterious;
  state.inventory.mysterious=0;
}
export function applyAction(before,command,now,random) {
  const state=structuredClone(before),{action,...b}=command;
  convertPresents(state,now);
  // Receipts have their own action and never grant rewards.
  if(action==='acknowledge') {
    if(b.id==='VI'&&!state.chapters.VI&&finaleEligible(now,state.genuineRolls,false))state.chapters.VI={id:'VI',source:'christmas-story',tree:state.tree,acknowledged:false};
    if(!Object.hasOwn(state.chapters,b.id)&&!Object.hasOwn(state.receipts,b.id))throw new Error('unknown_cutscene');
    if(b.id==='VI'&&!state.chapters.VI?.acknowledged&&!finaleEligible(now,state.genuineRolls,false))throw new Error('finale_expired');
    const receipt=state.chapters[b.id]||state.receipts[b.id];
    receipt.acknowledged=true;
    return {state,rewards:{}};
  }
  if(phase(now)!=='active')throw new Error('event_closed');
  const rewards={};
  if(action==='decorate') {
    if(state.tree>=25)throw new Error('tree_complete');
    const cost=TREE_COSTS[state.tree];
    for(const [id,n] of Object.entries(cost))if(n)take(state,id,n);
    Object.assign(rewards,TREE_REWARDS[state.tree]);state.tree++;
  } else if(action==='advent') {
    const day=b.day;
    if(!Number.isInteger(day)||day<1||day>25||day>eventDay(now))throw new Error('door_locked');
    if(state.advent.includes(day))throw new Error('already_claimed');
    state.advent.push(day);Object.assign(rewards,ADVENT[day-1]);
  } else if(action==='combine') {
    const plan=combinePlan(b.tier,state.inventory[b.tier]||0,b.quantity??1);
    take(state,b.tier,plan.consume);state.combined+=plan.grant;
    grant(state,{[plan.tier]:plan.grant},now,{points:false});
  } else if(action==='open') {
    if(b.tier==='mysterious')throw new Error('it_wont_open');
    const supported=['small','festive','large','golden','christmas','workshop-package','supply-crate'];
    if(!supported.includes(b.tier))throw new Error('invalid_present');
    if(b.tier==='christmas'&&b.quantity!==1)throw new Error('one_at_a_time');
    const n=amount(b.quantity??1,state.inventory[b.tier]||0);
    // Bounded transaction work. Open All stays one committed request; larger
    // stacks require the eventual job-based bulk resolver before release.
    if(n>10000)throw new Error('bulk_limit');
    take(state,b.tier,n);
    const owned=new Set(Object.keys(state.unlocks));
    for(let i=0;i<n;i++) {
      const raw=b.tier==='workshop-package'?openPackage(random):b.tier==='supply-crate'?openSupplyCrate(random):openPresent(b.tier,random);
      const r=resolveRewardTokens(raw,owned,random);
      for(const [id,q] of Object.entries(r))rewards[id]=(rewards[id]||0)+q;
    }
    const isPresent=['small','festive','large','golden','christmas'].includes(b.tier);
    if(isPresent)state.presentsOpened+=n;
    if(isPresent)recordQuestFacts(state,now,{opened:n,ordinaryOpened:b.tier==='christmas'?0:n});
  } else if(action==='buy') {
    const item=SHOP.find(i=>i.id===b.id);
    if(!item||item.enabled===false||now<(item.startsAt||START))throw new Error('not_available');
    const key=`${item.id}:${item.weekly?eventWeek(now):'event'}`,bought=state.purchases[key]||0;
    const n=amount(b.quantity??1,item.limit===null?10000:item.limit-bought);
    const price=item.id==='christmas'?(bought===0?item.price+(n-1)*item.subsequentPrice:n*item.subsequentPrice):item.price*n;
    take(state,'shillings',price);state.purchases[key]=bought+n;
    if(item.reward){for(const [id,q] of Object.entries(item.reward))rewards[id]=q*n;}else rewards[item.id]=n;
  } else if(action==='exchange') {
    if(state.tree!==25)throw new Error('workshop_locked');
    const rates={snowflakes:[100,25],ornaments:[10,50],lights:[1,25]},rate=rates[b.resource];
    if(!rate)throw new Error('invalid_resource');
    const n=amount(b.quantity??1,Math.floor(state[b.resource]/rate[0]));
    take(state,b.resource,n*rate[0]);rewards.shillings=n*rate[1];
  } else if(action==='craft') {
    if(state.tree!==25)throw new Error('workshop_locked');
    const max=Math.min(Math.floor(state.snowflakes/1000),Math.floor(state.ornaments/30),Math.floor(state.lights/5));
    const n=amount(b.quantity??1,max);
    take(state,'snowflakes',1000*n);take(state,'ornaments',30*n);take(state,'lights',5*n);rewards['workshop-package']=n;
  } else if(action==='quest') {
    Object.assign(rewards,claimQuest(state,now,b));
  } else if(action==='preference') {
    if(!GEMS.some(g=>g.name===b.gem)||!['exchange','keep','sell'].includes(b.preference))throw new Error('invalid_preference');
    state.preferences[b.gem]=b.preference;
  } else throw new Error('unknown_action');
  grant(state,rewards,now);
  for(const [id,n] of Object.entries(state.inventory))if(n===0)delete state.inventory[id];
  return {state,rewards};
}

export function publicSnapshot(before,now) {
  const state=structuredClone(before);convertPresents(state,now);
  if(phase(now)==='teaser')return {phase:'teaser',serverNow:new Date(now).toISOString(),startsAt:new Date(START).toISOString(),endsAt:new Date(END).toISOString()};
  const finale=finaleEligible(now,state.genuineRolls,state.chapters.VI?.acknowledged);
  // The provisional finale receipt is materialized only by the backend once
  // eligible, never exposed as a December placeholder.
  return {
    phase:phase(now),serverNow:new Date(now).toISOString(),startsAt:new Date(START).toISOString(),endsAt:new Date(END).toISOString(),
    state,quests:questSnapshot(state,Math.min(now,END-1)),finale,...(finale?{pendingFinale:{id:'VI',source:'christmas-story',tree:state.tree}}:{}),
    nextTreeCost:TREE_COSTS[state.tree]??null,nextTreeReward:TREE_REWARDS[state.tree]??null,
    advent:ADVENT.map((reward,i)=>({day:i+1,status:state.advent.includes(i+1)?'claimed':i+1>eventDay(now)?'future':i+1===eventDay(now)?'today':'available',...(i+1<=eventDay(now)?{reward}:{})})),
    shop:SHOP.filter(i=>i.enabled!==false&&now>=(i.startsAt||START)).map(i=>{
      const purchased=state.purchases[`${i.id}:${i.weekly?eventWeek(Math.min(now,END-1)):'event'}`]||0;
      return {...i,purchased,remaining:i.limit===null?null:Math.max(0,i.limit-purchased),price:i.subsequentPrice&&purchased>0?i.subsequentPrice:i.price};
    }),
    gems:collection(GEMS,new Set(Object.keys(state.discoveries)),now),
    discoveredCount:Object.keys(state.discoveries).length,...(phase(now)==='archived'?{totalGems:28}:{})
  };
}

import {phase,eventDay,eventWeek} from './christmas2026.js';

export const DAILY_QUESTS = [
  {id:'rolling',name:'Complete 300 genuine rolls',target:300,reward:{shillings:150,small:1}},
  {id:'christmas',name:'Obtain 20 Christmas gems',target:20,reward:{shillings:200,small:1}},
  {id:'activities',name:'Open 3 Presents, earn 15 PP, or complete 300 genuine rolls',target:1,reward:{shillings:250,small:1}}
];
export const WEEKLY_QUESTS = [
  {id:'rolls',name:'Complete genuine rolls',target:2000},
  {id:'gems',name:'Obtain Christmas gems',target:125},
  {id:'ordinaryOpened',name:'Open ordinary Presents',target:20},
  {id:'shillings',name:'Earn Christmas Shillings',target:7500},
  {id:'dailies',name:'Complete daily quests',target:12}
];
export const QUEST_REWARDS={daily:{shillings:500,festive:1},weeklyFour:{shillings:2500,large:1},weeklyAll:{shillings:1000,festive:1}};
const emptyDay=()=>({rolls:0,gems:0,opened:0,points:0,completed:[],claimed:[],bonusClaimed:false});
const emptyWeek=()=>({rolls:0,gems:0,ordinaryOpened:0,shillings:0,dailies:0,fourClaimed:false,allClaimed:false});
export function questPeriods(now){return {daily:String(eventDay(now)),weekly:String(eventWeek(now))};}
export function questBuckets(state,now){
  const periods=questPeriods(now);
  state.quests??={days:{},weeks:{}};
  state.quests.days??={};state.quests.weeks??={};
  state.quests.days[periods.daily]??=emptyDay();state.quests.weeks[periods.weekly]??=emptyWeek();
  return {periods,day:state.quests.days[periods.daily],week:state.quests.weeks[periods.weekly]};
}
export function dailyComplete(day){return {rolling:day.rolls>=300,christmas:day.gems>=20,activities:day.opened>=3||day.points>=15||day.rolls>=300};}
// Trusted server facts only. There is deliberately no public credit/progress
// action; displayed batches call the commit path once per successful subroll.
export function recordQuestFacts(state,now,facts={}){
  if(phase(now)!=='active')return;
  const {day,week}=questBuckets(state,now);
  const allowed=['rolls','gems','opened','ordinaryOpened','points','shillings'];
  for(const key of Object.keys(facts))if(!allowed.includes(key)||!Number.isSafeInteger(facts[key])||facts[key]<0)throw new Error('invalid_quest_fact');
  for(const key of ['rolls','gems','opened','points'])day[key]+=facts[key]||0;
  for(const key of ['rolls','gems','ordinaryOpened','shillings'])week[key]+=facts[key]||0;
  for(const [id,complete] of Object.entries(dailyComplete(day)))if(complete&&!day.completed.includes(id)){day.completed.push(id);week.dailies++;}
}
export function claimQuest(state,now,{kind,id,period}){
  const {periods,day,week}=questBuckets(state,now);
  if(period!==periods[kind])throw new Error('quest_period_expired');
  if(kind==='daily'){
    if(id==='bonus'){
      if(day.completed.length!==3)throw new Error('quest_incomplete');
      if(day.bonusClaimed)throw new Error('already_claimed');
      day.bonusClaimed=true;return QUEST_REWARDS.daily;
    }
    const quest=DAILY_QUESTS.find(q=>q.id===id);
    if(!quest)throw new Error('invalid_quest');
    if(!day.completed.includes(id))throw new Error('quest_incomplete');
    if(day.claimed.includes(id))throw new Error('already_claimed');
    day.claimed.push(id);return quest.reward;
  }
  if(kind==='weekly'){
    const count=WEEKLY_QUESTS.filter(q=>week[q.id]>=q.target).length;
    if(id==='four'){
      if(count<4)throw new Error('quest_incomplete');if(week.fourClaimed)throw new Error('already_claimed');
      week.fourClaimed=true;return QUEST_REWARDS.weeklyFour;
    }
    if(id==='all'){
      if(count!==5)throw new Error('quest_incomplete');if(week.allClaimed)throw new Error('already_claimed');
      week.allClaimed=true;return QUEST_REWARDS.weeklyAll;
    }
  }
  throw new Error('invalid_quest');
}
export function questSnapshot(before,now){
  const state=structuredClone(before),{periods,day,week}=questBuckets(state,now);
  const daily=DAILY_QUESTS.map(q=>({...q,progress:q.id==='rolling'?Math.min(day.rolls,300):q.id==='christmas'?Math.min(day.gems,20):Number(dailyComplete(day).activities),complete:day.completed.includes(q.id),claimed:day.claimed.includes(q.id)}));
  const weekly=WEEKLY_QUESTS.map(q=>({...q,progress:Math.min(week[q.id],q.target),complete:week[q.id]>=q.target}));
  return {periods,daily,weekly,activityAlternatives:{opened:Math.min(day.opened,3),points:Math.min(day.points,15),rolls:Math.min(day.rolls,300)},
    bonuses:{daily:{complete:day.completed.length===3,claimed:day.bonusClaimed,reward:QUEST_REWARDS.daily},weeklyFour:{complete:weekly.filter(q=>q.complete).length>=4,claimed:week.fourClaimed,reward:QUEST_REWARDS.weeklyFour},weeklyAll:{complete:weekly.every(q=>q.complete),claimed:week.allClaimed,reward:QUEST_REWARDS.weeklyAll}}};
}

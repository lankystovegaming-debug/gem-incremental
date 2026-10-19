import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RETALIATION_VERSION, computeRetaliationDamage, savedRetaliationDamage } from '../supabase/functions/dungeons/retaliation.js';
import { formatHealth, counterattackFeedback } from '../dungeons/combat-feedback.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const referenceAttack=JSON.parse(read('supabase/functions/dungeons/balance-reference.json'));
const input={referenceAttack,roomNumber:1,rank:'Normal',catalogDamage:'x1',regionDamage:1,zoneDamage:1};
assert.equal(computeRetaliationDamage(input),1.5);
assert.equal(computeRetaliationDamage({...input,rank:'Elite'}),2.5);
assert.equal(computeRetaliationDamage({...input,rank:'Calamity'}),3);
assert.equal(computeRetaliationDamage({...input,rank:'Boss',isBoss:true,catalogDamage:'x6'}),3);
assert.equal(computeRetaliationDamage({...input,rank:'Boss',isBoss:true,catalogDamage:'x9',bossRepeat:.5}),3,'repeat cannot double scale damage');
assert.equal(computeRetaliationDamage({...input,catalogDamage:null,fallbackRoleDamage:1.1}),1.5*Math.sqrt(1.1));
assert(Math.abs(computeRetaliationDamage({...input,catalogDamage:'x1',mutationDamage:3})-2.4)<1e-12);
assert.equal(computeRetaliationDamage({...input,catalogDamage:'x1000'}),1.5*Math.sqrt(2));
assert.throws(()=>computeRetaliationDamage({...input,roomNumber:1501}),/missing_dungeon_retaliation_reference/);
let checks=0;
for(let roomNumber=1;roomNumber<=1500;roomNumber++)for(const [rank,rate] of [['Normal',.015],['Elite',.025],['Champion',.03],['Cursed',.03],['Mythic',.03],['Paragon',.03],['Apex',.03],['Calamity',.03],['Boss',.03]])
  for(const zoneDamage of [.75,1,1.3,1.6])for(const mutationDamage of [1,1.05,1.15,1.35,1.8,3]){
    const isBoss=rank==='Boss',repeat=isBoss?1.6:1;
    const result=computeRetaliationDamage({referenceAttack,roomNumber,rank,isBoss,catalogDamage:'x'+(200*zoneDamage*(isBoss?6*repeat:1)),regionDamage:200,zoneDamage,bossRepeat:.6,mutationDamage});
    const expected=(100+Math.floor(2*Math.max(0,referenceAttack[roomNumber-1]-10)))*rate*zoneDamage*Math.min(1.6,mutationDamage);
    assert(Math.abs(result-expected)<1e-8);checks++;
  }
assert.equal(savedRetaliationDamage({damage:100}),8);
assert.equal(savedRetaliationDamage({}),.8);
assert.equal(savedRetaliationDamage({damage:100,retaliationDamage:999}),8,'unversioned snapshots remain legacy');
assert.equal(savedRetaliationDamage({damage:100,retaliationVersion:RETALIATION_VERSION,retaliationDamage:3}),3,'new damage is not multiplied by 0.08');
assert.throws(()=>savedRetaliationDamage({retaliationVersion:RETALIATION_VERSION}),/invalid_retaliation_snapshot/);
assert.equal(formatHealth(99.92),'99.92');
assert.equal(formatHealth(.001),'<0.01');
assert.equal(formatHealth(0),'0');
assert.match(counterattackFeedback({retaliationDamage:1.5,retaliationEnemy:'Zombie'},{}),/Zombie counterattacked for 1.5 damage/);
assert.match(counterattackFeedback({run:{player_health:99.92}},{player_health:100}),/counterattacked for 0.08 damage/,'frontend-first rollout can infer legacy HP loss');
assert.match(counterattackFeedback({retaliationDamage:0,defeated:'Zombie'},{}),/before it could counterattack/);

// Execute the actual attack branch with synthetic database responses.
const source=read('supabase/functions/dungeons/index.ts');
const body='const action=body.action;\n'+source.slice(source.indexOf('if (action === "attack")'),source.indexOf('if (action === "claim")'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const attack=new AsyncFunction('ctx','body','playerId','num','json','loadRoom','awardEnemyLoot','awardRoomKey','savedRetaliationDamage',body);
async function turn({enemy={},health=100,nextEnemy=null,stale=false,attacker='owner'}={}){
  let run={id:'fixture',player_id:'owner',status:'active',enemy_index:1,player_health:health,player_attack:10,updated_at:'old',room_number:1,loot:[],combatants:[{name:'Zombie',hp:100,maxHp:100,defense:0,damage:1,...enemy},...(nextEnemy?[nextEnemy]:[])]};
  let awarded=0;const filters=[];
  const query={select(){return this;},eq(k,v){filters.push([k,v]);return this;},async single(){return {data:structuredClone(run)};},update(v){run={...run,...v};return this;},async maybeSingle(){return {data:stale?null:run};}};
  const result=await attack({supabaseAdmin:{from(table){assert.equal(table,'dungeon_runs');return query;}}},{action:'attack',runId:run.id},attacker,
    (x,f=0)=>Number.isFinite(Number(x))?Number(x):f,(data,status=200)=>({data,status}),async()=>({}),async()=>{awarded++;},()=>{},savedRetaliationDamage);
  assert(filters.some(([k,v])=>k==='player_id'&&v===attacker),'reads enforce caller ownership');
  assert(filters.some(([k,v])=>k==='updated_at'&&v==='old'),'updates retain optimistic locking');
  return {...result,awarded};
}
const fresh={retaliationVersion:RETALIATION_VERSION,retaliationDamage:3};
assert.equal((await turn({enemy:fresh})).data.run.player_health,97);
assert.equal((await turn()).data.run.player_health,99.92);
const killed=await turn({enemy:{...fresh,hp:10}});
assert.equal(killed.data.retaliationDamage,0);assert.equal(killed.data.run.player_health,100);assert.equal(killed.data.won,true);assert.equal(killed.awarded,1);
const next=await turn({enemy:{...fresh,hp:10},nextEnemy:{name:'Skeleton',hp:20,maxHp:20,damage:999}});
assert.equal(next.data.run.player_health,100,'newly selected next mob does not retaliate in the same turn');
const lost=await turn({enemy:fresh,health:2});
assert.equal(lost.data.lost,true);assert.equal(lost.data.run.player_health,0);assert.equal(lost.awarded,0);assert.equal(lost.data.retaliationEnemy,'Zombie');
assert.equal((await turn({enemy:fresh,stale:true})).status,409,'no counterattack response is committed on stale update');
assert.match(source,/retaliationDamage, retaliationVersion: RETALIATION_VERSION/,'damage is snapshotted when creating mobs');
console.log(`Dungeon retaliation tests passed: ${checks} formula cases, legacy/new snapshots, lethal/nonlethal/CAS turns and fractional feedback.`);

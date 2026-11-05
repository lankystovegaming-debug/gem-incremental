import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {PGlite} from '@electric-sql/pglite';
import {executeWorld2LawBatch} from '../supabase/functions/roll/world2LawPipeline.js';
const db=new PGlite();const uid='00000000-0000-0000-0000-000000000001';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
let serial=0,draws=0,evaluations=0;
const body=(batchSize=1)=>({worldId:2,requestId:`90000000-0000-0000-0000-${String(++serial).padStart(12,'0')}`,batchSize});
const rpc=async(name,args)=>{try{return {data:await q(`select ${name}(${Object.values(args).map((_,i)=>'$'+(i+1)).join(',')}) v`,Object.values(args))};}catch(error){return {error};}};
const reset=()=>db.exec(`update players set next_roll_at=null,roll_lease_id=null,roll_lease_expires_at=null where id='${uid}'`);
const ordinary=async ({context,stages})=>{
 evaluations++;
 stages.stats({luck:1e12,mutation:1,speed:1,weightLuck:1});
 const gem=stages.gem([{id:'Quartz',rarity:100000,hazard:1,mutable:true}],'Quartz');
 const mutations=stages.mutations([{id:'glossy',multiplier:2,rolledChance:1}],[{id:'glossy',multiplier:2,rolledChance:1}]);
 const w=stages.weight({baseWeight:1,ordinaryFinalWeight:4,rawWeight:2});
 return {kind:'ordinary',primary:{gem_name:gem.id,rarity:gem.rarity,final_weight:w.finalWeight,value:12,natural_mutation_ids:mutations.map(x=>x.id)},extras:[],bucket:{steps:(context.bucket.steps??0)+1}};
};
const opts=b=>({rpc,playerId:uid,body:b,priceOrdinaryContext:async()=>2500,evaluateOrdinary:ordinary,randomSource:()=>()=>{draws++;return 0;}});
try {
 await db.exec("create table test_clock(at timestamptz);insert into test_clock values('2026-11-05T00:00:00Z');create function test_now() returns timestamptz language sql stable as $$select at from public.test_clock$$");
 for(const p of ['tests/fixtures/world2-phase1-schema.sql','tests/fixtures/world2-phase2-schema.sql','tests/fixtures/world2-phase2-live-functions.sql','supabase/migrations/20261029002115_world2_abyss_phase1_foundations.sql','supabase/migrations/20261029010322_world2_abyss_phase2_pipeline.sql'])await db.exec(read(p).replaceAll('clock_timestamp()','public.test_now()'));
 const before=await q('select jsonb_agg(to_jsonb(p) order by id) v from players p');
 const triggers=await q("select jsonb_agg(pg_get_triggerdef(oid) order by oid) v from pg_trigger where tgrelid='players'::regclass");
 await db.exec(read('supabase/migrations/20261104235634_world2_abyss_phase3_laws.sql').replaceAll('clock_timestamp()','public.test_now()'));
 assert.deepEqual(await q('select jsonb_agg(to_jsonb(p) order by id) v from players p'),before);
 assert.deepEqual(await q("select jsonb_agg(pg_get_triggerdef(oid) order by oid) v from pg_trigger where tgrelid='players'::regclass"),triggers);
 assert.equal((await executeWorld2LawBatch(opts(body()))).status,'disabled');assert.equal(draws,0);assert.equal(evaluations,0);
 await assert.rejects(db.exec('update abyss_private.pipeline_config set enabled=true'),/check constraint/);
 await assert.rejects(db.exec('update abyss_private.release_config set law_effects_enabled=true'),/check constraint/);
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  for(const sql of [`select world2_roll_context('${uid}')`,`select world2_begin_subroll('${uid}','00000000-0000-0000-0000-000000000000','${'a'.repeat(64)}',0,null)`,`update world2_player_law_state set envy_remaining=0`])await assert.rejects(db.exec(sql),/permission denied/);
  await db.exec('reset role');
 }
 // Lift only inside this isolated host. Real deployment constraints stay closed.
 await db.exec(`alter table abyss_private.release_config drop constraint release_config_gameplay_enabled_check;update abyss_private.release_config set gameplay_enabled=true;
 alter table abyss_private.pipeline_config drop constraint pipeline_config_enabled_check;update abyss_private.pipeline_config set enabled=true;
 alter table world2_player_state drop constraint world2_player_state_active_world_check;alter table world2_player_state drop constraint world2_player_state_abyss_unlocked_check;
 insert into world2_player_state(player_id,active_world,abyss_unlocked) values('${uid}',2,true);
 insert into world2_epochs(world_id,starts_at,ends_at,version,a_id,b_id,c_id) select 2,to_timestamp(floor(extract(epoch from public.test_now())/43200)*43200),to_timestamp(floor(extract(epoch from public.test_now())/43200)*43200)+interval '12 hours',1,'envy','distortion','grace';`);
 const request=body(4);const result=await executeWorld2LawBatch(opts(request));assert.equal(result.status,'complete');
 assert.equal(await q(`select final_weight::text v from inventory_gems where genuine_roll=true limit 1`),'4');
 assert.equal(result.outcomes[3].lawState.A.remaining,'97');assert.equal(result.outcomes[3].envyRemaining,'97');
 const count=draws;assert.deepEqual(await executeWorld2LawBatch(opts(request)),result);assert.equal(draws,count);assert.equal(evaluations,4);
 assert.equal(await q(`select total_rolls v from players where id='${uid}'`),300004);
 assert.equal(await q(`select equipment_state->'charged' v from players where id='${uid}'`),100);
 assert.equal(await q('select count(*)::int v from world2_resonance_history'),4);
 assert.deepEqual(await q('select natural_mutation_ids v from world2_resonance_history limit 1'),['glossy']);
 // Actual uncertain commit AND failed lookup: next same-ID retry replays once.
 await reset();const uncertainBody=body();let committed=false,lookupFailed=false;
 const uncertainRpc=async(name,args)=>{
  if(name==='world2_begin_subroll'&&committed&&!lookupFailed){lookupFailed=true;return {error:{message:'lookup unavailable'}};}
  const r=await rpc(name,args);if(name==='world2_commit_subroll'&&!r.error){committed=true;return {error:{message:'response lost'}};}return r;
 };
 const uncertain=await executeWorld2LawBatch({...opts(uncertainBody),rpc:uncertainRpc});assert.equal(uncertain.status,'in_flight');assert.equal(uncertain.uncertain,true);
 const at=evaluations;const recovered=await executeWorld2LawBatch(opts(uncertainBody));assert.equal(recovered.status,'complete');assert.equal(evaluations,at);
 // Precise queue above 2^53 and 2^63 survives SQL, JSON, adapter and receipt.
 await reset();const context=await q(`select world2_roll_context('${uid}') v`);
 await db.query(`update world2_player_law_state set envy_remaining=$1::numeric,temporary_state=$2 where player_id=$3`,['9223372036854775808',{epochStart:context.epoch.starts_at,A:{threshold:1000,remaining:'9223372036854775808',luck:.77},C:{}},uid]);
 const huge=await executeWorld2LawBatch(opts(body()));assert.equal(huge.status,'complete');assert.equal(huge.outcomes[0].envyRemaining,'9223372036854775832');
 assert.equal(await q('select envy_remaining::text v from world2_player_law_state'),'9223372036854775832');
 await assert.rejects(db.exec('update world2_player_law_state set envy_remaining=1.5'),/check constraint/);
 await assert.rejects(db.exec("update world2_player_law_state set envy_remaining='NaN'::numeric"),/check constraint/);
 // Austerity metadata comes from pinned DB epoch, never trusted outcome fields.
 await reset();await db.exec("insert into world2_epochs(world_id,starts_at,ends_at,version,a_id,b_id,c_id) select 2,starts_at+interval '12 hours',ends_at+interval '12 hours',1,'austerity',b_id,c_id from world2_epochs;update test_clock set at=at+interval '12 hours'");
 const aust=await executeWorld2LawBatch(opts(body()));assert.equal(aust.status,'complete');
 assert.equal(await q('select npc_liquidation_factor::text v from world2_specimen_provenance where epoch_start=(select max(starts_at) from world2_epochs) limit 1'),'0.8');
 assert.equal(aust.outcomes[0].cashDelta,0); // full economic integration deferred
 // Invalid queue rolls back routing/inventory/history/receipt atomically.
 await reset();let failure=false;
 const bad=await executeWorld2LawBatch({...opts(body()),rpc:async(name,args)=>{
  if(name==='world2_commit_subroll'){args={...args,p_outcome:{...args.p_outcome,envyRemaining:'1.5'}};failure=true;}return rpc(name,args);
 }});assert(failure);assert.equal(bad.status,'partial');assert.equal(bad.completed,0);
 // Local representative 1/4/20/100 batches, plus bounded ring with no extras.
 const timings=[];
 for(const size of [1,4,20,100,100,100]) {
  await reset();const start=performance.now();const r=await executeWorld2LawBatch(opts(body(size)));assert.equal(r.status,'complete');
  const ms=performance.now()-start;assert(ms<5000);timings.push([size,Math.round(ms)]);
 }
 assert.equal(await q('select count(*)::int v from world2_resonance_history'),250);
 assert.equal(await q('select max(genuine_ordinal)-min(genuine_ordinal)+1 v from world2_resonance_history'),250);
 console.log('Phase 3 SQL+law adapter: disabled/RLS/W1 data, atomic state+history, retries, uncertain recovery, huge Envy, Austerity provenance passed; local batch ms',JSON.stringify(timings));
} finally {await db.close();}

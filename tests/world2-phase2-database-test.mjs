import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {executeWorld2Batch} from '../supabase/functions/roll/world2Pipeline.js';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
const db=new PGlite();
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const uid='00000000-0000-0000-0000-000000000001';
const q=async(s,args=[])=>(await db.query(s,args)).rows;
const val=async(s,args=[])=>(await q(s,args))[0].v;
const rpc=async(name,args)=>{try {return {data:await val(`select public.${name}(${Object.values(args).map((_,i)=>'$'+(i+1)).join(',')}) v`,Object.values(args))};}catch(error){return {error};}};
const call=async(name,args)=>{const r=await rpc(name,args);if(r.error)throw r.error;return r.data;};
let requestNumber=0;
const request=()=>`10000000-0000-0000-0000-${String(++requestNumber).padStart(12,'0')}`;
const body=()=>({worldId:2,requestId:request(),batchSize:1});
const primary=name=>({gem_name:name,value:12,rolled_weight_multiplier:1,ordinary_final_weight_ratio:1,natural_mutation_ids:['glossy']});
const outcome=(kind='ordinary',name='Quartz',extras=[])=>({kind,primary:kind==='ordinary'||kind==='relic'?primary(name):null,extras,bucket:{charge:1},lawState:{step:1}});
const options=b=>({rpc,playerId:uid,body:b,priceContext:async()=>2500,evaluate:async()=>outcome()});
const reset=async()=>db.exec(`update players set next_roll_at=null,roll_lease_id=null,roll_lease_expires_at=null where id='${uid}'`);
const claim=async(batch=1)=>{
 await reset();const id=request();const context=await call('world2_roll_context',{p_player_id:uid});
 const args={p_player_id:uid,p_request_id:id,p_digest:'a'.repeat(64),p_batch_size:batch,p_single_cooldown_ms:2500,p_context:context};
 const c=await call('world2_claim_batch',args);assert.equal(c.status,'claimed');
 return {args,c,sub:{p_player_id:uid,p_request_id:id,p_digest:'a'.repeat(64),p_subroll:0,p_worker_token:c.workerToken}};
};
try {
 await db.exec(read('tests/fixtures/world2-phase1-schema.sql'));
 await db.exec(read('tests/fixtures/world2-phase2-schema.sql'));
 await db.exec(read('tests/fixtures/world2-phase2-live-functions.sql'));
 await db.exec(read('supabase/migrations/20261029002115_world2_abyss_phase1_foundations.sql'));
 const before=await q('select to_jsonb(p) v from players p order by id');
 const triggers=await q("select pg_get_triggerdef(oid) v from pg_trigger where tgrelid='players'::regclass order by oid");
 await db.exec(read('supabase/migrations/20261029010322_world2_abyss_phase2_pipeline.sql'));
 assert.deepEqual(await q('select to_jsonb(p) v from players p order by id'),before);
 assert.deepEqual(await q("select pg_get_triggerdef(oid) v from pg_trigger where tgrelid='players'::regclass order by oid"),triggers);
 assert.equal((await executeWorld2Batch(options(body()))).status,'disabled');
 await assert.rejects(db.exec('update abyss_private.pipeline_config set enabled=true'),/check constraint/);
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(call('world2_roll_context',{p_player_id:uid}),/permission denied/);
  await assert.rejects(db.exec('select * from abyss_private.roll_batches'),/permission denied/);
  await db.exec('reset role');
 }
 // Only this disposable database lifts the release constraints for execution QA.
 await db.exec(`alter table abyss_private.release_config drop constraint release_config_gameplay_enabled_check;update abyss_private.release_config set gameplay_enabled=true;alter table abyss_private.pipeline_config drop constraint pipeline_config_enabled_check;
  update abyss_private.pipeline_config set enabled=true;
  alter table world2_player_state drop constraint world2_player_state_active_world_check;
  alter table world2_player_state drop constraint world2_player_state_abyss_unlocked_check;
  insert into world2_player_state(player_id,active_world,abyss_unlocked) values('${uid}',2,true);`);
 for(const [time,expected] of [
  ['2026-10-28T23:59:59.999Z','2026-10-28T12:00:00.000Z'],
  ['2026-10-29T00:00:00Z','2026-10-29T00:00:00.000Z'],
  ['2026-10-29T11:59:59.999Z','2026-10-29T00:00:00.000Z'],
  ['2026-10-29T12:00:00Z','2026-10-29T12:00:00.000Z']]) {
  assert.equal((await val('select to_timestamp(floor(extract(epoch from $1::timestamptz)/43200)*43200) v',[time])).toISOString(),expected);
 }
 const b=body();b.batchSize=3;let draws=0;let states=[];let sources=0;
 const opts={...options(b),randomSource:()=>{sources++;return ()=>0.5;},evaluate:async({context,random})=>{draws++;states.push(context.bucket);assert(random()>=0);return {...outcome(),bucket:{charge:draws}};}};
 let result=await executeWorld2Batch(opts);assert.equal(result.status,'complete');assert.equal(draws,3);assert.equal(sources,3);
 assert.deepEqual(states,[{},{charge:1},{charge:2}]);
 const total=await val(`select total_rolls v from players where id='${uid}'`);assert.equal(total,300003);
 assert.equal(await val(`select equipment_state v from players where id='${uid}'`).then(x=>x.charged),100);
 assert.deepEqual(await executeWorld2Batch(opts),result);assert.equal(draws,3);assert.equal(sources,3);
 assert.equal(await val('select count(*)::int v from world2_outcome_receipts'),3);
 assert.equal(await val('select count(*)::int v from world2_specimen_provenance'),3);
 assert.equal(await val('select count(*)::int v from world2_resonance_history'),3);
 // Lost commit response recovers durable receipt without re-evaluation.
 await reset();let lost=true;let lostDraws=0;
 const lostRpc=async(n,a)=>{const r=await rpc(n,a);if(n==='world2_commit_subroll'&&lost&&!r.error){lost=false;return {error:{message:'network_lost'}};}return r;};
 result=await executeWorld2Batch({...options(body()),rpc:lostRpc,evaluate:async()=>{lostDraws++;return outcome();}});
 assert.equal(result.status,'complete');assert.equal(lostDraws,1);
 // Prefix survives; failed routing rolls back everything in that subroll.
 await reset();const partial=body();partial.batchSize=3;let sub=0;
 result=await executeWorld2Batch({...options(partial),evaluate:async()=>++sub===2?outcome('ordinary','insert-error'):outcome()});
 assert.equal(result.status,'partial');assert.equal(result.completed,1);assert.equal(sub,2);
 let replay=await executeWorld2Batch(options(partial));assert.equal(replay.status,'in_flight');assert.equal(replay.completed,1);
 await db.exec(`update players set roll_lease_expires_at=clock_timestamp()-interval '1 second' where id='${uid}'; update abyss_private.roll_batches set expires_at=clock_timestamp()-interval '1 second' where request_id='${partial.requestId}'`);
 replay=await executeWorld2Batch(options(partial));assert.equal(replay.status,'partial');assert.equal(replay.completed,1);
 // Payload conflict; stale lease; changed revision; out-of-order; switch race.
 let x=await claim(2);
 await assert.rejects(call('world2_claim_batch',{...x.args,p_digest:'b'.repeat(64)}),/request_conflict/);
 await assert.rejects(call('world2_commit_subroll',{...x.sub,p_worker_token:request(),p_outcome:outcome()}),/stale_lease/);
 await assert.rejects(call('world2_begin_subroll',{...x.sub,p_subroll:1}),/stale_state/);
 await assert.rejects(call('world2_switch_world',{p_player_id:uid,p_world:1}),/roll_in_flight/);
 await db.exec(`update world2_player_state set revision=revision+1 where player_id='${uid}'`);
 await assert.rejects(call('world2_commit_subroll',{...x.sub,p_outcome:outcome()}),/stale_state/);
 x=await claim();await db.exec(`update players set roll_lease_expires_at=clock_timestamp()-interval '1 second' where id='${uid}'`);
 await assert.rejects(call('world2_commit_subroll',{...x.sub,p_outcome:outcome()}),/stale_lease/);
 // Preclaim epoch/state changes cannot accept a priced context.
 await reset();const context=await call('world2_roll_context',{p_player_id:uid});
 await db.exec(`update world2_player_state set revision=revision+1 where player_id='${uid}'`);
 assert.equal((await call('world2_claim_batch',{p_player_id:uid,p_request_id:request(),p_digest:'a'.repeat(64),p_batch_size:1,p_single_cooldown_ms:2500,p_context:context})).status,'stale_context');
 await db.exec(`update players set inventory_capacity=0 where id='${uid}'`);
 // Explicit no-specimen/relic handling and extras never add genuine positions.
 for(const kind of ['loss','empty','relic']) {
  x=await claim();const r=await call('world2_commit_subroll',{...x.sub,p_outcome:outcome(kind)});
  assert.equal(r.kind,kind);assert.equal(r.specimens.length,kind==='relic'?1:0);
  assert.equal(await val('select gem_identity v from world2_resonance_history order by genuine_ordinal desc limit 1'),null);
 }
 await db.exec(`update players set inventory_capacity=2000 where id='${uid}'`);
 x=await claim();result=await call('world2_commit_subroll',{...x.sub,p_outcome:outcome('ordinary','Quartz',['astral','breakneck','convergence'].map(source=>({source,specimen:primary(source)})))});
 assert.equal(result.specimens.length,4);
 assert.equal(await val('select count(*)::int v from inventory_gems where genuine_roll=false'),4); // includes legacy row
 // Sell and deposit with receipt/provenance; failures abort routed side effects.
 for(const [name,sell,route] of [['sale',true,'autosell'],['bundle',false,'deposit'],['craft',false,'deposit'],['conserved',false,'inventory']]) {
  x=await claim();await db.exec(`create or replace function roll_refresh_context(uuid,timestamptz) returns jsonb language sql set search_path=public,pg_catalog as $f$ select jsonb_build_object('player',to_jsonb(p),'activeAutoCraft',${['craft','conserved'].includes(name)?"'test'":"null"}) from players p where id=$1 $f$`);
  const r=await call('world2_commit_subroll',{...x.sub,p_outcome:{...outcome('ordinary',name),filterSell:sell}});
  assert.equal(r.specimens[0].route,route);assert.equal(r.cashDelta,sell?12:0);
 }
 for(const name of ['error','sale-error']) {
  x=await claim();await db.exec(`create or replace function roll_refresh_context(uuid,timestamptz) returns jsonb language sql set search_path=public,pg_catalog as $f$ select jsonb_build_object('player',to_jsonb(p),'activeAutoCraft',${name==='error'?"'test'":"null"}) from players p where id=$1 $f$`);
  const counts=await val('select jsonb_build_array((select total_rolls from players where id=\''+uid+'\'),(select count(*) from fixture_routes),(select count(*) from world2_outcome_receipts)) v');
  await assert.rejects(call('world2_commit_subroll',{...x.sub,p_outcome:{...outcome('ordinary',name),filterSell:true}}),/deposit_failed|injected_sale_error/);
  assert.deepEqual(await val('select jsonb_build_array((select total_rolls from players where id=\''+uid+'\'),(select count(*) from fixture_routes),(select count(*) from world2_outcome_receipts)) v'),counts);
 }
 // A batch's accepted epoch remains pinned across the next epoch. Reset only
 // temporary state; persistent history and envy survive epoch identity change.
 x=await claim(2);const first=await call('world2_commit_subroll',{...x.sub,p_outcome:{...outcome('loss'),envyRemaining:7}});
 const epoch=await val(`select row_to_json(e) v from world2_epochs e where starts_at=(select epoch_start from abyss_private.roll_batches where request_id='${x.args.p_request_id}')`);
 await db.exec(`insert into world2_epochs(world_id,starts_at,ends_at,version,a_id,b_id,c_id) select 2,starts_at+interval '12 hours',ends_at+interval '12 hours',version,a_id,b_id,c_id from world2_epochs order by starts_at desc limit 1`);
 const second=await call('world2_commit_subroll',{...x.sub,p_subroll:1,p_outcome:outcome('loss')});assert.equal(second.epochStart,first.epochStart);
 assert.equal(await val('select envy_remaining v from world2_player_law_state'),7);
 // Forged outcome, changed equipment, inventory capacity and bonus errors
 // cannot leave a primary, cash mutation, history slot or receipt behind.
 x=await claim();await db.exec(`update player_equipment set equipped=false where player_id='${uid}'`);
 await assert.rejects(call('world2_commit_subroll',{...x.sub,p_outcome:outcome()}),/equipment_changed/);
 await db.exec(`update player_equipment set equipped=true where player_id='${uid}'`);
 for(const bad of [{...outcome('empty'),primary:primary('forged')},{...outcome('loss'),extras:[{source:'astral',specimen:primary('extra')}]},{...outcome(),extras:[{source:'unknown',specimen:primary('extra')}]}]) {
  x=await claim();const n=await val('select count(*)::int v from inventory_gems');
  await assert.rejects(call('world2_commit_subroll',{...x.sub,p_outcome:bad}),/invalid_primary|invalid_extras|invalid_extra/);
  assert.equal(await val('select count(*)::int v from inventory_gems'),n);
 }
 x=await claim();const n=await val('select count(*)::int v from inventory_gems');
 await db.exec(`update players set inventory_capacity=${n+1} where id='${uid}'`);
 await assert.rejects(call('world2_commit_subroll',{...x.sub,p_outcome:outcome('ordinary','Quartz',[{source:'astral',specimen:primary('extra')}])}),/inventory_full/);
 assert.equal(await val('select count(*)::int v from inventory_gems'),n);
 await db.exec(`update players set inventory_capacity=2000 where id='${uid}'`);
 // Provenance validation is inside the same transaction, after routing/sale.
 x=await claim();const wallet=await val(`select money v from players where id='${uid}'`);
 await assert.rejects(call('world2_commit_subroll',{...x.sub,p_outcome:{...outcome(),primary:{...primary('Quartz'),ordinary_final_weight_ratio:-1},filterSell:true}}),/check constraint/);
 assert.equal(await val(`select money v from players where id='${uid}'`),wallet);
 assert.equal(await val(`select count(*)::int v from world2_outcome_receipts where request_id='${x.args.p_request_id}'`),0);
 // 250-slot ring remains bounded after 260 genuine positions, including
 // no-specimen outcomes. Replays never advance its ordinals.
 for(let i=0;i<260;i++) {x=await claim();await call('world2_commit_subroll',{...x.sub,p_outcome:outcome('loss')});}
 assert.equal(await val('select count(*)::int v from world2_resonance_history'),250);
 assert.equal(await val('select max(genuine_ordinal)-min(genuine_ordinal)+1 v from world2_resonance_history'),250);
 await reset();await call('world2_switch_world',{p_player_id:uid,p_world:1});
 assert.equal(await val('select count(*)::int v from world2_resonance_history'),250);
 await call('world2_switch_world',{p_player_id:uid,p_world:2});
 // Operationally disabled gate still permits durable replay, never new claims.
 await db.exec('update abyss_private.pipeline_config set enabled=false');
 assert.equal((await executeWorld2Batch(opts)).status,'complete');assert.equal(draws,3);
 await db.exec('update abyss_private.pipeline_config set enabled=true');
 // Local latency budget: actual SQL + 20 serial writes, no network. W1 adds
 // zero SQL calls and retains v179 byte parity (separate source assertion).
 await reset();const timed=body();timed.batchSize=20;const started=performance.now();
 assert.equal((await executeWorld2Batch({...options(timed),evaluate:async()=>outcome('loss')})).status,'complete');
 const elapsed=performance.now()-started;assert(elapsed<5000,`local serial batch ${elapsed}ms`);
 console.log(`World 2 Phase 2 database/transport passed; 20-subroll local latency ${elapsed.toFixed(1)}ms. No production writes.`);
} finally {await db.close();}

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
const db=new PGlite();
const uid='00000000-0000-0000-0000-000000000001';
const q=async(s,args=[])=>(await db.query(s,args)).rows[0].v;
const call=async(n,a)=>q(`select ${n}(${a.map((_,i)=>'$'+(i+1)).join(',')}) v`,a);
const digest='a'.repeat(64);let ordinal=0;
const req=()=>`10000000-0000-0000-0000-${String(++ordinal).padStart(12,'0')}`;
const loss={kind:'loss',primary:null,extras:[],bucket:{charge:42},lawState:{temporary:1},envyRemaining:5};
try {
 await db.exec(`create table public.test_clock(at timestamptz);insert into public.test_clock values('2026-10-28 23:59:59.9Z');
 create function public.test_now() returns timestamptz language sql stable as $$select at from public.test_clock$$;`);
 // Execute the ACTUAL migrations/functions with only clock_timestamp replaced
 // by a controlled DB clock. All state/locks/claims/receipts use real SQL.
 for(const p of ['tests/fixtures/world2-phase1-schema.sql','tests/fixtures/world2-phase2-schema.sql','tests/fixtures/world2-phase2-live-functions.sql','supabase/migrations/20261029002115_world2_abyss_phase1_foundations.sql','supabase/migrations/20261029010322_world2_abyss_phase2_pipeline.sql']) {
  await db.exec(readFileSync(new URL('../'+p,import.meta.url),'utf8').replaceAll('clock_timestamp()','public.test_now()'));
 }
 await db.exec(`alter table abyss_private.release_config drop constraint release_config_gameplay_enabled_check;update abyss_private.release_config set gameplay_enabled=true;alter table abyss_private.pipeline_config drop constraint pipeline_config_enabled_check;update abyss_private.pipeline_config set enabled=true;
 alter table world2_player_state drop constraint world2_player_state_active_world_check;alter table world2_player_state drop constraint world2_player_state_abyss_unlocked_check;
 insert into world2_player_state(player_id,active_world,abyss_unlocked) values('${uid}',2,true)`);
 for(const boundary of ['2026-10-29T00:00:00Z','2026-10-29T12:00:00Z']) {
  await db.query("update test_clock set at=$1::timestamptz-interval '100 milliseconds'",[boundary]);
  await db.exec(`update players set next_roll_at=null,roll_lease_id=null,roll_lease_expires_at=null where id='${uid}'`);
  const pre=await call('world2_roll_context',[uid]);const request=req();
  const accepted=await call('world2_claim_batch',[uid,request,digest,2,2500,pre]);assert.equal(accepted.status,'claimed');
  const first=await call('world2_commit_subroll',[uid,request,digest,0,accepted.workerToken,loss]);
  await db.query('update test_clock set at=$1',[boundary]);
  // Subroll 2 inherits the accepted epoch, not the new current epoch.
  const next=await call('world2_begin_subroll',[uid,request,digest,1,accepted.workerToken]);assert.deepEqual(next.lawState,{temporary:1});
  const second=await call('world2_commit_subroll',[uid,request,digest,1,accepted.workerToken,loss]);
  assert.equal(first.epochStart,second.epochStart);
  await db.exec(`update players set next_roll_at=null where id='${uid}'`);
  // Old preclaim pricing is stale at BOTH 08:00 and 20:00 SGT.
  const stale=await call('world2_claim_batch',[uid,req(),digest,1,2500,pre]);assert.equal(stale.status,'stale_context');
  const fresh=await call('world2_roll_context',[uid]);assert.deepEqual(fresh.temporaryLawState,{});assert.equal(fresh.envyRemaining,5);
  assert.equal(new Date(fresh.epoch.starts_at).toISOString(),new Date(boundary).toISOString());
  const id=req();const c=await call('world2_claim_batch',[uid,id,digest,1,2500,fresh]);assert.equal(c.status,'claimed');
  const begin=await call('world2_begin_subroll',[uid,id,digest,0,c.workerToken]);
  assert.deepEqual(begin.lawState,{});assert.equal(begin.envyRemaining,5);assert.deepEqual(begin.bucket,{charge:42});
  assert(begin.history.length>=2);
  await call('world2_commit_subroll',[uid,id,digest,0,c.workerToken,loss]);
 }
 // Boundary crossed inside the underlying claim rolls the newly written
 // lease/cooldown back, forcing fresh speed pricing before acceptance.
 await db.exec("update test_clock set at='2026-10-30 11:59:59.9Z'");
 await db.exec(`update players set next_roll_at=null,roll_lease_id=null,roll_lease_expires_at=null where id='${uid}'`);
 const live=readFileSync(new URL('../tests/fixtures/world2-phase2-live-functions.sql',import.meta.url),'utf8');
 const slow=live.replaceAll('clock_timestamp()','public.test_now()').replace("  return jsonb_build_object(\n    'status', 'claimed'", "  update public.test_clock set at=at+interval '1 second';\n  return jsonb_build_object(\n    'status', 'claimed'");
 assert.notEqual(slow,live.replaceAll('clock_timestamp()','public.test_now()'));
 await db.exec(slow);
 const boundaryClaim=await call('world2_claim_batch',[uid,req(),digest,1,2500,await call('world2_roll_context',[uid])]);
 assert.equal(boundaryClaim.status,'stale_context');
 assert.equal(await q(`select roll_lease_id v from players where id='${uid}'`),null);
 assert.equal(await q(`select next_roll_at v from players where id='${uid}'`),null);
 await db.exec(live.replaceAll('clock_timestamp()','public.test_now()'));
 // Exact deadline is exclusive. Just-before deadline cannot rescue a commit
 // whose routing transaction crosses it (second clock check also tested below).
 await db.exec(`update players set next_roll_at=null where id='${uid}'`);
 const id=req();const c=await call('world2_claim_batch',[uid,id,digest,1,2500,await call('world2_roll_context',[uid])]);
 await db.exec(`update test_clock set at=(select expires_at from abyss_private.roll_batches where request_id='${id}')`);
 await assert.rejects(call('world2_commit_subroll',[uid,id,digest,0,c.workerToken,loss]),/stale_lease/);
 assert.equal((await call('world2_claim_batch',[uid,id,digest,1,null,null])).status,'partial');
 // Simulate waiting inside the sale domain past the accepted lease deadline.
 await db.exec(`update players set next_roll_at=null,roll_lease_id=null,roll_lease_expires_at=null where id='${uid}';
 create or replace function sell_inventory_gem(uuid,bigint,text) returns numeric language plpgsql set search_path=public,pg_catalog as $f$begin
 update players set money=money+12 where id=$1;delete from inventory_gems where id=$2;
 update test_clock set at=at+interval '2 minutes';return 12;end$f$`);
 const lateId=req();const late=await call('world2_claim_batch',[uid,lateId,digest,1,2500,await call('world2_roll_context',[uid])]);
 const snapshot=await q(`select jsonb_build_array(total_rolls,money,(select count(*) from world2_outcome_receipts)) v from players where id='${uid}'`);
 await assert.rejects(call('world2_commit_subroll',[uid,lateId,digest,0,late.workerToken,{...loss,kind:'ordinary',primary:{gem_name:'Quartz',value:12},filterSell:true}]),/stale_lease/);
 assert.deepEqual(await q(`select jsonb_build_array(total_rolls,money,(select count(*) from world2_outcome_receipts)) v from players where id='${uid}'`),snapshot);
 console.log('World 2 controlled DB clock: 08:00/20:00 SGT stale preclaim rejection, whole-batch epoch pinning, epoch-local reset, persistent envy/history/bucket, exact lease deadline passed.');
} finally {await db.close();}

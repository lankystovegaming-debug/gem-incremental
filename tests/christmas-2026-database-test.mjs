import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {initialState,applyAction} from '../supabase/functions/_shared/christmasActions.js';
import {START} from '../supabase/functions/_shared/christmas2026.js';
const db=new PGlite(),uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create table public.players(id uuid primary key);insert into public.players values('${uid}'),('${other}');`);
  await db.exec(`create function public.get_active_global_event() returns jsonb language sql as $$select '{"id":"normal-event","eventKey":"golden_touch","name":"Golden Touch"}'::jsonb$$;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261014052101_christmas_2026_foundation.sql',import.meta.url),'utf8'));
  const security=await db.query(`select relname,relrowsecurity from pg_class where relnamespace='christmas_2026_private'::regnamespace and relkind='r'`);
  assert.equal(security.rows.length,4);assert(security.rows.every(r=>r.relrowsecurity));
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select public.christmas_2026_load($1)',[uid]),/permission denied/);
    await assert.rejects(db.query('select * from christmas_2026_private.player_state'),/permission denied/);
    await db.exec('reset role');
  }
  await db.query('select public.christmas_2026_load($1)',[uid]);
  const before={...initialState(),snowflakes:100},command={action:'decorate'};
  const {state,rewards}=applyAction(before,command,START,()=>.5);
  const commit=(id,expected=0,cmd=command,s=state,r=rewards)=>db.query('select public.christmas_2026_commit($1,$2,$3,$4,$5,$6) result',[uid,id,JSON.stringify(cmd),expected,JSON.stringify(s),JSON.stringify(r)]);
  const request='10000000-0000-4000-8000-000000000001';
  await assert.rejects(commit(request),/christmas_not_released/);
  await db.exec(`update christmas_2026_private.configuration set release_enabled=true;create or replace function christmas_2026_private.server_now() returns timestamptz language sql as $$select '2026-12-01 00:00:00+00'::timestamptz$$;`);
  await db.query('update christmas_2026_private.player_state set state=$1 where player_id=$2',[JSON.stringify(before),uid]);
  const first=await commit(request);assert.equal(first.rows[0].result.version,1);
  assert.deepEqual((await commit(request)).rows,first.rows);
  await db.exec(`create or replace function christmas_2026_private.server_now() returns timestamptz language sql as $$select '2026-12-15 00:00:00+00'::timestamptz$$;
    insert into christmas_2026_private.event_windows(event_key,starts_at,ends_at) values
    ('christmas_aurora','2026-12-15 00:03:00+00','2026-12-15 00:23:00+00');`);
  await db.exec('set role authenticated');
  let events=(await db.query('select public.get_active_global_events() result')).rows[0].result;
  assert.equal(events.length,2);assert.equal(events[0].id,'normal-event');assert.equal(events[1].eventKey,'christmas_aurora');assert.equal(events[1].approaching,true);assert(!JSON.stringify(events[1]).includes('75000'));
  await db.exec('reset role');
  await db.exec(`create or replace function christmas_2026_private.server_now() returns timestamptz language sql as $$select '2026-12-15 00:03:00+00'::timestamptz$$;`);
  events=(await db.query('select public.get_active_global_events() result')).rows[0].result;assert.equal(events[1].approaching,false);
  await db.exec(`create or replace function christmas_2026_private.server_now() returns timestamptz language sql as $$select '2026-12-31 16:00:00+00'::timestamptz$$;`);
  events=(await db.query('select public.get_active_global_events() result')).rows[0].result;assert.equal(events.length,1);assert.equal(events[0].id,'normal-event');
  await db.exec(`create or replace function christmas_2026_private.server_now() returns timestamptz language sql as $$select '2026-12-01 00:00:00+00'::timestamptz$$;`);
  await assert.rejects(commit(request,0,{action:'advent',day:1}),/idempotency_conflict/);
  await assert.rejects(commit('10000000-0000-4000-8000-000000000002'),/version_conflict/);
  const persisted=(await db.query('select * from christmas_2026_private.player_state where player_id=$1',[uid])).rows[0];
  assert.equal(Number(persisted.version),1);assert.equal(persisted.state.tree,1);assert.equal(persisted.state.snowflakes,0);assert.equal(persisted.state.inventory.small,2);
  assert.equal((await db.query('select count(*)::int n from christmas_2026_private.action_receipts')).rows[0].n,1);
  // Same request UUID belongs to one player and cannot leak through another load.
  const otherLoad=(await db.query('select public.christmas_2026_load($1,$2) result',[other,request])).rows[0].result;
  assert.equal(otherLoad.receipt,null);
  await assert.rejects(commit('10000000-0000-4000-8000-000000000003',1,command,{...state,snowflakes:-1}),/invalid_balance/);
  await assert.rejects(commit('10000000-0000-4000-8000-000000000004',1,{action:'acknowledge',id:'I'},state,{golden:1}),/receipt_cannot_grant_rewards/);
  await db.exec(`create or replace function christmas_2026_private.server_now() returns timestamptz language sql as $$select '2026-12-31 16:00:00+00'::timestamptz$$;`);
  await assert.rejects(commit('10000000-0000-4000-8000-000000000005',1),/event_closed/);
  // A successful operation's retry remains replayable after closure.
  assert.deepEqual((await commit(request)).rows,first.rows);
  console.log('Christmas migration: roles, RLS, CAS conflicts, transactional receipts, identity isolation and midnight boundary passed.');
}finally{await db.close();}

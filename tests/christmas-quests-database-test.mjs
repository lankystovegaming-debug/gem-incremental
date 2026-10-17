import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {initialState,applyAction} from '../supabase/functions/_shared/christmasActions.js';
import {recordQuestFacts} from '../supabase/functions/_shared/christmasQuests.js';
import {START} from '../supabase/functions/_shared/christmas2026.js';
const db=new PGlite(),uid='00000000-0000-4000-8000-000000000001';
try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create table public.players(id uuid primary key,total_rolls bigint default 5000,equipment_genuine_rolls bigint default 123,
      rarest_gem_name text,rarest_gem_rarity integer,roll_lease_id uuid,equipment_state jsonb,equipment_state_roll bigint default 0);
    create table public.player_equipment(player_id uuid,equipment_id text,equipped boolean);
    insert into public.players(id) values('${uid}');
    create function public.get_active_global_event() returns jsonb language sql as $$select null::jsonb$$;`);
  for(const path of ['20261014052101_christmas_2026_foundation.sql','20261014060812_christmas_2026_approved_quests_and_schedule.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+path,import.meta.url),'utf8'));
  const quota=(await db.query('select event_key,count(*)::int n from christmas_2026_private.event_windows group by event_key order by event_key')).rows;
  assert.deepEqual(quota,[{event_key:'christmas_aurora',n:32},{event_key:'present_rush',n:90},{event_key:'present_storm',n:6}]);
  const bad=(await db.query(`select count(*)::int n from (
    select *,lag(ends_at) over(partition by event_key order by starts_at) previous_end from christmas_2026_private.event_windows
  ) w where ends_at-starts_at<>interval '20 minutes' or starts_at<'2026-12-01 00:00Z' or ends_at>'2026-12-31 16:00Z'
    or starts_at-previous_end < case event_key when 'present_rush' then interval '3 hours' when 'christmas_aurora' then interval '4 hours' else interval '90 minutes' end
    or (event_key<>'present_storm' and starts_at<'2026-12-25 00:00Z' and ends_at>'2026-12-24 00:00Z')
    or (event_key='christmas_aurora' and starts_at<'2026-12-15 00:00Z')
    or (event_key='present_storm' and (starts_at<'2026-12-24 00:00Z' or ends_at>'2026-12-25 00:00Z'))`)).rows[0].n;
  assert.equal(bad,0);await db.exec('select christmas_2026_private.seed_schedule()');
  assert.equal((await db.query('select count(*)::int n from christmas_2026_private.event_windows')).rows[0].n,128);
  // Exercise several random shared seeds, not just one lucky layout.
  for(let i=0;i<8;i++){
    await db.exec('delete from christmas_2026_private.event_windows;update christmas_2026_private.configuration set schedule_seed=gen_random_uuid();select christmas_2026_private.seed_schedule();');
    assert.equal((await db.query(`select count(*)::int n from (select event_key,starts_at,lag(ends_at) over(partition by event_key order by starts_at) previous_end from christmas_2026_private.event_windows) w where starts_at-previous_end < case event_key when 'present_rush' then interval '3 hours' when 'christmas_aurora' then interval '4 hours' else interval '90 minutes' end`)).rows[0].n,0);
  }
  await db.exec(`create or replace function christmas_2026_private.server_now() returns timestamptz language sql as $$select '2026-12-01 00:00Z'::timestamptz$$;`);
  await db.query('select public.record_server_roll($1,$2,$3,$4)',[uid,'Snowball',1250,250]);
  assert.equal((await db.query('select count(*)::int n from christmas_2026_private.player_state')).rows[0].n,0,'release gate must leave ordinary rolls unaffected');
  await db.exec(`update christmas_2026_private.configuration set release_enabled=true;
    do $$begin for i in 1..300 loop perform public.record_server_roll('${uid}',case when i<=20 then 'Snowball' else 'Quartz' end,1250,250);end loop;end$$;`);
  let stored=(await db.query('select state,version from christmas_2026_private.player_state where player_id=$1',[uid])).rows[0];
  const expected=initialState();for(let i=0;i<300;i++)recordQuestFacts(expected,START,{rolls:1,gems:i<20?1:0});
  assert.deepEqual(stored.state.quests,expected.quests,'SQL roll bookkeeping must agree with the server action resolver');
  assert.equal(stored.state.genuineRolls,300);assert.equal(stored.state.lastQuestTotalRolls,5301);assert.equal(Number(stored.version),300);
  const original=structuredClone(stored);
  await db.query('select christmas_2026_private.record_roll_quests($1,$2,$3)',[uid,'Snowball',5301]);
  stored=(await db.query('select state,version from christmas_2026_private.player_state where player_id=$1',[uid])).rows[0];assert.deepEqual(stored,original);
  await db.exec('begin');await db.query('select public.record_server_roll($1,$2,$3,$4)',[uid,'Snowball',1250,250]);await db.exec('rollback');
  assert.deepEqual((await db.query('select state,version from christmas_2026_private.player_state where player_id=$1',[uid])).rows[0],original,'failed outer roll transaction must not leave quest progress');
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);await assert.rejects(db.query('select public.record_server_roll($1,$2,$3,$4)',[uid,'Snowball',1250,250]),/permission denied/);await db.exec('reset role');
  }
  const command={action:'quest',kind:'daily',id:'rolling',period:'1'},before={...initialState(),...original.state,version:Number(original.version)};
  const claimed=applyAction(before,command,START,()=>.5),request='20000000-0000-4000-8000-000000000001';
  const args=[uid,request,JSON.stringify(command),Number(original.version),JSON.stringify(claimed.state),JSON.stringify(claimed.rewards)];
  await db.exec(`create or replace function christmas_2026_private.server_now() returns timestamptz language sql as $$select '2026-12-02 00:00Z'::timestamptz$$;`);
  await assert.rejects(db.query('select public.christmas_2026_commit($1,$2,$3,$4,$5,$6)',args),/quest_period_expired/);
  await db.exec(`create or replace function christmas_2026_private.server_now() returns timestamptz language sql as $$select '2026-12-01 23:59:59.999Z'::timestamptz$$;`);
  const result=await db.query('select public.christmas_2026_commit($1,$2,$3,$4,$5,$6) result',args);assert.equal(result.rows[0].result.rewards.shillings,150);
  await db.exec(`create or replace function christmas_2026_private.server_now() returns timestamptz language sql as $$select '2026-12-02 00:00Z'::timestamptz$$;`);
  assert.deepEqual((await db.query('select public.christmas_2026_commit($1,$2,$3,$4,$5,$6) result',args)).rows,result.rows,'receipt replay after reset must not claim another reward');
  await db.exec(`create or replace function christmas_2026_private.server_now() returns timestamptz language sql as $$select '2026-12-02 00:00Z'::timestamptz$$;`);
  await db.query('select public.record_server_roll($1,$2,$3,$4)',[uid,'Snowball',1250,250]);
  stored=(await db.query('select state from christmas_2026_private.player_state where player_id=$1',[uid])).rows[0];assert.equal(stored.state.quests.days['2'].rolls,1);assert.equal(stored.state.quests.weeks['0'].rolls,301);
  await db.exec(`create or replace function christmas_2026_private.server_now() returns timestamptz language sql as $$select '2026-12-08 00:00Z'::timestamptz$$;`);
  await db.query('select public.record_server_roll($1,$2,$3,$4)',[uid,'Snowball',1250,250]);
  stored=(await db.query('select state from christmas_2026_private.player_state where player_id=$1',[uid])).rows[0];assert.equal(stored.state.quests.weeks['1'].rolls,1);
  const lease='10000000-0000-4000-8000-000000000001';
  await db.query('update public.players set roll_lease_id=$1 where id=$2',[lease,uid]);
  await db.query("insert into public.player_equipment values($1,'jackpot-slot',true)",[uid]);
  const genuine=Number((await db.query('select equipment_genuine_rolls+1 n from public.players where id=$1',[uid])).rows[0].n);
  const lossArgs=[uid,lease,genuine,'{}'];
  const loss=await db.query('select public.commit_jackpot_loss($1,$2,$3,$4) result',lossArgs);assert.equal(loss.rows[0].result.total_rolls,5304);
  const replay=await db.query('select public.commit_jackpot_loss($1,$2,$3,$4) result',lossArgs);assert(replay.rows[0].result.duplicate);
  stored=(await db.query('select state from christmas_2026_private.player_state where player_id=$1',[uid])).rows[0];assert.equal(stored.state.quests.weeks['1'].rolls,2);assert.equal(stored.state.quests.weeks['1'].gems,1);
  await db.exec(`create or replace function christmas_2026_private.server_now() returns timestamptz language sql as $$select '2026-12-31 16:00Z'::timestamptz$$;`);
  const final=structuredClone(stored);await db.query('select public.record_server_roll($1,$2,$3,$4)',[uid,'Quartz',2,1]);assert.deepEqual((await db.query('select state from christmas_2026_private.player_state where player_id=$1',[uid])).rows[0],final);
  console.log('Christmas approved migration passed: shared schedule/gaps across seeds, roll-hook/JS parity, repeated acquisitions, permissions, rollback and daily/weekly/end boundaries.');
}finally{await db.close();}

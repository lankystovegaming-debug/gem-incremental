import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const uid='11111111-1111-4111-8111-111111111111';
const read=n=>readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8');
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
create table players(id uuid primary key,username text,money numeric default 0,coins numeric default 0,lifetime_earnings numeric default 0);
create table game_consumables(id text primary key);create table player_consumables(player_id uuid,consumable_id text,quantity integer,updated_at timestamptz,primary key(player_id,consumable_id));
insert into players(id,username) values('${uid}','Miner');grant select on players,game_consumables to service_role;`);
const daily=read('20260826150001_daily_login_streak.sql');
await db.exec(daily.slice(daily.indexOf('create or replace function public.apply_reward_object'),daily.indexOf('create or replace function public.get_login_streak')));
await db.exec(read('20261026002136_player_mailbox.sql'));
await db.exec(read('20261026003507_mailbox_publishing.sql'));
// Test backfill of mail that predates the retention migration.
await db.exec(`insert into player_mail(player_id,subject,body,read_at) values('${uid}','Old','Read earlier',now()-interval '31 minutes');`);
const migration=read('20261026010410_mailbox_read_claim_retention.sql');
const split=migration.indexOf('-- The live project');
await db.exec(migration.slice(0,split));
await db.exec(read('20261026010619_mailbox_pending_notification.sql'));
const cron=migration.slice(split);
await assert.rejects(db.exec(cron),/Enable pg_cron/,'missing Cron must not silently omit cleanup');
// PGlite cannot load pg_cron. Stub only its external scheduling API, then run
// the migration's real registration block with its extension guard satisfied.
await db.exec(`create schema cron;create table cron.job(name text primary key,schedule text,command text);
create function cron.schedule(n text,s text,c text) returns bigint language plpgsql as $$begin insert into cron.job values(n,s,c) on conflict(name) do update set schedule=excluded.schedule,command=excluded.command;return 1;end$$;`);
await db.exec(cron.replace("not exists(select 1 from pg_extension where extname='pg_cron')",'false'));
assert.deepEqual((await db.query('select * from cron.job')).rows,[{name:'clear-expired-player-mail',schedule:'* * * * *',command:'select mailbox_private.clear_expired_mail();'}]);
await db.exec(`begin;
insert into player_mail(player_id,subject,body,rewards,read_at,claimed_at) values
('${uid}','Unread','Keep','[]',null,null),
('${uid}','Unclaimed','Keep','[{"type":"money","amount":100}]',now()-interval '2 days',null),
('${uid}','Plain boundary','Clear','[]',now()-interval '30 minutes',null),
('${uid}','Plain fresh','Keep','[]',now()-interval '29 minutes',null),
('${uid}','Reward boundary','Clear','[{"type":"coins","amount":1}]',now()-interval '40 minutes',now()-interval '30 minutes'),
('${uid}','Reward fresh','Keep','[{"type":"coins","amount":1}]',now()-interval '2 days',now()-interval '29 minutes'),
('${uid}','Claim first','Keep','[{"type":"coins","amount":1}]',now()-interval '29 minutes',now()-interval '40 minutes');
set role authenticated;select set_config('request.jwt.claim.sub','${uid}',false);`);
const visible=(await db.query('select subject from player_mail order by id')).rows.map(r=>r.subject);
assert.deepEqual(visible,['Unread','Unclaimed','Plain fresh','Reward fresh','Claim first']);
assert.equal(Number((await db.query('select public.mailbox_pending_count() count')).rows[0].count),2,'unread and unclaimed both count, expired mail does not');
async function rejected(sql,args,pattern) {
 await db.exec('savepoint expected_failure');
 await assert.rejects(db.query(sql,args),pattern);
 await db.exec('rollback to savepoint expected_failure;release savepoint expected_failure');
}
for(const id of [1,4,6]) {
 await rejected('select public.read_mail($1)',[id],/mail_not_found/);
 await rejected('select public.claim_mail_reward($1)',[id],/mail_not_found/);
}
await rejected('select mailbox_private.clear_expired_mail()',[],/permission denied/);
const before=(await db.query('select read_at,expires_at from player_mail where id=5')).rows[0];
await db.query('select public.read_mail(5)');
const after=(await db.query('select read_at,expires_at from player_mail where id=5')).rows[0];
assert.deepEqual(after,before,'rereading must not extend retention');
const claim=(await db.query('select public.claim_mail_reward(3) result')).rows[0].result;
assert.equal(new Date(claim.expiresAt)-new Date(claim.claimedAt),30*60*1000,'read long ago, timer starts only now that claimed');
const retry=(await db.query('select public.claim_mail_reward(3) result')).rows[0].result;
assert.equal(retry.expiresAt,claim.expiresAt);
assert.equal(Number((await db.query('select public.mailbox_pending_count() count')).rows[0].count),1,'claimed/read reward drops from badge');
await db.query('select public.read_mail(2)');
assert.equal(Number((await db.query('select public.mailbox_pending_count() count')).rows[0].count),0,'reading plain mail clears its notification');
await db.exec('reset role');
assert.equal((await db.query('select mailbox_private.clear_expired_mail() count')).rows[0].count,3);
assert.equal((await db.query('select count(*)::int count from player_mail')).rows[0].count,5);
assert.equal((await db.query('select money::int money from players')).rows[0].money,100);
await db.exec('commit;set role service_role');
const publication='33333333-3333-4333-8333-333333333333';
const sql="select public.publish_system_mail($1,'Retry safety','Body','[]','player',$2) result";
await db.query(sql,[publication,uid]);
await db.exec('reset role');
await db.query("update player_mail set read_at=now()-interval '31 minutes' where publication_id=$1",[publication]);
await db.query('select mailbox_private.clear_expired_mail()');
await db.exec('set role service_role');
assert.equal((await db.query(sql,[publication,uid])).rows[0].result.alreadyPublished,true);
assert.equal((await db.query('select count(*)::int count from player_mail where publication_id=$1',[publication])).rows[0].count,0,'a retried publication cannot resurrect cleared mail');
await db.exec("reset role;set role anon");
await assert.rejects(db.query('select public.mailbox_pending_count()'),/permission denied/);
await db.close();console.log('PASS retention: read/claim boundaries, backfill, unread/unclaimed protection, no timer reset, expiry access, cleanup, cron registration, no resurrection');

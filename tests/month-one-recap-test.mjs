import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { globalRecap, personalRecap, summarySvg, shareSummary } from '../recap/month-1/render.js';

const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table players (id uuid primary key,username text,created_at timestamptz,
 leaderboard_hidden boolean default false,total_rolls bigint default 0,
 lifetime_earnings numeric default 0,lifetime_money_burned numeric default 0,
 money numeric default 0,rarest_gem_name text,rarest_gem_rarity numeric);
create table bank_accounts(player_id uuid primary key,balance numeric);
create table system_account_exclusions(player_id uuid primary key,exclude_from_economy boolean);
create table minigame_scores(run_id uuid primary key,player_id uuid,game text,score numeric,
 tie1 numeric,tie2 numeric,achieved_at timestamptz);
create table best_roll_history(id bigint primary key,player_id uuid,username text,gem_name text,
 rarity numeric,raw_luck numeric,base_luck numeric,final_weight numeric,value numeric,
 mutation_ids text[],effective_rarity numeric,created_at timestamptz);
create table roll_weight_history(id bigint primary key,player_id uuid,username text,gem_name text,
 final_weight numeric,base_rarity numeric,mutation_ids text[],created_at timestamptz);
insert into players(id,username,created_at,total_rolls,lifetime_earnings,rarest_gem_name,rarest_gem_rarity) values
 ('00000000-0000-0000-0000-000000000001','One','2026-08-12',100,1000,'Ruby',1000),
 ('00000000-0000-0000-0000-000000000002','Two','2026-08-13',100,500,'Diamond',10000),
 ('00000000-0000-0000-0000-000000000003','Dev','2026-08-10',999999,999999,'Test',999999),
 ('00000000-0000-0000-0000-000000000004','Hidden','2026-08-11',999999,999999,'Test',999999),
 ('00000000-0000-0000-0000-000000000005','Zero','2026-08-14',0,0,null,0);
update players set leaderboard_hidden=true where username='Hidden';
insert into system_account_exclusions values('00000000-0000-0000-0000-000000000003',true);
insert into best_roll_history values
 (1,'00000000-0000-0000-0000-000000000001','One','Ruby',1000,2,999,3,100,ARRAY['polished'],100000,'2026-08-25'),
 (2,'00000000-0000-0000-0000-000000000002','Two','Diamond',10000,100,1,4,200,ARRAY[]::text[],10000,'2026-08-26'),
 (3,'00000000-0000-0000-0000-000000000003','Dev','Test',999999,1,1,999,999999,ARRAY[]::text[],999999,'2026-08-26');
insert into roll_weight_history values
 (1,'00000000-0000-0000-0000-000000000001','One','Ruby',30,1000,ARRAY[]::text[],'2026-08-20');
insert into bank_accounts values('00000000-0000-0000-0000-000000000001',50),
 ('00000000-0000-0000-0000-000000000003',99999);
insert into minigame_scores values
 ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','gem-tower',23,0,0,'2026-09-06'),
 ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000003','gem-tower',9999,0,0,'2026-09-06'),
 ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000001','minesweeper',-20,0,0,'2026-09-06');
`);
const migration = await fs.readFile(new URL('../supabase/migrations/20260907070950_month_one_recap.sql', import.meta.url),'utf8');
// Tests remain runnable after the real deadline. Production has one fixed cutoff.
const future = new Date(Date.now() + 86400000).toISOString();
await db.exec(migration.replaceAll('2026-09-07 16:00:00+00',future));
const get = async () => (await db.query('select public.get_month_one_recap() data')).rows[0].data;
const expire = async () => db.exec("update month_one_private.cache set generated_at=clock_timestamp()-interval '1 minute'");
let response = await get();
assert.equal(response.status,'live');
assert.equal(response.personal,null);
assert.equal(response.global.totals.players,3);
assert.equal(response.global.totals.rolls,200);
assert.equal(response.global.banked,50);
assert.equal(response.global.highestDisplayed.gem,'Diamond');
assert.equal(response.global.highestDisplayed.luck,100);
assert.equal(response.global.records.raw.gem,'Ruby');
assert.equal(response.global.records.raw.rawRarity,500);
assert.equal(response.global.records.raw.luck,2); // Never base/current luck (999).
assert.equal(response.global.records.weight.luck,null);
assert.equal(response.global.minigames.find(g=>g.game==='gem-tower').best_score,23);
assert.equal(response.global.minigames.find(g=>g.game==='minesweeper').best_score,null);
await db.exec("set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; set role authenticated;");
response = await get();
assert.equal(response.personal.joinNumber,1);
assert.equal(response.personal.rollRank,1);
assert.equal(response.personal.rollTopPercent,34);
assert.equal(response.personal.population,3);
assert.equal(response.personal.records.raw.luck,2);
assert.ok(!('00000000-0000-0000-0000-000000000002' in response));
await assert.rejects(db.query('select * from month_one_private.sources'), /permission denied/);
await assert.rejects(db.query('select month_one_private.build()'), /permission denied/);
await db.exec("reset role; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003'");
assert.equal((await get()).personal,null);
await db.exec("set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002'");
assert.equal((await get()).personal.rollRank,1); // Ties share rank.
await db.exec("update players set total_rolls=300 where username='One';");
await expire();
assert.equal((await get()).global.totals.rolls,400);
await db.exec(`insert into best_roll_history values
 (4,'00000000-0000-0000-0000-000000000002','Two','Diamond',10000,1,777,5,250,null,10000,'2026-09-07');`);
await expire();
assert.equal((await get()).global.records.raw.rawRarity,10000);
await db.exec('delete from best_roll_history where id=4');
await expire();
assert.equal((await get()).global.records.raw.gem,'Ruby');
await db.exec(`insert into best_roll_history values
 (4,'00000000-0000-0000-0000-000000000002','Two','Diamond',10000,1,777,5,250,null,10000,'2026-09-07');`);
await db.exec("insert into system_account_exclusions values('00000000-0000-0000-0000-000000000002',false)");
await expire();
assert.equal((await get()).global.totals.players,2);
await db.exec("delete from system_account_exclusions where player_id='00000000-0000-0000-0000-000000000002'");
await expire();
response = await get();
assert.equal(response.global.totals.players,3);

// The first read can be arbitrarily late; post-cutoff writes cannot leak in.
const past = new Date(Date.now()-1000).toISOString();
await db.exec(`create or replace function month_one_private.cutoff() returns timestamptz
 language sql immutable set search_path='' as $$ select '${past}'::timestamptz $$;
 update players set total_rolls=9000, username='Later';
 update bank_accounts set balance=9000;
 delete from minigame_scores;
 insert into best_roll_history values
 (5,'00000000-0000-0000-0000-000000000001','Later','Future',999999999,1,1,1,1,ARRAY[]::text[],999999999,clock_timestamp());`);
const frozen = await get();
assert.equal(frozen.status,'final');
assert.equal(frozen.refreshSeconds,null);
assert.equal(frozen.global.totals.rolls,400);
assert.equal(frozen.global.banked,50);
assert.equal(frozen.global.records.raw.gem,'Diamond');
assert.equal(frozen.personal.username,'Two');
await db.exec('delete from players; delete from system_account_exclusions;');
assert.deepEqual((await get()).global,frozen.global);
assert.deepEqual((await get()).personal,frozen.personal);
await db.exec("set request.jwt.claim.sub=''; set role anon;");
assert.equal((await get()).personal,null);
assert.equal((await get()).status,'final');

assert.match(globalRecap(frozen),/Highest Displayed Rarity/);
assert.match(globalRecap(frozen),/Roll-time luck not recorded/);
assert.match(personalRecap(frozen),/You Were Here/);
const hostile = structuredClone(frozen);
hostile.personal.username = '<script>alert("x")</script>';
assert.ok(!personalRecap(hostile).includes('<script>'));
assert.ok(!summarySvg(hostile).includes('<script>'));
assert.match(summarySvg(frozen),/xmlns="http:\/\/www.w3.org\/2000\/svg"/);
assert.match(shareSummary(frozen),/Player #2/);
assert.match(personalRecap({...frozen,personal:null}),/Sign in/);
if (process.env.MONTH_ONE_FIXTURE) await fs.writeFile(process.env.MONTH_ONE_FIXTURE,JSON.stringify(frozen));
console.log('Month One: live capture, final freeze, exclusions, ties, auth isolation, raw odds, null luck and safe sharing passed.');
await db.close();

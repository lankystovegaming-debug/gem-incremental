import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
process.on('uncaughtException',e=>{console.error(e.message,e.where??'');process.exit(1)});
const db=new PGlite();
const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const value=async(q,args=[]) => (await db.query(q,args)).rows[0]?.result;
const time=t=>db.query("select set_config('interlude.test_now',$1,false)",[t]);
const clock=s=>s.replace(/\b(?:now|clock_timestamp)\(\)/g,'public.interlude_test_now()');
try {
 await db.exec(read('tests/fixtures/cosmetics-live-schema.sql'));
 await db.exec(read('tests/fixtures/cosmetics-live-functions.sql'));
 await db.exec(`create function public.interlude_test_now() returns timestamptz language sql stable as $$select current_setting('interlude.test_now')::timestamptz$$;
 alter table public.season_definitions add primary key(id);
 alter table public.season_definitions add unique(name);
 create table public.game_section_settings(id text primary key,enabled boolean);
 insert into public.game_section_settings values('seasons',true);
 create table public.player_research_effects(player_id uuid primary key,season_xp_multiplier numeric);
 create table public.test_rewards(player_id uuid,id text,quantity integer);
 create function public.expedition_grant_consumable(u uuid,i text,q integer) returns void language sql as $$insert into public.test_rewards values(u,i,q)$$;
 create function public.expedition_grant_relic(u uuid,i text,q integer) returns void language sql as $$insert into public.test_rewards values(u,i,q)$$;`);
 await time('2026-10-15 00:00:00+00');
 const base=read('supabase/migrations/20260819000010_unreleased_expansion_features.sql');
 await db.exec(base.slice(base.indexOf('create table if not exists public.player_seasons'),base.indexOf('alter table public.season_definitions')));
 await db.query('insert into players(id,username,money) values($1,\'Interlude Test\',20000000),($2,\'Other\',0)',[uid,other]);
 await db.exec("insert into season_definitions(name,enabled) values('Season Zero — First Light',true)");
 await db.exec(clock(read('supabase/migrations/20260821000001_season_zero_pass.sql')));
 await db.exec("update season_definitions set starts_at='2026-08-22 12:19:06+00',ends_at='2026-09-21 12:19:06+00'");
 await db.exec(read('supabase/migrations/20260908075320_player_profiles_cosmetics_v1.sql'));
 await db.exec(clock(read('supabase/migrations/20261015024142_season_one_interlude.sql')));
 const sid=await value("select id result from season_definitions where metadata->>'version'='season-one'");
 const zero=await value("select id result from season_definitions where metadata->>'version'='season-zero'");
 const tiers=await value('select tiers result from season_definitions where id=$1',[sid]);
 const old=await value('select tiers result from season_definitions where id=$1',[zero]);
 assert.deepEqual(tiers,JSON.parse(read('docs/season-one-rewards.json')));
 assert.equal(tiers.length,50);assert.equal(tiers[0].xp,0);assert.equal(tiers.at(-1).xp,25000);
 const totals={};
 for(const lane of ['free','premium']){
  totals[lane]={};
  tiers.forEach((t,i)=>{
   assert.equal(t.xp,Math.round(old[i].xp*25000/59500/50)*50);
   if(i)assert(t.xp>tiers[i-1].xp);
   assert(t[lane].length>0);
   for(const r of t[lane])totals[lane][r.id??r.type]=(totals[lane][r.id??r.type]??0)+(r.amount??r.quantity??1);
  });
 }
 for(const [lane,cash,enchant,ancient,legendary] of [['free',945000,20,2,5],['premium',940000,22,4,9]]){
  assert.equal(totals[lane].money,cash);assert.equal(totals[lane]['Enchant Relic'],enchant);assert.equal(totals[lane]['Ancient Relic'],ancient);assert.equal(totals[lane]['legendary-potion'],legendary);
 }
 assert.equal(totals.premium['mythic-potion'],1);
 assert.equal(tiers.flatMap(t=>[...t.free,...t.premium]).filter(r=>r.type==='cosmetic').length,6);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 await db.query('insert into player_seasons(season_id,player_id,xp) values($1,$2,59500)',[zero,uid]);
 await db.query("insert into player_season_cosmetics(player_id,cosmetic_id,cosmetic_type,season_id) values($1,'first-light','title',$2)",[uid,zero]);
 assert.equal(await value('select ensure_player_season($1) result',[uid]),null);
 await assert.rejects(db.query('select purchase_season_premium($1)',[sid]),/season_not_active/);
 await time('2026-10-16 23:59:59+00');assert.equal(await value('select ensure_player_season($1) result',[uid]),null);
 await time('2026-10-17 00:00:00+00');assert.equal(await value('select ensure_player_season($1) result',[uid]),sid);
 await db.query('select ensure_player_season($1)',[uid]);
 assert.equal(await value('select count(*)::int result from player_season_missions where season_id=$1',[sid]),5);
 for(const cadence of ['daily','weekly']){
  const cats=cadence==='daily'?['rolls','sold','legendary','mythic','mutated','effective100k']:['rolls','sold','legendary','mythic','exotic','mutated','effective100k','effective1m'];
  const thresholds=cadence==='daily'?[[75,200,400],[40,100,200],[5,15,30],[1,2,4],[1,3,6],[1,2,4]]:[[750,1750,3500,6000],[300,800,1750,3000],[50,150,350,600],[5,15,40,80],[1,2,3,5],[10,30,75,150],[3,8,20,40],[1,2,3,5]];
  for(const [i,cat] of cats.entries()){
   const spec=await value('select season_mission_spec($1,$2,$3) result',[cat,cadence,sid]);
   assert.deepEqual(spec.thresholds,thresholds[i]);assert.deepEqual(spec.xp,cadence==='daily'?[50,100,150]:[100,150,250,350]);
  }
 }
 // Premium is atomic, affordable and idempotent. Ownership cannot be forged.
 await db.exec('set role authenticated');
 await db.query('select purchase_season_premium($1)',[sid]);
 assert.equal((await value('select purchase_season_premium($1) result',[sid])).alreadyOwned,true);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
 await assert.rejects(db.query('select purchase_season_premium($1)',[sid]),/not_enough_money/);
 await assert.rejects(db.query('select record_season_roll($1,1000,1000,0,false)',[other]),/permission denied/);
 await assert.rejects(db.query('select ensure_player_season($1)',[other]),/permission denied/);
 await assert.rejects(db.query('select season_advance_missions($1,$2,\'roll\')',[other,sid]),/permission denied/);
 await assert.rejects(db.query('select season_grant_reward($1,$2,\'[]\')',[other,sid]),/permission denied/);
 await db.exec('reset role');
 assert.equal(await value('select money result from players where id=$1',[uid]),10000000);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 await db.query('select claim_season_tier($1,1,\'free\')',[sid]);
 await assert.rejects(db.query('select claim_season_tier($1,1,\'free\')',[sid]),/already_claimed/);
 await assert.rejects(db.query('select claim_season_tier($1,50,\'free\')',[sid]),/tier_locked/);
 await assert.rejects(db.query('select claim_season_tier($1,1,\'free; DROP TABLE players;\')',[sid]),/invalid_lane/);
 // Exercise the deployed rarity/mutation formula and retained research multiplier.
 await db.query('update player_season_missions set thresholds=array[999999,9999999,99999999,999999999] where season_id=$1',[sid]);
 await db.query('insert into player_research_effects values($1,1.5)',[uid]);
 assert.equal(Number((await value('select record_season_roll($1,10000,100000,2,false) result',[uid])).xp),18);
 assert.equal(Number((await value('select record_season_roll($1,1000000,1000000,0,true) result',[uid])).xp),0);
 await db.query('update player_seasons set roll_xp_today=1499 where player_id=$1 and season_id=$2',[uid,sid]);
 assert.equal(Number((await value('select record_season_roll($1,1000000,1000000,0,false) result',[uid])).xp),1);
 assert.equal(Number((await value('select record_season_roll($1,1000000,1000000,0,false) result',[uid])).xp),0);
 await time('2026-10-18 00:00:00+00');
 assert.equal(Number((await value('select record_season_roll($1,1000000,1000000,0,false) result',[uid])).xp),75);
 assert.equal(await value("select count(*)::int result from player_season_missions where player_id=$1 and season_id=$2 and cadence='daily'",[uid,sid]),4);
 await time('2026-10-19 00:00:00+00');await db.query('select ensure_player_season($1)',[uid]);
 assert.equal(await value("select count(*)::int result from player_season_missions where player_id=$1 and season_id=$2 and cadence='weekly'",[uid,sid]),6);
 // Award all milestones once; completed-mission item remains the existing tier III potion.
 await db.query("update player_season_missions set category='sold',progress=2999,awarded_tiers=0,thresholds=array[300,800,1750,3000],xp_rewards=array[100,150,250,350] where player_id=$1 and season_id=$2 and cadence='weekly' and period_start='2026-10-19 00:00:00+00' and slot=1",[uid,sid]);
 assert.equal(Number(await value('select record_season_sale($1) result',[uid])),850);
 const rewards=await value('select count(*)::int result from test_rewards');
 assert.equal(Number(await value('select record_season_sale($1) result',[uid])),0);
 assert.equal(await value('select count(*)::int result from test_rewards'),rewards);
 await db.query('update player_seasons set xp=24999 where player_id=$1 and season_id=$2',[uid,sid]);
 await db.query('select record_season_roll($1,1000000,1000000,0,false)',[uid]);
 assert.equal(Number(await value('select xp result from player_seasons where player_id=$1 and season_id=$2',[uid,sid])),25000);
 // Rerolls are once per UTC day and cannot survive the season end.
 await db.query("update player_season_missions set progress=0,awarded_tiers=0 where player_id=$1 and season_id=$2 and cadence='daily' and period_start='2026-10-19 00:00:00+00'",[uid,sid]);
 await db.query('select reroll_daily_season_mission($1,1)',[sid]);
 await assert.rejects(db.query('select reroll_daily_season_mission($1,2)',[sid]),/reroll_used/);
 await time('2026-11-15 23:59:59+00');await db.query('select ensure_player_season($1)',[uid]);
 await time('2026-11-16 00:00:00+00');
 assert.equal(await value('select ensure_player_season($1) result',[uid]),null);
 assert.equal(await value('select record_season_roll($1,1000000,1000000,0,false) result',[uid]),null);
 assert.equal(Number(await value('select season_advance_missions($1,$2,\'sale\') result',[uid,sid])),0);
 await assert.rejects(db.query('select purchase_season_premium($1)',[sid]),/season_not_active/);
 await assert.rejects(db.query('select reroll_daily_season_mission($1,1)',[sid]),/season_not_active/);
 // Earned rewards remain claimable throughout the seven-day grace, including all six cosmetics.
 for(const [t,l] of [[15,'premium'],[25,'free'],[30,'free'],[40,'premium'],[50,'free'],[50,'premium']])await db.query('select claim_season_tier($1,$2,$3)',[sid,t,l]);
 for(const [id,slot] of [['between-the-lights','title'],['quiet-miner','title'],['silver-horizon','frame'],['crystal-reverie','background'],['the-interlude','title'],['season-one','badge']]){
  assert.deepEqual(await value('select slots result from cosmetic_definitions where id=$1',[id]),[slot]);
  assert.equal(await value('select exists(select 1 from player_cosmetics where player_id=$1 and cosmetic_id=$2) result',[uid,id]),true);
 }
 await db.query('select set_my_cosmetic_loadout($1)',[JSON.stringify({title:'the-interlude',frame:'silver-horizon',background:'crystal-reverie',badges:['season-one']})]);
 await time('2026-11-22 23:59:59+00');await db.query('select claim_season_tier($1,2,\'free\')',[sid]);
 await time('2026-11-23 00:00:00+00');await assert.rejects(db.query('select claim_season_tier($1,3,\'free\')',[sid]),/claim_period_ended/);
 assert.equal(Number(await value('select xp result from player_seasons where player_id=$1 and season_id=$2',[uid,zero])),59500);
 assert.equal(await value("select exists(select 1 from player_cosmetics where player_id=$1 and cosmetic_id='first-light') result",[uid]),true);
 assert.equal((await value('select get_my_cosmetics() result')).resolved.background.id,'crystal-reverie');
 const saved=await value('select to_jsonb(p) result from player_seasons p where player_id=$1 and season_id=$2',[uid,sid]);
 await db.exec(clock(read('supabase/migrations/20261015024142_season_one_interlude.sql')));
 assert.deepEqual(await value('select to_jsonb(p) result from player_seasons p where player_id=$1 and season_id=$2',[uid,sid]),saved,'migration reapplication preserves progress and claims');
 console.log('Season 1: 100 slots, exact totals/curve, boundaries, premium, claims, permissions, roll/mission XP, resets, rerolls, idempotency, archives and profile grants passed.');
} finally {await db.close();}

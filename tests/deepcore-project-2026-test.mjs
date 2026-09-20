import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
const sql=read("supabase/migrations/20260916105437_deepcore_project_2026.sql");
const triggerSql=read("supabase/migrations/20260916125715_install_deepcore_hot_table_triggers.sql");
const leaderboardRewardSql=read("supabase/migrations/20260920035123_add_deepcore_leaderboard_consumable_rewards.sql");
const roll=read("supabase/functions/roll/index.ts");
const page=read("limited-events/deepcore/index.html");
const client=read("limited-events/deepcore/deepcore.js");
const cutscenes=read("src/ui/cutsceneConfig.js");
const deployment=read("docs/deepcore-2026-deployment.md");

assert.match(sql,/2026-09-20T00:00:00Z/); assert.match(sql,/2026-10-04T00:00:00Z/);
assert.ok((sql.match(/2026-10-04T00:00:00Z/g)||[]).length>=12,"every limited catalog entry and the event share the hard expiry"); assert.match(roll,/deepcoreContext\?\.status !== "active"/);
assert.match(sql,/new\.total_rolls-old\.total_rolls/); assert.doesNotMatch(sql,/equipment_genuine_rolls/);
assert.doesNotMatch(sql,/drop trigger if exists deepcore_track_(rolls|specimen)/,"hot-table trigger DDL must stay outside the long schema transaction");
assert.match(triggerSql,/deepcore_track_rolls/); assert.match(triggerSql,/deepcore_track_specimen/);
assert.ok((triggerSql.match(/commit;/g)||[]).length>=2,"hot-table trigger locks must be released independently");
assert.match(triggerSql,/set lock_timeout = '10s'/);
assert.match(deployment,/20260916125715_install_deepcore_hot_table_triggers\.sql/);
assert.match(deployment,/20260920035123_add_deepcore_leaderboard_consumable_rewards\.sql/);
assert.match(leaderboardRewardSql,/\(1,10,6,3,1\)/); assert.match(leaderboardRewardSql,/\(5,4,2,1,0\)/);
assert.match(leaderboardRewardSql,/deepcore_leaderboard_reward_grants/);
assert.match(sql,/for update/); assert.match(sql,/unique\(player_id,request_id\)/);
assert.match(sql,/route_winner is not null/); assert.match(sql,/route_loser_snapshot/);
assert.match(sql,/g\.locked or g\.museum_locked/); assert.match(sql,/p_objective='key'/);
assert.match(sql,/for idx in 1\.\.greatest\(0,floor\(\(e\.effective_funding-10000000000\)\/500000000\)/);
assert.match(sql,/eligible_at is not null and eligible_at<'2026-10-04T00:00:00Z'/);
for(const id of ["lucky-potion-4","speed-potion-4","fortune-potion-4","mass-potion-4"]) assert.match(sql,new RegExp(id));
assert.match(roll,/deepcore_get_roll_context/); assert.match(roll,/deepcore_auto_contribute_roll/); assert.match(roll,/deepcorePhaseOrder/);
assert.match(page,/Overview/); assert.match(page,/Quests/); assert.match(page,/Supply Shop/); assert.match(page,/Consumables/); assert.match(page,/Leaderboards/); assert.match(page,/Project Log/);
assert.match(client,/status==="preview"/); assert.match(sql,/Asia\/Singapore/);
assert.match(client,/legendary_sacrificed/); assert.match(client,/50,000 Legendary specimens/);
assert.match(client,/mythic_sacrificed/); assert.match(client,/5,000 Mythic specimens/); assert.match(client,/heavy_specimen_met/);
assert.match(page,/phaseObjectives/);
assert.match(client,/sacrificed_value/); assert.match(client,/Sacrificed specimen value/); assert.match(client,/maximumSignificantDigits: 5/);
assert.match(client,/setInterval\(refreshRequirements,30_000\)/); assert.match(client,/document\.hidden/); assert.match(client,/snapshotVersion/);
for(const reward of ["Deepcore Catalyst","Pressurized Catalyst","Seismic Potion","Unstable Core"]) assert.match(client,new RegExp(reward));
assert.match(page,/Placing on both boards grants both packages/); assert.match(client,/remaining consumables and Deepcore Crates are still usable/);
assert.match(cutscenes,/deepcore-pressure/); assert.match(cutscenes,/deepcore-heartbeat/);

const db=new PGlite();
await db.exec(read("tests/fixtures/deepcore-live-schema.sql"));
await db.exec(sql);
await db.exec(triggerSql);
await db.exec(leaderboardRewardSql);
const one=async(q,args=[])=>(await db.query(q,args)).rows[0];
assert.equal((await one("select deepcore_private.status('2026-09-19T23:59:59.999Z') status")).status,"preview");
assert.equal((await one("select deepcore_private.status('2026-09-20T00:00:00Z') status")).status,"active");
assert.equal((await one("select deepcore_private.status('2026-10-03T23:59:59.999Z') status")).status,"active");
assert.equal((await one("select deepcore_private.status('2026-10-04T00:00:00Z') status")).status,"archived");

const uid="00000000-0000-0000-0000-000000000001";
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:"authenticated"})]);
await db.query("insert into players(id,money,total_rolls,username) values($1,2000000000,100,'Tester')",[uid]);
await db.exec("update deepcore_event_state set starts_at=now()-interval '1 day',ends_at=now()+interval '1 day'");
const request="10000000-0000-0000-0000-000000000001";
await db.query("select deepcore_contribute(1000000,'global',$1)",[request]);
assert.equal(Number((await one("select money from players where id=$1",[uid])).money),1999000000);
assert.equal(Number((await one("select actual_funding from deepcore_players where player_id=$1",[uid])).actual_funding),1000000);
await db.query("select deepcore_contribute(1000000,'global',$1)",[request]);
assert.equal(Number((await one("select actual_funding from deepcore_players where player_id=$1",[uid])).actual_funding),1000000,"replayed contribution is idempotent");

await db.query("update players set total_rolls=total_rolls+900 where id=$1",[uid]);
assert.equal(Number((await one("select event_rolls from deepcore_players where player_id=$1",[uid])).event_rolls),900,"batch delta increments by every successful genuine roll");
await db.query("update players set total_rolls=total_rolls+100 where id=$1",[uid]);
assert.ok((await one("select eligible_at from deepcore_players where player_id=$1",[uid])).eligible_at,"eligibility becomes permanent once both requirements are met");

await db.exec("update deepcore_event_state set phase=2");
const supplyRequest="20000000-0000-0000-0000-000000000001";
await db.query("select deepcore_buy_supply($1)",[supplyRequest]);
await db.query("select deepcore_buy_supply($1)",[supplyRequest]);
assert.equal(Number((await one("select supply_level from deepcore_players where player_id=$1",[uid])).supply_level),1,"a retried supply request cannot buy the next sequential level");

await db.exec("update deepcore_event_state set phase=51");
const buyRequest="30000000-0000-0000-0000-000000000001";
await db.query("select deepcore_buy_consumable('deepcore-catalyst',1,$1)",[buyRequest]);
await db.query("select deepcore_buy_consumable('deepcore-catalyst',1,$1)",[buyRequest]);
assert.equal(Number((await one("select quantity from player_consumables where player_id=$1 and consumable_id='deepcore-catalyst'",[uid])).quantity),1,"shop retries are idempotent");
const useRequest="40000000-0000-0000-0000-000000000001";
await db.query("select deepcore_use_consumable('deepcore-catalyst',$1)",[useRequest]);
await db.query("select deepcore_use_consumable('deepcore-catalyst',$1)",[useRequest]);
assert.equal(Number((await one("select rolls_remaining from deepcore_player_effects where player_id=$1 and effect_id='deepcore-catalyst'",[uid])).rolls_remaining),25,"consumable use retries do not stack twice");

await db.query("select deepcore_claim_quest('project-roll-1k')");
await assert.rejects(()=>db.query("select deepcore_claim_quest('project-roll-1k')"),/quest_incomplete/);
assert.equal(Number((await one("select research_data from deepcore_players where player_id=$1",[uid])).research_data),3,"quest rewards are granted once");

await db.exec("select deepcore_private.unlock_reward('test-reward','Test','[{\"id\":\"deepcore-crate\",\"quantity\":1}]',99)");
await db.query("select deepcore_claim_reward('test-reward')");
await db.query("select deepcore_claim_reward('test-reward')");
assert.equal(Number((await one("select quantity from player_consumables where player_id=$1 and consumable_id='deepcore-crate'",[uid])).quantity),1,"manual community reward claims are idempotent");

await db.exec("update deepcore_event_state set phase=52,crystalline_funding=1500000000,crystalline_specimens=4000,anomalous_funding=1500000000,anomalous_specimens=10,route_winner=null");
await db.exec("select deepcore_private.resolve_route(); select deepcore_private.resolve_route()");
const route=await one("select route_winner,route_loser_snapshot from deepcore_event_state");
assert.equal(route.route_winner,"crystalline","the locked route resolver records exactly one winner");
assert.equal(Number(route.route_loser_snapshot.anomalousSpecimens),10,"the losing route is frozen, not refunded or transferred");

await db.exec("update deepcore_event_state set phase=7,effective_funding=12500000000");
await db.exec("select deepcore_private.advance_state()");
assert.equal(Number((await one("select count(*) count from deepcore_rewards where reward_key like 'stretch-%'")).count),5,"skipped $500M boundaries unlock exactly once");
await db.exec("select deepcore_private.advance_state()");
assert.equal(Number((await one("select count(*) count from deepcore_rewards where reward_key like 'stretch-%'")).count),5,"stretch reconciliation is idempotent");

assert.equal((await one("select has_function_privilege('authenticated','public.deepcore_get_roll_context(uuid)','EXECUTE') allowed")).allowed,false);

// Freeze five players into the same rank on both boards. Each board awards its
// package independently, so every expected quantity below is doubled.
await db.query("update deepcore_players set actual_funding=0,effective_funding=0 where player_id=$1",[uid]);
const finalists=Array.from({length:5},(_,i)=>`00000000-0000-0000-0000-00000000001${i+1}`);
for(let i=0;i<finalists.length;i++){
 await db.query("insert into players(id,username) values($1,$2)",[finalists[i],`Finalist ${i+1}`]);
 await db.query("insert into deepcore_players(player_id,actual_funding,effective_funding) values($1,$2,$2)",[finalists[i],500-i*10]);
}
await db.exec("update deepcore_event_state set ends_at=now()-interval '1 second',archived_at=null");
await db.query("select get_deepcore_snapshot()");
assert.equal((await one("select deepcore_private.status() status")).status,"archived");
assert.equal(Number((await one("select count(*) count from deepcore_leaderboard_reward_grants")).count),10,"both Top-5 boards receive one ledgered grant per placement");
const expected=[[20,12,6,2],[16,10,4,2],[12,8,4,0],[10,6,2,0],[8,4,2,0]];
for(let i=0;i<finalists.length;i++){
 const rows=(await db.query("select consumable_id,quantity from player_consumables where player_id=$1 and consumable_id in ('deepcore-catalyst','pressurized-catalyst','seismic-potion','unstable-core')",[finalists[i]])).rows;
 const owned=Object.fromEntries(rows.map(r=>[r.consumable_id,Number(r.quantity)]));
 assert.deepEqual([owned["deepcore-catalyst"]||0,owned["pressurized-catalyst"]||0,owned["seismic-potion"]||0,owned["unstable-core"]||0],expected[i],`rank ${i+1} receives both leaderboard packages`);
}
await db.query("select get_deepcore_snapshot()");
assert.equal(Number((await one("select quantity from player_consumables where player_id=$1 and consumable_id='deepcore-catalyst'",[finalists[0]])).quantity),20,"archive retries cannot duplicate leaderboard rewards");

// Archival closes purchases and event-gem availability, but owned effects and
// crates deliberately remain usable as permanent limited inventory.
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[finalists[4]]);
await db.query("select deepcore_use_consumable('seismic-potion',$1)",["50000000-0000-0000-0000-000000000001"]);
assert.equal(Number((await one("select quantity from player_consumables where player_id=$1 and consumable_id='seismic-potion'",[finalists[4]])).quantity),1);
assert.ok((await one("select expires_at from deepcore_player_effects where player_id=$1 and effect_id='seismic-potion'",[finalists[4]])).expires_at,"archived consumables still activate");
await assert.rejects(()=>db.query("select deepcore_buy_consumable('deepcore-catalyst',1,$1)",["60000000-0000-0000-0000-000000000001"]),/deepcore_not_active/);
await db.query("select deepcore_private.grant_consumable($1,'deepcore-crate',1)",[finalists[4]]);
await db.query("select deepcore_open_crate($1)",["70000000-0000-0000-0000-000000000001"]);
assert.equal(Number((await one("select count(*) count from deepcore_crate_openings where player_id=$1",[finalists[4]])).count),1,"archived Deepcore Crates still open");
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[finalists[0]]);
await db.query("select deepcore_use_consumable('unstable-core',$1)",["80000000-0000-0000-0000-000000000001"]);
await db.query("update players set total_rolls=total_rolls+4 where id=$1",[finalists[0]]);
assert.equal(Number((await one("select rolls_remaining from deepcore_player_effects where player_id=$1 and effect_id='unstable-core'",[finalists[0]])).rolls_remaining),6,"archived roll-count consumables still deplete on genuine rolls");
await db.close();
console.log("Deepcore schedule, migration, atomicity, batch counting, eligibility, leaderboard rewards, archive use, UI and cutscene checks passed.");

import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { PGlite } = await import(
  process.env.MINIGAMES_PGLITE_MODULE || "@electric-sql/pglite"
);
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
create table public.players(id uuid primary key,username text,leaderboard_hidden boolean default false);
grant select on public.players to service_role;
insert into players values ('00000000-0000-0000-0000-000000000001','One',false),('00000000-0000-0000-0000-000000000002','Two',false);`);
await db.exec(
  await fs.readFile(
    new URL(
      "../supabase/migrations/20260905031842_minigames_v1.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(await fs.readFile(new URL('../supabase/migrations/20260906141753_gem_reels_v1.sql', import.meta.url), 'utf8'));
const one = "00000000-0000-0000-0000-000000000001",
  two = "00000000-0000-0000-0000-000000000002";
await db.exec("set role service_role");
const wallet = async () =>
  (await db.query("select * from minigame_wallet($1)", [one])).rows[0];
const start = async (game = "gem-tower", mode = "rewarded") =>
  (
    await db.query("select * from minigame_start($1,$2,$3,$4)", [
      one,
      game,
      mode,
      JSON.stringify({ game, mode, done: false }),
    ])
  ).rows[0];
const commit = async (run, version, state, rank = [10, 0, 0]) =>
  (
    await db.query("select * from minigame_commit($1,$2,$3,$4,$5,$6)", [
      one,
      run.id,
      version,
      '{"type":"collect"}',
      JSON.stringify(state),
      JSON.stringify(rank),
    ])
  ).rows[0];
assert.equal((await wallet()).tickets, 5);
let r = await start();
assert.equal((await wallet()).tickets, 4);
let repeated = await Promise.all(
  Array.from({ length: 20 }, () => start("crystal-bags")),
);
assert.ok(repeated.every((x) => x.id === r.id));
assert.equal((await wallet()).tickets, 4);
await Promise.all(
  Array.from({ length: 20 }, () => commit(r, 0, { done: true, pending: 55 })),
);
assert.equal((await wallet()).mt, 55);
assert.equal((await wallet()).lifetime_mt, 55);
assert.equal((await db.query("select * from minigame_scores")).rows.length, 1);
let practice = await start("gem-tower", "practice");
await commit(practice, 0, { done: true, pending: 10000 }, [20, 0, 0]);
assert.equal((await wallet()).mt, 55);
assert.equal((await wallet()).tickets, 4);
let board = (
  await db.query("select minigame_board($1,$2) board", ["gem-tower", one])
).rows[0].board;
assert.equal(board.own_rank, 1);
assert.equal(board.entries[0].score, 20);
assert.ok(!("player_id" in board.entries[0]));
await db.exec(
  `update minigame_wallets set tickets=1,regen_at=now()-interval '150 minutes' where player_id='${one}'`,
);
assert.equal((await wallet()).tickets, 3);
assert.ok(
  Math.abs(
    Date.now() - new Date((await wallet()).regen_at).getTime() - 30 * 60000,
  ) < 2000,
);
await db.exec(
  `update minigame_wallets set tickets=4,regen_at=now()-interval '10 hours' where player_id='${one}'`,
);
assert.equal((await wallet()).tickets, 5);
await db.exec(`update minigame_wallets set tickets=0 where player_id='${one}'`);
await assert.rejects(start(), /No tickets/);
await assert.rejects(start("gem-2048", "rewarded"), /Not rewarded/);
await db.exec(
  `reset role;set role authenticated;set request.jwt.claim.sub='${one}';`,
);
assert.equal((await db.query("select * from minigame_wallets")).rows.length, 1);
for (let table of ["minigame_runs", "minigame_actions", "minigame_scores"])
  await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
await assert.rejects(
  db.exec("update minigame_wallets set mt=999999"),
  /permission denied/,
);
await assert.rejects(start(), /permission denied/);
await assert.rejects(
  commit(r, 1, { done: true, pending: 9999 }),
  /permission denied/,
);
await db.exec(`set request.jwt.claim.sub='${two}'`);
assert.equal((await db.query("select * from minigame_wallets")).rows.length, 0);
await db.exec("reset role;set role anon");
await assert.rejects(
  db.query("select * from minigame_wallets"),
  /permission denied/,
);
await db.exec("reset role;set role service_role");
const {create,step,ranking}=await import('../supabase/functions/minigames/engine.js');
await db.exec(`update minigame_wallets set tickets=5,regen_at=now() where player_id='${one}'`);
const mtBefore=Number((await wallet()).mt);
for(const mode of ['rewarded','practice']) {
  let state=create('gem-reels',mode);
  let reel=(await db.query('select * from minigame_start($1,$2,$3,$4)',[one,'gem-reels',mode,JSON.stringify(state)])).rows[0];
  const same=await start('gem-reels',mode);
  assert.equal(same.id,reel.id);
  assert.equal((await wallet()).tickets,4);
  for(let i=0;i<16;i++) {
    const action=i%2 ? {type:'respin',holds:[0,1,2,3,4]} : {type:'spin'};
    state=step(state,action,i+1,()=>0);
    const args=[one,reel.id,reel.version,JSON.stringify(action),JSON.stringify(state),JSON.stringify(ranking(state))];
    const retries=await Promise.all(Array.from({length:3},()=>db.query('select * from minigame_commit($1,$2,$3,$4,$5,$6)',args)));
    reel=retries[0].rows[0];
    assert.ok(retries.every(r=>r.rows[0].version===i+1));
    if(i<15) assert.equal(Number((await wallet()).mt),mtBefore+(mode==='practice'?50:0));
  }
  assert.equal(Number((await wallet()).mt),mtBefore+50);
  assert.equal(reel.state.score,24000);
  assert.equal(reel.state.history.length,8);
  assert.equal((await db.query('select count(*)::int n from minigame_actions where run_id=$1',[reel.id])).rows[0].n,16);
  assert.equal((await db.query('select score from minigame_scores where run_id=$1',[reel.id])).rows[0].score,24000);
  await assert.rejects(db.query('select * from minigame_commit($1,$2,$3,$4,$5,$6)',[two,reel.id,16,'{}','{}','null']),/Run not found/);
}
const reelsBoard=(await db.query("select minigame_board('gem-reels',$1) b",[one])).rows[0].b;
assert.equal(reelsBoard.own_rank,1);assert.equal(reelsBoard.entries[0].score,24000);
await db.exec("reset role;set role authenticated");
await assert.rejects(start('gem-reels'),/permission denied/);
await db.close();
console.log(
  "PASS: tickets, retries, credit once, practice isolation, leaderboard, private states and RLS",
);

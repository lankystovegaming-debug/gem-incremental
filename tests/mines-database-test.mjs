import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { create, step, ranking } from '../supabase/functions/minigames/engine.js';
const {PGlite} = await import(process.env.MINIGAMES_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const one='00000000-0000-0000-0000-000000000001', two='00000000-0000-0000-0000-000000000002';
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
create table public.players(id uuid primary key,username text,leaderboard_hidden boolean default false);
grant select on public.players to service_role; insert into players values ('${one}','One',false),('${two}','Two',false);`);
for (const name of ['20260905031842_minigames_v1.sql','20260906141753_gem_reels_v1.sql','20261029003138_mines_minigame.sql']) {
  await db.exec(await fs.readFile(new URL('../supabase/migrations/'+name, import.meta.url),'utf8'));
}
await db.exec('set role service_role');
const wallet=async () => (await db.query('select * from minigame_wallet($1)',[one])).rows[0];
const start=async (mode='practice',game='mines') => (await db.query('select * from minigame_start($1,$2,$3,$4)',[one,game,mode,JSON.stringify(create(game,'practice'))])).rows[0];
const commit=async (r,s,player=one) => (await db.query('select * from minigame_commit($1,$2,$3,$4,$5,$6)',[player,r.id,r.version,JSON.stringify({type:'bank'}),JSON.stringify(s),JSON.stringify(ranking(s))])).rows[0];
let r=await start();
assert.equal((await start()).id,r.id);
assert.equal((await wallet()).tickets,5);
await assert.rejects(start('rewarded'),/Not rewarded/);
let now=1;
for (let round=0;round<5;round++) {
  if (round) r=await commit(r,step(r.state,{type:'next'},now++));
  const before=r;
  const s=step(r.state,{type:'bank'},now++);
  await assert.rejects(commit(r,s,two),/Run not found/);
  r=await commit(r,s);
  const retry=await commit(before,s);
  assert.equal(retry.version,r.version);
  assert.equal(retry.state.score,r.state.score);
}
assert.equal(r.status,'complete');
assert.equal(r.state.score,5000);
assert.equal((await wallet()).mt,0);
assert.equal((await wallet()).tickets,5);
const board=(await db.query('select minigame_board($1,$2) as board',['mines',one])).rows[0].board;
assert.equal(board.own_rank,1);
assert.equal(board.entries[0].score,5000);
assert.equal((await db.query("select count(*)::int n from minigame_scores where game='mines'")).rows[0].n,1);
// Existing rewarded games remain allowed by the extended constraint.
await start('rewarded','gem-reels');
assert.equal((await wallet()).tickets,4);
await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${one}'`);
await assert.rejects(db.query('select * from minigame_runs'),/permission denied/);
await assert.rejects(start(),/permission denied/);
await assert.rejects(commit(r,r.state),/permission denied/);
await db.exec('reset role; set role anon');
await assert.rejects(start(),/permission denied/);
await db.close();
console.log('Mines database: resume, ownership, version retries, score-only completion, leaderboard and permissions passed.');

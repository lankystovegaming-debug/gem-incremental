import assert from "node:assert/strict";
import test from "node:test";
import { createHandler } from "../supabase/functions/minigames/handler.ts";
import { create } from "../supabase/functions/minigames/engine.js";
const request = (b) =>
  new Request("https://example.test", {
    method: "POST",
    headers: { Authorization: "Bearer test" },
    body: JSON.stringify(b),
  });
test("invalid authentication does not access database", async () => {
  let admin = {
    auth: { getUser: async () => ({ error: new Error("bad") }) },
    from() {
      throw Error("must not query");
    },
  };
  let r = await createHandler(admin)(request({ action: "start" }));
  assert.equal(r.status, 401);
});
test("server ownership, composite RPC responses, hidden seed and ignored client score", async () => {
  let calls = [],
    state = create("gem-tower", "rewarded", {}, 3, 1000),
    run = { id: "run", version: 0, game: "gem-tower", mode: "rewarded", state };
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: "real" } } }) },
    from(table) {
      let q = {
        select() {
          return q;
        },
        eq(k, v) {
          calls.push([table, k, v]);
          return q;
        },
        maybeSingle: async () => ({
          data: table === "players" ? { id: "real" } : null,
        }),
        single: async () => ({ data: run }),
      };
      return q;
    },
    async rpc(name, args) {
      calls.push([name, args]);
      if (name === "minigame_wallet") return { data: [{ mt: 0, tickets: 4 }] };
      if (name === "minigame_board") return { data: { entries: [] } };
      if (name === "minigame_start") return { data: [run] };
      if (name === "minigame_commit") {
        run = { ...run, version: 1, state: args.p_state };
        return { data: [run] };
      }
      throw Error(name);
    },
  };
  let h = createHandler(admin, () => 1001),
    r = await h(
      request({
        action: "start",
        game: "gem-tower",
        mode: "rewarded",
        player_id: "forged",
        seed: 0,
      }),
    ),
    body = await r.json();
  assert.equal(body.wallet.tickets, 4);
  assert.equal(body.run.id, "run");
  assert.ok(!("seed" in body.run.state));
  assert.equal(
    calls.find((c) => c[0] === "minigame_start")[1].p_player,
    "real",
  );
  r = await h(
    request({
      action: "act",
      game: "gem-tower",
      run_id: "run",
      version: 0,
      input: { type: "door", door: 0, score: 1e9, pending: 1e9 },
    }),
  );
  body = await r.json();
  assert.ok(body.run.state.score <= 1);
  assert.ok(body.run.state.pending <= 1);
  assert.ok(
    calls.some(
      (c) =>
        c[0] === "minigame_runs" && c[1] === "player_id" && c[2] === "real",
    ),
  );
});
test('Gem Reels rejects forged outcomes, serializes stale versions and derives owner from JWT', async()=>{
  let run={id:'reels',version:0,status:'active',game:'gem-reels',mode:'rewarded',state:create('gem-reels','rewarded',{},1,0)}, commits=0;
  const filters=[];
  const admin={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from(table){const q={select(){return q},eq(k,v){filters.push([k,v]);return q},maybeSingle:async()=>({data:table==='players'?{id:'owner'}:null}),single:async()=>({data:run})};return q},async rpc(name,args){
    if(name==='minigame_wallet')return {data:{mt:0,tickets:4}};
    if(name==='minigame_board')return {data:{entries:[]}};
    if(name==='minigame_commit'){assert.equal(args.p_player,'owner');commits++;run={...run,version:run.version+1,state:args.p_state};return {data:run};}
    throw Error(name);
  }};
  const h=createHandler(admin,()=>1);
  const act=async(input,version=run.version)=>(await h(request({action:'act',game:'gem-reels',run_id:'reels',version,player_id:'victim',score:99999,pending:99999,input})));
  assert.equal((await act({type:'spin',symbols:[11,11,11,11,11]})).status,400);
  assert.equal(commits,0);
  const spin=await (await act({type:'spin'})).json();
  assert.equal(spin.run.state.phase,'hold');assert.equal(spin.run.state.score,0);assert.equal(spin.run.state.pending,0);
  assert.ok(!('seed' in spin.run.state));assert.equal(spin.run.state.symbols.length,5);
  assert.equal((await act({type:'respin',holds:[],pending:50})).status,400);
  assert.equal(commits,1);
  await act({type:'spin'},0);assert.equal(commits,1);
  await act({type:'respin',holds:[0,1,2,3,4]});assert.equal(commits,2);
  assert.equal(run.state.hand,1);assert.equal(run.state.pending,0);
  await act({type:'respin',holds:[]},1);assert.equal(commits,2);
  assert.ok(filters.some(([k,v])=>k==='player_id'&&v==='owner'));
});

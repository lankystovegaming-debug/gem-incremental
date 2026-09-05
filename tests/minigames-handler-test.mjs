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

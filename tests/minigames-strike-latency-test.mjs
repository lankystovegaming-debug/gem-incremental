// Regression: a Perfect Strike must not be rejected as "out of sync" just
// because the server spent time on auth + DB round trips before scoring it.
//
// The handler timestamps the request on arrival and uses that for step(), so
// the anti-cheat compares the client's reported elapsed against real network
// latency — not against arrival + auth + ban-check + run-load latency. If the
// clock is ever read at step() time again (after those awaits), a legitimately
// timed strike over a normal connection gets rejected and the strike counter
// never advances. This test simulates that server-side latency and asserts the
// strike is accepted.
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

test("a well-timed strike survives server-side auth/DB latency", async () => {
  const createNow = 1000;
  let run = {
    id: "run",
    version: 0,
    status: "active",
    game: "perfect-strike",
    mode: "practice",
    state: create("perfect-strike", "practice", {}, 7, createNow, [], []),
  };
  // ready is 2.5s after create; the player strikes 300ms into the live window.
  const ready = run.state.ready;
  const arrival = ready + 300;
  const clientElapsed = arrival - ready; // 300ms — what a synced client sends

  // Server clock starts at the request's arrival time, then every await (auth,
  // ban check, run load, commit) pushes it forward by 150ms of "DB latency".
  let serverTime = arrival;
  const tick = () => {
    serverTime += 150;
  };
  const admin = {
    auth: {
      getUser: async () => {
        tick();
        return { data: { user: { id: "real" } } };
      },
    },
    from(table) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => {
          tick();
          return { data: table === "players" ? { id: "real" } : null };
        },
        single: async () => {
          tick();
          return { data: run };
        },
      };
      return q;
    },
    async rpc(name, args) {
      tick();
      if (name === "minigame_wallet") return { data: [{ mt: 0, tickets: 5 }] };
      if (name === "minigame_board") return { data: { entries: [] } };
      if (name === "minigame_commit") {
        run = { ...run, version: 1, state: args.p_state };
        return { data: [run] };
      }
      throw Error(name);
    },
  };

  const handler = createHandler(admin, () => serverTime);
  const res = await handler(
    request({
      action: "act",
      game: "perfect-strike",
      run_id: "run",
      version: 0,
      input: { type: "strike", elapsed: clientElapsed },
    }),
  );
  const body = await res.json();

  assert.equal(body.error, undefined, `strike rejected: ${body.error}`);
  assert.equal(body.run.state.strike, 1, "strike counter must advance to 1");
  assert.ok(
    serverTime - arrival >= 350,
    "sanity: simulated server latency must exceed the 350ms tolerance",
  );
});

console.log("minigames-strike-latency-test passed");

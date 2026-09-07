import assert from "node:assert/strict";
import test from "node:test";
import {
  create,
  step,
  visible,
  ranking,
  move2048,
  random,
} from "../supabase/functions/minigames/engine.js";
import { catalog, bagTable, strikeRating } from "../minigames/catalog.js";
test("catalog launch modes and no rewarded bypass", () => {
  assert.equal(catalog.length, 13);
  assert.deepEqual(
    catalog.filter((g) => g.mt).map((g) => g.id),
    ["gem-reels", "mine-sweeper", "gem-tower", "crystal-bags"],
  );
  assert.throws(() => create("gem-2048", "rewarded"));
  assert.throws(() =>
    create("mine-sweeper", "rewarded", { difficulty: "easy" }),
  );
  assert.throws(() => create("gemdle", "practice"));
});
test("Mine Sweeper safety at every boundary, original clues and perfect completion", () => {
  for (let seed = 1; seed <= 20; seed++) {
    for (let [x, y] of [
      [0, 0],
      [0, 19],
      [19, 19],
      [10, 10],
    ]) {
      let s = create(
        "mine-sweeper",
        "practice",
        { difficulty: "expert" },
        seed,
      );
      s = step(s, { type: "reveal", x, y }, 100);
      assert.equal(s.board.length, 40);
      assert.ok(
        s.board.every(
          (i) =>
            Math.max(Math.abs((i % 20) - x), Math.abs(Math.floor(i / 20) - y)) >
            1,
        ),
      );
      let publicState = visible(s);
      assert.ok(!("seed" in publicState) && !("board" in publicState));
      for (let i = 0; i < 400 && !s.done; i++)
        if (!s.board.includes(i) && !s.revealed.includes(i))
          s = step(
            s,
            { type: "reveal", x: i % 20, y: Math.floor(i / 20) },
            200 + i,
          );
      assert.equal(s.pending, 40);
      assert.equal(s.perfect, true);
      assert.ok(ranking(s)[0] < 0);
    }
  }
});
test("Mine Sweeper lost MT continues, flags never award", () => {
  let s = step(
    create("mine-sweeper", "rewarded", {}, 4),
    { type: "reveal", x: 0, y: 0 },
    100,
  );
  let i = s.board[0];
  s = step(s, { type: "flag", x: i % 12, y: Math.floor(i / 12) }, 101);
  assert.equal(s.pending, undefined);
  s = step(s, { type: "flag", x: i % 12, y: Math.floor(i / 12) }, 102);
  s = step(s, { type: "reveal", x: i % 12, y: Math.floor(i / 12) }, 103);
  assert.equal(s.lost, 1);
  assert.equal(s.done, false);
});
test("Tower 75%, guaranteed floors, triangular payouts and collapse floor", () => {
  let survived = 0;
  for (let seed = 1; seed <= 20000; seed++) {
    let s = step(
      create("gem-tower", "rewarded", {}, seed),
      { type: "door", door: 0 },
      1,
    );
    if (!s.done) survived++;
  }
  assert.ok(Math.abs(survived / 20000 - 0.75) < 0.015);
  let s = create("gem-tower", "rewarded", {}, 5);
  for (let f = 1; f <= 50; f++) {
    let copy = structuredClone(s),
      loser = Math.floor(random(copy) * 4);
    s = step(s, { type: "door", door: (loser + 1) % 4 }, f);
    assert.equal(s.floor, f);
    assert.equal(s.pending, (f * (f + 1)) / 2);
  }
  s = step(s, { type: "collect" }, 51);
  assert.equal(s.pending, 1275);
  assert.equal(ranking(s)[0], 50);
});
test("Crystal Bags explicit tables, risk choices, target EV and deterministic resume", () => {
  for (let r = 0; r < 5; r++) {
    let evs = Object.keys({
      Safe: 1,
      Balanced: 1,
      Risky: 1,
      Jackpot: 1,
      Chaos: 1,
    }).map((name) => {
      let table = bagTable(name, r);
      assert.equal(
        table.reduce((a, [p]) => a + p, 0),
        100,
      );
      assert.ok(table.every(([, v]) => Number.isInteger(v)));
      return table.reduce((a, [p, v]) => a + (p * v) / 100, 0);
    });
    assert.ok(Math.max(...evs) - Math.min(...evs) <= 0.3);
  }
  assert.deepEqual(bagTable("Jackpot", 0), [
    [90, 0],
    [8, 5],
    [2, 80],
  ]);
  let s = create("crystal-bags", "rewarded", {}, 7);
  for (let r = 0; r < 5; r++) {
    assert.equal(new Set(s.offers).size, 3);
    let a = { type: "bag", bag: s.offers[0] };
    assert.deepEqual(step(s, a, r), step(s, a, r));
    s = step(s, a, r);
  }
  assert.equal(s.done, true);
  assert.equal(s.choices.length, 5);
  assert.equal(ranking(s), null);
});
test("2048 standard merge, score, replay and validation", () => {
  assert.deepEqual(
    move2048([2, 2, 2, 2, ...Array(12).fill(0)], "left").board.slice(0, 4),
    [4, 4, 0, 0],
  );
  assert.equal(move2048([2, 2, 2, 2, ...Array(12).fill(0)], "left").score, 8);
  let a = create("gem-2048", "practice", {}, 13),
    b = structuredClone(a);
  for (let direction of ["left", "up", "right", "down", "left"])
    if (move2048(a.board, direction).changed) {
      a = step(a, { type: "move", direction }, 1);
      b = step(b, { type: "move", direction }, 1);
    }
  assert.deepEqual(a, b);
  assert.throws(() => step(a, { type: "move", direction: "cheat" }, 2));
});
test("Prospector hidden coordinates, frozen clues, refund and efficiency", () => {
  let s = create("prospector", "practice", {}, 42);
  assert.ok(!("deposits" in visible(s)));
  assert.ok(visible(s).discoveries.every((d) => d.position === null));
  for (let i of [...s.deposits])
    s = step(s, { type: "dig", x: i % 10, y: Math.floor(i / 10) }, 1);
  assert.equal(s.score, 4700 + 2000);
  assert.equal(s.digs, 20);
  assert.equal(s.done, true);
});
test("Explosive board budgets, deterministic chain replay, no sixth bomb", () => {
  for (let seed = 1; seed < 100; seed++) {
    let s = create("explosive-mining", "practice", {}, seed);
    assert.ok(s.total >= 3900 && s.total <= 4249);
    let b = structuredClone(s);
    for (let i = 0; i < 5 && !s.done; i++) {
      s = step(s, { type: "bomb", x: i * 2, y: i * 2 }, i);
      b = step(b, { type: "bomb", x: i * 2, y: i * 2 }, i);
    }
    assert.deepEqual(s, b);
    assert.ok(s.done);
    assert.throws(() => step(s, { type: "bomb", x: 0, y: 0 }, 10));
  }
});
test("Perfect Strike validates timing, never rating, final base and streak", () => {
  let s = create("perfect-strike", "practice");
  let now = 0;
  for (let i = 0; i < 10; i++) {
    let period = i === 9 ? 650 : i < 3 ? 1800 : i < 6 ? 1300 : 950;
    let elapsed = period / 2;
    now += 2500 + elapsed;
    s = step(s, { type: "strike", elapsed, rating: "MISS" }, now);
  }
  assert.equal(s.score, 15500);
  assert.equal(s.perfects, 10);
  assert.equal(s.longest, 10);
  assert.throws(() =>
    step(
      create("perfect-strike", "practice"),
      { type: "strike", elapsed: 900 },
      100,
    ),
  );
  assert.equal(strikeRating(0, 0), "MISS");
});
test("Price hidden actual values, timeout, formulas, immutable replay", () => {
  let s = create(
    "price-is-right",
    "practice",
    {},
    1,
    0,
    [{ name: "Quartz", rarity: 2, base_weight: 100, value_per_gram: 0.0575 }],
    [{ name: "Polished", multiplier: 2 }],
  );
  assert.ok(!("questions" in visible(s)));
  assert.ok(!("actual" in visible(s).specimen));
  let actual = s.questions[0].actual;
  s = step(s, { type: "guess", value: actual }, 1000);
  assert.equal(s.score, 1000);
  s = step(s, { type: "next" }, 1000);
  s = step(s, { type: "guess", value: s.questions[1].actual }, 17000);
  assert.equal(s.score, 1000);
  assert.equal(s.answers[1].accuracy, 0);
});
test("Stack seeded 7-bag, hold, drops and replay", () => {
  let s = create("gem-stack", "practice", {}, 87);
  assert.equal(new Set([s.piece.type, ...s.queue.slice(0, 6)]).size, 7);
  let b = structuredClone(s);
  for (let i = 0; i < 50 && !s.done; i++) {
    let a = { type: i % 2 ? "hard" : "left" };
    s = step(s, a, i * 100);
    b = step(b, a, i * 100);
  }
  assert.deepEqual(s, b);
  assert.ok(s.done);
  let h = step(create("gem-stack", "practice"), { type: "hold" }, 1);
  assert.throws(() => step(h, { type: "hold" }, 2));
});
test("Arcade cannot claim scores or backdate entire run", () => {
  let s = create("gem-catcher", "practice", {}, 3);
  assert.throws(() =>
    step(s, { type: "inputs", inputs: [{ t: 1, x: 0.5 }] }, 80000),
  );
  assert.throws(() => step(s, { type: "score", score: 1e9 }, 90000));
  s = step(s, { type: "inputs", inputs: [], score: 1e9 }, 90000);
  assert.equal(s.score, 0);
  assert.equal(s.done, true);
});
test("Ore swipe spans requests and path segments; TNT invalidates the entire combo", () => {
  let s = create("ore-slicer", "practice");
  s.events = [
    { id: 0, t: 0, x: 0.3, fall: 1000, kind: "gem", value: 100 },
    { id: 1, t: 0, x: 0.7, fall: 1000, kind: "gem", value: 100 },
    { id: 2, t: 0, x: 0.9, fall: 1000, kind: "hazard", value: 0 },
  ];
  s = step(
    s,
    {
      type: "inputs",
      inputs: [
        { t: 500, x: 0.1, y: 0.5, swipe: 1 },
        { t: 500, x: 0.5, y: 0.5, swipe: 1 },
      ],
      end: false,
    },
    500,
  );
  assert.equal(s.sliced, 1);
  assert.equal(s.score, 0);
  s = step(
    s,
    {
      type: "inputs",
      inputs: [{ t: 500, x: 0.95, y: 0.5, swipe: 1 }],
      end: true,
    },
    500,
  );
  assert.equal(s.sliced, 2);
  assert.equal(s.score, 0);
  assert.equal(s.lives, 2);
  assert.throws(() =>
    step(
      s,
      {
        type: "inputs",
        inputs: [{ t: 501, x: 0.5, y: 0.5, swipe: 1 }],
        end: true,
      },
      501,
    ),
  );
});

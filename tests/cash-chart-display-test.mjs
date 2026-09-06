import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chartBounds, niceTicks, largeMoney, historyWindow } from "../global-cash-graph/chartMath.js";

const now = 1800000000000;
for (const hours of [1, 6, 24, 168]) {
  const fresh = historyWindow([{ t: now - 60000 }], hours, now);
  assert.equal(fresh.end - fresh.start, hours * 3600000);
  assert.equal(fresh.partial, true);
  assert.equal(historyWindow([{ t: now - hours * 3600000 + 300000 }], hours, now).partial, false);
}
const single = historyWindow([{ t: now }], 100000, now);
assert.ok(single.end > single.start);
const all = historyWindow([{ t: now - 86400000 }, { t: now }], 100000, now);
assert.equal(all.start, now - 86400000);

for (const values of [[0, 0], [100, 100], [866770690274325000, 866770690274325000], [5e9, 866770690274325000], [8e17, 3e17]]) {
  const [min, max] = chartBounds(values);
  assert.ok(Number.isFinite(min) && Number.isFinite(max) && max > min);
  const ticks = niceTicks(min, max);
  assert.ok(ticks.length > 0 && ticks.length <= 32);
  assert.ok(ticks.every(Number.isFinite));
  assert.equal(new Set(ticks).size, ticks.length);
  for (const value of values) assert.ok(Number.isFinite((value - min) / (max - min)));
}
assert.deepEqual(niceTicks(1, 1), []);
assert.equal(largeMoney(866770690274325000), "$866.8Qa");
assert.equal(largeMoney(1e18), "$1.0Qi");
const css = readFileSync(new URL("../global-cash-graph/graph.css", import.meta.url), "utf8");
assert.match(css, /\.market__status\[hidden\],\s*\.market__tooltip\[hidden\]\s*\{\s*display: none;/);
const graph = readFileSync(new URL("../global-cash-graph/graph.js", import.meta.url), "utf8");
assert.match(graph, /chartBounds\(values\)/);
assert.match(graph, /if \(id !== requestId\) return;/);
assert.match(graph, /rows\.map\(\(r\) => r\[metric\]\)/);
console.log("Cash chart display checks passed.");

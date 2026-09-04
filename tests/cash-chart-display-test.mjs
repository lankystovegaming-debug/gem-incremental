import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chartBounds, niceTicks, largeMoney } from "../global-cash-graph/chartMath.js";

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
assert.match(graph, /rows\.map\(\(r\) => r\[metric\]\)/);
console.log("Cash chart display checks passed.");

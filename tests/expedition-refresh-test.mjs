import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startExpeditionRefresh } from "../src/ui/expeditionRefresh.js";

const events = new Map();
let tick, delay, cleared = false, busy = false, calls = 0, release;
const host = {
  document: {
    visibilityState: "visible",
    addEventListener: (key, fn) => events.set(key, fn),
    removeEventListener: key => events.delete(key)
  },
  setInterval: (fn, ms) => { tick = fn; delay = ms; return 1; },
  clearInterval: () => { cleared = true; },
  addEventListener: (key, fn) => events.set(key, fn),
  removeEventListener: key => events.delete(key)
};
const stop = startExpeditionRefresh(async () => {
  calls++;
  await new Promise(resolve => { release = resolve; });
}, () => busy, host);
assert.equal(delay, 30000);
const first = tick();
await tick();
assert.equal(calls, 1, "overlapping timer requests are suppressed");
release();
await first;
busy = true;
await tick();
assert.equal(calls, 1);
busy = false;
const resumed = events.get("focus")();
assert.equal(calls, 2);
release();
await resumed;
const next = tick();
assert.equal(calls, 3, "polling does not depend on having a run");
release();
await next;
stop();
assert.ok(cleared);
assert.equal(events.size, 0);
for (const file of ["expeditions/expeditions.js", "crystal-caverns/crystal-caverns.js", "volcanic-depths/volcanic-depths.js"]) {
  const source = readFileSync(new URL("../" + file, import.meta.url), "utf8");
  assert.match(source, /startExpeditionRefresh\(/);
  assert.doesNotMatch(source, /setInterval\(/);
}
console.log("Expedition refresh checks passed.");

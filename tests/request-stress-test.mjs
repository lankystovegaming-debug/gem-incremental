import assert from "node:assert/strict";
import { runRequestStress } from "../src/ui/cli/requestStress.js";

const sentAt = [];
const result = await runRequestStress(12, async () => {
  sentAt.push(performance.now());
  return { error: sentAt.length % 4 === 0 ? new Error("test") : null };
}, { durationMs: 120, concurrency: 3 });

assert.equal(result.sent, 12);
assert.equal(result.succeeded, 9);
assert.equal(result.failed, 3);
assert.equal(result.timedOut, false);
assert.ok(sentAt.at(-1) - sentAt[0] >= 80, "requests should be spread over the window");

let active = 0;
let peak = 0;
const timedOut = await runRequestStress(1000, (signal) => new Promise((resolve) => {
  active += 1;
  peak = Math.max(peak, active);
  signal.addEventListener("abort", () => {
    active -= 1;
    resolve({ error: new Error("aborted") });
  }, { once: true });
}), { durationMs: 25, concurrency: 4 });

assert.equal(timedOut.timedOut, true);
assert.equal(timedOut.sent, 4);
assert.equal(timedOut.succeeded, 0);
assert.equal(timedOut.failed, 0);
assert.equal(peak, 4);
assert.equal(active, 0);

await assert.rejects(() => runRequestStress(0, async () => ({})), RangeError);
console.log("request stress checks passed");

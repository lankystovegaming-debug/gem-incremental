import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const edge = read("../supabase/functions/roll/index.ts");
const docs = read("../docs/roll-timing-telemetry.md");

for (const phase of [
  "roll_prepare_context_ms",
  "lease_claim_ms",
  "rng_js_ms",
  "bundle_route_roll_ms",
  "roll_autocraft_deposit_ms",
  "inventory_insert_ms",
  "commit_equipment_roll_ms",
  "roll_finish_bookkeeping_critical_ms",
  "roll_finish_bookkeeping_background_ms",
  "roll_finish_bookkeeping_loss_ms"
]) {
  assert.match(edge, new RegExp(`recordRollPhase\\([^;]+${phase}`), phase);
}

assert.match(edge, /ROLL_TIMING_SAMPLE_RATE/);
assert.match(edge, /Math\.min\(1, Math\.max\(0, parsed\)\)/);
assert.match(edge, /\[ROLL_TIMING\]/);
assert.match(edge, /segment: "response"/);
assert.match(edge, /segment: "waitUntil"/);
assert.match(edge, /batch_size: batchSize/);
assert.match(edge, /background_awaited: batchSize > 1/);
assert.match(edge, /subrollTiming\.total_ms/);
assert.match(edge, /lease_release_ms/);
assert.match(edge, /whole_invocation_ms/);
assert.match(edge, /response_path_ms/);
assert.doesNotMatch(edge, /from\(["']roll_(?:timing|telemetry)/i);

assert.match(docs, /ROLL_TIMING_SAMPLE_RATE/);
assert.match(docs, /single roll/i);
assert.match(docs, /batch/i);
assert.match(docs, /waitUntil/);
assert.match(docs, /does not contain a player ID/i);

console.log("Roll timing sampling, phase coverage, response/background split and telemetry documentation checks passed.");

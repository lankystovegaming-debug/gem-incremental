import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../main.js", import.meta.url), "utf8");
const renderRoll = source.slice(
  source.indexOf("function renderRoll(data, outcome)"),
  source.indexOf("function renderHistory") > 0
    ? source.indexOf("function renderHistory")
    : source.indexOf("// =========================================================\n// ROLL")
);

assert.match(renderRoll, /const baseWeight = Number\(data\?\.gem\?\.baseWeight/);
assert.match(renderRoll, /const finalWeight = Number\(data\?\.finalWeight/);
assert.match(renderRoll, /finalWeight \/ baseWeight/);
assert.match(renderRoll, /formatMultiplier\(finalWeightMultiplier\)/);
assert.doesNotMatch(renderRoll, /formatMultiplier\(data\.weightMultiplier\)/);

const finalMultiplier = ({ baseWeight, finalWeight, naturalMultiplier }) => {
  const base = Number(baseWeight);
  const final = Number(finalWeight);
  return Number.isFinite(base) && base > 0 && Number.isFinite(final)
    ? final / base
    : Number(naturalMultiplier ?? 0);
};

assert.equal(finalMultiplier({ baseWeight: 3, finalWeight: 7.2, naturalMultiplier: 1.2 }), 2.4);
assert.equal(finalMultiplier({ baseWeight: 0, finalWeight: 7.2, naturalMultiplier: 1.2 }), 1.2);

console.log("Roll final-weight multiplier display checks passed.");

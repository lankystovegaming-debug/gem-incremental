import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const statsBackend = read("src/backend/cloudDebug.js");
const statsUi = read("debug/debug.js");
const statsCss = read("debug/debug.css");
const roll = read("supabase/functions/roll/index.ts");

for (const stat of ["luck", "rollSpeed", "weightLuck", "weightMultiplier"]) {
  assert.match(statsBackend, new RegExp(`${stat}: \\[\\{ label: "Base"`));
}

assert.match(statsBackend, /recordAddition\("luck", label, itemLuck\)/);
assert.match(statsBackend, /recordMultiplier\("luck", "Research", researchLuckMultiplier\)/);
assert.match(statsBackend, /recordAddition\("luck", "Active potion", effectValue\)/);
assert.match(statsBackend, /recordAddition\("luck", "Charged one-roll potion", oneRollLuck\)/);
assert.match(statsBackend, /recordMultiplier\("luck", adminEventLabel, adminLuckMultiplier\)/);
assert.match(statsBackend, /recordMultiplier\("luck", "Guild upgrade", guildLuckMultiplier\)/);
assert.match(statsBackend, /breakdown: statBreakdown/);
assert.match(statsUi, /function bonusBreakdown/);
assert.match(statsUi, /cloudState\.stats\.breakdown\?\.\[key\]/);
assert.match(statsCss, /\.bonus-breakdown/);

// This QoL change must not replace or de-optimize the server roll pipeline.
assert.match(roll, /Run independent post-commit systems concurrently/);
assert.match(roll, /await Promise\.all\(\[/);

console.log("Stats source breakdown checks passed.");

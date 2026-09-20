import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../gem-index/index.js", import.meta.url), "utf8");

assert.match(
  source,
  /function hasDiscoveredGem\(gemName\)[\s\S]*record\.gemName === gemName/,
  "secret gem discovery must be based on any recorded mutation combination"
);
assert.match(
  source,
  /!record && isSecretGem\(entry\.gem\) && !secretLocked[\s\S]*Gem discovered; this exact mutation combination has not been found yet\./,
  "a discovered secret gem must reveal its identity even when the selected combination is unrolled"
);
assert.match(
  source,
  /<span class="index-card__key">Combination found<\/span><span class="index-card__val">Not yet<\/span>/,
  "the revealed card must not attribute another mutation combination's totals to the selected combination"
);
assert.match(
  source,
  /function displayedAsDiscovered\(entry\)[\s\S]*isSecretGem\(entry\.gem\) && hasDiscoveredGem\(entry\.gem\.name\)/,
  "tier and filter discovery state must agree with the revealed secret card"
);

console.log("Gem Index secret discovery checks passed.");

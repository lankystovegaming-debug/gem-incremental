import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rollFunction = readFileSync(
  new URL("../supabase/functions/roll/index.ts", import.meta.url),
  "utf8"
);
const inventory = readFileSync(
  new URL("../inventory/inventory.js", import.meta.url),
  "utf8"
);

assert.match(
  rollFunction,
  /const announcedLuck = luck;/,
  "chat should use the same final effective Luck as the roll and debug page"
);
assert.doesNotMatch(rollFunction, /luck \/ adminLuckFactor/);
assert.equal(
  (rollFunction.match(/luck_at_roll: announcedLuck/g) ?? []).length,
  3,
  "all announcement paths should use effective announced Luck"
);
assert.match(
  rollFunction,
  /p_luck_at_roll: announcedLuck/,
  "the announcement mutation RPC should receive effective announced Luck"
);
assert.doesNotMatch(
  rollFunction,
  /luck_at_roll: baseLuck|p_luck_at_roll: baseLuck/,
  "rare-roll chat must not discard legitimate potion Luck"
);
assert.match(
  rollFunction,
  /const effectiveRollSpeed =[\s\S]*?rollSpeed \* eventContext\.rollSpeedMultiplier[\s\S]*?adminRollSpeedBonus[\s\S]*?adminRollSpeedMultiplier[\s\S]*?volcanicRollSpeedMultiplier;/,
  "the server roll lease must include event Roll Speed"
);
assert.match(
  rollFunction,
  /rollWeightMultiplier\(\s*eventWeightLuck/,
  "admin-modified Weight Luck must feed the authoritative weight RNG"
);
assert.match(
  rollFunction,
  /const finalWeight =[\s\S]*?rolledWeight \*[\s\S]*?weightMultiplier \*/,
  "admin-modified Weight Multiplier must feed final specimen weight"
);
assert.match(
  inventory,
  /Actual chance: \$\{escapeHtml\(\s*inventoryChanceLabel\(gem, mutationIds\)/,
  "inventory should retain mutation-adjusted Actual chance"
);

console.log("Rare-roll Luck display checks passed.");

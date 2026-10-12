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
const rollBookkeeping = readFileSync(
  new URL(
    "../supabase/migrations/20260913102618_optimize_roll_hot_path_v2.sql",
    import.meta.url
  ),
  "utf8"
);

assert.match(
  rollFunction,
  /const announcedLuck = luck;/,
  "chat should use the same final effective Luck as the roll and debug page"
);
assert.doesNotMatch(rollFunction, /luck \/ adminLuckFactor/);
assert.match(
  rollFunction,
  /const bookkeepingPayload = \{[\s\S]*?announcedLuck,/,
  "roll bookkeeping should receive effective announced Luck"
);
assert.equal(
  (rollBookkeeping.match(/p_payload->>'announcedLuck'/g) ?? []).length,
  2,
  "all database announcement paths should use effective announced Luck"
);
assert.match(
  rollBookkeeping,
  /global_chat_announcements[\s\S]*?p_payload->>'announcedLuck'/,
  "mutation-only announcements should receive effective announced Luck"
);
assert.match(
  rollBookkeeping,
  /attach_roll_announcement_mutations\([\s\S]*?p_payload->>'announcedLuck'/,
  "the announcement mutation helper should receive effective announced Luck"
);
assert.doesNotMatch(
  rollBookkeeping,
  /luck_at_roll[^;]*p_payload->>'baseLuck'|attach_roll_announcement_mutations\([\s\S]*?p_payload->>'baseLuck'/,
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

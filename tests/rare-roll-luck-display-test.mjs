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
  /const luckBeforeAdminEvent = luck;[\s\S]*?adminLuckFactor = luck \/ luckBeforeAdminEvent;/,
  "roll should isolate the active admin-event Luck contribution"
);
assert.match(
  rollFunction,
  /const announcedLuck =[\s\S]*?luck \/ adminLuckFactor/,
  "chat Luck should retain player boosts while removing the admin-event factor"
);
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
  inventory,
  /Actual chance: \$\{escapeHtml\(\s*inventoryChanceLabel\(gem, mutationIds\)/,
  "inventory should retain mutation-adjusted Actual chance"
);

console.log("Rare-roll Luck display checks passed.");

import assert from "node:assert/strict";
import fs from "node:fs";
import {
  canonicalEnemyName,
  equipmentGemPower,
  gearChance,
  gearMutationChance,
  mutationWeight,
  parseMutationSummary,
  probability,
  rollEssenceDrops,
  rollMutationTier,
  shouldMutate,
} from "../supabase/functions/dungeons/formulas.js";

assert.equal(probability("84.0%"), 0.84);
assert.equal(probability("1/15K"), 1 / 15_000);

const mutationSummary = parseMutationSummary(
  "Mob mutation chance: 15.00% per mob (region base 10% x zone 1.5). " +
  "Tier split: Common 45.0%, Uncommon 33.5%, Rare 15.0%, Epic 5.4%, Legendary 1.1%.",
);
assert.equal(mutationSummary.chance, 0.15, "overall mutation chance must not be confused with the tier split");
for (const [tier, expected] of Object.entries({
  Common: 0.45, Uncommon: 0.335, Rare: 0.15, Epic: 0.054, Legendary: 0.011,
})) {
  assert(Math.abs(mutationSummary.tiers[tier] - expected) < 1e-12, `${tier} tier split must be preserved`);
}
assert.equal(rollMutationTier(mutationSummary, () => 0), "Common");
assert.equal(rollMutationTier(mutationSummary, () => 0.999), "Legendary");
assert.equal(shouldMutate(mutationSummary, () => 0.149), true);
assert.equal(shouldMutate(mutationSummary, () => 0.15), false);
assert.equal(gearMutationChance(false), 0.03);
assert.equal(gearMutationChance(true), 0.30);

const nonNative = mutationWeight({ best_odds: "1 in 10", native_regions: ["Jun"] }, ["Rft"]);
const native = mutationWeight({ best_odds: "1 in 10", native_regions: ["Rft"] }, ["Rft"]);
assert(nonNative > 0, "non-native mutations must remain possible");
assert.equal(native, nonNative * 3, "native mutations receive weighting without excluding the other 66 mutations");
assert.equal(
  mutationWeight({ best_odds: "1 in 10", native_regions: ["Any"] }, ["Rft"]),
  native,
  "Any-region mutations receive the universal native weighting",
);

const essence = rollEssenceDrops(
  { amount: "4-6 ME", te: "6.99%", se: "12.7%", le: "23.1%", me: "42.0%" },
  1,
  () => 0,
);
assert.deepEqual(essence, [
  { tier: "TE", quantity: 4 }, { tier: "SE", quantity: 4 },
  { tier: "LE", quantity: 4 }, { tier: "ME", quantity: 4 },
], "each lower-case catalog essence field is rolled independently");

const bossRoom = {
  weapon_chance: "0%", armor_chance: "0%",
  gear_chances: {
    "Weapon / boss": "95%", "Armor / boss": "94%",
    "Weapon / add": "81%", "Armor / add": "82%",
  },
};
assert.equal(gearChance(bossRoom, "boss", "weapon"), 0.95);
assert.equal(gearChance(bossRoom, "boss_add", "armor"), 0.82);
assert.equal(gearChance(bossRoom, "mimic", "weapon"), 0);
assert.equal(gearChance({ weapon_chance: "84%", gear_chances: {} }, "enemy", "weapon"), 0.84);
assert.equal(gearChance({ weapon_chance: "84%", gear_chances: { "Weapon / enemy": "84%" } }, "mimic", "weapon"), 0);

assert.equal(canonicalEnemyName("Chronophage (boss)"), "Chronophage");
assert(equipmentGemPower(1188, { quality: "80%", components: 20, level: "+4" }) > 0);

const source = fs.readFileSync(new URL("../supabase/functions/dungeons/index.ts", import.meta.url), "utf8");
assert.match(source, /name: "Dungeon Room Key"/, "room keys must enter a claimable inventory bucket");
assert.match(source, /name: "Mimic"[\s\S]+"Elite"/, "mimic encounters must create a combatant");
assert.doesNotMatch(source, /type:\s*"treasure"/, "unclaimable placeholder treasure must not be emitted");
assert.doesNotMatch(source, /type:\s*"key"/, "unclaimable placeholder keys must not be emitted");
const enemyLootBody = source.match(/async function awardEnemyLoot[\s\S]*?\n}\nfunction awardRoomKey/)?.[0] ?? "";
assert.doesNotMatch(enemyLootBody, /room_key_chance/, "room-key chance must be rolled once per room, not once per enemy");

console.log("Dungeon backend formula tests passed.");

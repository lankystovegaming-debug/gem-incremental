import assert from "node:assert/strict";
import fs from "node:fs";
import {
  borderAdjacentRegion,
  canonicalEnemyName,
  completeBossAddDistribution,
  equipmentGemPower,
  gearChance,
  gearMutationChance,
  mutationWeight,
  parseMutationSummary,
  parseStatMultiplier,
  probability,
  rollEssenceDrops,
  rollMutationTier,
  shouldMutate,
} from "../supabase/functions/dungeons/formulas.js";

assert.equal(probability("84.0%"), 0.84);
assert.equal(probability("1/15K"), 1 / 15_000);
assert.equal(parseStatMultiplier("x43,200"), 43_200);
assert.equal(parseStatMultiplier("not a stat"), null);

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
assert.equal(mutationWeight({ best_odds: "1 in 10", native_regions: ["Rft"] }, ["Rft"], ["Sky"]), nonNative * 2.4);
assert.equal(mutationWeight({ best_odds: "1 in 10", native_regions: ["Sky"] }, ["Rft"], ["Sky"]), nonNative * 1.6);
assert.equal(borderAdjacentRegion(1150), "Time Rift");
assert.equal(borderAdjacentRegion(1151), "Sky Citadel");
assert.equal(borderAdjacentRegion(1188), null);

const bossEncounters = [
  { kind: "1 boss", chance: "96.1%" },
  { kind: "2 bosses", chance: "3.00%" },
  { kind: "3 bosses", chance: "0.720%" },
  { kind: "4 bosses", chance: "0.150%" },
  { kind: "5 bosses", chance: "0.033%" },
  { kind: "0 adds", chance: "0.700%", summary: "Avg enemies", value: "4.57" },
  { kind: "1 add", chance: "1.60%" },
  { kind: "2 adds", chance: "19.4%" },
  { kind: "3 adds", chance: "31.0%" },
  { kind: "4 adds", chance: "27.2%" },
];
const completedAdds = completeBossAddDistribution(bossEncounters);
assert(Math.abs(completedAdds.reduce((sum, row) => sum + row.weight, 0) - 1) < 1e-12);
assert.deepEqual(completedAdds.filter((row) => row.inferred).map((row) => row.kind), ["5 adds", "6 adds"]);
const averageBosses = bossEncounters.slice(0, 5).reduce(
  (sum, row) => sum + Number.parseInt(row.kind, 10) * probability(row.chance),
  0,
) / bossEncounters.slice(0, 5).reduce((sum, row) => sum + probability(row.chance), 0);
const averageAdds = completedAdds.reduce((sum, row) => sum + Number.parseInt(row.kind, 10) * row.weight, 0);
assert(Math.abs(averageBosses + averageAdds - 4.57) < 1e-12, "boss add tail must reproduce the catalog average");

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
assert.match(source, /parseStatMultiplier\(row\.hp\)/, "catalog HP multipliers must drive combat stats");
assert.match(source, /completeBossAddDistribution\(encounterRows\)/, "boss add probability tails must not be discarded");
assert.match(source, /\.in\("status", \["active", "won"\]\)/, "new runs must be blocked while an earlier run is unresolved");

const migration = fs.readFileSync(new URL("../supabase/migrations/20261011232956_prevent_parallel_dungeon_runs.sql", import.meta.url), "utf8");
assert.match(migration, /create unique index[\s\S]*where status in \('active', 'won'\)/i, "parallel starts require a database constraint");

const dungeonUi = fs.readFileSync(new URL("../dungeons/dungeons.js", import.meta.url), "utf8");
assert.match(dungeonUi, /textContent=d\.defeated\?`Defeated/, "defeat text must only be shown after a lethal attack");
assert.match(dungeonUi, /d\.gear\?\.length/, "claim feedback must include claimed gear");

const workbenchUi = fs.readFileSync(new URL("../workbench/workbench.js", import.meta.url), "utf8");
assert.match(workbenchUi, /g\.stats\?\.recipe\|\|g\.stats\?\.name\|\|g\.source_enemy/, "dropped gear must show its item name");

console.log("Dungeon backend formula tests passed.");

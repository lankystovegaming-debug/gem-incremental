import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import recipes from "../src/data/recipes.js";
import { EQUIPMENT_PASSIVES } from "../src/data/equipmentPassives.js";
import { createCraftingState, ensureRecipeProgress, isRequirementComplete } from "../src/logic/crafting.js";

const expected = {
  "eclipse-pickaxe": ["pickaxe", 11, "luck", 16, 500000],
  "singularity-pickaxe": ["pickaxe", 12, "luck", 18, 1100000],
  "transcendent-pickaxe": ["pickaxe", 13, "luck", 21, 2500000],
  "astral-pickaxe": ["pickaxe", 14, "luck", 23, 50000000],
  "celestial-pickaxe": ["pickaxe", 15, "luck", 25, 125000000],
  "eventide-boots": ["boots", 9, "weightLuck", 4.75, 250000],
  "singularity-striders": ["boots", 10, "weightLuck", 5.75, 600000]
  ,"event-horizon-boots": ["boots", 11, "weightLuck", 6.5, 15000000]
  ,"gravitational-boots": ["boots", 12, "weightLuck", 7.25, 40000000]
  ,"riftwoven-bag": ["bag", 9, "weightMultiplier", 0.75, 10000000]
  ,"vault-of-plenty": ["bag", 10, "weightMultiplier", 0.85, 35000000]
  ,"dimensional-vault": ["bag", 11, "weightMultiplier", 0.95, 90000000]
  ,"singularity-vault": ["bag", 12, "weightMultiplier", 1.05, 200000000]
  ,"bottomless-singularity": ["bag", 13, "weightMultiplier", 2, 750000000]
};

for (const [id, [category, tier, stat, bonus, cost]] of Object.entries(expected)) {
  const recipe = recipes.find((entry) => entry.id === id);
  assert.ok(recipe, `${id} exists`);
  assert.equal(recipe.category, category);
  assert.equal(recipe.reward.tier, tier);
  assert.equal(recipe.reward.bonus[stat], bonus);
  assert.equal(recipe.moneyCost, cost);
}

assert.equal(recipes.some((recipe) => recipe.category === "lantern"), false);
assert.deepEqual(
  recipes.filter((recipe) => recipe.category === "pickaxe").map((recipe) => recipe.reward.bonus.rollSpeed),
  [0.05, 0.10, 0.20, 0.30, 0.45, 0.60, 0.80, 1.00, 1.15, 1.30, 1.40, 1.50, 1.60, 1.70, 1.80]
);

assert.deepEqual(recipes.find((recipe) => recipe.id === "astral-pickaxe").requirements, [
  { type: "equipment", equipmentId: "transcendent-pickaxe" },
  { type: "gem-count", gem: "Peridot", amount: 750 },
  { type: "gem-count", gem: "Topaz", amount: 500 },
  { type: "gem-count", gem: "Tourmaline", amount: 250 },
  { type: "gem-count", gem: "Antimatter Crystal", amount: 1 },
  { type: "lifetime-rolls", rolls: 40000 }
]);
assert.deepEqual(recipes.find((recipe) => recipe.id === "celestial-pickaxe").requirements, [
  { type: "equipment", equipmentId: "astral-pickaxe" },
  { type: "gem-count", gem: "Opal", amount: 300 },
  { type: "gem-count", gem: "Zircon", amount: 200 },
  { type: "gem-count", gem: "Moonstone", amount: 150 },
  { type: "gem-count", gem: "Lunar Diamond", amount: 1 },
  { type: "gem-count", gem: "Singularity Shard", amount: 1 },
  { type: "lifetime-rolls", rolls: 60000 }
]);

assert.deepEqual(Object.keys(EQUIPMENT_PASSIVES).sort(), [
  "astral-pickaxe",
  "bottomless-singularity",
  "celestial-pickaxe",
  "dimensional-vault",
  "eclipse-pickaxe",
  "event-horizon-boots",
  "gravitational-boots",
  "riftwoven-bag",
  "singularity-pickaxe",
  "singularity-vault",
  "transcendent-pickaxe",
  "vault-of-plenty"
]);

const rollSource = readFileSync(
  new URL("../supabase/functions/roll/index.ts", import.meta.url),
  "utf8"
);
assert.match(rollSource, /hasMutationResonance/);
assert.match(rollSource, /hasEventHorizon/);
assert.match(rollSource, /hasEnchantConduit/);
assert.match(rollSource, /hasVeinHunter/);
assert.match(rollSource, /random01\(\) < 0\.05/);
assert.match(rollSource, /gem\.rarity >= 10000/);
assert.match(rollSource, /gem\.rarity <= 1000000/);
assert.match(rollSource, /hasRarityResonance/);
assert.match(rollSource, /resonanceBeforeRoll >= 100/);
assert.match(rollSource, /if \(resonanceEmpowered\) luck \*= 3/);
assert.match(rollSource, /gem\.affectedByLuck !== false/);
assert.match(rollSource, /random01\(\) < 0\.15/);
assert.match(rollSource, /surgeReady && hasGravitationalSurge \? 2 \/ 3 : 1 \/ 3/);
assert.match(rollSource, /surgeReady && hasGravitationalSurge \? 10 : null/);
assert.match(rollSource, /naturalWeight >= 0\.90 && naturalWeight <= 1\.10/);
assert.match(rollSource, /compressionProgress >= 50/);
assert.match(rollSource, /bagPassiveWeightFactor/);

const migration = readFileSync(
  new URL("../supabase/migrations/20260828160000_pickaxe_t14_t15_rollspeed.sql", import.meta.url),
  "utf8"
);
assert.match(migration, /rarity_resonance integer not null default 0/);
assert.match(migration, /update public\.player_equipment/);

const lateGameMigration = readFileSync(
  new URL("../supabase/migrations/20260828050518_late_game_boots_bags.sql", import.meta.url),
  "utf8"
);
assert.match(lateGameMigration, /gravitational_surge_ready boolean not null default false/);
assert.match(lateGameMigration, /bag_compression_progress integer not null default 0/);
assert.match(lateGameMigration, /best_rare_natural_weight_1m double precision not null default 0/);
assert.match(lateGameMigration, /original_t13_legacy boolean not null default false/);
assert.match(lateGameMigration, /new\.original_t13_legacy := true/);

const t13 = recipes.find((recipe) => recipe.id === "bottomless-singularity");
assert.equal(t13.description, "At some point, calling this a bag stopped making sense.");
assert.deepEqual(t13.requirements.slice(-3), [
  { type: "gem-count", gem: "Unlucky Gem", amount: 10 },
  { type: "lifetime-rolls", rolls: 400000 },
  { id: "bottomless-singularity-heavy-rare", type: "roll-history-condition", label: "Rolled a 1/1,000,000+ base-rarity specimen at ≥8× natural weight", minimumRarity: 1000000, minimumWeightMultiplier: 8 }
]);

const t13State = createCraftingState();
const t13Progress = ensureRecipeProgress(t13State, t13);
for (const requirement of t13.requirements) {
  if (requirement.type === "gem-count") t13Progress[requirement.gem] = requirement.amount;
}
const t13Inventory = {
  equipment: [{ id: "singularity-vault" }],
  totalRolls: 400000,
  bestRareNaturalWeight1m: 8
};
assert.equal(
  t13.requirements.every((requirement, index) =>
    isRequirementComplete(t13State, t13, requirement, index, t13Inventory)
  ),
  true,
  "the original T13 remains technically craftable when every gate is met"
);
const historyGate = t13.requirements.at(-1);
assert.equal(isRequirementComplete(t13State, t13, historyGate, t13.requirements.length - 1, {
  ...t13Inventory,
  bestRareNaturalWeight1m: 7.999
}), false);

console.log("Equipment tier tests passed.");

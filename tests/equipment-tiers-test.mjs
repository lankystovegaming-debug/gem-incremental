import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import recipes from "../src/data/recipes.js";
import { EQUIPMENT_PASSIVES } from "../src/data/equipmentPassives.js";

const expected = {
  "eclipse-pickaxe": ["pickaxe", 11, "luck", 16, 500000],
  "singularity-pickaxe": ["pickaxe", 12, "luck", 18, 1100000],
  "transcendent-pickaxe": ["pickaxe", 13, "luck", 21, 2500000],
  "astral-pickaxe": ["pickaxe", 14, "luck", 23, 50000000],
  "celestial-pickaxe": ["pickaxe", 15, "luck", 25, 125000000],
  "eventide-boots": ["boots", 9, "weightLuck", 4.75, 250000],
  "singularity-striders": ["boots", 10, "weightLuck", 5.75, 600000]
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
  "celestial-pickaxe",
  "eclipse-pickaxe",
  "singularity-pickaxe",
  "transcendent-pickaxe"
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

const migration = readFileSync(
  new URL("../supabase/migrations/20260828160000_pickaxe_t14_t15_rollspeed.sql", import.meta.url),
  "utf8"
);
assert.match(migration, /rarity_resonance integer not null default 0/);
assert.match(migration, /update public\.player_equipment/);

console.log("Equipment tier tests passed.");

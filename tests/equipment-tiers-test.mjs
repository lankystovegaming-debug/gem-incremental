import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import recipes from "../src/data/recipes.js";
import { EQUIPMENT_PASSIVES } from "../src/data/equipmentPassives.js";

const expected = {
  "eclipse-pickaxe": ["pickaxe", 11, "luck", 16, 500000],
  "singularity-pickaxe": ["pickaxe", 12, "luck", 18, 1100000],
  "transcendent-pickaxe": ["pickaxe", 13, "luck", 21, 2500000],
  "event-horizon-lantern": ["lantern", 9, "rollSpeed", 2.1, 175000],
  "singularity-lantern": ["lantern", 10, "rollSpeed", 2.4, 400000],
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

assert.deepEqual(Object.keys(EQUIPMENT_PASSIVES).sort(), [
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

console.log("Equipment tier tests passed.");

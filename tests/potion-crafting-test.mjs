import assert from "node:assert/strict";
import recipes from "../src/data/recipes.js";
import {
  createCraftingState,
  ensureRecipeProgress,
  isRequirementComplete,
  manuallyDepositRequirement
} from "../src/logic/crafting.js";

const potionRecipes = recipes.filter((recipe) => recipe.category === "potion");
assert.equal(potionRecipes.length, 8);
assert.ok(potionRecipes.every((recipe) => recipe.reward.type === "consumable"));

const fortune = recipes.find((recipe) => recipe.id === "fortune-potion-2");
const fortuneState = createCraftingState();
const fortuneSpecial = fortune.requirements[2];
const fortuneInventory = {
  equipment: [],
  consumables: [{ consumable_id: "fortune-potion-1", quantity: 2 }],
  gems: [
    { locked: false, gem: { name: "Quartz", rarity: 1 }, weightMultiplier: 1.99, finalWeight: 100, value: 1 },
    { locked: false, gem: { name: "Quartz", rarity: 1 }, weightMultiplier: 2, finalWeight: 100, value: 1 }
  ]
};
assert.equal(manuallyDepositRequirement(fortuneState, fortune, fortuneInventory, 2), true);
assert.equal(fortuneInventory.gems.length, 1);
assert.equal(fortuneInventory.gems[0].weightMultiplier, 1.99);
assert.equal(isRequirementComplete(fortuneState, fortune, fortuneSpecial, 2, fortuneInventory), true);

const mass = recipes.find((recipe) => recipe.id === "mass-potion-2");
const massState = createCraftingState();
const massInventory = {
  equipment: [], consumables: [],
  gems: [
    { locked: false, gem: { name: "Quartz", rarity: 1 }, weightMultiplier: 1, finalWeight: 4000, value: 1 },
    { locked: false, gem: { name: "Garnet", rarity: 50 }, weightMultiplier: 1, finalWeight: 3600, value: 1 }
  ]
};
assert.equal(manuallyDepositRequirement(massState, mass, massInventory, 2), true);
assert.equal(manuallyDepositRequirement(massState, mass, massInventory, 2), true);
assert.equal(ensureRecipeProgress(massState, mass)["mass-potion-2-weight"], 7600);
assert.equal(isRequirementComplete(massState, mass, mass.requirements[2], 2, massInventory), true);

const lucky = recipes.find((recipe) => recipe.id === "lucky-potion-2");
assert.equal(isRequirementComplete(createCraftingState(), lucky, lucky.requirements[0], 0, {
  equipment: [], consumables: [{ consumable_id: "lucky-potion-1", quantity: 2 }]
}), true);

console.log("Potion crafting tests passed.");

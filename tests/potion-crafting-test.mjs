import assert from "node:assert/strict";
import recipes from "../src/data/recipes.js";
import {
  createCraftingState,
  ensureRecipeProgress,
  isRequirementComplete,
  manuallyDepositRequirement
} from "../src/logic/crafting.js";

const potionRecipes = recipes.filter((recipe) => recipe.category === "potion");
assert.equal(potionRecipes.length, 10);
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

// Consumable requirements are OWNERSHIP-based: owning enough of the
// required potion satisfies it (the server consumes them at craft time).
// They are never deposited — depositing would empty the bag and the
// craft's ownership check would then fail (consumables_not_owned).
const lucky = recipes.find((recipe) => recipe.id === "lucky-potion-2");
const luckyState = createCraftingState();
const luckyInventory = {
  equipment: [],
  consumables: [{ consumable_id: "lucky-potion-1", quantity: 2 }],
  gems: []
};

// Owning 2 satisfies the "2x Lucky Potion I" requirement immediately.
assert.equal(
  isRequirementComplete(luckyState, lucky, lucky.requirements[0], 0, luckyInventory),
  true
);
// Consumables are not depositable, and ownership is untouched.
assert.equal(manuallyDepositRequirement(luckyState, lucky, luckyInventory, 0), false);
assert.equal(luckyInventory.consumables[0].quantity, 2);

console.log("Potion crafting tests passed.");

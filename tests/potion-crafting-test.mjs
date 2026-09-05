import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import recipes from "../src/data/recipes.js";
import {
  createCraftingState,
  ensureRecipeProgress,
  isRequirementComplete,
  manuallyDepositRequirement
} from "../src/logic/crafting.js";

const potionRecipes = recipes.filter((recipe) => recipe.category === "potion");
assert.equal(potionRecipes.length, 16);
assert.ok(potionRecipes.every((recipe) => recipe.reward.type === "consumable"));

const admin = readFileSync(new URL("../supabase/functions/admin/index.ts", import.meta.url), "utf8");
const manualDeposit = readFileSync(new URL("../supabase/functions/manual-deposit/index.ts", import.meta.url), "utf8");
const backendMigration = readFileSync(new URL("../supabase/migrations/20260904140000_tier4_potion_backend_catalog.sql", import.meta.url), "utf8");
const moneyUpMigration = readFileSync(new URL("../supabase/migrations/20260905150000_money_up_potions_auto_sell.sql", import.meta.url), "utf8");
const sellFunction = readFileSync(new URL("../supabase/functions/sell-gem/index.ts", import.meta.url), "utf8");

for (const [id, previousId] of [
  ["lucky-potion-4", "lucky-potion-3"],
  ["speed-potion-4", "speed-potion-3"],
  ["fortune-potion-4", "fortune-potion-3"],
  ["mass-potion-4", "mass-potion-3"]
]) {
  const recipe = recipes.find((entry) => entry.id === id);
  assert.ok(recipe);
  assert.equal(recipe.reward.id, id);
  assert.equal(recipe.reward.tier, 4);
  assert.equal(recipe.requirements[0].consumableId, previousId);
  assert.equal(recipe.requirements[0].amount, 2);
  assert.match(admin, new RegExp(`"${id}"`));
  assert.match(manualDeposit, new RegExp(`"${id}"`));
  assert.match(backendMigration, new RegExp(`'${id}'`));
}

assert.match(backendMigration, /player_boosts_tier_check check \(tier between 1 and 4\)/);
assert.match(backendMigration, /duration_seconds/);

const mutation = recipes.find((recipe) => recipe.id === "mutation-chance-potion-2");
assert.ok(mutation);
assert.equal(mutation.reward.family, "mutationChance");
assert.equal(mutation.reward.effectValue, 1);
assert.equal(mutation.requirements[0].consumableId, "mutation-chance-potion-1");
assert.deepEqual(mutation.requirements.slice(1), [
  { type: "gem-count", gem: "Amethyst", amount: 3 },
  { type: "gem-count", gem: "Chronite", amount: 1 }
]);

const moneyUp = recipes.find((recipe) => recipe.id === "money-up-potion-2");
assert.ok(moneyUp);
assert.equal(moneyUp.reward.family, "moneyUp");
assert.equal(moneyUp.reward.effectValue, 0.5);
assert.equal(moneyUp.requirements[0].consumableId, "money-up-potion-1");
assert.deepEqual(moneyUp.requirements.slice(1), [
  { type: "gem-count", gem: "Pyrite", amount: 3 },
  { type: "gem-count", gem: "random rock i found outside", amount: 3 },
  { type: "gem-count", gem: "focus.", amount: 1 }
]);
assert.match(moneyUpMigration, /'money-up-potion-1'.*'moneyUp'.*0\.25/s);
assert.match(moneyUpMigration, /'money-up-potion-2'.*'moneyUp'.*0\.50/s);
assert.match(moneyUpMigration, /family = 'moneyUp'/);
assert.match(moneyUpMigration, /p_auto_sell boolean/);
assert.match(sellFunction, /autoSell = body\.autoSell === true/);
assert.match(sellFunction, /p_auto_sell: autoSell/);

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

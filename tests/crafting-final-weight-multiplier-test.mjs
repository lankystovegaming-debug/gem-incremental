import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import recipes from "../src/data/recipes.js";
import {
  createCraftingState,
  manuallyDepositRequirement
} from "../src/logic/crafting.js";

const recipe = recipes.find((entry) => entry.id === "singularity-striders");
const requirementIndex = recipe.requirements.findIndex(
  (requirement) => requirement.id === "singularity-heavy-rare"
);
const inventory = {
  equipment: [],
  consumables: [],
  gems: [
    {
      locked: false,
      gem: { name: "Natural Moissanite", rarity: 110000, baseWeight: 1275 },
      weightMultiplier: 2.67895011673681,
      finalWeight: 6148.19051791099,
      value: 221334.86
    }
  ]
};

assert.equal(
  manuallyDepositRequirement(
    createCraftingState(),
    recipe,
    inventory,
    requirementIndex
  ),
  true,
  "the displayed 4.822x final multiplier should satisfy the 4x requirement"
);
assert.equal(inventory.gems.length, 0);

for (const path of [
  "supabase/functions/manual-deposit/index.ts",
  "supabase/functions/roll/index.ts"
]) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.match(source, /finalWeight \/ baseWeight/);
  assert.match(source, /weightMultiplier </);
  assert.match(source, /weightMultiplier >/);
}

const manualDeposit = readFileSync(
  new URL("../supabase/functions/manual-deposit/index.ts", import.meta.url),
  "utf8"
);
assert.match(manualDeposit, /rarity,\s+base_weight,\s+rolled_weight_multiplier,/);

console.log("Crafting final weight multiplier checks passed.");

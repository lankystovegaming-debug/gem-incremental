import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import recipes from "../src/data/recipes.js";
import {
  createCraftingState,
  manuallyDepositRequirement
} from "../src/logic/crafting.js";

const recipe = {id:"final-weight-regression",equipmentOverhaul:true,requirements:[{id:"final-heavy",type:"specimen-condition",minimumWeightMultiplier:4,amount:1}]};
const requirementIndex = recipe.requirements.findIndex(
  (requirement) => requirement.id === "final-heavy"
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

const manualDeposit = readFileSync(
  new URL("../supabase/functions/manual-deposit/index.ts", import.meta.url),
  "utf8"
);
assert.match(manualDeposit, /finalWeight\s*\/\s*baseWeight/);
assert.match(manualDeposit, /weightMultiplier\s*</);
assert.match(manualDeposit, /weightMultiplier\s*>/);
assert.match(manualDeposit, /rarity,\s+base_weight,\s+rolled_weight_multiplier,/);

const roll = readFileSync(
  new URL("../supabase/functions/roll/index.ts", import.meta.url),
  "utf8"
);
assert.match(roll, /\.rpc\("roll_route_result",\s*\{[\s\S]*?p_specimen:\s*specimen/);

const rollAutoCraft = readFileSync(
  new URL(
    "../supabase/migrations/20260913233627_optimize_roll_autocraft_hot_path.sql",
    import.meta.url
  ),
  "utf8"
);
assert.match(rollAutoCraft, /v_final_weight\s*\/\s*v_base_weight/);
assert.match(
  rollAutoCraft,
  /v_weight_multiplier\s*>=\s*\(v_requirement->>'minimumWeightMultiplier'\)::numeric/
);
assert.match(
  rollAutoCraft,
  /v_weight_multiplier\s*<=\s*\(v_requirement->>'maximumWeightMultiplier'\)::numeric/
);

console.log("Crafting final weight multiplier checks passed.");

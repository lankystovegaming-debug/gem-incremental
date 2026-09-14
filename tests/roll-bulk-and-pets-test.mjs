import assert from "node:assert/strict";
import { equipmentTotals } from "../supabase/functions/roll/equipmentRules.js";
import { getMaximumBatchSize, isBatchSizeUnlocked, renderBatchOptions } from "../src/logic/batchRolling.js";


const totals = equipmentTotals([
  { category: "pickaxe", equipment_id: "celestial-pickaxe" },
  { category: "petGear", roll_bulk_bonus: 4, pet_luck_bonus: 3 }
]);
assert.equal(totals.rollBulk, 4);
assert.equal(totals.petLuck, 3);

const access = { genuineRolls: 500000, hasCelestialPickaxe: true, rollBulk: 4 };
assert.equal(getMaximumBatchSize(access), 8);
assert.equal(isBatchSizeUnlocked(4, access), true);
assert.equal(isBatchSizeUnlocked(8, access), true);
assert.equal(isBatchSizeUnlocked(9, access), false);
assert.match(renderBatchOptions(access), /×8/);
console.log("roll bulk tests passed");

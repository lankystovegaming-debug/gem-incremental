import assert from "node:assert/strict";
import { MASTERWORK_PASSIVES, masterworkLevelCost, masterworkRerollCost } from "../src/data/masterwork.js";

assert.deepEqual(masterworkLevelCost(10, 5), { money: 40_000_000, enchant: 10, ancient: 3 });
assert.deepEqual(masterworkLevelCost(13, 5), { money: 80_000_000, enchant: 15, ancient: 5 });
assert.equal(Object.keys(MASTERWORK_PASSIVES.pickaxe).length, 4);
assert.equal(Object.keys(MASTERWORK_PASSIVES.lantern).length, 4);
assert.equal(Object.keys(MASTERWORK_PASSIVES.boots).length, 4);
assert.equal(masterworkLevelCost(9, 6), null);
assert.deepEqual(masterworkRerollCost(13, 4, "imprint"), { money: 150_000_000, enchant: 9, ancient: 3 });

console.log("Masterwork Forge tests passed.");

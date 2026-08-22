import assert from "node:assert/strict";
import { chanceDenominator } from "../src/logic/chances.js";

const gem = { name: "Quartz", rarity: 100 };
assert.equal(Math.round(chanceDenominator(gem, ["prismatic", "celestial"])), 2_500_000_000);
assert.ok(Math.round(chanceDenominator({ ...gem, rarity: 100_000 }, [])) >= 100_000);
assert.ok(Math.round(chanceDenominator({ ...gem, rarity: 99_999 }, [])) < 100_000);
assert.ok(chanceDenominator(gem, ["gilded", "prismatic"]) >= 1_000_000);
console.log("chat rarity tests passed");

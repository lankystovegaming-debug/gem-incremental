import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const roll = read("supabase/functions/roll/index.ts");
const enchanting = read("supabase/functions/enchant-equipment/index.ts");
const descriptions = read("src/data/enchants.js");

assert.match(roll, /enchantGrade === "ancient" \? 5 : 7/);
assert.match(roll, /enchantGrade === "ancient" \? 0\.10 : 0\.05/);
assert.match(roll, /enchantGrade === "ancient" \? 0\.08 : 0\.05/);
assert.match(roll, /enchantState\.remaining = 3/);
assert.match(roll, /completion \* \(enchantGrade === "ancient" \? 0\.25 : 0\.12\)/);
assert.match(roll, /strengthenEnchantMultiplier\(1\.5\)/);
assert.match(roll, /enchantGrade === "ancient" \? 1\.6 : 1\.4/);
assert.match(roll, /gem\.rarity >= \(enchantGrade === "ancient" \? 10000 : 5000\)/);
assert.match(roll, /enchantState\.remaining = enchantGrade === "ancient" \? 6 : 4/);
assert.match(roll, /if \(outcome < 0\.08\)/);
assert.match(roll, /else if \(outcome < 0\.12\)/);
assert.match(roll, /enchantGrade === "ancient" \? 10 : 20/);
assert.match(roll, /gem\.rarity >= 30000/);
assert.match(roll, /Math\.max\(0\.5, 1\.75 - rolls \* 0\.025\)/);
assert.match(roll, /gem\.rarity >= 10000\) \|\| rolls >= 100/);

assert.match(enchanting, /"geologist", "prospectors_instinct", "jackpot_mining", "blitz_vein"/);
assert.match(enchanting, /"prospectors_instinct", "vein_hunter", "jackpot_mining", "blitz_vein"/);
assert.match(enchanting, /"slow_starter"/);
assert.match(descriptions, /Up to 1\.25x Luck/);
assert.match(descriptions, /Slow Starter/);

console.log("Enchant rebalance checks passed.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../crafting/crafting.js", import.meta.url),
  "utf8"
);

const depositFlow = source.match(
  /async function depositRequirementFully[\s\S]*?\n}\n\n\nfunction wireRecipeCard/
)?.[0] ?? "";

assert.match(depositFlow, /data\?\.progress/);
assert.match(depositFlow, /state\.crafting\.progress\[recipeId\] = data\.progress/);
assert.doesNotMatch(depositFlow, /renderRecipes\(\)/);

const singleDepositAction = source.match(
  /for \(const button of card\.querySelectorAll\('\[data-action="deposit"\]'\)\)[\s\S]*?\/\/ Deposit into every remaining requirement/
)?.[0] ?? "";
const depositAllAction = source.match(
  /\/\/ Deposit into every remaining requirement[\s\S]*?\n    \}\);\n}/
)?.[0] ?? "";

assert.match(singleDepositAction, /renderRecipeInPlace\(/);
assert.match(depositAllAction, /renderRecipeInPlace\(/);
assert.doesNotMatch(singleDepositAction, /await refresh\(\)/);
assert.doesNotMatch(depositAllAction, /await refresh\(\)/);

assert.match(source, /window\.scrollTo\(scrollX, scrollY\)/);
assert.match(source, /focus\(\{ preventScroll: true \}\)/);

console.log("Crafting deposit in-place UI checks passed.");

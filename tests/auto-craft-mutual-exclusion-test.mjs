import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const crafting = await readFile(new URL("../crafting/crafting.js", import.meta.url), "utf8");

assert.match(crafting, /function stopPotionAutoCraft\(\)[\s\S]*setAutoPotionRecipeId\(null\)[\s\S]*clearInterval\(potionAutoTimer\)/);
assert.match(crafting, /async function setEquipmentAutoCraft\(recipeId\)[\s\S]*setCloudAutoCraft\(recipeId\)[\s\S]*stopPotionAutoCraft\(\)/);

const impossibleToggle = crafting.slice(crafting.indexOf("#impossibleAutoToggle"), crafting.indexOf("#impossiblePrepareFinal"));
assert.match(impossibleToggle, /setEquipmentAutoCraft\(result\?\.autoCraft \? null : 'impossible-pickaxe'\)/);

const recipeCard = crafting.slice(crafting.indexOf("function wireRecipeCard"), crafting.indexOf("autoBannerClear.addEventListener"));
assert.match(recipeCard, /setEquipmentAutoCraft\(enabled \? null : recipeId\)/);

console.log("auto-craft mutual exclusion checks passed");

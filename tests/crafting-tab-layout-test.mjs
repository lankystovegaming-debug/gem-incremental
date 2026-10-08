import assert from "node:assert/strict";
import recipes from "../src/data/recipes.js";
import {
  BASE_PICKAXE_IDS,
  getCraftingSection,
  isSpecialistUnlocked,
  specialistUnlock
} from "../src/logic/craftingTabs.js";

const section = (id) => getCraftingSection(recipes.find((recipe) => recipe.id === id));

assert.equal(BASE_PICKAXE_IDS.size, 16);
assert.deepEqual(section("crude-pickaxe"), { group: "pickaxes", subcategory: null });
assert.deepEqual(section("celestial-pickaxe"), { group: "pickaxes", subcategory: null });
assert.deepEqual(section("paradox-pickaxe"), { group: "pickaxes", subcategory: null });
assert.deepEqual(
  recipes.filter((recipe) => getCraftingSection(recipe).group === "pickaxes").map((recipe) => recipe.id),
  [...BASE_PICKAXE_IDS]
);

assert.deepEqual(section("tectonic-pickaxe"), { group: "specialists", subcategory: "t15" });
assert.deepEqual(section("fortune-pickaxe"), { group: "specialists", subcategory: "t15" });
assert.deepEqual(section("empyrean-pickaxe"), { group: "specialists", subcategory: "t16" });
assert.deepEqual(section("supersizer-pickaxe"), { group: "specialists", subcategory: "t16" });

assert.deepEqual(section("three-leaf-clover"), { group: "secondary", subcategory: "clover" });
assert.deepEqual(section("singularity-lantern"), { group: "secondary", subcategory: "lantern" });
assert.deepEqual(section("miners-boots"), { group: "secondary", subcategory: "boots" });
assert.deepEqual(section("worn-bag"), { group: "secondary", subcategory: "bag" });

assert.deepEqual(section("toy-shovel"), { group: "others", subcategory: "toys" });
assert.deepEqual(section("pet-luck-collar"), { group: "others", subcategory: "petGear" });
assert.deepEqual(section("lucky-potion-2"), { group: "others", subcategory: "potion" });

assert.equal(isSpecialistUnlocked("t15", []), false);
assert.equal(isSpecialistUnlocked("t15", [{ equipment_id: "celestial-pickaxe" }]), true);
assert.equal(isSpecialistUnlocked("t16", [{ equipment_id: "celestial-pickaxe" }]), false);
assert.equal(isSpecialistUnlocked("t16", [{ equipment_id: "paradox-pickaxe" }]), true);
assert.equal(specialistUnlock("t15").message, "LOCKED - Craft the Celestial pickaxe to unlock");
assert.equal(specialistUnlock("t16").message, "LOCKED - Craft the Paradox pickaxe to unlock");

console.log("Crafting tabs passed: base pickaxes, specialist tiers and locks, secondary equipment, and all Others subtabs are routed correctly.");

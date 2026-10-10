export const BASE_PICKAXE_IDS = new Set([
  "crude-pickaxe",
  "reinforced-pickaxe",
  "polished-pickaxe",
  "refined-pickaxe",
  "masterwork-pickaxe",
  "mythic-pickaxe",
  "aether-pickaxe",
  "voidbreaker-pickaxe",
  "veteran-pickaxe",
  "ascendant-pickaxe",
  "eclipse-pickaxe",
  "singularity-pickaxe",
  "transcendent-pickaxe",
  "astral-pickaxe",
  "celestial-pickaxe",
  "paradox-pickaxe"
]);

export const CRAFTING_SUBTABS = {
  specialists: ["t15", "t16"],
  secondary: ["clover", "lantern", "boots", "bag"],
  others: ["toys", "petGear", "potion"]
};

export const DEFAULT_CRAFTING_SUBTAB = {
  specialists: "t15",
  secondary: "clover",
  others: "toys"
};

export function getCraftingSection(recipe) {
  const tab = recipe.craftingTab ?? recipe.category;

  if (recipe.category === "potion") return { group: "others", subcategory: "potion" };
  if (tab === "limited-time") return { group: "limited-time", subcategory: null };
  if (["clover", "lantern", "boots", "bag"].includes(tab)) {
    return { group: "secondary", subcategory: tab };
  }
  if (["toys", "petGear"].includes(tab)) {
    return { group: "others", subcategory: tab };
  }
  if (BASE_PICKAXE_IDS.has(recipe.id)) {
    return { group: "pickaxes", subcategory: null };
  }
  if (recipe.category === "pickaxe") {
    return {
      group: "specialists",
      subcategory: Number(recipe.reward?.tier ?? 15) <= 15 ? "t15" : "t16"
    };
  }

  return { group: tab, subcategory: null };
}

export function specialistUnlock(subcategory) {
  return subcategory === "t16"
    ? { equipmentId: "paradox-pickaxe", message: "LOCKED - Craft the Paradox pickaxe to unlock" }
    : { equipmentId: "celestial-pickaxe", message: "LOCKED - Craft the Celestial pickaxe to unlock" };
}

export function isSpecialistUnlocked(subcategory, equipment = []) {
  const { equipmentId } = specialistUnlock(subcategory);
  return equipment.some((item) => (item.equipment_id ?? item.id) === equipmentId);
}

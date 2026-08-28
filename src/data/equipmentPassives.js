export const EQUIPMENT_PASSIVES = {
  "eclipse-pickaxe": {
    name: "Mutation Resonance",
    description: "1.10x mutation activation chances."
  },
  "singularity-pickaxe": {
    name: "Event Horizon",
    description: "1.10x Luck toward gems with base rarity of 1/100,000+."
  },
  "transcendent-pickaxe": {
    name: "Enchant Conduit",
    description: "Increases the strength of this pickaxe's enchant by 10%."
  },
  "astral-pickaxe": {
    name: "Vein Hunter",
    description: "5% chance for a 1/10,000–1/1,000,000 base-rarity gem to grant a second copy with independently rolled weight and mutations."
  },
  "celestial-pickaxe": {
    name: "Rarity Resonance",
    description: "Luck-based rolls worse than 1/100,000 build Resonance. At 100, the next eligible roll gets 3x final Luck."
  }
};

export function getEquipmentPassive(equipmentId) {
  return EQUIPMENT_PASSIVES[equipmentId] ?? null;
}

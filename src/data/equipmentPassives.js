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
  }
};

export function getEquipmentPassive(equipmentId) {
  return EQUIPMENT_PASSIVES[equipmentId] ?? null;
}

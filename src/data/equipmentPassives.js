export const EQUIPMENT_PASSIVES = {
  "event-horizon-vault": {"name": "Gravitational Storage", "description": "Every 100th genuine roll receives +25% final weight."},
  "omnidimensional-vault": {"name": "Conservation", "description": "Each ordinary gem-count deposit has a 10% chance to preserve its gem. Special specimens are always consumed."},
  "plastic-shopping-bag": {"name": "Reusable / Bag for Life", "description": "12.5% Conservation. Every 67th genuine roll has a 1/67 chance of a harmless bagged cosmetic."},
  "neutron-boots": {"name": "Crushing Pressure", "description": "Natural ≥2× weight tails use 36% continuation."},
  "spacetime-walkers": {"name": "Heavy Step", "description": "Every 50th genuine roll adds 10 percentage points to the final ≥2× tail-entry chance."},
  "reality-breakers": {"name": "Reality Collapse", "description": "Every 100th genuine roll guarantees a ≥2× tail with 40% continuation."},
  "empyrean-pickaxe": {"name": "Celestial Alignment", "description": "Every 100th genuine roll receives 1.5× effective Luck."},
  "eternity-pickaxe": {"name": "Eternity", "description": "Every 250th genuine roll receives 2× effective Luck and 1.5× mutation chance."},

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
  },
  "event-horizon-boots": { name: "Heavy Footing", description: "Specimens that naturally enter the 2×+ tail have a 15% chance to advance exactly one additional whole weight tier." },
  "gravitational-boots": { name: "Gravitational Surge", description: "Every 100 rolls charges a persistent Surge. The next natural 2×+ specimen uses a 2/3 continuation chance, capped at 10×." },
  "riftwoven-bag": { name: "Overflow", description: "Natural weight of 3× or more grants +10% final weight." },
  "vault-of-plenty": { name: "Precious Cargo", description: "Base-rarity 1/100,000+ gems receive +12.5% final weight." },
  "dimensional-vault": { name: "Perfect Fit", description: "Natural weight from 0.90× through 1.10× receives +20% final weight." },
  "singularity-vault": { name: "Compression", description: "Every 50th roll receives +25% final weight. Progress persists between sessions." },
  "bottomless-singularity": { name: "Event Horizon", description: "Gems at ≥5× final weight receive +10% final sell value." }
};

export function getEquipmentPassive(equipmentId) {
  return EQUIPMENT_PASSIVES[equipmentId] ?? null;
}

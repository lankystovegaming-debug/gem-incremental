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

// Secondary passives are retired; Plastic is the sole exception.
for (const id of Object.keys(EQUIPMENT_PASSIVES)) {
 if (!id.endsWith('pickaxe') && id !== 'plastic-shopping-bag') delete EQUIPMENT_PASSIVES[id];
}
Object.assign(EQUIPMENT_PASSIVES, {
 'reality-shifter': {name:'Reality Shift',description:'Every 500th genuine roll with this Toy gains ×400 Luck and independently has a 20% chance of Shifted: ×35 value. Ordinary mutations are disabled. Progress persists when switched out.'},
 'bedrock-pickaxe': {name:'From the Ground Up',description:'Genuine Common / Uncommon / Rare rolls gain 2 / 3 / 5 Foundation. At 100, reset and empower the next 10 genuine rolls: ×1.50 Luck, ×1.25 Weight Luck, ×1.10 Weight Multiplier. Foundation pauses during the burst; all progress persists. Use Max Luck to gather low-tier materials.'},
 'all-in-pickaxe': {name:'All-In',description:'Ignores every personal and external buff. Admin Events alone remain. Flat-luck gems have 4× probability. Equipment stays equipped; potion timers continue.'},
 'all-rounder-toy': {name:'Balanced',description:'Each genuine roll has an independent 1/20 chance of Balanced: ×1.2 value, stacking with ordinary mutations.'},
 'jackpot-slot': {name:'Jackpot / House Edge',description:'Independent Luck multipliers: 1/77 ×0.77; 1/777 ×1.77; every 7th genuine roll ×0.77; every 777th ×7.77. House Edge: 0.77% of genuine rolls give no gem or reward, but still count for progression.'},
 'money-pickaxe': {name:'Cheap Taste',description:'Only Common and Rare-range gems below 1/100 can roll. Buffs cannot bypass this ceiling.'},
 'empyrean-pickaxe': {name:'Ascension',description:'Every 1,000 genuine Empyrean rolls, the next 10 add +50 to the enchant component. Exclusive Ascended mutation: 1/400, ×2 value.'},
 'eternity-pickaxe': {name:'Eternal Surge',description:'Every 1,000 genuine Eternity rolls, the next 10 add +50 mutation chance. Mutations stack independently.'},
 'tectonic-pickaxe': {name:'Deep Pressure / Crushing Depth',description:'Light natural specimens build Pressure. At 100, the next 5 genuine rolls use 40% tail entry and 45% continuation. No guaranteed heavy result.'},
 'the-accelerator': {name:'Velocity / Breakneck',description:'Spools to 3.8× speed after 200 rolls. Switching pickaxe resets the spool. At full Overdrive, 1/100 genuine rolls grants an extra nonrecursive roll.'},
 'the-resonator': {name:'Resonance',description:'1.25× Special Gem Chance. Discovering a Special Gem builds permanent per-gem Resonance, up to 1.875× chance.'},
 'the-excavator': {name:'Excavation / Archaeology',description:'1/40 genuine rolls grants a potion alongside the gem. Permanent mastery improves loot quality. Exclusive Relic Potions boost normal secondary bonuses for 60s.'},
 'toy-shovel': {name:'Wrong Tool / Close Enough',description:'1/67 genuine rolls borrows a random endgame pickaxe’s stats only. On that proc, another 1/67 uses 67× Luck, 6.7× mutation and Weight Luck, and 2.67× weight.'},
 'silly-fun-happy-pickaxe': {name:'Silly / Happy',description:'Independent effects: 50% Silly ×0.5, 10% Silly ×10, 0.5% Happy ×50. All can stack on the same specimen.'}
});
export function getEquipmentPassive(equipmentId) {
 return EQUIPMENT_PASSIVES[equipmentId] ?? null;
}

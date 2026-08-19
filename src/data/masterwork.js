export const MASTERWORK_PASSIVES = {
  pickaxe: {
    deep_survey: { name: "Deep Survey", description: "1.05x Luck toward gems with base rarity of 1/100,000+." },
    mutation_resonance: { name: "Mutation Resonance", description: "1.05x mutation activation chances." },
    careful_extraction: { name: "Careful Extraction", description: "1.10x weight on gems with base rarity of 1/100,000+." },
    steady_hand: { name: "Steady Hand", description: "1.03x final specimen weight." }
  },
  lantern: {
    overclocked_flame: { name: "Overclocked Flame", description: "1.05x total Roll Speed." },
    potion_afterglow: { name: "Potion Afterglow", description: "Roll Speed potion bonuses are 10% stronger." },
    focused_beam: { name: "Focused Beam", description: "+3% base Luck." },
    flashpoint: { name: "Flashpoint", description: "Every 250th roll receives 1.25x Roll Speed." }
  },
  boots: {
    heavy_step: { name: "Heavy Step", description: "1.08x weight on gems with base rarity of 1/100,000+." },
    sure_footing: { name: "Sure Footing", description: "1.03x final specimen weight." },
    fortune_walker: { name: "Fortune Walker", description: "1.05x Weight Luck." },
    trailblazer: { name: "Trailblazer", description: "1.15x weight when discovering a new gem." }
  }
};

export const MASTERWORK_ATTUNEMENTS = {
  amplified: { name: "Amplified", description: "All enchants are 3% stronger." },
  resonant: { name: "Resonant", description: "Shared enchants are 5% stronger." },
  specialized: { name: "Specialized", description: "Relic-exclusive enchants are 5% stronger." }
};

const LEVEL_COSTS = [
  null,
  { money: 1_000_000, enchant: 2, ancient: 0 },
  { money: 2_500_000, enchant: 4, ancient: 0 },
  { money: 6_000_000, enchant: 6, ancient: 1 },
  { money: 15_000_000, enchant: 8, ancient: 1 },
  { money: 40_000_000, enchant: 10, ancient: 3 }
];

export function masterworkTierMultipliers(tier) {
  if (tier >= 13) return { money: 2, enchant: 1.5, ancient: 1.4 };
  if (tier === 12) return { money: 1.6, enchant: 1.3, ancient: 1.2 };
  if (tier === 11) return { money: 1.25, enchant: 1.15, ancient: 1 };
  return { money: 1, enchant: 1, ancient: 1 };
}

export function masterworkLevelCost(tier, nextLevel) {
  const base = LEVEL_COSTS[nextLevel];
  if (!base) return null;
  const scale = masterworkTierMultipliers(tier);
  return {
    money: Math.ceil(base.money * scale.money),
    enchant: Math.ceil(base.enchant * scale.enchant),
    ancient: Math.ceil(base.ancient * scale.ancient)
  };
}

export function masterworkRerollCost(tier, rerolls = 0, mode = "reroll") {
  const money = [2_000_000, 3_500_000, 6_000_000, 10_000_000, 15_000_000][Math.min(Math.max(0, rerolls), 4)];
  const enchant = [2, 3, 4, 5, 6][Math.min(Math.max(0, rerolls), 4)];
  const scale = masterworkTierMultipliers(tier);
  return {
    money: Math.ceil(money * scale.money * (mode === "imprint" ? 5 : 1)),
    enchant: Math.ceil(enchant * scale.enchant),
    ancient: mode === "insight" ? 1 : mode === "imprint" ? 3 : 0
  };
}

export function masterworkAttunementCost(tier) {
  const scale = masterworkTierMultipliers(tier);
  return { money: Math.ceil(10_000_000 * scale.money), enchant: Math.ceil(5 * scale.enchant), ancient: Math.ceil(scale.ancient) };
}

export function masterworkPassive(category, id) {
  return MASTERWORK_PASSIVES[category]?.[id] ?? null;
}

export const RELICS = {
  "Enchant Relic": { grade: "normal", chance: 1 / 250 },
  "Ancient Relic": { grade: "ancient", chance: 1 / 1500 }
};

export const ENCHANTS = {
  deep_strike: {
    name: "Deep Strike",
    normal: "Every 7th roll gains 1.35x Luck.",
    ancient: "Every 5th roll gains 1.5x Luck."
  },
  lucky_break: {
    name: "Lucky Break",
    normal: "5% chance to reroll once and keep the rarer gem.",
    ancient: "10% chance to reroll once and keep the rarer gem."
  },
  fortune_surge: {
    name: "Fortune Surge",
    normal: "5% chance to give the next 3 rolls 1.35x Luck.",
    ancient: "8% chance to give the next 3 rolls 1.5x Luck."
  },
  collectors_edge: {
    name: "Collector's Edge",
    normal: "Up to 1.12x Luck based on Gem Index completion.",
    ancient: "Up to 1.25x Luck based on Gem Index completion."
  },
  geologist: {
    name: "Geologist",
    normal: "Undiscovered gems are rolled with 1.5x Luck."
  },
  prospectors_instinct: {
    name: "Prospector's Instinct",
    normal: "After finding a 1-in-5,000+ gem, the next 4 rolls gain 1.4x Luck.",
    ancient: "After finding a 1-in-10,000+ gem, the next 6 rolls gain 1.6x Luck."
  },
  vein_hunter: {
    name: "Vein Hunter",
    ancient: "Gain 1% Luck per miss, up to 1.3x; resets on a 1/10,000+ gem."
  },
  jackpot_mining: {
    name: "Jackpot Mining",
    normal: "8% chance for 1.75x Luck and 4% chance for 0.5x Luck.",
    ancient: "8% chance for 2.5x Luck and 4% chance for 0.5x Luck."
  },
  blitz_vein: {
    name: "Blitz Vein",
    normal: "Gain a stack every 20 rolls, up to 10. At maximum: 1.2x Weight Luck, 1.15x Roll Speed, and 1.05x Multiplier. A 1-in-30,000+ gem removes all stacks.",
    ancient: "Gain a stack every 10 rolls, up to 10. At maximum: 1.3x Weight Luck, 1.25x Roll Speed, and 1.1x Multiplier. A 1-in-30,000+ gem removes all stacks."
  },
  slow_starter: {
    name: "Slow Starter",
    ancient: "Starts with a 75% longer cooldown. Each roll reduces it by 2.5 percentage points, down to 50% shorter. Resets every 100 rolls or after a 1-in-10,000+ gem."
  }
};

export function isRelic(gem) {
  return Boolean(RELICS[gem?.gem_name]);
}

export function enchantDescription(id, grade) {
  const enchant = ENCHANTS[id];
  return enchant?.[grade] ?? "Unknown enchant";
}

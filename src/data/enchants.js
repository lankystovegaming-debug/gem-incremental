export const RELICS = {
  "Enchant Relic": { grade: "normal", chance: 1 / 250 },
  "Ancient Relic": { grade: "ancient", chance: 1 / 1500 }
};

export const ENCHANTS = {
  deep_strike: {
    name: "Deep Strike",
    normal: "Every 10th roll gets 1.35x Luck.",
    ancient: "Every 8th roll gets 1.5x Luck."
  },
  lucky_break: {
    name: "Lucky Break",
    normal: "3% chance to reroll once and keep the rarer gem.",
    ancient: "5% chance to reroll once and keep the rarer gem."
  },
  fortune_surge: {
    name: "Fortune Surge",
    normal: "2.5% chance to give the next 3 rolls 1.25x Luck.",
    ancient: "3.5% chance to give the next 4 rolls 1.35x Luck."
  },
  collectors_edge: {
    name: "Collector's Edge",
    normal: "Up to 1.12x Luck based on Gem Index completion.",
    ancient: "Up to 1.2x Luck based on Gem Index completion."
  },
  geologist: {
    name: "Geologist",
    normal: "Undiscovered gems are rolled with 1.3x Luck."
  },
  prospectors_instinct: {
    name: "Prospector's Instinct",
    normal: "After finding a 1/5,000+ gem, the next 3 rolls get 1.25x Luck."
  },
  vein_hunter: {
    name: "Vein Hunter",
    ancient: "Gain 1% Luck per miss, up to 1.3x; resets on a 1/10,000+ gem."
  },
  jackpot_mining: {
    name: "Jackpot Mining",
    ancient: "1% chance for the current roll to get 2.5x Luck."
  }
};

export function isRelic(gem) {
  return Boolean(RELICS[gem?.gem_name]);
}

export function enchantDescription(id, grade) {
  const enchant = ENCHANTS[id];
  return enchant?.[grade] ?? "Unknown enchant";
}

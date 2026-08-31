const POTION_DURATION_MS = 60 * 1000;

const MARKET_REFERENCE_PRICES = {
  "lucky-potion-1": 200,
  "speed-potion-1": 150,
  "fortune-potion-1": 200,
  "mass-potion-1": 300,
  "lucky-potion-2": 40000,
  "speed-potion-2": 30000,
  "fortune-potion-2": 40000,
  "mass-potion-2": 60000,
  "lucky-potion-3": 175000,
  "speed-potion-3": 125000,
  "fortune-potion-3": 175000,
  "mass-potion-3": 250000
};

const consumables = [
  ["lucky", "Lucky", "luck", [0.10, 0.25, 0.50], 200],
  ["speed", "Speed", "rollSpeed", [0.10, 0.25, 0.50], 150],
  ["fortune", "Fortune", "weightLuck", [0.10, 0.25, 0.50], 200],
  ["mass", "Mass", "weightMultiplier", [0.05, 0.15, 0.25], 300]
].flatMap(([slug, name, family, effects, price]) =>
  effects.map((effectValue, index) => ({
    id: `${slug}-potion-${index + 1}`,
    name: `${name} Potion ${["I", "II", "III"][index]}`,
    family,
    tier: index + 1,
    durationMs: POTION_DURATION_MS,
    effectValue,
    marketReferencePrice: MARKET_REFERENCE_PRICES[`${slug}-potion-${index + 1}`] ?? 0,
    shop: {
      purchasable: index === 0,
      price: index === 0 ? price : null
    }
  }))
);

consumables.push(
  {
    id: "legendary-potion",
    name: "Legendary Potion",
    family: "luck",
    tier: 4,
    durationMs: null,
    effectValue: 1000,
    oneRoll: true,
    marketReferencePrice: 0,
    shop: { purchasable: false, price: null }
  },
  {
    id: "mythic-potion",
    name: "Mythic Potion",
    family: "luck",
    tier: 4,
    durationMs: null,
    effectValue: 10000,
    oneRoll: true,
    marketReferencePrice: 0,
    shop: { purchasable: false, price: null }
  }
);

export function getConsumableById(id) {
  return consumables.find((item) => item.id === id) ?? null;
}

export default consumables;

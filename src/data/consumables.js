const POTION_DURATION_MS = 60 * 1000;

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
    shop: {
      purchasable: index === 0,
      price: index === 0 ? price : null
    }
  }))
);

export function getConsumableById(id) {
  return consumables.find((item) => item.id === id) ?? null;
}

export default consumables;

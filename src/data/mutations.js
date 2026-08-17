export const GEM_MUTATIONS = Object.freeze({
  polished: Object.freeze({ id: "polished", name: "Polished", chance: 100, multiplier: 1.5, description: "A clean, reflective finish that makes the gem more desirable." }),
  gilded: Object.freeze({ id: "gilded", name: "Gilded", chance: 500, multiplier: 2.5, description: "Fine golden veins run naturally across the gem's surface." }),
  prismatic: Object.freeze({ id: "prismatic", name: "Prismatic", chance: 2500, multiplier: 5, description: "Its colour shifts continuously across the visible spectrum." }),
  celestial: Object.freeze({ id: "celestial", name: "Celestial", chance: 10000, multiplier: 12, description: "A cold, brilliant glow seems to come from somewhere beyond the sky." }),
  corrupted: Object.freeze({ id: "corrupted", name: "Corrupted", chance: 50000, multiplier: 30, description: "Unstable energy twists the gem into something extraordinarily valuable." })
});

export function getGemMutation(id, savedMultiplier = null) {
  const mutation = GEM_MUTATIONS[id];

  if (!mutation) return null;

  return {
    ...mutation,
    multiplier: Number(savedMultiplier ?? mutation.multiplier)
  };
}

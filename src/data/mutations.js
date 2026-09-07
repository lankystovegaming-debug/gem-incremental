export const GEM_MUTATIONS = Object.freeze({
  'ascended': Object.freeze({id:'ascended',name:'Ascended',chance:400,multiplier:2,exclusive:true}),
  'silly-small': Object.freeze({id:'silly-small',name:'Silly',chance:2,multiplier:.5,exclusive:true}),
  'silly-large': Object.freeze({id:'silly-large',name:'Silly',chance:10,multiplier:10,exclusive:true}),
  'happy': Object.freeze({id:'happy',name:'Happy',chance:200,multiplier:50,exclusive:true}),
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


export function normalizeMutationIds(ids = []) {
  return Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => String(id ?? "").trim().toLowerCase())
        .filter((id) => Boolean(GEM_MUTATIONS[id]))
    )
  ).sort(
    (a, b) =>
      Object.keys(GEM_MUTATIONS).indexOf(a) -
      Object.keys(GEM_MUTATIONS).indexOf(b)
  );
}

export function mutationCombinationKey(ids = []) {
  const normalized = normalizeMutationIds(ids);
  return normalized.length ? normalized.join("+") : "none";
}

export function mutationCombinationLabel(ids = []) {
  const normalized = normalizeMutationIds(ids);
  if (!normalized.length) return "No Mutation";

  return normalized
    .map((id) => GEM_MUTATIONS[id]?.name ?? id)
    .join(" + ");
}

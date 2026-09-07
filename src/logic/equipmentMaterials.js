// Preview only. The database repeats allocation while holding the player's lock.
export function planIncludedMaterial(recipe, progress, specimen, requestedIndex = null) {
  const rarity = Number(specimen.gem?.rarity ?? specimen.rarity);
  const name = specimen.gem?.name ?? specimen.gem_name;
  const base = Number(specimen.gem?.baseWeight ?? specimen.base_weight);
  const weight = Number(specimen.finalWeight ?? specimen.final_weight) / base;
  if (!(base > 0) || !Number.isFinite(weight) || !Number.isFinite(rarity)) return null;
  const matches = r => (!r.gem || r.gem === name)
    && rarity >= (r.minimumRarity ?? 0) && rarity <= (r.maximumRarity ?? Infinity)
    && weight >= (r.minimumWeightMultiplier ?? 0) && weight <= (r.maximumWeightMultiplier ?? Infinity);
  const reqs = recipe.requirements.map((r, i) => ({ ...r, index: i }));
  if (requestedIndex != null && !matches(reqs[requestedIndex])) return null;
  const bulk = reqs.find(r => r.type === 'gem-count' && matches(r) && Number(progress[r.id] ?? 0) < r.amount);
  if (!bulk) return null;
  const next = { ...progress, [bulk.id]: Number(progress[bulk.id] ?? 0) + 1 };
  const slots = reqs.filter(r => r.includedInBulk)
    .sort((a, b) => b.minimumRarity - a.minimumRarity || b.minimumWeightMultiplier - a.minimumWeightMultiplier);
  const slot = slots.find(r => matches(r) && Number(next[r.id] ?? 0) < r.amount);
  if (slot) next[slot.id] = Number(next[slot.id] ?? 0) + 1;
  if (requestedIndex != null && reqs[requestedIndex].includedInBulk && slot?.index !== requestedIndex) return null;
  for (const threshold of slots) {
    const needed = slots.filter(r => r.minimumRarity >= threshold.minimumRarity)
      .reduce((n, r) => n + Math.max(0, r.amount - Number(next[r.id] ?? 0)), 0);
    const space = reqs.filter(r => r.type === 'gem-count' && r.minimumRarity >= threshold.minimumRarity)
      .reduce((n, r) => n + Math.max(0, r.amount - Number(next[r.id] ?? 0)), 0);
    if (needed > space) return null;
  }
  return { progress: next, requirementIndex: slot?.index ?? bulk.index, conservationEligible: !slot };
}

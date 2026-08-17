import gems from "../data/gems.js";
import { GEM_MUTATIONS, normalizeMutationIds } from "../data/mutations.js";

export const BASE_ROLL_LUCK = 1;
const rollableGems = gems.filter((gem) => gem.name !== "Quartz").sort((a,b) => b.rarity-a.rarity);

export function gemRollChance(gemOrName, luck = BASE_ROLL_LUCK) {
  const gem = typeof gemOrName === "string" ? gems.find((entry) => entry.name === gemOrName) : gemOrName;
  if (!gem) return 0;
  const safeLuck = Math.max(0, Number(luck) || 0);
  if (gem.name === "Quartz") return rollableGems.reduce((p,c) => p * (1 - Math.min(safeLuck / c.rarity, 1)), 1);
  const index = rollableGems.findIndex((candidate) => candidate.name === gem.name);
  if (index < 0) return 0;
  const ownChance = Math.min(safeLuck / gem.rarity, 1);
  return rollableGems.slice(0,index).reduce((p,c) => p * (1 - Math.min(safeLuck / c.rarity, 1)), 1) * ownChance;
}

export function mutationChance(id) {
  const mutation = GEM_MUTATIONS[id];
  return mutation ? Math.min(1 / Number(mutation.chance), 1) : 0;
}

export function mutationSelectionChance(ids=[]) {
  return normalizeMutationIds(ids).reduce((p,id) => p * mutationChance(id), 1);
}

export function rolledResultChance(gemOrName, mutationIds=[], luck=BASE_ROLL_LUCK) {
  return gemRollChance(gemOrName, luck) * mutationSelectionChance(mutationIds);
}

export function formatChance(probability) {
  if (!Number.isFinite(probability) || probability <= 0) return "Impossible";
  const denominator = 1 / probability;
  if (denominator > 1e15) return `1 in ${denominator.toExponential(2).replace("e+", "e")}`;
  return `1 in ${Math.max(1, Math.round(denominator)).toLocaleString("en-US")}`;
}

export function chanceLabelForResult(gemOrName, mutationIds=[], luck=BASE_ROLL_LUCK) {
  return formatChance(rolledResultChance(gemOrName, mutationIds, luck));
}

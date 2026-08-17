import gems from "../data/gems.js";
import { GEM_MUTATIONS, normalizeMutationIds } from "../data/mutations.js";

const BASE_ROLL_LUCK = 1;
const mutationList = Object.values(GEM_MUTATIONS);

export function gemRollChanceByName(gemName, luck = BASE_ROLL_LUCK) {
  const safeLuck = Math.max(0, Number(luck) || 0);

  // This intentionally uses ALL server gems, including hidden Lanky Gem.
  // Lanky is checked by the server and its failure probability affects
  // the exact probability of every gem checked after it.
  const rollable = gems
    .filter((gem) => gem.name !== "Quartz")
    .sort((a, b) => b.rarity - a.rarity);

  if (gemName === "Quartz") {
    return rollable.reduce(
      (p, gem) => p * (1 - Math.min(safeLuck / gem.rarity, 1)),
      1
    );
  }

  const index = rollable.findIndex((gem) => gem.name === gemName);
  if (index < 0) return 0;

  const ownChance = Math.min(
    safeLuck / Number(rollable[index].rarity),
    1
  );

  const priorFailures = rollable
    .slice(0, index)
    .reduce(
      (p, gem) => p * (1 - Math.min(safeLuck / gem.rarity, 1)),
      1
    );

  return priorFailures * ownChance;
}

export function mutationChance(id) {
  const mutation = GEM_MUTATIONS[String(id ?? "").toLowerCase()];
  return mutation ? Math.min(1 / Number(mutation.chance), 1) : 0;
}

export function exactMutationCombinationChance(ids = []) {
  const selected = new Set(normalizeMutationIds(ids));

  return mutationList.reduce((p, mutation) => {
    const chance = mutationChance(mutation.id);
    return p * (
      selected.has(mutation.id)
        ? chance
        : (1 - chance)
    );
  }, 1);
}

export function exactRollChance(gemName, mutationIds = [], luck = BASE_ROLL_LUCK) {
  return gemRollChanceByName(gemName, luck) *
    exactMutationCombinationChance(mutationIds);
}

export function formatChance(probability) {
  if (!Number.isFinite(probability) || probability <= 0) return "Impossible";

  const denominator = 1 / probability;

  if (denominator > 1e15) {
    return `1 in ${denominator.toExponential(2).replace("e+", "e")}`;
  }

  return `1 in ${Math.max(1, Math.round(denominator)).toLocaleString("en-US")}`;
}

export function exactRollChanceLabel(gemName, mutationIds = [], luck = BASE_ROLL_LUCK) {
  return formatChance(exactRollChance(gemName, mutationIds, luck));
}

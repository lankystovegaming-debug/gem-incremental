import gems from "../data/gems.js";
import { GEM_MUTATIONS, normalizeMutationIds } from "../data/mutations.js";

export const BASE_ROLL_LUCK = 1;
export const CHAT_CHANCE_THRESHOLD = 1_000_000;
export const EFFECTIVE_CHAT_CHANCE_THRESHOLD = 10_000_000;

// Player-facing odds intentionally use the configured 1 / rarity chance.
// Player/equipment/potion modifiers are ignored here.
// If mutations exist, their individual chances are multiplied by the gem chance.
export function gemRollChance(gemOrName, luck = BASE_ROLL_LUCK) {
  // Accept both bundled gem names and full gem objects. The latter is
  // important for admin-created catalogue gems that are not in gems.js.
  const gem =
    typeof gemOrName === "string"
      ? gems.find((entry) => entry.name === gemOrName)
      : gemOrName;

  if (!gem) return 0;

  const safeLuck = Math.max(0, Number(luck) || 0);
  if (safeLuck <= 0) return 0;

  return Math.min(safeLuck / Number(gem.rarity), 1);
}

export function mutationChance(id) {
  const mutation = GEM_MUTATIONS[id];
  return mutation
    ? Math.min(1 / Number(mutation.chance), 1)
    : 0;
}

export function mutationSelectionChance(ids = []) {
  return normalizeMutationIds(ids).reduce(
    (probability, id) => probability * mutationChance(id),
    1
  );
}

export function rolledResultChance(
  gemOrName,
  mutationIds = [],
  luck = BASE_ROLL_LUCK
) {
  return (
    gemRollChance(gemOrName, luck) *
    mutationSelectionChance(mutationIds)
  );
}

export function chanceDenominator(
  gemOrName,
  mutationIds = [],
  luck = BASE_ROLL_LUCK
) {
  const probability = rolledResultChance(
    gemOrName,
    mutationIds,
    luck
  );

  return probability > 0 ? 1 / probability : Infinity;
}

export function meetsChatChanceThreshold(
  gemOrName,
  mutationIds = [],
  luck = BASE_ROLL_LUCK
) {
  const denominator = chanceDenominator(gemOrName, mutationIds, luck);
  return Number.isFinite(denominator) && denominator >= CHAT_CHANCE_THRESHOLD;
}

export function formatChance(probability) {
  if (!Number.isFinite(probability) || probability <= 0) {
    return "Impossible";
  }

  const denominator = 1 / probability;

  if (denominator > 1e15) {
    return `1 in ${denominator
      .toExponential(2)
      .replace("e+", "e")}`;
  }

  return `1 in ${Math.max(
    1,
    Math.round(denominator)
  ).toLocaleString("en-US")}`;
}

export function chanceLabelForResult(
  gemOrName,
  mutationIds = [],
  luck = BASE_ROLL_LUCK
) {
  return formatChance(
    rolledResultChance(gemOrName, mutationIds, luck)
  );
}

// Live rolls already include the effective rarity calculated by the
// server-authoritative mutation catalog. Prefer it so admin-created mutations
// do not fall back to the five bundled mutation definitions in this client.
export function chanceLabelForRollResult(
  result,
  gemOrName = result?.gem,
  mutationIds = []
) {
  const denominator = Number(result?.effectiveRarity ?? result?.effective_rarity);
  if (Number.isFinite(denominator) && denominator > 0) {
    return formatChance(1 / denominator);
  }
  return chanceLabelForResult(gemOrName, mutationIds);
}

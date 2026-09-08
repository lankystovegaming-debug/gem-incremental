import gems from "../data/gems.js";
import { GEM_MUTATIONS, normalizeMutationIds } from "../data/mutations.js";

export const BASE_ROLL_LUCK = 1;
export const CHAT_CHANCE_THRESHOLD = 1_000_000;
export const EFFECTIVE_CHAT_CHANCE_THRESHOLD = 50_000_000;

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

// Exact denominator arithmetic using BigInt prevents huge mutation combinations
// from overflowing JavaScript Number/Infinity. This is the same class of fix
// decimal.js provides, but keeps the browser bundle dependency-free.
function integerDenominator(value) {
  const text = String(value ?? '').trim();
  if (/^\d+$/.test(text)) return BigInt(text);
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n)) : 1n;
}

export function exactChanceDenominator(gemOrName, mutationIds = []) {
  const gem = typeof gemOrName === 'string' ? gems.find((entry) => entry.name === gemOrName) : gemOrName;
  if (!gem) return null;
  let denominator = integerDenominator(gem.rarity);
  for (const id of normalizeMutationIds(mutationIds)) denominator *= integerDenominator(GEM_MUTATIONS[id]?.chance ?? 1);
  return denominator;
}

export function formatExactDenominator(denominator) {
  if (denominator == null || denominator <= 0n) return 'Impossible';
  const raw = denominator.toString();
  if (raw.length <= 15) return `1 in ${denominator.toLocaleString('en-US')}`;
  const exponent = raw.length - 1;
  const head = raw.slice(0, 3);
  const mantissa = head.length > 1 ? `${head[0]}.${head.slice(1)}` : head;
  return `1 in ${mantissa}e${exponent}`;
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
  const exact = exactChanceDenominator(gemOrName, mutationIds);
  if (exact != null) {
    // Preserve compatibility for callers that need a Number, but never emit Infinity.
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    return exact > max ? Number.MAX_SAFE_INTEGER : Number(exact);
  }
  return 0;
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
  const exactText = result?.effectiveRarityExact ?? result?.effective_rarity_exact;
  if (exactText && /^\d+$/.test(String(exactText))) {
    return formatExactDenominator(BigInt(String(exactText)));
  }
  const exact = exactChanceDenominator(gemOrName, mutationIds);
  if (exact != null) return formatExactDenominator(exact);
  const denominator = Number(result?.effectiveRarity ?? result?.effective_rarity);
  if (Number.isFinite(denominator) && denominator > 0) return formatChance(1 / denominator);
  return chanceLabelForResult(gemOrName, mutationIds);
}

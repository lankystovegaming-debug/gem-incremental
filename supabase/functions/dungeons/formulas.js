export const MUTATION_TIERS = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];

export function probability(value) {
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!text) return 0;
  if (text.endsWith("%")) {
    return Math.max(0, Math.min(1, Number(text.slice(0, -1)) / 100));
  }
  const match = text.match(/^1\s*\/\s*([0-9.]+)\s*([KMBT]?)$/i);
  if (!match) return 0;
  const scales = { "": 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  return 1 / (Number(match[1]) * (scales[match[2].toUpperCase()] ?? 1));
}

export function weighted(items, weight, random = Math.random) {
  const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
  if (total <= 0) return items[0] ?? null;
  let roll = random() * total;
  for (const item of items) {
    roll -= Math.max(0, weight(item));
    if (roll <= 0) return item;
  }
  return items.at(-1) ?? null;
}

export function parseRange(value, fallback = 1, random = Math.random) {
  const range = String(value ?? "").match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/);
  if (range) {
    return Math.floor(Number(range[1]) + random() * (Number(range[2]) - Number(range[1]) + 1));
  }
  const single = String(value ?? "").match(/\d+(?:\.\d+)?/);
  return single ? Math.floor(Number(single[0])) : fallback;
}

export function parseMutationSummary(value) {
  const text = String(value ?? "");
  const chanceMatch = text.match(/Mob mutation chance:\s*([0-9.]+%)/i);
  const tiers = {};
  for (const tier of MUTATION_TIERS) {
    const match = text.match(new RegExp(`${tier}[^%]*?([0-9.]+)%`, "i"));
    if (match) tiers[tier] = Number(match[1]) / 100;
  }
  return { chance: probability(chanceMatch?.[1]), tiers };
}

export function rollMutationTier(summary, random = Math.random) {
  return weighted(MUTATION_TIERS, (tier) => summary?.tiers?.[tier] ?? 0, random);
}

export function shouldMutate(summary, random = Math.random) {
  return random() < (summary?.chance ?? 0);
}

export function gearMutationChance(enemyMutated) {
  return enemyMutated ? 0.30 : 0.03;
}

export function mutationWeight(mutation, regionCodes = []) {
  const nativeRegions = mutation?.native_regions ?? [];
  const isNative = nativeRegions.includes("Any") || nativeRegions.some((code) => regionCodes.includes(code));
  // The generated room sheets use a 3x native-region weight while retaining every mutation in the pool.
  const nativeBoost = isNative ? 3 : 1;
  return (probability(String(mutation?.best_odds ?? "").replace(/^1 in /i, "1/")) || 1) * nativeBoost;
}

export function canonicalEnemyName(value) {
  return String(value ?? "").replace(/\s*\(boss\)$/i, "").trim();
}

export function parseMaterialAmount(value, random = Math.random) {
  return Math.max(1, parseRange(String(value ?? ""), 1, random));
}

export function rollEssenceDrops(row, rankMultiplier = 1, random = Math.random) {
  const amount = parseMaterialAmount(row?.amount, random);
  return ["TE", "SE", "LE", "ME"].flatMap((tier) => {
    const chance = Math.min(1, probability(row?.[tier.toLowerCase()]) * rankMultiplier);
    return random() < chance ? [{ tier, quantity: amount }] : [];
  });
}

export function gearChance(room, role, itemType) {
  const label = itemType === "armor" ? "Armor" : "Weapon";
  const suffix = ({
    boss: "boss",
    boss_add: "add",
    treasure_chest: "chest",
    treasure_guard: "guard",
    enemy: "enemy",
  })[role];
  const configured = suffix ? room?.gear_chances?.[`${label} / ${suffix}`] : null;
  if (configured != null) return probability(configured);
  if (role === "enemy") {
    return probability(itemType === "armor" ? room?.armor_chance : room?.weapon_chance);
  }
  return 0;
}

export function equipmentGemPower(roomNumber, item, mutationMultiplier = 1) {
  const quality = probability(item?.quality);
  const components = Math.max(1, Number(item?.components) || 1);
  const upgrade = Math.max(0, Number.parseInt(String(item?.level ?? "0").replace("+", ""), 10) || 0);
  // Room depth supplies the progression baseline; quality, components, upgrades, and mutation then scale it.
  const base = Math.max(1, Number(roomNumber) || 1) * 100;
  return Math.max(1, Math.round(base * components * quality * (1 + upgrade * 0.05) * mutationMultiplier));
}

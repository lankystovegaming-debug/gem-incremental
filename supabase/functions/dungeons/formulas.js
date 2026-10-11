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

export function parseStatMultiplier(value) {
  const match = String(value ?? "").trim().match(/^x\s*([0-9,.]+)$/i);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

export function mutationWeight(mutation, regionCodes = [], adjacentRegionCodes = [], adjacentShare = 0.30) {
  const nativeRegions = mutation?.native_regions ?? [];
  const universal = nativeRegions.includes("Any");
  const currentNative = nativeRegions.some((code) => regionCodes.includes(code));
  const adjacentNative = nativeRegions.some((code) => adjacentRegionCodes.includes(code));
  // Native weighting is 3x. Border rooms split the 2x bonus 70/30 with the adjacent region.
  const share = Math.max(0, Math.min(1, Number(adjacentShare) || 0));
  const nativeBoost = universal || (currentNative && adjacentNative)
    ? 3
    : currentNative
      ? 1 + 2 * (adjacentRegionCodes.length ? 1 - share : 1)
      : adjacentNative
        ? 1 + 2 * share
        : 1;
  return (probability(String(mutation?.best_odds ?? "").replace(/^1 in /i, "1/")) || 1) * nativeBoost;
}

const BORDER_REGIONS = [
  [181, 200, "Jungle"],
  [201, 213, "Entrance"], [313, 325, "Beach & Sea"],
  [326, 338, "Jungle"], [438, 450, "Mountain"],
  [451, 463, "Beach & Sea"], [563, 575, "Volcano"],
  [576, 583, "Mountain"], [643, 650, "Hell"],
  [651, 665, "Volcano"], [786, 800, "Dragon's Domain"],
  [801, 810, "Hell"], [891, 900, "Abyss"],
  [901, 910, "Dragon's Domain"], [991, 1000, "Sky Citadel"],
  [1001, 1015, "Abyss"], [1136, 1150, "Time Rift"],
  [1151, 1168, "Sky Citadel"], [1313, 1330, "Genesis Core"],
  [1331, 1347, "Time Rift"],
];

export function borderAdjacentRegion(roomNumber) {
  const room = Number(roomNumber);
  return BORDER_REGIONS.find(([start, end]) => room >= start && room <= end)?.[2] ?? null;
}

export function completeBossAddDistribution(encounters = []) {
  const addRows = encounters.filter((entry) => /\badds?\b/i.test(String(entry?.kind)));
  if (!addRows.length) return [];
  const weightedRows = addRows.map((entry) => ({ ...entry, weight: probability(entry.chance) }));
  const explicitMass = weightedRows.reduce((sum, entry) => sum + entry.weight, 0);
  const missingMass = Math.max(0, 1 - explicitMass);
  const averageEnemies = Number(encounters.find((entry) => entry?.summary === "Avg enemies")?.value);
  if (!Number.isFinite(averageEnemies) || missingMass < 1e-6) return weightedRows;

  const bossRows = encounters.filter((entry) => /\bboss(?:es)?\b/i.test(String(entry?.kind)));
  const bossMass = bossRows.reduce((sum, entry) => sum + probability(entry.chance), 0);
  const averageBosses = bossMass > 0
    ? bossRows.reduce((sum, entry) => sum + parseRange(entry.kind, 0, () => 0) * probability(entry.chance), 0) / bossMass
    : 1;
  const explicitAdds = weightedRows.reduce((sum, entry) => sum + parseRange(entry.kind, 0, () => 0) * entry.weight, 0);
  const inferredMean = Math.max(5, (averageEnemies - averageBosses - explicitAdds) / missingMass);
  const lower = Math.floor(inferredMean);
  const upper = Math.ceil(inferredMean);
  if (lower === upper) return [...weightedRows, { kind: `${lower} adds`, weight: missingMass, inferred: true }];
  const upperWeight = missingMass * (inferredMean - lower);
  return [
    ...weightedRows,
    { kind: `${lower} adds`, weight: missingMass - upperWeight, inferred: true },
    { kind: `${upper} adds`, weight: upperWeight, inferred: true },
  ];
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

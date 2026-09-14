export const BATCH_ROLL_OPTIONS = [
  { size: 1, label: "×1", baseCooldownSeconds: 2.5, requirement: "Available by default" },
  { size: 2, label: "×2", baseCooldownSeconds: 5, requirement: "Available by default" },
  { size: 3, label: "×3", baseCooldownSeconds: 7.5, requirement: "100,000 lifetime rolls" },
  { size: 4, label: "×4", baseCooldownSeconds: 10, requirement: "500,000 lifetime rolls + Celestial Pickaxe" }
];

export function normalizeUiBatchSize(value) {
  const size = Number(value);
  return Number.isSafeInteger(size) && size >= 1 && size <= 100 ? size : 1;
}

export function getEquipmentRollBulk(access = {}) {
  return Math.max(0, Math.floor(Number(access.rollBulk ?? 0) || 0));
}

export function getMaximumBatchSize(access = {}) {
  return Math.min(100, 4 + getEquipmentRollBulk(access));
}

export function isBatchSizeUnlocked(size, { totalRolls = 0, genuineRolls = totalRolls, hasCelestialPickaxe = false, rollBulk = 0 } = {}) {
  const normalized = normalizeUiBatchSize(size);
  if (normalized <= 2) return true;
  if (normalized === 3) return Number(genuineRolls) >= 100_000;
  if (normalized === 4) return Number(genuineRolls) >= 500_000 && hasCelestialPickaxe === true;
  return Number(genuineRolls) >= 500_000 && hasCelestialPickaxe === true && normalized <= getMaximumBatchSize({ rollBulk });
}

export function batchRollResults(response) {
  if (Array.isArray(response?.results)) return response.results;
  return response ? [response] : [];
}

export function batchCooldown(response) {
  return response?.cooldown ?? batchRollResults(response).at(-1)?.cooldown ?? null;
}

export function renderBatchOptions(access = {}) {
  const max = getMaximumBatchSize(access);
  const options = [];
  for (let size = 1; size <= max; size++) {
    const unlocked = isBatchSizeUnlocked(size, access);
    let suffix = "base";
    if (size === 1) suffix = "base";
    else if (size === 2) suffix = "base";
    else if (size === 3) suffix = "100,000 lifetime rolls";
    else if (size === 4) suffix = "500,000 lifetime rolls + Celestial Pickaxe";
    else suffix = `Roll Bulk +${size - 4}`;
    options.push(`<option value="${size}" ${unlocked ? "" : "disabled"}>×${size} · ${suffix}</option>`);
  }
  return options.join("");
}

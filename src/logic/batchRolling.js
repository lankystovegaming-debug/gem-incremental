export const BATCH_ROLL_OPTIONS = [
  { size: 1, label: "×1", baseCooldownSeconds: 2.5, requirement: "Available by default" },
  { size: 2, label: "×2", baseCooldownSeconds: 5, requirement: "Available by default" },
  { size: 3, label: "×3", baseCooldownSeconds: 7.5, requirement: "100,000 lifetime rolls" },
  { size: 4, label: "×4", baseCooldownSeconds: 10, requirement: "500,000 lifetime rolls + Celestial Pickaxe" }
];

export function normalizeUiBatchSize(value) {
  const size = Number(value);
  return BATCH_ROLL_OPTIONS.some((option) => option.size === size) ? size : 1;
}

export function isBatchSizeUnlocked(size, { totalRolls = 0, hasCelestialPickaxe = false } = {}) {
  const normalized = normalizeUiBatchSize(size);
  if (normalized <= 2) return true;
  if (normalized === 3) return Number(totalRolls) >= 100_000;
  return Number(totalRolls) >= 500_000 && hasCelestialPickaxe === true;
}

export function batchRollResults(response) {
  if (Array.isArray(response?.results)) return response.results;
  return response ? [response] : [];
}

export function batchCooldown(response) {
  return response?.cooldown ?? batchRollResults(response).at(-1)?.cooldown ?? null;
}

export function renderBatchOptions(access = {}) {
  return BATCH_ROLL_OPTIONS.map((option) => {
    const unlocked = isBatchSizeUnlocked(option.size, access);
    const suffix = unlocked ? `${option.baseCooldownSeconds}s base` : `Locked — ${option.requirement}`;
    return `<option value="${option.size}" ${unlocked ? "" : "disabled"}>${option.label} · ${suffix}</option>`;
  }).join("");
}

import { BESPOKE_CUTSCENES, getCutsceneDefinition, normalizeCutsceneName } from "./cutsceneConfig.js";

function safeJson(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return null; }
}

function mutationIdentity(result) {
  const ids = Array.isArray(result?.mutationIds)
    ? result.mutationIds
    : Array.isArray(result?.mutations)
      ? result.mutations.map((mutation) => mutation?.id)
      : [];
  return ids.filter(Boolean).map(String).sort().join(",");
}

export function cutsceneQueueKey(result = {}) {
  const specimenId = result.specimenId ?? result.specimen_id;
  if (specimenId != null) return `specimen:${specimenId}`;
  const totalRolls = result?.lifetimeStats?.totalRolls ?? result?.lifetime_stats?.total_rolls;
  const name = normalizeCutsceneName(result?.gem?.name ?? result?.gem_name);
  return `roll:${totalRolls ?? "unknown"}:${name}:${mutationIdentity(result)}`;
}

export function cutsceneSceneKey(result = {}) {
  const rarity = Number(result?.gem?.rarity ?? result?.rarity ?? 0);
  const name = normalizeCutsceneName(result?.gem?.name ?? result?.gem_name);
  const definition = getCutsceneDefinition({ rarity, gemName: name });
  return `${name || "unknown"}:${definition?.id ?? definition?.theme ?? "none"}`;
}

export function compareCutsceneItems(left, right) {
  const leftBespoke = BESPOKE_CUTSCENES[normalizeCutsceneName(left?.result?.gem?.name)] ? 1 : 0;
  const rightBespoke = BESPOKE_CUTSCENES[normalizeCutsceneName(right?.result?.gem?.name)] ? 1 : 0;
  if (leftBespoke !== rightBespoke) return rightBespoke - leftBespoke;

  const baseDifference = Number(right?.result?.gem?.rarity ?? 0) - Number(left?.result?.gem?.rarity ?? 0);
  if (baseDifference) return baseDifference;
  const effectiveDifference = Number(right?.result?.effectiveRarity ?? 0) - Number(left?.result?.effectiveRarity ?? 0);
  if (effectiveDifference) return effectiveDifference;
  const rollDifference = Number(left?.result?.lifetimeStats?.totalRolls ?? Number.MAX_SAFE_INTEGER)
    - Number(right?.result?.lifetimeStats?.totalRolls ?? Number.MAX_SAFE_INTEGER);
  if (rollDifference) return rollDifference;
  return String(left?.key ?? "").localeCompare(String(right?.key ?? ""));
}

export function createCutsceneQueueItem(result, queuedAt = Date.now()) {
  const snapshot = safeJson(result);
  if (!snapshot) return null;
  return {
    key: cutsceneQueueKey(snapshot),
    sceneKey: cutsceneSceneKey(snapshot),
    queuedAt,
    result: snapshot
  };
}

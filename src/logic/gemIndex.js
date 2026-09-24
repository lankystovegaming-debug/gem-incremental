const EQUIPMENT_MUTATION_FAMILIES = Object.freeze({
  tryhard: "all-in-pickaxe",
  shifted: "reality-shifter",
  balanced: "all-rounder-toy",
  ascended: "empyrean-pickaxe",
  "silly-small": "silly-fun-happy-pickaxe",
  "silly-large": "silly-fun-happy-pickaxe",
  happy: "silly-fun-happy-pickaxe",
  "supersizer-small": "supersizer-pickaxe",
  "supersizer-big": "supersizer-pickaxe",
  "supersizer-giant": "supersizer-pickaxe",
  "supersizer-massive": "supersizer-pickaxe",
  "supersizer-colossal": "supersizer-pickaxe",
  "supersizer-titanic": "supersizer-pickaxe",
  "supersizer-gargantuan": "supersizer-pickaxe"
});

export function canonicalMutationIds(ids = [], validIds = null) {
  return Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id ?? "").trim().toLowerCase())
    .filter((id) => id && (!validIds || validIds.has(id)))))
    .sort((a, b) => a.localeCompare(b));
}

export function canonicalMutationKey(ids = [], validIds = null) {
  const normalized = canonicalMutationIds(ids, validIds);
  return normalized.length ? normalized.join("+") : "none";
}

export function mutationCombinationIsObtainable(ids = []) {
  const normalized = canonicalMutationIds(ids);
  const equipmentFamilies = new Set(
    normalized.map((id) => EQUIPMENT_MUTATION_FAMILIES[id]).filter(Boolean)
  );
  if (equipmentFamilies.size > 1) return false;

  const supersizerCount = normalized.filter((id) => id.startsWith("supersizer-")).length;
  if (supersizerCount > 1) return false;

  // Reality Shifter disables ordinary mutation RNG on its rolls.
  if (normalized.includes("shifted") && normalized.length > 1) return false;
  return true;
}

export function mutationSourceLabel(ids = []) {
  const normalized = canonicalMutationIds(ids);
  const family = normalized.map((id) => EQUIPMENT_MUTATION_FAMILIES[id]).find(Boolean);
  const labels = {
    "all-in-pickaxe": "All-In Pickaxe only",
    "reality-shifter": "Reality Shifter only",
    "all-rounder-toy": "All-Rounder Toy only",
    "empyrean-pickaxe": "Empyrean Pickaxe only",
    "silly-fun-happy-pickaxe": "Silly Fun Happy Pickaxe only",
    "supersizer-pickaxe": "Supersizer Pickaxe only"
  };
  return labels[family] ?? "";
}

export function indexCombinationRecords(rows = []) {
  const combinations = new Map();
  const discoveredGemNames = new Set();
  for (const row of rows) {
    const mutationIds = canonicalMutationIds(row.mutation_ids ?? []);
    const combinationKey = canonicalMutationKey(mutationIds);
    const key = `${row.gem_name}::${combinationKey}`;
    const existing = combinations.get(key);
    const record = {
      gemName: row.gem_name,
      combinationKey,
      mutationIds,
      mutationMultipliers: row.mutation_multipliers && typeof row.mutation_multipliers === "object"
        ? row.mutation_multipliers
        : {},
      totalFound: Number(row.total_found ?? 0),
      highestValue: Number(row.highest_value ?? 0),
      firstDiscoveredAt: row.first_discovered_at ?? null,
      lastDiscoveredAt: row.last_discovered_at ?? null
    };
    combinations.set(key, existing ? {
      ...record,
      mutationMultipliers: { ...existing.mutationMultipliers, ...record.mutationMultipliers },
      totalFound: existing.totalFound + record.totalFound,
      highestValue: Math.max(existing.highestValue, record.highestValue),
      firstDiscoveredAt: [existing.firstDiscoveredAt, record.firstDiscoveredAt]
        .filter(Boolean).sort()[0] ?? null,
      lastDiscoveredAt: [existing.lastDiscoveredAt, record.lastDiscoveredAt]
        .filter(Boolean).sort().at(-1) ?? null
    } : record);
    discoveredGemNames.add(row.gem_name);
  }
  return { combinations, discoveredGemNames };
}

export function rawCombinationDenominator(gemRarity, mutationIds, mutationById) {
  let denominator = Number(gemRarity);
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  for (const id of canonicalMutationIds(mutationIds)) {
    const chance = Number(mutationById.get(id)?.chance);
    if (!Number.isFinite(chance) || chance <= 0) return null;
    denominator *= chance;
    if (!Number.isFinite(denominator)) return null;
  }
  return Math.max(1, Math.round(denominator));
}

export function availabilityState(gem, now = new Date()) {
  const nowMs = now.getTime();
  const startsMs = gem.startsAt ? Date.parse(gem.startsAt) : null;
  const endsMs = gem.endsAt ? Date.parse(gem.endsAt) : null;
  if (Number.isFinite(startsMs) && nowMs < startsMs) return "upcoming";
  if (Number.isFinite(endsMs) && nowMs >= endsMs) return "expired";
  if (["daily", "date_range_daily"].includes(gem.availabilityMode)) {
    return dailyWindowIsOpen(gem, now) ? "available" : "closed";
  }
  if (gem.availabilityMode === "global_event") return "conditional";
  return "available";
}

function minuteOfDay(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ""));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60 ? hour * 60 + minute : null;
}

export function dailyWindows(gem) {
  const configured = Array.isArray(gem.dailyTimeWindows)
    ? gem.dailyTimeWindows.filter((window) => minuteOfDay(window?.start) != null && minuteOfDay(window?.end) != null)
    : [];
  if (configured.length) return configured;
  return minuteOfDay(gem.dailyStartTime) != null && minuteOfDay(gem.dailyEndTime) != null
    ? [{ start: gem.dailyStartTime, end: gem.dailyEndTime }]
    : [];
}

export function dailyWindowIsOpen(gem, now = new Date()) {
  const windows = dailyWindows(gem);
  if (!windows.length) return false;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: gem.availabilityTimezone || "Asia/Singapore",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    const current = hour * 60 + minute;
    return windows.some((window) => {
      const start = minuteOfDay(window.start);
      const end = minuteOfDay(window.end);
      if (start === end) return true;
      return start < end ? current >= start && current < end : current >= start || current < end;
    });
  } catch {
    return false;
  }
}

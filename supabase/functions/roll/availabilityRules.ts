export type DailyTimeWindow = {
  start: string;
  end: string;
};

type DailyAvailabilityEntry = {
  availability_mode?: unknown;
  availability_timezone?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  daily_start_time?: unknown;
  daily_end_time?: unknown;
  daily_time_windows?: unknown;
};

const DAILY_MODES = new Set(["daily", "date_range_daily"]);

function minuteOfDay(value: unknown): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(value ?? ""));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function validWindow(value: unknown): DailyTimeWindow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (minuteOfDay(candidate.start) == null || minuteOfDay(candidate.end) == null) return null;
  return { start: String(candidate.start), end: String(candidate.end) };
}

export function dailyWindowsForEntry(entry: DailyAvailabilityEntry): DailyTimeWindow[] {
  if (Array.isArray(entry.daily_time_windows)) {
    const configured = entry.daily_time_windows.map(validWindow).filter((window): window is DailyTimeWindow => window != null);
    if (configured.length) return configured;
  }

  const legacy = validWindow({ start: entry.daily_start_time, end: entry.daily_end_time });
  return legacy ? [legacy] : [];
}

export function minuteFallsInWindow(current: number, window: DailyTimeWindow): boolean {
  const start = minuteOfDay(window.start);
  const end = minuteOfDay(window.end);
  if (start == null || end == null) return false;
  if (start === end) return true;
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

export function gemTimeAvailable(entry: DailyAvailabilityEntry, now: Date): boolean {
  if (entry.starts_at && Date.parse(String(entry.starts_at)) > now.getTime()) return false;
  if (entry.ends_at && Date.parse(String(entry.ends_at)) <= now.getTime()) return false;
  if (!DAILY_MODES.has(String(entry.availability_mode))) return true;

  const windows = dailyWindowsForEntry(entry);
  if (!windows.length) return false;

  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: String(entry.availability_timezone || "Asia/Singapore"),
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? NaN);
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? NaN);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
    const current = hour * 60 + minute;
    return windows.some((window) => minuteFallsInWindow(current, window));
  } catch {
    return false;
  }
}

export function mythicPotionExclusiveGem(
  consumableId: unknown,
  random01: () => number
): Record<string, unknown> | null {
  if (String(consumableId ?? "") !== "mythic-potion") return null;
  if (random01() >= 1 / 1000) return null;
  return {
    name: "Zephyrion",
    rarity: 1000,
    baseWeight: 6000,
    valuePerGram: 4000,
    affectedByLuck: false,
    specialGem: true,
    metadata: {
      rarityClass: "anomalous",
      sourceExclusive: true,
      sourceId: "mythic-potion",
      sourceLabel: "Mythic Potion",
      rawChanceDenominator: 1000
    }
  };
}

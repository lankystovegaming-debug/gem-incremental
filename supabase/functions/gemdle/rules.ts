import { buildEventRollContext, eventGemIsEligible, normalizeGlobalEvent } from "../roll/eventRules.ts";

export type Random = () => number;
export const random01: Random = () => {
  const words = crypto.getRandomValues(new Uint32Array(2));
  return ((words[0] >>> 5) * 67108864 + (words[1] >>> 6)) / 9007199254740992;
};
export function singaporeDay(now: Date) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}
export function nextReset(now: Date) {
  return new Date(Date.parse(`${singaporeDay(now)}T00:00:00+08:00`) + 86400000).toISOString();
}

// Exact baseline port of src/logic/weight.js; intentionally independent of roll/index.ts.
export function rollWeight(random: Random = random01): number {
  const between = (a: number, b: number) => a + random() * (b - a);
  if (random() < 0.75) return random() < 0.2 ? between(0.5, 0.85) : between(0.85, 1.1);
  const high = random();
  if (high < 0.6) return between(1.1, 1.5);
  if (high < 0.75) return between(1.5, 2);
  let whole = 2;
  while (random() < 0.5) whole++;
  return between(whole, whole + 1);
}
export function weightContribution(weight: number) {
  if (weight < 2) return 1;
  const whole = Math.floor(weight), fraction = weight - whole;
  // Tail mass above the next integer plus the remaining uniform mass in this band.
  return 16 * 2 ** (whole - 2) / (1 - fraction / 2);
}

export function gemEligible(gem: any, now: Date) {
  if (gem.enabled === false || !(Number(gem.rarity) >= 10) || !Number.isFinite(Number(gem.rarity))) return false;
  if (!(Number(gem.base_weight) > 0) || !Number.isFinite(Number(gem.base_weight))) return false;
  const meta = gem.metadata ?? {};
  if (/seriali copenhageni/i.test(gem.name) || meta.serialDependent || meta.requiresSerial || meta.serial_dependent) return false;
  if (gem.starts_at && !(now.getTime() >= Date.parse(gem.starts_at))) return false;
  if (gem.ends_at && !(now.getTime() < Date.parse(gem.ends_at))) return false;
  if (["daily", "date_range_daily"].includes(gem.availability_mode)) {
    const parse = (s: string) => { const [h, m, sec = 0] = String(s).split(":").map(Number); return h * 3600 + m * 60 + sec; };
    const start = parse(gem.daily_start_time), end = parse(gem.daily_end_time);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    const sgt = new Date(now.getTime() + 8 * 3600000);
    const clock = sgt.getUTCHours() * 3600 + sgt.getUTCMinutes() * 60 + sgt.getUTCSeconds();
    if (!(start === end || (start < end ? clock >= start && clock < end : clock >= start || clock < end))) return false;
  }
  return true;
}

export function selectionProbabilities(pool: any[]) {
  const sorted = [...pool].sort((a, b) => Number(b.rarity) - Number(a.rarity) || Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name)));
  if (!sorted.length) throw new Error("no_gems_available");
  const fallback = sorted.filter(g => g.affected_by_luck !== false).at(-1) ?? sorted.at(-1);
  let remaining = 1;
  const outcomes = sorted.map(gem => {
    const chance = 1 / Math.sqrt(Number(gem.rarity));
    const probability = remaining * chance;
    remaining *= 1 - chance;
    return { gem, probability };
  });
  outcomes.find(row => row.gem === fallback)!.probability += remaining;
  return outcomes;
}

// Integrate random event states (e.g. Totality) into final gem probabilities.
// Only eligibility is reused: no event luck, weight or mutation stat bonuses apply.
export function gemDistribution(catalog: any[], rawEvent: any, now: Date) {
  const event = normalizeGlobalEvent(rawEvent, now.getTime());
  const base = buildEventRollContext(event, () => 0.999999, now.getTime());
  let states = [{ context: base, probability: 1 }];
  if (event && ["total_eclipse", "volatile_veins"].includes(event.eventKey)) {
    const list = (event.config.states ?? []).filter((s: any) => Number(s.weight) > 0);
    const total = list.reduce((sum: number, s: any) => sum + Number(s.weight), 0);
    if (total > 0) states = list.map((s: any) => ({ context: { ...base, state: String(s.key) }, probability: Number(s.weight) / total }));
  }
  const eligible = catalog.filter(g => gemEligible(g, now));
  const combined = new Map<string, any>();
  for (const state of states) {
    const pool = eligible.filter(g => eventGemIsEligible(state.context, { ...g, requiredEventKey: g.required_event_key }));
    for (const row of selectionProbabilities(pool)) {
      const previous = combined.get(row.gem.name);
      combined.set(row.gem.name, { gem: row.gem, probability: (previous?.probability ?? 0) + row.probability * state.probability });
    }
  }
  return [...combined.values()];
}

export function rollMutations(catalog: any[], gem: any, rawEvent: any, now: Date, random: Random) {
  const event = normalizeGlobalEvent(rawEvent, now.getTime());
  const successes: any[] = [];
  // Live catalog currently only has Charged's event gate; also honor explicit future rules.
  for (const m of [...catalog].sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || String(a.id).localeCompare(String(b.id)))) {
    if (m.enabled === false || !(Number(m.chance) > 0) || !Number.isFinite(Number(m.chance))) continue;
    if (m.id === "charged" && event?.eventKey !== "mutation_storm") continue;
    if (m.required_event_key && m.required_event_key !== event?.eventKey) continue;
    if (Array.isArray(m.eligible_gems) && !m.eligible_gems.includes(gem.name)) continue;
    if (successes.some(s => m.excludes?.includes(s.id) || s.excludes?.includes(m.id))) continue;
    const probability = Math.min(1, 1 / Math.sqrt(Number(m.chance))) * (successes.length ? 0.35 : 1);
    if (random() < probability) successes.push({ id: m.id, name: m.name, normal_rarity: Number(m.chance), probability, excludes: m.excludes });
  }
  return successes.map(({ excludes: _excludes, ...mutation }) => mutation);
}
export function badges(gem: any, weight: number, mutations: any[]) {
  const result: string[] = [];
  for (const [threshold, name] of [[1e9, "Secret"], [1e8, "Transcendent"], [1e7, "Cosmic"], [1e6, "Exalted"]] as const) {
    if (Number(gem.rarity) >= threshold) { result.push(name); break; }
  }
  for (const [threshold, name] of [[10, "Titanic"], [8, "Colossal"], [5, "Extreme"], [3, "Massive"], [2, "Heavy"]] as const) {
    if (weight >= threshold) { result.push(name); break; }
  }
  if (mutations.length) result.push(["", "Mutated", "Double Mutation", "Triple Mutation", "Mutation Overload"][Math.min(4, mutations.length)]);
  if (mutations.some(m => m.normal_rarity >= 10000)) result.push("Rare Mutation");
  if (gem.affected_by_luck === false) result.push("Flat");
  if (["daily", "date_range_daily"].includes(gem.availability_mode)) result.push("Time-Gated");
  if (gem.metadata?.troll) result.push("Troll");
  return result;
}
export function generateResult(gems: any[], mutations: any[], event: any, now: Date, random: Random = random01) {
  const distribution = gemDistribution(gems, event, now);
  let draw = random();
  const picked = distribution.find(row => (draw -= row.probability) < 0) ?? distribution.at(-1)!;
  const gem = picked.gem;
  const weight = rollWeight(random);
  const successful = rollMutations(mutations, gem, event, now, random);
  const contributions = {
    gem: 1 / picked.probability,
    weight: weightContribution(weight),
    mutations: successful.reduce((r, m) => r / m.probability, 1)
  };
  const overall = contributions.gem * contributions.weight * contributions.mutations;
  if (!Number.isFinite(overall) || !Number.isFinite(Number(gem.base_weight) * weight)) throw new Error("invalid_result");
  return {
    version: 1, gem_name: gem.name, normal_rarity: Number(gem.rarity), base_weight: Number(gem.base_weight),
    weight_multiplier: weight, final_weight: Number(gem.base_weight) * weight,
    mutations: successful, badges: badges(gem, weight, successful), contributions, overall_rarity: overall
  };
}

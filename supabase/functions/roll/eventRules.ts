export type RandomSource = () => number;

export type GlobalEventSnapshot = {
  id: string;
  eventKey: string;
  name: string;
  icon: string;
  tier: string;
  description: string;
  startsAt: string;
  endsAt: string;
  serverNow: string;
  config: Record<string, any>;
  mass: number;
  massTarget: number | null;
  collapsedAt: string | null;
};

export type EventRollContext = {
  occurrenceId: string | null;
  eventKey: string | null;
  state: string | null;
  luckMultiplier: number;
  rollSpeedMultiplier: number;
  weightLuckMultiplier: number;
  mutationMultiplier: number;
  valueMultiplier: number;
  luckyRoll: boolean;
  secondChance: boolean;
  poorWeightRerollChance: number;
  tailContinuationChance: number | null;
  tailEntryChance: number | null;
  starfallActive: boolean;
  collapsed: boolean;
  finalSeconds: number;
  config: Record<string, any>;
};

const positive = (value: unknown, fallback = 1) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

function weightedState(states: any[], random: RandomSource) {
  const total = states.reduce((sum, state) => sum + Math.max(0, Number(state.weight) || 0), 0);
  let draw = random() * total;
  for (const state of states) {
    draw -= Math.max(0, Number(state.weight) || 0);
    if (draw < 0) return state;
  }
  return states.at(-1) ?? null;
}

export function normalizeGlobalEvent(value: any, nowMs = Date.now()): GlobalEventSnapshot | null {
  if (!value || typeof value !== "object" || !value.id || !value.eventKey) return null;
  const starts = new Date(value.startsAt).getTime();
  const ends = new Date(value.endsAt).getTime();
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || nowMs < starts || nowMs >= ends) return null;
  return {
    ...value,
    config: value.config && typeof value.config === "object" ? value.config : {},
    mass: Math.max(0, Number(value.mass) || 0),
    massTarget: value.massTarget == null ? null : Math.max(1, Number(value.massTarget) || 1),
    collapsedAt: value.collapsedAt ?? null
  };
}

export function buildEventRollContext(
  event: GlobalEventSnapshot | null,
  random: RandomSource,
  nowMs = Date.now()
): EventRollContext {
  const base: EventRollContext = {
    occurrenceId: event?.id ?? null, eventKey: event?.eventKey ?? null, state: null,
    luckMultiplier: 1, rollSpeedMultiplier: 1, weightLuckMultiplier: 1,
    mutationMultiplier: 1, valueMultiplier: 1, luckyRoll: false,
    secondChance: false, poorWeightRerollChance: 0, tailContinuationChance: null, tailEntryChance: null,
    starfallActive: false, collapsed: Boolean(event?.collapsedAt), finalSeconds: Infinity,
    config: event?.config ?? {}
  };
  if (!event) return base;
  const config = event.config;
  base.luckMultiplier = positive(config.luckMultiplier);
  base.rollSpeedMultiplier = positive(config.rollSpeedMultiplier);
  base.weightLuckMultiplier = positive(config.weightLuckMultiplier);
  base.mutationMultiplier = positive(config.mutationMultiplier);
  base.valueMultiplier = positive(config.valueMultiplier);
  base.poorWeightRerollChance = Math.max(0, Math.min(1, Number(config.poorWeightRerollChance) || 0));
  base.tailContinuationChance = config.tailContinuationChance == null
    ? null : Math.max(0, Math.min(0.95, Number(config.tailContinuationChance) || 0));
  base.tailEntryChance = config.tailEntryChance == null
    ? null : Math.max(0, Math.min(0.95, Number(config.tailEntryChance) || 0));
  base.finalSeconds = Math.max(0, (new Date(event.endsAt).getTime() - nowMs) / 1000);

  if (event.eventKey === "lucky_roll" && random() < Number(config.luckyRollChance ?? 0)) {
    base.luckyRoll = true;
    base.luckMultiplier *= positive(config.luckyRollMultiplier);
  }
  if (event.eventKey === "second_chance") {
    base.secondChance = random() < Number(config.secondChanceChance ?? 0);
  }
  if (event.eventKey === "unstable_luck") {
    const phaseSeconds = Math.max(1, Number(config.phaseSeconds) || 30);
    const phase = Math.max(0, Math.floor((nowMs - new Date(event.startsAt).getTime()) / (phaseSeconds * 1000)));
    base.luckMultiplier *= positive(config.phaseValues?.[phase]);
    base.state = `phase_${phase}`;
  }
  if (event.eventKey === "volatile_veins" || event.eventKey === "total_eclipse") {
    const state = weightedState(Array.isArray(config.states) ? config.states : [], random);
    if (state) {
      base.state = String(state.key);
      base.luckMultiplier *= positive(state.luck);
      base.weightLuckMultiplier *= positive(state.weightLuck);
      base.mutationMultiplier *= positive(state.mutation);
    }
  }
  if (event.eventKey === "falling_stars") {
    const elapsed = (nowMs - new Date(event.startsAt).getTime()) / 1000;
    base.starfallActive = (config.windows ?? []).some((window: any) =>
      elapsed >= Number(window.offsetSeconds) && elapsed < Number(window.offsetSeconds) + Number(window.durationSeconds));
    base.state = base.starfallActive ? "starfall" : null;
  }
  if (event.eventKey === "singularity") {
    if (base.finalSeconds <= 30) {
      base.state = "final"; base.luckMultiplier *= 3; base.weightLuckMultiplier *= 2; base.mutationMultiplier *= 1.5;
    } else if (base.finalSeconds <= 60) {
      base.state = "surge"; base.luckMultiplier *= 2; base.weightLuckMultiplier *= 1.5;
    } else if (base.finalSeconds <= 180) {
      base.state = "compression"; base.luckMultiplier *= 1.5; base.weightLuckMultiplier *= 1.25;
    } else if (base.finalSeconds <= 300) {
      base.state = "pull"; base.luckMultiplier *= 1.25; base.weightLuckMultiplier *= 1.1;
    } else {
      base.state = "forming"; base.luckMultiplier *= 1.1;
    }
    const progress = event.massTarget ? event.mass / event.massTarget : 0;
    base.rollSpeedMultiplier *= progress >= 0.75 ? 1.15 : progress >= 0.5 ? 1.1 : progress >= 0.25 ? 1.05 : 1;
  }
  return base;
}

export function eventGemLuckFactor(context: EventRollContext, gem: any): number {
  const rarity = Number(gem.rarity) || 0;
  const config = context.config;
  if (gem.metadata?.ignoreEventRarityFactor) return 1;
  if (context.eventKey === "prospectors_eye" && gem.name === config.targetGem) return positive(config.targetGemLuckMultiplier);
  if (context.eventKey === "gem_rush" && rarity >= Number(config.rarityMin)) return positive(config.rarityLuckMultiplier);
  if (context.eventKey === "narrowed_veins" && Array.isArray(config.selectedBand)) {
    const [minimum, maximum] = config.selectedBand.map(Number);
    if (rarity >= minimum && rarity < maximum) return positive(config.rarityLuckMultiplier);
  }
  if (["cosmic_alignment", "reality_fracture"].includes(String(context.eventKey))) {
    for (const [minimum, factor] of config.rarityFactors ?? []) if (rarity >= Number(minimum)) return positive(factor);
  }
  return 1;
}

export function eventGemIsEligible(context: EventRollContext, gem: any): boolean {
  if (!gem.requiredEventKey) return true;
  if (gem.requiredEventKey !== context.eventKey) return false;
  if (context.eventKey === "falling_stars" && !context.starfallActive) return false;
  if (gem.metadata?.requiredRollState && gem.metadata.requiredRollState !== context.state) return false;
  if (gem.metadata?.requiresCollapse && (!context.collapsed || context.finalSeconds > Number(gem.metadata.finalSeconds ?? 0))) return false;
  return true;
}

export function eventMutationFactor(context: EventRollContext, mutation: any): number {
  if (mutation.id === "charged") return context.eventKey === "mutation_storm" ? 2 : 0;
  let factor = context.mutationMultiplier;
  factor *= positive(context.config.mutationFactors?.[mutation.id]);
  if (context.eventKey === "polished_world" && Number(mutation.multiplier) <= Number(context.config.maxMutationValue)) {
    factor *= positive(context.config.mutationFactor);
  }
  return factor;
}

export function eventWeightLuckFactor(context: EventRollContext, gem: any): number {
  if (context.eventKey === "heavy_favorites" && (context.config.targetGems ?? []).includes(gem.name)) {
    return context.weightLuckMultiplier * positive(context.config.targetWeightLuckMultiplier);
  }
  return context.weightLuckMultiplier;
}

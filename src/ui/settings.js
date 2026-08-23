import { GEM_MUTATIONS } from "../data/mutations.js";

// =========================================================
// GAMEPLAY SETTINGS
//
// Automation preferences live on the device rather than the
// server: the server stays authoritative for every action,
// these only decide when the client asks for one.
//
// The Roll page and the Settings page both bind to this
// store, so a change in one updates the other immediately.
// =========================================================


const STORAGE_KEY = "gemIncremental.settings";


export const SELL_TIERS = [
  { id: "common", label: "Common only", rank: 0 },
  { id: "uncommon", label: "Uncommon and below", rank: 1 },
  { id: "rare", label: "Rare and below", rank: 2 },
  { id: "epic", label: "Epic and below", rank: 3 },
  { id: "legendary", label: "Legendary and below", rank: 4 },
  { id: "mythic", label: "Mythic and below", rank: 5 }
];


export const GEM_REALISM_LEVELS = [
  { id: "classic", label: "Classic" },
  { id: "polished", label: "Polished" },
  { id: "faceted", label: "Faceted" },
  { id: "gemstone", label: "Gemstone" },
  { id: "realistic", label: "Realistic" },
  { id: "studio", label: "Studio" },
  { id: "photoreal", label: "Photoreal" }
];

const DEFAULTS = {
  autoRoll: false,
  autoSell: false,
  autoSellTier: "common",
  autoKeep: true,
  autoKeepEffectiveRarity: 1_000_000,
  rollAnimations: true,
  cutsceneMinimumRarity: 100000,
  // Off by default: a small side counter showing the sum of every
  // player's lifetime earnings ("global cash").
  globalCash: false,
  // Off by default: unlocks the Global Cash graph page (stock-style
  // chart of the economy over time).
  cashGraph: false,
  gemRealism: "classic"
};


let state = load();


function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return { ...DEFAULTS };
    }

    const parsed = JSON.parse(raw);

    return sanitise({ ...DEFAULTS, ...parsed });
  } catch {
    return { ...DEFAULTS };
  }
}


function sanitise(value) {
  const allowedTiers = SELL_TIERS.map((tier) => tier.id);

  return {
    autoRoll: Boolean(value.autoRoll),
    autoSell: Boolean(value.autoSell),

    autoSellTier: allowedTiers.includes(value.autoSellTier)
      ? value.autoSellTier
      : DEFAULTS.autoSellTier,

    autoKeep: value.autoKeep !== false,
    autoKeepEffectiveRarity: Math.max(
      1,
      Math.floor(Number(value.autoKeepEffectiveRarity) || DEFAULTS.autoKeepEffectiveRarity)
    ),

    rollAnimations: value.rollAnimations !== false,

    cutsceneMinimumRarity: Math.max(100000, Math.floor(Number(value.cutsceneMinimumRarity) || DEFAULTS.cutsceneMinimumRarity)),

    globalCash: Boolean(value.globalCash),
    cashGraph: Boolean(value.cashGraph),

    gemRealism: GEM_REALISM_LEVELS.some((entry) => entry.id === value.gemRealism)
      ? value.gemRealism
      : DEFAULTS.gemRealism
  };
}


export function getSettings() {
  return { ...state };
}


export function updateSettings(patch) {
  state = sanitise({ ...state, ...patch });

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Session-only settings are still better than none.
  }

  notify();

  return getSettings();
}


// ---------------------------------------------------------
// AUTO SELL RULE
// ---------------------------------------------------------

export function tierRank(tierId) {
  const known = SELL_TIERS.find((tier) => tier.id === tierId);

  if (known) {
    return known.rank;
  }

  // Anything above the configurable range (exotic, cosmic)
  // is never auto-sold.
  return Number.MAX_SAFE_INTEGER;
}


export function shouldAutoSell(gemTierId) {
  if (!state.autoSell) {
    return false;
  }

  return tierRank(gemTierId) <= tierRank(state.autoSellTier);
}




// ---------------------------------------------------------
// AUTO KEEP RULE
//
// Auto-keep is a client-side safety override for Auto Sell. The
// server still owns the inventory and sale operation; this rule
// simply prevents the client from asking to sell results at or
// above the configured tier.
// ---------------------------------------------------------

function mutationIdsFor(result) {
  if (Array.isArray(result?.mutationIds)) return result.mutationIds;
  if (Array.isArray(result?.mutation_ids)) return result.mutation_ids;
  if (Array.isArray(result?.mutations)) {
    return result.mutations.map((mutation) => mutation?.id).filter(Boolean);
  }
  return result?.mutation_id ? [result.mutation_id] : [];
}

function mutationChanceProduct(result) {
  return mutationIdsFor(result).reduce((product, id) => {
    const chance = Number(GEM_MUTATIONS[id]?.chance ?? 1);
    return product * Math.max(1, chance);
  }, 1);
}

export function effectiveRarityForResult(result) {
  const supplied = Number(result?.effectiveRarity ?? result?.effective_rarity);
  if (Number.isFinite(supplied) && supplied > 0) return supplied;
  const base = Number(result?.gem?.rarity ?? result?.rarity ?? 0);
  return Math.max(0, base) * mutationChanceProduct(result);
}

export function shouldAutoKeep(result) {
  const name = String(result?.gem?.name ?? result?.gem_name ?? "");
  if (result?.gem?.dropType === "relic" || name === "Enchant Relic" || name === "Ancient Relic") {
    return true;
  }
  if (!state.autoKeep) return false;
  return effectiveRarityForResult(result) >= state.autoKeepEffectiveRarity;
}

// ---------------------------------------------------------
// CHANGE NOTIFICATIONS
// ---------------------------------------------------------

const listeners = new Set();


export function onSettingsChange(callback) {
  listeners.add(callback);

  return () => listeners.delete(callback);
}


function notify() {
  for (const listener of listeners) {
    listener(getSettings());
  }
}


window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) {
    return;
  }

  state = load();

  notify();
});

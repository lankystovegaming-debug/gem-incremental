import { sanitizeMaxLuck } from '../../supabase/functions/roll/equipmentRules.js';
import { GEM_MUTATIONS } from "../data/mutations.js";
import { supabase } from "../backend/supabase.js";
import { ensurePlayerAuth } from "../backend/auth.js";

// =========================================================
// GAMEPLAY SETTINGS
//
// Supabase stores automation preferences. A device cache supplies initial paint;
// saved patches are serialized and the optimized roll backend owns all routing.

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
  maxLuck: null,
  autoRoll: false,
  autoSell: false,
  enableBuffs: true, discoveryKeep: true, discoveryKeepRarity: 10000, gemFilter: {},
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
let hydration;
let saveQueue = Promise.resolve();
export function hydrateSettingsFromCloud() {
  return hydration ??= (async () => {
    const user = await ensurePlayerAuth();
    if (!user) throw new Error('Sign in to save settings.');
    const { data, error } = await supabase.from('player_settings').select('settings').eq('player_id', user.id).maybeSingle();
    if (error) throw error;
    const cloud = data?.settings ?? {};
    const importPatch = {};
    for (const key of ['autoRoll','autoKeep','autoKeepEffectiveRarity','rollAnimations','cutsceneMinimumRarity','globalCash','cashGraph','gemRealism']) {
      if (!(key in cloud)) importPatch[key] = state[key];
    }
    if (cloud.legacyAutoSell == null) {
      importPatch.legacyAutoSellTier = cloud.autoSellTier ?? state.autoSellTier;
      importPatch.legacyAutoSell = cloud.autoSell ?? state.autoSell;
    }
    if (Object.keys(importPatch).length) {
      const { data: migrated, error: migrationError } = await supabase.rpc('update_qol_settings', { p_patch: importPatch });
      if (migrationError) throw migrationError;
      Object.assign(cloud, migrated);
    }
    state = sanitise({ ...DEFAULTS, ...cloud });
    notify();
    return getSettings();
  })().catch(error => { hydration = null; throw error; });
}


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
    ...value,
    maxLuck: sanitizeMaxLuck(value.maxLuck),
    enableBuffs: value.enableBuffs !== false,
    discoveryKeep: value.discoveryKeep !== false,
    discoveryKeepRarity: Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.floor(Number(value.discoveryKeepRarity) || 10000))),
    gemFilter: value.gemFilter && typeof value.gemFilter === 'object' ? { ...value.gemFilter } : {},
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
  return { ...state, gemFilter: { ...state.gemFilter } };
}


export function updateSettings(patch) {
  const operation = saveQueue.catch(() => {}).then(async () => {
    await hydrateSettingsFromCloud();
    const { data, error } = await supabase.rpc('update_qol_settings', { p_patch: patch });
    if (error) throw error;
    state = sanitise({ ...DEFAULTS, ...data });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
    notify();
    return getSettings();
  });
  saveQueue = operation;
  operation.catch(error => window.dispatchEvent(new CustomEvent('gem:settings-error', { detail: error })));
  return operation;
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


// Automatic sale decisions now belong exclusively to the optimized roll server.
export function shouldAutoSell() { return false; }

// ---------------------------------------------------------
// AUTO KEEP RULE
//
// Display fallback for older roll responses. Current roll responses include
// the authoritative retention decision.
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

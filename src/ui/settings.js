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


const DEFAULTS = {
  autoRoll: false,
  autoSell: false,
  autoSellTier: "common",
  autoKeep: true,
  autoKeepTier: "legendary",
  rollAnimations: true,
  cutsceneMinimumRarity: 100000
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
    autoKeepTier: allowedTiers.includes(value.autoKeepTier)
      ? value.autoKeepTier
      : DEFAULTS.autoKeepTier,

    rollAnimations: value.rollAnimations !== false,

    cutsceneMinimumRarity: Math.max(100000, Math.floor(Number(value.cutsceneMinimumRarity) || DEFAULTS.cutsceneMinimumRarity))
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

export function shouldAutoKeep(gemTierId) {
  if (!state.autoKeep) return false;
  return tierRank(gemTierId) >= tierRank(state.autoKeepTier);
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

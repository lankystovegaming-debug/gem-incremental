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
  autoKeep: false,
  autoKeepEffectiveRarity: 1000000,
  autoKeepMutation: "celestial",
  autoKeepMinValue: 0,
  autoKeepMinWeight: 0,
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
    autoKeep: Boolean(value.autoKeep),
    autoKeepEffectiveRarity: Math.max(0,Math.floor(Number(value.autoKeepEffectiveRarity)||0)),
    autoKeepMutation: ["none","polished","gilded","prismatic","celestial","corrupted"].includes(value.autoKeepMutation)?value.autoKeepMutation:"celestial",
    autoKeepMinValue: Math.max(0,Number(value.autoKeepMinValue)||0),
    autoKeepMinWeight: Math.max(0,Number(value.autoKeepMinWeight)||0),

    autoSellTier: allowedTiers.includes(value.autoSellTier)
      ? value.autoSellTier
      : DEFAULTS.autoSellTier,

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

const MUTATION_RANK={polished:1,gilded:2,prismatic:3,celestial:4,corrupted:5};
export function autoKeepMatch(data){
  if(data?.gem?.dropType==="relic")return{keep:true,reason:"Relics are always protected"};
  if(!state.autoKeep)return{keep:false,reason:""};
  const effective=Number(data?.gem?.rarity||0)*Math.max(1,Number(data?.mutationMultiplier||1));
  if(state.autoKeepEffectiveRarity>0&&effective>=state.autoKeepEffectiveRarity)return{keep:true,reason:`Effective rarity reached 1/${Math.round(state.autoKeepEffectiveRarity).toLocaleString()}`};
  const ids=(Array.isArray(data?.mutations)?data.mutations:[]).map(item=>item.id),required=MUTATION_RANK[state.autoKeepMutation]||0;
  if(required&&ids.some(id=>(MUTATION_RANK[id]||0)>=required))return{keep:true,reason:`Matched ${state.autoKeepMutation} mutation protection`};
  if(state.autoKeepMinValue>0&&Number(data?.value||0)>=state.autoKeepMinValue)return{keep:true,reason:`Value reached ${state.autoKeepMinValue.toLocaleString()}`};
  if(state.autoKeepMinWeight>0&&Number(data?.finalWeight||0)>=state.autoKeepMinWeight)return{keep:true,reason:`Weight reached ${state.autoKeepMinWeight.toLocaleString()}g`};
  return{keep:false,reason:""};
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

// =========================================================
// FORMATTING HELPERS
//
// Shared so every page prints money, weights and rarities
// exactly the same way.
// =========================================================


const RARITY_TIERS = [
  { id: "common",     name: "Common",     max: 10 },
  { id: "uncommon",   name: "Uncommon",   max: 50 },
  { id: "rare",       name: "Rare",       max: 100 },
  { id: "epic",       name: "Epic",       max: 1000 },
  { id: "legendary",  name: "Legendary",  max: 10000 },
  { id: "mythic",     name: "Mythic",     max: 100000 },
  { id: "exotic",     name: "Exotic",     max: 1000000 },
  { id: "cosmic",     name: "Cosmic",     max: Infinity }
];


export function rarityTier(rarity) {
  const value = Number(rarity ?? 0);

  return (
    RARITY_TIERS.find((tier) => value < tier.max) ??
    RARITY_TIERS[RARITY_TIERS.length - 1]
  );
}


export function rarityLabel(rarity) {
  return `1 in ${formatCount(rarity)}`;
}


// ---------------------------------------------------------
// NUMBERS
// ---------------------------------------------------------

export function formatCount(value) {
  return Math.round(Number(value ?? 0)).toLocaleString("en-US");
}


// Money is exact below $10k and abbreviated above it, so the
// wallet pill never pushes the navigation around.
export function formatMoney(value, { compact = false } = {}) {
  const amount = Number(value ?? 0);

  if (compact && Math.abs(amount) >= 10000) {
    return `$${abbreviate(amount)}`;
  }

  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}


export function abbreviate(value) {
  const amount = Number(value ?? 0);
  const abs = Math.abs(amount);

  const units = [
    { size: 1e12, suffix: "T" },
    { size: 1e9,  suffix: "B" },
    { size: 1e6,  suffix: "M" },
    { size: 1e3,  suffix: "K" }
  ];

  const unit = units.find((entry) => abs >= entry.size);

  if (!unit) {
    return amount.toLocaleString("en-US", {
      maximumFractionDigits: 2
    });
  }

  const scaled = amount / unit.size;

  return (
    scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2)
      .replace(/\.?0+$/, "") + unit.suffix
  );
}


export function formatWeight(value) {
  const grams = Number(value ?? 0);

  if (grams >= 100000) {
    return `${abbreviate(grams)}g`;
  }

  return `${grams.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}g`;
}


export function formatMultiplier(value) {
  return `${Number(value ?? 0).toFixed(3)}x`;
}


export function formatSeconds(seconds) {
  const total = Math.max(0, Number(seconds ?? 0));

  if (total < 10) {
    return `${total.toFixed(1)}s`;
  }

  if (total < 60) {
    return `${Math.ceil(total)}s`;
  }

  const minutes = Math.floor(total / 60);
  const rest = Math.ceil(total % 60);

  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}


export function formatRelativeTime(isoString) {
  if (!isoString) {
    return "";
  }

  const elapsed = Date.now() - new Date(isoString).getTime();
  const seconds = Math.round(elapsed / 1000);

  if (seconds < 60) {
    return "just now";
  }

  const steps = [
    { limit: 3600, size: 60, unit: "minute" },
    { limit: 86400, size: 3600, unit: "hour" },
    { limit: 2592000, size: 86400, unit: "day" }
  ];

  const step = steps.find((entry) => seconds < entry.limit);

  if (!step) {
    return new Date(isoString).toLocaleDateString();
  }

  const amount = Math.floor(seconds / step.size);

  return `${amount} ${step.unit}${amount === 1 ? "" : "s"} ago`;
}


// ---------------------------------------------------------
// SAFETY
// ---------------------------------------------------------

// Gem and equipment names come back from the database, so
// anything interpolated into innerHTML goes through here.
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]
  );
}

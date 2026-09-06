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
  { id: "exotic",       name: "Exotic",       max: 1000000 },
  { id: "exalted",      name: "Exalted",      max: 10000000 },
  { id: "cosmic",       name: "Cosmic",       max: 100000000 },
  { id: "transcendent", name: "Transcendent", max: 1000000000 },
  { id: "secret",       name: "Secret",       max: Infinity }
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

// Extended incremental-game suffixes. The sequence follows the standard
// short-scale naming convention from thousand through centillion, using
// compact game-friendly abbreviations for very large inventory/roll counts.
// Canonical suffixes requested for the game's 10^3 groups, from K through Ce.
const GAME_SUFFIXES = [
  "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No",
  "Dc", "UDc", "DDc", "TDc", "QtDc", "QnDc", "SxDc", "SpDc", "OcDc", "NoDc",
  "Vg", "UVg", "DVg", "TVg", "QtVg", "QnVg", "SxVg", "SpVg", "OcVg", "NoVg",
  "Tg", "UTg", "DTg", "TTg", "QtTg", "QnTg", "SxTg", "SpTg", "OcTg", "NoTg",
  "Qdg", "UQdg", "DQdg", "TQdg", "QtQdg", "QnQdg", "SxQdg", "SpQdg", "OcQdg", "NoQdg",
  "Qqg", "UQqg", "DQqg", "TQqg", "QtQqg", "QnQqg", "SxQqg", "SpQqg", "OcQqg", "NoQqg",
  "Sxg", "USxg", "DSxg", "TSxg", "QtSxg", "QnSxg", "SxSxg", "SpSxg", "OcSxg", "NoSxg",
  "Spg", "USpg", "DSpg", "TSpg", "QtSpg", "QnSpg", "SxSpg", "SpSpg", "OcSpg", "NoSpg",
  "Ocg", "UOcg", "DOcg", "TOcg", "QtOcg", "QnOcg", "SxOcg", "SpOcg", "OcOcg", "NoOcg",
  "Nog", "UNog", "DNog", "TNog", "QtNog", "QnNog", "SxNog", "SpNog", "OcNog", "NoNog",
  "Ce"
];

function gameSuffixForExponent(exponent) {
  if (exponent < 3) return "";
  const group = Math.floor(exponent / 3);
  return GAME_SUFFIXES[group - 1] ?? null;
}

function formatAbbreviatedNumber(value) {
  const amount = Number(value ?? 0);
  const abs = Math.abs(amount);

  if (!Number.isFinite(amount)) return String(amount);
  if (abs < 1000) {
    return Math.round(amount).toLocaleString("en-US");
  }

  const exponent = Math.floor(Math.log10(abs));
  const suffix = gameSuffixForExponent(exponent);

  if (!suffix) return Math.round(amount).toLocaleString("en-US");

  const power = 10 ** (Math.floor(exponent / 3) * 3);
  const scaled = amount / power;
  const fixed = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const text = scaled.toFixed(fixed).replace(/\.?0+$/, "");

  return text + suffix;
}

export function formatCount(value) {
  return formatAbbreviatedNumber(Math.round(Number(value ?? 0)));
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

  // Trim only trailing zeros in the FRACTIONAL part (e.g. "1.50" -> "1.5",
  // "2.00" -> "2"). Never strip zeros from a whole number — "160" must stay
  // "160", not become "16".
  const fixed = scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2);
  const trimmed = fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;

  return trimmed + unit.suffix;
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

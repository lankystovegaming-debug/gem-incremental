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
  "Ce", "UCe", "DCe", "TCe", "QtCe", "QnCe", "SxCe", "SpCe", "OcCe", "NoCe",
  "UnCe", "UUnCe", "DUnCe", "TUnCe", "QtUnCe", "QnUnCe", "SxUnCe", "SpUnCe", "OcUnCe", "NoUnCe",
  "DCe", "UDCe", "DDCe", "TDCe", "QtDCe", "QnDCe", "SxDCe", "SpDCe", "OcDCe", "NoDCe",
  "TCe", "UTCe", "DTCe", "TTCe", "QtTCe", "QnTCe", "SxTCe", "SpTCe", "OcTCe", "NoTCe",
  "QtCe", "UQtCe", "DQtCe", "TQtCe", "QtQtCe", "QnQtCe", "SxQtCe", "SpQtCe", "OcQtCe", "NoQtCe",
  "QnCe", "UQnCe", "DQnCe", "TQnCe", "QtQnCe", "QnQnCe", "SxQnCe", "SpQnCe", "OcQnCe", "NoQnCe",
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
  const formatted = scaled.toFixed(fixed);
  const text = formatted.includes(".")
    ? formatted.replace(/0+$/, "").replace(/\.$/, "")
    : formatted;

  return text + suffix;
}


// Arbitrary-size integer formatter. Uses BigInt so values above Number.MAX_VALUE
// never become Infinity or scientific notation. Three significant figures.
export function formatHugeInteger(value, { prefix = "", suffix = "" } = {}) {
  let n;
  try { n = typeof value === "bigint" ? value : BigInt(String(value).replace(/\.0+$/, "")); } catch { return `${prefix}${String(value)}${suffix}`; }
  const sign = n < 0n ? "-" : ""; n = n < 0n ? -n : n;
  const raw = n.toString();
  if (raw.length <= 3) return `${prefix}${sign}${raw}${suffix}`;
  const exponent = raw.length - 1;
  const groupExp = Math.floor(exponent / 3) * 3;
  const unit = gameSuffixForExponent(groupExp);
  if (!unit) {
    const head = raw.slice(0,3);
    const mantissa = `${head[0]}.${head.slice(1)}`.replace(/0+$/, "").replace(/\.$/, "");
    return `${prefix}${sign}${mantissa}e${exponent}${suffix}`;
  }
  const leadDigits = exponent - groupExp + 1;
  const sig = raw.slice(0, Math.min(raw.length, leadDigits + Math.max(0, 3-leadDigits)));
  const whole = sig.slice(0, leadDigits);
  const frac = sig.slice(leadDigits).replace(/0+$/, "");
  return `${prefix}${sign}${whole}${frac ? "."+frac : ""}${unit}${suffix}`;
}

export function formatHugeDecimal(value, { prefix = "", suffix = "" } = {}) {
  const text = String(value ?? "0").trim();
  if (/^[+-]?\d+$/.test(text)) return formatHugeInteger(text,{prefix,suffix});
  // Decimal.js-style scientific input, including legacy values such as 1.98e52T.
  const suffixMatch = text.match(/^([+-]?[0-9.]+)(?:e([+-]?\d+))?([A-Za-z]+)?$/i);
  if (suffixMatch) {
    const signMantissa = suffixMatch[1];
    const legacyUnit = suffixMatch[3] || "";
    const legacyIndex = GAME_SUFFIXES.indexOf(legacyUnit);
    const legacyExponent = legacyIndex >= 0 ? (legacyIndex + 1) * 3 : 0;
    const mantissa = Number(signMantissa);
    const sciExponent = Number(suffixMatch[2] || 0) + legacyExponent;
    if (Number.isFinite(mantissa)) {
      if (sciExponent < 3 && !legacyUnit) return `${prefix}${mantissa.toLocaleString("en-US",{maximumSignificantDigits:3})}${suffix}`;
      const baseExp = Math.floor(Math.log10(Math.abs(mantissa) || 1)) + sciExponent;
      const groupExp = Math.floor(baseExp / 3) * 3;
      const unit = gameSuffixForExponent(groupExp);
      if (unit) {
        const scaled = mantissa * 10 ** (baseExp - groupExp - Math.floor(Math.log10(Math.abs(mantissa) || 1)));
        const out = Number(scaled).toPrecision(3).replace(/\.?0+$/," ").trim();
        return `${prefix}${out}${unit}${suffix}`;
      }
    }
  }
  const n = Number(text);
  if (!Number.isFinite(n)) return `${prefix}${text}${suffix}`;
  if (Math.abs(n) < 1000) return `${prefix}${n.toLocaleString("en-US",{maximumSignificantDigits:3})}${suffix}`;
  const exponent=Math.floor(Math.log10(Math.abs(n))); const groupExp=Math.floor(exponent/3)*3; const unit=gameSuffixForExponent(groupExp);
  const scaled=n/10**groupExp; const out=scaled.toPrecision(3).replace(/\.?0+$/," ").trim();
  return `${prefix}${out}${unit||""}${suffix}`;
}

export function formatCount(value) {
  return formatAbbreviatedNumber(Math.round(Number(value ?? 0)));
}


// Cash is shown as an exact, rounded whole-dollar amount by default.
// Individual gem values use formatGemValue to retain two decimal places.
function formatExactMoney(value, decimalPlaces = 0) {
  const text = String(value ?? 0).trim();
  const match = text.match(/^([+-]?)(\d+)(?:\.(\d*))?$/);

  if (match) {
    const [, sign, rawWhole, rawFraction = ""] = match;
    const places = Math.max(0, Math.trunc(decimalPlaces));
    const paddedFraction = rawFraction.padEnd(places + 1, "0");
    const scaledText = `${rawWhole}${paddedFraction.slice(0, places)}`.replace(/^0+(?=\d)/, "");
    let scaled = BigInt(scaledText || "0");
    if (paddedFraction[places] >= "5") scaled += 1n;
    const digits = scaled.toString().padStart(places + 1, "0");
    const whole = places ? digits.slice(0, -places) : digits;
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const fraction = places ? `.${digits.slice(-places)}` : "";
    return `$${sign === "-" && scaled !== 0n ? "-" : ""}${grouped}${fraction}`;
  }

  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return `$${text}`;
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
    useGrouping: true
  })}`;
}

export function formatMoney(value, { compact = false, exact = false, decimalPlaces = 0 } = {}) {
  if (exact || !compact) return formatExactMoney(value, decimalPlaces);
  const text = String(value ?? 0);
  if (/^[+-]?\d+$/.test(text)) {
    const abs = text.replace(/^[+-]/, "");
    if (abs.length > 15 || compact) return formatHugeInteger(text, { prefix: "$" });
  }
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return `$${formatHugeDecimal(text)}`;
  if (Math.abs(amount) >= 1000) return formatHugeDecimal(amount, { prefix: "$" });
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatGemValue(value) {
  return formatExactMoney(value, 2);
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

export const CONTENT_FILTER_LEVELS = Object.freeze([
  { id: "standard", label: "Standard" },
  { id: "strict", label: "Strict" }
]);

const ZERO_WIDTH_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF]/gu;

const STANDARD_PATTERNS = Object.freeze([
  /\bf+[\W_]*u+[\W_]*c+[\W_]*k+(?:[\W_]*(?:e+d+|i+n+g+|s+))?\b/giu,
  /\bs+[\W_]*h+[\W_]*[i1]+[\W_]*t+(?:[\W_]*(?:t+y+|e+d+|s+))?\b/giu,
  /\bb+[\W_]*[i1]+[\W_]*t+[\W_]*c+[\W_]*h+(?:[\W_]*(?:e+s+|y+))?\b/giu,
  /\bc+[\W_]*u+[\W_]*n+[\W_]*t+s?\b/giu,
  /\b(?:w+[\W_]*h+[\W_]*o+[\W_]*r+[\W_]*e+s?|s+[\W_]*l+[\W_]*u+[\W_]*t+s?)\b/giu,
  /\bn+[\W_]*[i1]+[\W_]*g+[\W_]*g+[\W_]*(?:e+[\W_]*r+|a+)s?\b/giu,
  /\bf+[\W_]*a+[\W_]*g+(?:[\W_]*g+[\W_]*o+[\W_]*t+)?s?\b/giu,
  /\br+[\W_]*e+[\W_]*t+[\W_]*a+[\W_]*r+[\W_]*d+(?:[\W_]*e+[\W_]*d+)?\b/giu,
  /\b(?:k+[\W_]*y+[\W_]*s+|k+[\W_]*i+[\W_]*l+[\W_]*l+[\W_]+y+[\W_]*o+[\W_]*u+[\W_]*r+[\W_]*s+[\W_]*e+[\W_]*l+[\W_]*f+)\b/giu,
  /\br+[\W_]*a+[\W_]*p+[\W_]*e+(?:[\W_]*d+|[\W_]*i+[\W_]*s+[\W_]*t+)?\b/giu
]);

const STRICT_PATTERNS = Object.freeze([
  /\ba+[\W_]*s+[\W_]*s+(?:[\W_]*h+[\W_]*o+[\W_]*l+[\W_]*e+)?s?\b/giu,
  /\bd+[\W_]*a+[\W_]*m+[\W_]*n+(?:[\W_]*e+[\W_]*d+)?\b/giu,
  /\bh+[\W_]*e+[\W_]*l+[\W_]*l+\b/giu,
  /\b(?:i+[\W_]*d+[\W_]*i+[\W_]*o+[\W_]*t+|m+[\W_]*o+[\W_]*r+[\W_]*o+[\W_]*n+|s+[\W_]*t+[\W_]*u+[\W_]*p+[\W_]*i+[\W_]*d+|l+[\W_]*o+[\W_]*s+[\W_]*e+[\W_]*r+)s?\b/giu,
  /\bs+[\W_]*h+[\W_]*u+[\W_]*t+[\W_]+u+[\W_]*p+\b/giu
]);

export function normalizeContentFilterLevel(value) {
  return value === "strict" ? "strict" : "standard";
}

export function moderatePlayerText(value, level = "standard") {
  let text = String(value ?? "").replace(ZERO_WIDTH_CHARACTERS, "");
  const patterns = normalizeContentFilterLevel(level) === "strict"
    ? [...STANDARD_PATTERNS, ...STRICT_PATTERNS]
    : STANDARD_PATTERNS;

  for (const pattern of patterns) {
    text = text.replace(pattern, "[filtered]");
  }

  return text;
}

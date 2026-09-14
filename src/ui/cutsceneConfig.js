const FACET = Object.freeze({
  id: "facet", duration: 3_000, theme: "facet", label: "FACET ANALYSIS",
  beats: ["SPECIMEN ACQUIRED", "FACETS: RESOLVING", "STRUCTURE: CONFIRMED"]
});
const PRISM = Object.freeze({
  id: "prism", duration: 5_500, theme: "prism", label: "PRISM ANALYSIS",
  beats: ["SPECIMEN ACQUIRED", "REFRACTION: INCREASING", "SPECTRUM: LOCKED"]
});

const scene = (duration, theme, beats, extra = {}) => Object.freeze({
  duration, theme, beats, label: "TRANSCENDENT SPECIMEN", ...extra
});

// The registry is deliberately keyed by normalized server identity. Rarity is
// retained as a fallback boundary, never as a substitute for gem identity.
export const BESPOKE_CUTSCENES = Object.freeze({
  "heart of xy": scene(10_000, "xy-heart", ["X COORDINATE: LOCKED", "Y COORDINATE: LOCKED", "HEARTBEAT DETECTED", "COLLISION: IMMINENT"]),
  "xy gem": scene(10_000, "xy-heart", ["X COORDINATE: LOCKED", "Y COORDINATE: LOCKED", "HEARTBEAT DETECTED", "COLLISION: IMMINENT"]),
  "potassic-magnesio-fluoro-chloro-potassic-ferri-magnesiotaramite-potassic-chloro-ferri-magnesiotaramite": scene(9_000, "buffer", ["IDENTIFYING SPECIMEN...", "IDENTIFICATION BUFFER EXCEEDED", "FORCING FULL IDENTIFIER"]),
  "first light": scene(8_000, "sunrise", ["LIGHT LEVEL: 0.01%", "HORIZON SOURCE DETECTED", "FIRST RAYS ACQUIRED"], { quiet: true }),
  noobium: scene(6_500, "noob", ["RUNNING SERIOUS ANALYSIS...", "NOOB DETECTED", "PRESENTATION QUALITY: BASIC"], { label: "NOOBIUM SCAN" }),
  stishovite: scene(8_500, "pressure-one", ["PRESSURE: 10 GPa", "PRESSURE: 45 GPa", "DENSITY: INCREASING", "EXTREME PRESSURE I"]),
  unobtainium: scene(7_500, "missing", ["LOCATING SPECIMEN...", "LOCATING SPECIMEN...", "SPECIMEN DOES NOT EXIST", "...WHAT?"]),
  solarion: scene(8_500, "solar", ["STELLAR SEED DETECTED", "SOLAR ACTIVITY: RISING", "CORE COLLAPSE: CONTROLLED"]),
  seifertite: scene(9_000, "pressure-two", ["PRESSURE: 120 GPa", "PRESSURE: 900 GPa", "PRESSURE: ███████", "LUCK: IRRELEVANT", "EXTREME PRESSURE II"]),
  eventide: scene(9_000, "eventide", ["DAYLIGHT: FADING", "SPECTRUM: RED → VIOLET", "STARS: EMERGING"], { quiet: true }),
  deadstar: scene(8_500, "deadstar", ["STELLAR OUTPUT: 12%", "STELLAR OUTPUT: 1%", "STELLAR OUTPUT: 0%", "EMBER SIGNAL: FAINT"], { quiet: true }),
  tistarite: scene(8_500, "meteor", ["INCOMING OBJECT", "IMPACT: PAUSED", "OUTER LAYER: FRACTURED", "ORIGIN: NOT LOCAL"]),
  infernite: scene(9_000, "inferno", ["TEMPERATURE: RISING", "THERMAL LIMIT EXCEEDED", "TEMPERATURE: ∞", "HEAT COLLAPSE: INWARD"]),
  ascendentite: scene(9_000, "ascend", ["ALTITUDE: +10m", "+1km", "+100km", "TRACKING LIMIT EXCEEDED", "RETURN VECTOR: LOCKED"]),
  allendeite: scene(9_000, "impact", ["INCOMING OBJECT", "GEOLOGICAL SHOCKWAVE", "EXCAVATING SPECIMEN", "ORIGIN: NOT LOCAL"]),
  polaris: scene(8_500, "polaris", ["SEARCHING STAR FIELD", "REFERENCE POINT: FIXED", "CELESTIAL ROTATION: CONFIRMED"], { quiet: true }),
  "the last gem": scene(8_000, "false-ending", ["CATALOG ANALYSIS COMPLETE", "COMPLETION: 100%", "Checking catalog...", "ADDITIONAL SPECIMENS DETECTED", "Apparently not."]),
  panguite: scene(9_500, "primordial", ["SOLAR DUST: ASSEMBLING", "AGE: >4.5 BILLION YEARS", "ORIGIN: NOT LOCAL", "ORIGIN: PRIMORDIAL"]),
  "yttrocolumbite-(y)": scene(9_000, "analysis", ["COMPOSITION: SCANNING", "STRUCTURE: SCANNING", "SPECTRAL PROFILE: SCANNING", "CLASSIFICATION COMPLETE", "CORRECTION: (Y)"]),
  thalassa: scene(11_500, "ocean", ["DEPTH: -10m", "DEPTH: -200m", "DEPTH: -1000m", "DEPTH: -4000m", "LIGHT: 0%", "SIGNAL LOST"], { quiet: true }),
  fluorotetraferriphlogopite: scene(7_500, "perfect-id", ["IDENTIFYING SPECIMEN...", "IDENTIFICATION CONFIDENCE: 100%", "FULL IDENTIFIER: STABLE"]),
  hapkeite: scene(9_000, "lunar-impact", ["LUNAR SURFACE SWEEP", "REFLECTIVE INCLUSION FOUND", "EXPOSURE: IMPACT-ALTERED", "ORIGIN: NOT LOCAL"]),
  edscottite: scene(10_500, "journey", ["TERRESTRIAL SOURCE: NONE", "EXTRATERRESTRIAL SOURCE: FOUND", "JOURNEY RECONSTRUCTION", "ATMOSPHERIC ENTRY", "ORIGIN: CONFIRMED"]),
  "where gem": scene(8_500, "where", ["LOCATING SPECIMEN...", "404 SPECIMEN NOT FOUND", "SCANNING VIEWPORT...", "oh"], { randomAnchor: true }),
  "last light": scene(9_000, "last-light", ["REMAINING LIGHT: 1.7%", "REMAINING LIGHT: 0.8%", "REMAINING LIGHT: 0.2%", "REMAINING LIGHT: 0.0%", "INTERNAL SOURCE DETECTED"], { quiet: true }),
  armalcolite: scene(9_000, "lunar", ["SURFACE: DUST", "TERRESTRIAL ORIGIN: NEGATIVE", "LUNAR MATERIAL: CONFIRMED"]),
  netherwrong: scene(10_500, "wrong", ["RESONANCE PATTERN: FAMILIAR", "SPECIMEN VALIDATION: VALID", "SPECIMEN VALIDATION: WRONG", "THIS IS WRONG."], { theatre: true }),
  aurorite: scene(9_000, "aurora", ["SPECTRAL READING: VARIABLE", "SPECTRAL READING: UNSTABLE", "SCANNER: DISENGAGED"], { quiet: true }),
  "reality fragment": scene(11_000, "reality", ["CONTAINMENT FAILURE", "REALITY COHERENCE: 81%", "REALITY COHERENCE: 54%", "REALITY COHERENCE: 17%", "REALITY COHERENCE: ERROR"], { theatre: true, lingeringCrack: true }),
  tranquillityite: scene(10_000, "tranquillity", ["LUNAR HORIZON ACQUIRED", "SCANNER: STANDBY", "DISTURBANCE: NONE"], { quiet: true }),
  "ton 618": scene(12_000, "black-hole", ["UNEXPECTED GRAVITATIONAL FIELD", "GRAVITATIONAL FIELD: INCREASING", "MASS: ????????", "EVENT HORIZON: COMPLETE"], { theatre: true, quiet: true }),
  "cat ore": scene(10_000, "cat", ["CRITICAL ENERGY", "MAXIMUM DANGER", "ENTITY APPROACHING", "PLEASE STOP", "meow"]),
  "tonalite-trondhjemite-granodiorite": scene(12_000, "master-analysis", ["FACET: PASS", "PRISM: PASS", "RESONANCE: PASS", "PRESSURE: PASS", "COMPOSITION: PASS", "ORIGIN: PASS", "REALITY: STABLE"]),
  "almost secret": scene(10_500, "almost", ["COUNTING TOWARD SECRET THRESHOLD", "THRESHOLD: 1,000,000,000", "RESULT: 999,999,999", "DIFFERENCE: 1", "SECR—", "no.", "1 short."], { counter: true }),
  "glitched gem": scene(12_500, "glitched-gem", ["QUARTZ · 1 in 2", "RESULT VALIDATION FAILED", "REVALIDATING...", "ROLL RESULT RECOVERED", "GLITCHED GEM", "ROLL RESULT CORRUPTED", "THIS RESULT SHOULD NOT EXIST"], { secret: true, theatre: true, fakeResult: true }),
  finality: scene(12_000, "finality", ["FINAL SPECIMEN DETECTED", "FACET", "PRISM", "RESONANCE", "SPECIMEN ANALYSIS COMPLETE", "NO FURTHER SPECIMENS DETECTED", "ENDING SESSION", "GEM INCREMENTAL · Thank you for playing.", "The end.", "for this roll."], { secret: true, quiet: true, theatre: true }),
  reminiscite: scene(17_000, "memory", ["FACET · PRISM · RESONANCE", "SUNRISE · PRESSURE · METEOR · DEADSTAR", "FIRE · ASCENSION · POLARIS · THALASSA", "404 · LAST LIGHT · NETHERWRONG · AURORA", "REALITY · LUNAR · TON 618 · CAT ORE", "999,999,999 · GLITCHED GEM · FINALITY", "MEMORY INDEX COMPLETE", "SEARCHING FOR CURRENT SPECIMEN...", "NO MATCH FOUND", "Everything before led here."], { secret: true, quiet: true })
});

export function normalizeCutsceneName(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function resonanceIntensity(rarity) {
  const value = Math.max(10_000_000, Math.min(99_999_999, Number(rarity) || 10_000_000));
  return (value - 10_000_000) / 89_999_999;
}

export function getCutsceneDefinition({ rarity, gemName } = {}) {
  const value = Number(rarity) || 0;
  const name = normalizeCutsceneName(gemName);
  if (value >= 100_000_000) {
    return BESPOKE_CUTSCENES[name] ?? scene(9_500, "transcendent", [
      "SPECIMEN ACQUIRED", "ANALYSIS BEYOND CATALOG LIMITS", "IDENTITY: CONFIRMED"
    ]);
  }
  if (value >= 10_000_000) {
    const intensity = resonanceIntensity(value);
    return Object.freeze({
      id: "resonance", theme: "resonance", label: "RESONANCE ANALYSIS",
      duration: Math.round(8_000 + intensity * 2_000), intensity,
      beats: ["THUM", "RESONANCE: BUILDING", "MINERAL LATTICE: VISIBLE", "STRUCTURAL LIGHT LEAK DETECTED"]
    });
  }
  if (value >= 1_000_000) return PRISM;
  if (value >= 100_000) return FACET;
  return null;
}

export function configuredCutsceneDuration({ rarity, gemName, mobile = false, reducedMotion = false } = {}) {
  const definition = getCutsceneDefinition({ rarity, gemName });
  if (!definition) return 0;
  // Coarse-pointer devices get a little more reading time. Reduced motion
  // shortens long holds while keeping every narrative beat present.
  let duration = definition.duration * (mobile ? 1.05 : 1);
  if (reducedMotion) duration = Math.max(3_000, duration * 0.72);
  return Math.round(duration);
}

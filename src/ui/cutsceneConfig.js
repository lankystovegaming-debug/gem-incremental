const FACET = Object.freeze({
  id: "facet", duration: 4_000, theme: "facet", beats: [], revealAt: 0.55,
  primitives: ["facets"]
});
const PRISM = Object.freeze({
  id: "prism", duration: 6_500, theme: "prism", beats: [], revealAt: 0.68,
  primitives: ["prism"]
});

const scene = (duration, theme, beats = [], extra = {}) => Object.freeze({
  duration, theme, beats, revealAt: 0.78, primitives: [], ...extra
});

// Text is deliberately sparse here. Each entry's primitives and theme carry the
// scene; beats are only measurements, punchlines, or essential dramatic turns.
// The registry is keyed by normalized server identity. Rarity remains a fallback
// boundary, never a substitute for gem identity.
export const BESPOKE_CUTSCENES = Object.freeze({
  "heart of xy": scene(14_000, "xy-heart"),
  "xy gem": scene(14_000, "xy-heart"),
  "potassic-magnesio-fluoro-chloro-potassic-ferri-magnesiotaramite-potassic-chloro-ferri-magnesiotaramite": scene(12_000, "buffer", ["IDENTIFICATION BUFFER EXCEEDED"], { primitives: ["identifier"], textPosition: "center-low", beatStart: 0.55 }),
  "first light": scene(12_000, "sunrise", [], { quiet: true, primitives: ["horizon", "star"] }),
  noobium: scene(11_000, "noob", ["NOOB DETECTED"], { primitives: ["pixel"], textPosition: "center", beatStart: 0.48 }),
  stishovite: scene(12_000, "pressure-one", ["10 GPa", "45 GPa"], { primitives: ["pressure"], textPosition: "specimen-right" }),
  unobtainium: scene(11_500, "missing", ["SPECIMEN DOES NOT EXIST"], { primitives: ["search", "reticle"], textPosition: "center-low", beatStart: 0.6 }),
  solarion: scene(12_000, "solar", [], { primitives: ["star", "orbit"] }),
  seifertite: scene(13_000, "pressure-two", ["120 GPa", "900 GPa", "LUCK: IRRELEVANT"], { primitives: ["pressure"], textPosition: "specimen-right" }),
  eventide: scene(12_000, "eventide", [], { quiet: true, primitives: ["horizon", "stars"] }),
  deadstar: scene(12_500, "deadstar", [], { quiet: true, primitives: ["star", "embers"] }),
  tistarite: scene(12_500, "meteor", ["ORIGIN: NOT LOCAL"], { primitives: ["meteor"], textPosition: "lower-right", beatStart: 0.58 }),
  infernite: scene(13_500, "inferno", ["TEMPERATURE: ∞"], { primitives: ["fire", "heat"], textPosition: "center-low", beatStart: 0.58 }),
  ascendentite: scene(13_000, "ascend", ["+10 m", "+1 km", "+100 km"], { primitives: ["ascent"], textPosition: "altitude" }),
  allendeite: scene(13_000, "impact", ["ORIGIN: NOT LOCAL"], { primitives: ["meteor", "crater"], textPosition: "lower-right", beatStart: 0.58 }),
  polaris: scene(12_500, "polaris", [], { quiet: true, primitives: ["star-trails"] }),
  "the last gem": scene(12_000, "false-ending", ["100%", "Apparently not."], { primitives: ["catalogue"], textPosition: "center", beatStart: 0.32 }),
  panguite: scene(13_500, "primordial", [">4.5 BILLION YEARS", "ORIGIN: PRIMORDIAL"], { primitives: ["dust", "orbit"], textPosition: "orbit" }),
  "yttrocolumbite-(y)": scene(12_500, "analysis", ["CORRECTION: (Y)"], { primitives: ["slices", "reticle"], textPosition: "specimen-right", beatStart: 0.55 }),
  thalassa: scene(15_000, "ocean", ["-10 m", "-1,000 m", "-4,000 m"], { quiet: true, primitives: ["water", "depth"], textPosition: "depth" }),
  fluorotetraferriphlogopite: scene(11_500, "perfect-id", ["IDENTIFICATION CONFIDENCE: 100%"], { primitives: ["identifier"], textPosition: "center-low", beatStart: 0.55 }),
  hapkeite: scene(13_000, "lunar-impact", ["ORIGIN: NOT LOCAL"], { primitives: ["lunar", "crater"], textPosition: "lower-right", beatStart: 0.58 }),
  edscottite: scene(14_000, "journey", ["ORIGIN: CONFIRMED"], { primitives: ["journey", "meteor"], textPosition: "lower-right", beatStart: 0.58 }),
  "where gem": scene(12_000, "where", ["404", "oh"], { primitives: ["search", "reticle"], textPosition: "where", randomAnchor: true }),
  "last light": scene(13_000, "last-light", [], { quiet: true, primitives: ["horizon", "ember"] }),
  armalcolite: scene(13_000, "lunar", ["LUNAR MATERIAL"], { primitives: ["lunar"], textPosition: "horizon", beatStart: 0.55 }),
  netherwrong: scene(14_000, "wrong", ["THIS IS WRONG."], { theatre: true, primitives: ["wrong"], textPosition: "wrong", beatStart: 0.58 }),
  aurorite: scene(13_000, "aurora", [], { quiet: true, primitives: ["aurora"] }),
  "reality fragment": scene(15_000, "reality", ["CONTAINMENT FAILURE", "COHERENCE: ERROR"], { theatre: true, lingeringCrack: true, primitives: ["reality"], textPosition: "fracture" }),
  tranquillityite: scene(14_000, "tranquillity", [], { quiet: true, primitives: ["lunar", "horizon"] }),
  "ton 618": scene(16_000, "black-hole", ["MASS: ????????", "EVENT HORIZON"], { theatre: true, quiet: true, primitives: ["black-hole"], textPosition: "orbit" }),
  "cat ore": scene(12_000, "cat", ["meow"], { primitives: ["cat"], textPosition: "center-low", beatStart: 0.63, revealAt: 0.72 }),
  "tonalite-trondhjemite-granodiorite": scene(15_000, "master-analysis", ["FACET · PRISM · RESONANCE"], { primitives: ["master"], textPosition: "orbit", beatStart: 0.54 }),
  "almost secret": scene(16_000, "almost", ["no.", "1 short."], { counter: true, counterDuration: 8_500, primitives: ["counter"], textPosition: "center", beatStart: 0.6, beatWindow: 0.12, revealAt: 0.84 }),
  "glitched gem": scene(17_000, "glitched-gem", ["RESULT VALIDATION FAILED", "THIS RESULT SHOULD NOT EXIST"], { secret: true, theatre: true, fakeResult: true, primitives: ["glitch"], textPosition: "corrupt-ui", beatStart: 0.3, revealAt: 0.82 }),
  finality: scene(16_000, "finality", ["The end.", "for this roll."], { secret: true, quiet: true, theatre: true, primitives: ["void"], textPosition: "center", beatStart: 0.58, revealAt: 0.83 }),
  reminiscite: scene(20_000, "memory", ["MEMORY INDEX COMPLETE", "SEARCHING FOR CURRENT SPECIMEN...", "NO MATCH FOUND"], { secret: true, quiet: true, primitives: ["memories"], textPosition: "center", beatStart: 0.64, beatWindow: 0.14, revealAt: 0.84 })
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
    return BESPOKE_CUTSCENES[name] ?? scene(13_000, "transcendent", [], { primitives: ["transcendent"] });
  }
  if (value >= 10_000_000) {
    const intensity = resonanceIntensity(value);
    return Object.freeze({
      id: "resonance", theme: "resonance", duration: Math.round(11_000 + intensity * 2_000),
      intensity, beats: [], revealAt: 0.78, primitives: ["resonance"]
    });
  }
  if (value >= 1_000_000) return PRISM;
  if (value >= 100_000) return FACET;
  return null;
}

export function configuredCutsceneDuration({ rarity, gemName, mobile = false, reducedMotion = false } = {}) {
  const definition = getCutsceneDefinition({ rarity, gemName });
  if (!definition) return 0;
  // Live and replay share this single duration source. Coarse-pointer devices
  // receive a little more hold time; reduced motion preserves the story beats.
  let duration = definition.duration * (mobile ? 1.05 : 1);
  if (reducedMotion) duration = Math.max(3_000, duration * 0.72);
  return Math.round(duration);
}

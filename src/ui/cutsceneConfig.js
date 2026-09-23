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
  "prismarine fragment": scene(4_000,"deep-sea-shard",[],{focus:false,primitives:["sea-shard"],revealPosition:"upper-right",revealAt:.66,worldExitAt:.63}),
  "ancient coin": scene(4_200,"deep-sea-coin",[],{focus:false,primitives:["sea-coin"],revealPosition:"center",revealAt:.67,worldExitAt:.64}),
  pearl: scene(4_400,"deep-sea-pearl",[],{focus:false,primitives:["sea-shell"],revealPosition:"center",revealAt:.68,worldExitAt:.65}),
  "pearl of the sea": scene(5_800,"deep-sea-grand-pearl",[],{focus:false,quiet:true,primitives:["sea-grand-shell"],revealPosition:"center",revealAt:.72,worldExitAt:.69}),
  nautilii: scene(5_800,"deep-sea-nautilus",[],{focus:false,quiet:true,primitives:["sea-nautilus"],revealPosition:"center",revealAt:.72,worldExitAt:.69}),
  "sunken treasure": scene(7_500,"deep-sea-treasure",["VESSEL LOCATED"],{focus:false,primitives:["sea-wreck"],textPosition:"upper-left",revealPosition:"center",revealAt:.76,worldExitAt:.73}),
  "abyssal coral": scene(10_500,"deep-sea-coral",[],{focus:false,quiet:true,primitives:["sea-bleaching-reef"],revealPosition:"center",revealAt:.8,worldExitAt:.77}),
  trenchstone: scene(11_500,"deep-sea-trench",["−6,000 m","PRESSURE // CRITICAL"],{focus:false,theatre:true,primitives:["sea-trench-descent"],textPosition:"depth-hud",revealPosition:"center",revealAt:.82,worldExitAt:.79}),
  coral: scene(12_000,"deep-sea-golden-coral",[],{focus:false,theatre:true,primitives:["sea-golden-reef"],revealPosition:"center",revealAt:.83,worldExitAt:.8}),
  "leviathan scale": scene(13_000,"deep-sea-leviathan",["DO NOT LOOK UP"],{focus:false,theatre:true,quiet:true,cameraMotion:"track",primitives:["sea-leviathan-pass"],textPosition:"lower-right",revealPosition:"center",revealAt:.84,worldExitAt:.81}),
  "heart of the sea": scene(14_500,"deep-sea-heart",[],{focus:false,theatre:true,quiet:true,cameraMotion:"plunge",primitives:["sea-heart-impact"],revealPosition:"center",revealAt:.86,worldExitAt:.83}),
  "neptune's tear": scene(16_000,"deep-sea-neptune",["A GOD'S TEAR DOES NOT DRY"],{focus:false,secret:true,theatre:true,cameraMotion:"dolly",primitives:["sea-neptune-palace"],textPosition:"upper-right",revealPosition:"center",revealAt:.875,worldExitAt:.845}),
  "soul of the sea god": scene(18_000,"deep-sea-soul",[],{focus:false,secret:true,theatre:true,quiet:true,cameraMotion:"surge",primitives:["sea-soul-awakening"],revealPosition:"center",revealAt:.888,worldExitAt:.858}),
  "deepcore geode": scene(12_500, "deepcore-pressure", [
    "DEPTH 11,842 m", "LITHOSTATIC LOAD // 4.7 GPa", "THE ROCK OPENED FROM WITHIN"
  ], { theatre: true, primitives: ["deepcore-geode"], textPosition: "deepcore-descent", beatStart: .15, beatWindow: .52, revealAt: .82 }),
  "crystalline singularity": scene(13_500, "deepcore-convergence", [
    "LOCAL GRAVITY: INVERTED", "MASS → ∞  /  VOLUME → 0", "LIGHT HAS NOWHERE LEFT TO GO"
  ], { theatre: true, primitives: ["deepcore-singularity"], textPosition: "deepcore-singularity", beatStart: .18, beatWindow: .48, revealAt: .84 }),
  "ontological shard": scene(13_500, "deepcore-absence", [
    "OBJECT REGISTERED", "OBJECT DENIED", "DISCOVERY RECORD:  [          ]"
  ], { theatre: true, quiet: true, primitives: ["deepcore-absence"], textPosition: "deepcore-absence", beatStart: .16, beatWindow: .5, revealAt: .84 }),
  "blacksite crystal": scene(14_500, "deepcore-redacted", [
    "SITE 06 // CAMERA 4", "CONTAINMENT IS NOT EMPTY", "CLEARANCE REVOKED"
  ], { theatre: true, primitives: ["deepcore-blacksite"], textPosition: "deepcore-blacksite", beatStart: .12, beatWindow: .56, revealAt: .85 }),
  "heart of the deep": scene(17_000, "deepcore-heartbeat", [
    "12,000 m BELOW THE LAST MAP", "SIGNAL SOURCE: BENEATH THE CORE", "IT HEARD YOU."
  ], { theatre: false, quiet: true, primitives: ["deepcore-heart"], textPosition: "deepcore-heart", beatStart: .12, beatWindow: .58, revealAt: .88 }),
  "heart of xy": scene(14_000, "xy-heart"),
  "xy gem": scene(14_000, "xy-heart"),
  "touch grass": scene(12_500, "touch-grass", [], { focus: false, primitives: ["touch-grass"], revealAt: 0.82, includeInReminiscite: false }),
  asterism: scene(13_000, "asterism", [], { focus: false, quiet: true, primitives: ["asterism"], revealAt: 0.83, includeInReminiscite: false }),
  seraphite: scene(14_000, "seraphite", [], { focus: false, quiet: true, primitives: ["seraphite"], revealAt: 0.84, includeInReminiscite: false }),
  aurorium: scene(14_000, "aurorium", [], { focus: false, quiet: true, primitives: ["aurorium"], revealAt: 0.84, includeInReminiscite: false }),
  "false vacuum": scene(15_500, "false-vacuum", ["VACUUM DECAY"], { focus: false, quiet: true, primitives: ["false-vacuum"], textPosition: "vacuum-orbit", beatStart: 0.57, revealAt: 0.85, includeInReminiscite: false }),
  serpentite: scene(14_000, "serpentite", [], { focus: false, primitives: ["serpentite"], revealAt: 0.84, includeInReminiscite: false }),
  sutoronchiumushahouhoakinseki: scene(15_000, "sutoronchiumushahouhoakinseki", [], { focus: false, quiet: true, primitives: ["sutoronchiumushahouhoakinseki"], revealAt: 0.84, includeInReminiscite: false }),
  "heat death": scene(18_000, "heat-death", ["ΔT → 0"], { focus: false, quiet: true, primitives: ["heat-death"], textPosition: "heat-death", beatStart: 0.68, revealAt: 0.88, includeInReminiscite: false }),
  zephyrion: scene(15_500, "zephyrion", ["SOURCE: MYTHIC POTION"], { focus: false, primitives: ["zephyrion"], textPosition: "zephyrion", beatStart: 0.62, revealAt: 0.86, includeInReminiscite: false }),
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
  "one singular grain of sand": scene(15_000, "singular-sand", ["ONE."], { primitives: ["sand"], textPosition: "center-low", beatStart: 0.67, revealAt: 0.82 }),
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
  if (BESPOKE_CUTSCENES[name]) return BESPOKE_CUTSCENES[name];
  if (value >= 100_000_000) {
    return scene(13_000, "transcendent", [], { primitives: ["transcendent"] });
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

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CutsceneController,
  cutsceneDuration,
  isCutsceneEligible
} from "../src/ui/cutsceneController.js";
import {
  BESPOKE_CUTSCENES,
  getCutsceneDefinition
} from "../src/ui/cutsceneConfig.js";
import { REMINISCITE_MEMORY_FRAMES } from "../src/ui/cutscenePrimitives.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

assert.equal(
  isCutsceneEligible({ rarity: 100_000, threshold: 100_000 }),
  false,
  "a roll exactly equal to the configured threshold must not trigger"
);
assert.equal(
  isCutsceneEligible({ rarity: 100_001, threshold: 100_000 }),
  true,
  "a roll strictly rarer than the configured threshold must trigger"
);
assert.equal(
  isCutsceneEligible({ rarity: 1_000_000, threshold: 100_000, dropType: "relic" }),
  false,
  "flat-chance relics must remain outside gem cutscenes"
);

assert.equal(cutsceneDuration({ rarity: 10_000, mobile: false, reducedMotion: false }), 0);
assert.equal(cutsceneDuration({ rarity: 100_000, mobile: false, reducedMotion: false }), 4_000);
assert.equal(cutsceneDuration({ rarity: 4_000_000, mobile: false, reducedMotion: false }), 6_500);
assert.equal(cutsceneDuration({ rarity: 10_000_000, mobile: false, reducedMotion: false }), 11_000);
assert.equal(cutsceneDuration({ rarity: 99_999_999, mobile: false, reducedMotion: false }), 13_000);
assert.equal(cutsceneDuration({ rarity: 100_000_000, gemName: "Heart of Xy", mobile: false, reducedMotion: false }), 14_000);
assert.equal(cutsceneDuration({ rarity: 6_242_026, gemName: "Ja-ore", mobile: false, reducedMotion: false }), 6_500);
assert.equal(cutsceneDuration({ rarity: 250_000, gemName: "Glitched Ore", mobile: false, reducedMotion: false }), 4_000);
assert.equal(cutsceneDuration({ rarity: 100_000, mobile: false, reducedMotion: true }), 3_000);
assert.equal(cutsceneDuration({ rarity: 99_999_999, mobile: false, reducedMotion: true }), 9_360);
assert.equal(getCutsceneDefinition({ rarity: 999_999 }).id, "facet");
assert.equal(getCutsceneDefinition({ rarity: 1_000_000 }).id, "prism");
assert.equal(getCutsceneDefinition({ rarity: 99_999_999 }).id, "resonance");
assert.deepEqual(getCutsceneDefinition({ rarity: 999_999 }).beats, []);
assert.deepEqual(getCutsceneDefinition({ rarity: 1_000_000 }).beats, []);
assert.deepEqual(getCutsceneDefinition({ rarity: 99_999_999 }).beats, []);
assert.equal(getCutsceneDefinition({ rarity: 100_000_000, gemName: "Heart of Xy" }).theme, "xy-heart");
assert.equal(getCutsceneDefinition({ rarity: 666_666_666, gemName: "one singular grain of sand" }).theme, "singular-sand");
assert.equal(cutsceneDuration({ rarity: 666_666_666, gemName: "one singular grain of sand", mobile: false, reducedMotion: false }), 15_000);
assert.deepEqual(BESPOKE_CUTSCENES["one singular grain of sand"].primitives, ["sand"]);
assert.equal(Object.keys(BESPOKE_CUTSCENES).length, 38, "the 37 locked scenes plus the legacy XY alias must be registered");
for (const [name, definition] of Object.entries(BESPOKE_CUTSCENES)) {
  assert.ok(definition.duration >= 11_000 && definition.duration <= 20_000, `${name} must retain ceremonial pacing`);
  assert.ok(definition.beats.length <= 3, `${name} must use animation rather than explanatory copy`);
  if (definition.theme !== "xy-heart") {
    assert.ok(definition.primitives.length > 0, `${name} must opt into a visual identity`);
  }
  assert.ok(definition.duration * (1 - definition.revealAt) >= 2_000, `${name} must leave a readable aftermath`);
}
assert.ok(
  Object.values(BESPOKE_CUTSCENES).filter((definition) => definition.primitives.includes("reticle")).length <= 3,
  "reticles must be an occasional scene primitive, not a cinematic watermark"
);

const previousMatchMedia = globalThis.matchMedia;
globalThis.matchMedia = (query) => ({ matches: query.includes("pointer: coarse") });
assert.equal(
  cutsceneDuration({ rarity: 100_000 }),
  4_200,
  "live and replay callers must share the same mobile viewport adjustment"
);
if (previousMatchMedia === undefined) delete globalThis.matchMedia;
else globalThis.matchMedia = previousMatchMedia;

const classes = new Set();
const previousDocument = globalThis.document;
globalThis.document = {
  documentElement: {
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value)
    }
  }
};

try {
  const controller = new CutsceneController();
  let removed = 0;
  let cleaned = 0;
  let renderCleaned = 0;
  const overlay = {
    classList: { remove() {} },
    remove() { removed += 1; }
  };

  const first = controller.play({
    duration: 10_000,
    fadeOutMs: 0,
    render: () => ({ overlay, cleanup: ({ interrupted }) => {
      assert.equal(interrupted, true);
      renderCleaned += 1;
    } }),
    onCleanup: ({ interrupted }) => {
      assert.equal(interrupted, true);
      cleaned += 1;
    }
  });

  assert.equal(controller.isActive, true, "the shared lock must engage while a cutscene is active");
  assert.equal(classes.has("is-cinematic-active"), true, "the document input/scroll lock must engage");
  assert.equal(controller.interrupt(), true, "an active cutscene must be interruptible");
  assert.deepEqual(await first, { interrupted: true });
  assert.equal(controller.isActive, false, "interrupting must release the shared lock");
  assert.equal(classes.has("is-cinematic-active"), false, "interrupting must release the document lock");
  assert.equal(removed, 1, "interrupting must remove the active overlay");
  assert.equal(cleaned, 1, "interrupting must run stage cleanup exactly once");
  assert.equal(renderCleaned, 1, "interrupting must run renderer cleanup exactly once");

  const second = controller.play({ duration: 1, fadeOutMs: 0, render: () => overlay });
  assert.deepEqual(await second, { interrupted: false });
  assert.equal(controller.isActive, false, "normal completion must release the shared lock");
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}

const main = source("main.js");
const replay = source("src/ui/cutsceneReplay.js");
const automation = source("src/ui/globalAutomation.js");
const scenes = source("src/ui/cutsceneScenes.js");
const config = source("src/ui/cutsceneConfig.js");
const primitives = source("src/ui/cutscenePrimitives.js");
const sceneStyles = source("src/ui/cutsceneScenes.css");
const styles = source("style.css");

assert.match(main, /isCutsceneEligible\(\{/);
assert.match(replay, /isCutsceneEligible\(\{/);
assert.match(automation, /isCutsceneEligible\(\{/);
assert.doesNotMatch(automation, /rarity\s*>=\s*Math\.max\([^\n]*cutsceneMinimumRarity/);
assert.doesNotMatch(main, /function cinematicDuration/);
assert.doesNotMatch(replay, /function durationForRarity/);
assert.match(main, /return cutsceneController\.play\(\{/);
assert.match(replay, /return cutsceneController\.play\(\{/);
assert.match(main, /renderCutscene\(data, duration\)/);
assert.match(replay, /renderCutscene\(replayData, duration, \{ replay: true \}\)/);
assert.match(main, /if \(rollInFlight \|\| cutsceneController\.isActive \|\| !view\.ready\)/);
assert.match(main, /!getSettings\(\)\.autoRoll \|\|[\s\S]*cutsceneController\.isActive/);
assert.match(main, /queueMicrotask\(\(\) => \{[\s\S]*!cutsceneController\.isActive/);
assert.ok(
  main.indexOf("if (isUltraRare)") < main.indexOf("if (!settings.rollAnimations)"),
  "eligible cutscenes must be handled before the ordinary roll-animation preference"
);
assert.match(
  main.slice(main.indexOf("if (isUltraRare)"), main.indexOf("if (!settings.rollAnimations)")),
  /if \(settings\.rollAnimations\) \{[\s\S]*classList\.add\("is-animating"/,
  "ordinary roll-stage animation classes must still honor their own setting"
);
assert.match(main, /class="roll-action-status" role="status"/);
assert.doesNotMatch(main, /function buildUltraCutscene/);
assert.doesNotMatch(
  scenes,
  /outcome\.icon|outcome\.text/,
  "automation outcomes must not be rendered inside the full-screen compositor"
);
assert.match(styles, /\.roll-action-status\s*\{/);
assert.doesNotMatch(styles, /ultra-level-10k[\s\S]{0,500}1800ms/);
assert.match(scenes, /getCutsceneDefinition/);
assert.match(scenes, /createTheatricalUiClones/);
assert.match(primitives, /cloneNode\(true\)/);
assert.match(primitives, /node\.disabled = true/);
assert.match(
  sceneStyles,
  /data-phase="reveal"\] \.cs-focus\s*\{[\s\S]*?visibility:\s*hidden/,
  "the buildup specimen must retire before the final reveal gem appears"
);
assert.match(scenes, /primitives\.includes\("reticle"\)/);
assert.doesNotMatch(scenes, /cs-scanner|scanner__label/);
assert.doesNotMatch(config, /FACET ANALYSIS|PRISM ANALYSIS|RESONANCE ANALYSIS|SPECIMEN ACQUIRED/);
assert.match(config, /counterDuration:\s*8_500/);
assert.ok(BESPOKE_CUTSCENES["almost secret"].counterDuration <= 9_000);
assert.match(scenes, /Math\.min\(9_000, duration \* 0\.68/);
assert.match(scenes, /counterDuration \/ duration \+ 0\.07/);
assert.deepEqual(BESPOKE_CUTSCENES.reminiscite.beats, [
  "MEMORY INDEX COMPLETE", "SEARCHING FOR CURRENT SPECIMEN...", "NO MATCH FOUND"
]);
const precedingCutsceneThemes = Array.from(new Set(
  Object.values(BESPOKE_CUTSCENES).map((definition) => definition.theme)
)).filter((theme) => theme !== "memory");
assert.deepEqual(
  REMINISCITE_MEMORY_FRAMES,
  precedingCutsceneThemes,
  "Reminiscite must preserve one standout frame from every preceding 100M+ cutscene"
);
assert.equal(new Set(REMINISCITE_MEMORY_FRAMES).size, 36);
assert.ok(REMINISCITE_MEMORY_FRAMES.includes("singular-sand"));
assert.match(scenes, /2\.5 \* Math\.pow\(0\.4 \/ 2\.5, progress\)/);
assert.match(scenes, /elapsedMemoryWeight \/ memoryWeightTotal/);
assert.match(config, /"glitched gem"/);
assert.match(config, /finality:/);
assert.match(config, /reminiscite:/);
assert.doesNotMatch(replay, /buildJaOreCutscene|buildGlitchedOreCutscene/);

console.log("cutscene reliability tests passed");

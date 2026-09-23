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
import {
  compareCutsceneItems,
  createCutsceneQueueItem,
  cutsceneQueueKey
} from "../src/ui/cutsceneQueueModel.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

assert.equal(
  isCutsceneEligible({ rarity: 100_000, threshold: 100_000 }),
  true,
  "a roll equal to the configured threshold must trigger"
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
assert.equal(
  isCutsceneEligible({ rarity: 2_000, gemName: "Prismarine Fragment", threshold: 100_000 }),
  true,
  "an explicitly authored source/event reveal must not be discarded by a generic rarity threshold"
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
assert.equal(Object.keys(BESPOKE_CUTSCENES).length, 56, "the locked scenes, Deepcore and Deep Sea scenes, and legacy XY alias must be registered");
assert.equal(cutsceneDuration({ rarity: 145_000_000, gemName: "Deepcore Geode", mobile: false, reducedMotion: false }), 12_500);
assert.equal(cutsceneDuration({ rarity: 250_000_000, gemName: "Crystalline Singularity", mobile: false, reducedMotion: false }), 13_500);
assert.equal(cutsceneDuration({ rarity: 250_000_000, gemName: "Ontological Shard", mobile: false, reducedMotion: false }), 13_500);
assert.equal(cutsceneDuration({ rarity: 345_000_000, gemName: "Blacksite Crystal", mobile: false, reducedMotion: false }), 14_500);
assert.equal(cutsceneDuration({ rarity: 1_000_000_000, gemName: "Heart of the Deep", mobile: false, reducedMotion: false }), 17_000);
const deepcoreScenes = [
  "deepcore geode", "crystalline singularity", "ontological shard",
  "blacksite crystal", "heart of the deep"
].map((name) => BESPOKE_CUTSCENES[name]);
assert.equal(new Set(deepcoreScenes.flatMap((definition) => definition.primitives)).size, 5, "every Deepcore discovery must own a unique cinematic primitive");
assert.deepEqual(BESPOKE_CUTSCENES["heart of the deep"].primitives, ["deepcore-heart"], "the Heart must not remix earlier Deepcore or catalogue primitives");
assert.equal(BESPOKE_CUTSCENES["heart of the deep"].theatre, false, "the Heart must not reuse or distort the surrounding game UI");
assert.equal(new Set(deepcoreScenes.map((definition) => definition.textPosition)).size, 5, "Deepcore story copy must have scene-specific choreography");
for (const definition of deepcoreScenes) {
  assert.equal(definition.beats.length, 3, "Deepcore scenes use narrative beats rather than a repeated one-word card");
  assert.ok(definition.beats.every((beat) => !/^(PRESSURE|CONVERGENCE|ABSENCE|REDACTED|HEARTBEAT)$/.test(beat)));
}
for (const [name, definition] of Object.entries(BESPOKE_CUTSCENES)) {
  const isDeepSea = definition.theme.startsWith("deep-sea-");
  assert.ok(definition.duration >= (isDeepSea ? 4_000 : 11_000) && definition.duration <= 20_000, `${name} must retain appropriate pacing`);
  assert.ok(definition.beats.length <= 3, `${name} must use animation rather than explanatory copy`);
  if (definition.theme !== "xy-heart") {
    assert.ok(definition.primitives.length > 0, `${name} must opt into a visual identity`);
  }
  assert.ok(definition.duration * (1 - definition.revealAt) >= (isDeepSea && definition.duration < 8_000 ? 1_200 : 2_000), `${name} must leave a readable aftermath`);
}
const deepSeaScenes = [
  "prismarine fragment", "ancient coin", "pearl", "pearl of the sea", "nautilii",
  "sunken treasure", "abyssal coral", "trenchstone", "coral", "leviathan scale",
  "heart of the sea", "neptune's tear", "soul of the sea god"
].map((name) => BESPOKE_CUTSCENES[name]);
assert.equal(new Set(deepSeaScenes.map((definition) => definition.primitives.join(","))).size, deepSeaScenes.length, "every Deep Sea discovery must own a unique visual primitive");
assert.ok(deepSeaScenes.slice(0, 6).reduce((total, definition) => total + definition.beats.length, 0) <= 1, "early Deep Sea discoveries must stay visually simple and text-light");
assert.ok(deepSeaScenes.every((definition) => definition.focus === false), "Deep Sea scenes must not reuse the centered pre-reveal specimen");
assert.ok(deepSeaScenes.every((definition) => definition.worldExitAt < definition.revealAt), "Deep Sea world assets must exit before the result card");
const deepSeaFinales = deepSeaScenes.slice(-4);
assert.equal(new Set(deepSeaFinales.map((definition) => definition.cameraMotion)).size, 4, "the four rarest Deep Sea scenes need distinct camera movement");
assert.ok(deepSeaScenes.slice(1).every((definition) => definition.revealPosition === "center"), "Ancient Coin onward must finish on a centred gem reveal");
assert.equal(BESPOKE_CUTSCENES["neptune's tear"].secret, true, "Neptune's Tear must reveal as a secret");
assert.equal(BESPOKE_CUTSCENES["soul of the sea god"].revealPosition, "center", "the final Deep Sea gem must reveal at centre stage");
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
  assert.deepEqual(await first, { interrupted: true, reason: "interrupted" });
  assert.equal(controller.isActive, false, "interrupting must release the shared lock");
  assert.equal(classes.has("is-cinematic-active"), false, "interrupting must release the document lock");
  assert.equal(removed, 1, "interrupting must remove the active overlay");
  assert.equal(cleaned, 1, "interrupting must run stage cleanup exactly once");
  assert.equal(renderCleaned, 1, "interrupting must run renderer cleanup exactly once");

  const second = controller.play({ duration: 1, fadeOutMs: 0, render: () => overlay });
  assert.deepEqual(await second, { interrupted: false, reason: "completed" });
  assert.equal(controller.isActive, false, "normal completion must release the shared lock");
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}

const main = source("main.js");
const replay = source("src/ui/cutsceneReplay.js");
const automation = source("src/ui/globalAutomation.js");
const globalCutscenes = source("src/ui/globalCutscenes.js");
const shell = source("src/ui/shell.js");
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
assert.match(replay, /return cutsceneController\.play\(\{/);
assert.match(globalCutscenes, /renderCutscene\(item\.result, duration\)/);
assert.match(replay, /renderCutscene\(replayData, duration, \{ replay: true \}\)/);
assert.match(main, /if \(rollInFlight \|\| globalCutsceneQueue\.isBusy \|\| !view\.ready\)/);
assert.match(main, /globalCutsceneQueue\.enqueueBatch\(announcedResults\)/);
assert.match(main, /await globalCutsceneQueue\.whenIdle\(\)/);
assert.match(automation, /globalCutsceneQueue\.enqueueBatch\(results\)/);
assert.match(shell, /initGlobalCutscenes\(\)/);
assert.match(globalCutscenes, /window\.addEventListener\("gem:roll-complete"/);
assert.match(globalCutscenes, /gemIncremental\.cutsceneQueue\.v1/);
assert.match(globalCutscenes, /result\.reason === "navigation"/);
assert.match(globalCutscenes, /skipSeenCutscenes/);
assert.match(source("src/styles/app.css"), /\.cutscene-controls__skip/);
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
for (const primitive of ["geode", "singularity", "absence", "blacksite", "heart"]) {
  assert.match(primitives, new RegExp(`deepcore-${primitive}`));
  assert.match(sceneStyles, new RegExp(`cs-dc-${primitive}`));
}
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
const deepcoreThemes = new Set([
  "deepcore-pressure", "deepcore-convergence", "deepcore-absence",
  "deepcore-redacted", "deepcore-heartbeat"
]);
const precedingCutsceneThemes = Array.from(new Set(
  Object.values(BESPOKE_CUTSCENES).map((definition) => definition.theme)
)).filter((theme) => theme !== "memory" && !deepcoreThemes.has(theme));
assert.deepEqual(
  REMINISCITE_MEMORY_FRAMES,
  precedingCutsceneThemes,
  "Reminiscite must preserve one standout frame from every preceding 100M+ cutscene"
);
assert.equal(new Set(REMINISCITE_MEMORY_FRAMES).size, 49);
for (const theme of deepcoreThemes) {
  assert.equal(REMINISCITE_MEMORY_FRAMES.includes(theme), false, `${theme} must remain exclusive to Deepcore`);
}
assert.ok(REMINISCITE_MEMORY_FRAMES.includes("singular-sand"));
assert.match(scenes, /2\.5 \* Math\.pow\(0\.4 \/ 2\.5, progress\)/);
assert.match(scenes, /elapsedMemoryWeight \/ memoryWeightTotal/);
assert.match(config, /"glitched gem"/);
assert.match(config, /finality:/);
assert.match(config, /reminiscite:/);
assert.doesNotMatch(replay, /buildJaOreCutscene|buildGlitchedOreCutscene/);

const rare = createCutsceneQueueItem({
  specimenId: "rare-1",
  gem: { name: "Solarion", rarity: 100_000_000 },
  effectiveRarity: 100_000_000,
  lifetimeStats: { totalRolls: 42 }
}, 1);
const mutatedCommon = createCutsceneQueueItem({
  specimenId: "common-1",
  gem: { name: "Quartz", rarity: 100_000 },
  effectiveRarity: 9_000_000_000,
  lifetimeStats: { totalRolls: 43 }
}, 1);
assert.equal(cutsceneQueueKey(rare.result), "specimen:rare-1", "committed specimen ids must provide idempotent queue keys");
assert.equal(compareCutsceneItems(rare, mutatedCommon) < 0, true, "batch priority must use base reveal rarity before displayed/effective rarity");
assert.equal(createCutsceneQueueItem(rare.result).result.specimenId, "rare-1", "the queued reveal must retain the committed specimen snapshot");

console.log("cutscene reliability tests passed");

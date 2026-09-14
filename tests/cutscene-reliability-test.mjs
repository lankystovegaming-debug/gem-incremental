import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CutsceneController,
  cutsceneDuration,
  isCutsceneEligible
} from "../src/ui/cutsceneController.js";

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

assert.equal(cutsceneDuration({ rarity: 10_000, mobile: false }), 2_400);
assert.equal(cutsceneDuration({ rarity: 10_000, mobile: true }), 2_592);
assert.equal(cutsceneDuration({ rarity: 100_000, mobile: false }), 9_000);
assert.equal(cutsceneDuration({ rarity: 4_000_000, mobile: false }), 18_000);
assert.equal(cutsceneDuration({ rarity: 100_000_000, gemName: "Heart of Xy", mobile: false }), 30_000);
assert.equal(cutsceneDuration({ rarity: 6_242_026, gemName: "Ja-ore", mobile: false }), 15_000);
assert.equal(cutsceneDuration({ rarity: 250_000, gemName: "Glitched Ore", mobile: false }), 12_000);

const previousMatchMedia = globalThis.matchMedia;
globalThis.matchMedia = (query) => ({ matches: query.includes("pointer: coarse") });
assert.equal(
  cutsceneDuration({ rarity: 100_000 }),
  9_720,
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
  const overlay = {
    classList: { remove() {} },
    remove() { removed += 1; }
  };

  const first = controller.play({
    duration: 10_000,
    fadeOutMs: 0,
    render: () => overlay,
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
const glitched = source("src/ui/glitchedOreCutscene.js");
const styles = source("style.css");

assert.match(main, /isCutsceneEligible\(\{/);
assert.match(replay, /isCutsceneEligible\(\{/);
assert.match(automation, /isCutsceneEligible\(\{/);
assert.doesNotMatch(automation, /rarity\s*>=\s*Math\.max\([^\n]*cutsceneMinimumRarity/);
assert.doesNotMatch(main, /function cinematicDuration/);
assert.doesNotMatch(replay, /function durationForRarity/);
assert.match(main, /return cutsceneController\.play\(\{/);
assert.match(replay, /return cutsceneController\.play\(\{/);
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
assert.doesNotMatch(
  main.slice(main.indexOf("function buildUltraCutscene"), main.indexOf("function mutationNamesHtml")),
  /outcome\.icon|outcome\.text/,
  "automation outcomes must not be rendered inside the full-screen compositor"
);
assert.match(styles, /\.roll-action-status\s*\{/);
assert.doesNotMatch(styles, /ultra-level-10k[\s\S]{0,500}1800ms/);
assert.match(glitched, /return overlay;\s*\n\}/);
assert.match(replay, /buildXyGemCutscene/);
assert.match(replay, /buildJaOreCutscene/);
assert.match(replay, /buildGlitchedOreCutscene/);

console.log("cutscene reliability tests passed");

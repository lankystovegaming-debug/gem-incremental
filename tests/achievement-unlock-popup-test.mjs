import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const popup = read("src/ui/achievementPopup.js");
const popupCss = read("src/styles/achievement-popup.css");
const shell = read("src/ui/shell.js");
const expeditionsCss = read("expeditions/expeditions.css");
const expeditionsHtml = read("expeditions/index.html");

// ── Achievement unlock popup ──────────────────────────────────────────

// The watcher must be mounted globally by the shell so popups appear on
// every page, not just the Achievements page.
assert.match(shell, /import\("\.\.\/\.\.\/src\/ui\/achievementPopup\.js"\)/,
  "shell.js must lazily import the achievement popup module");
assert.match(shell, /module\.mountAchievementPopups\(\)/,
  "shell.js must call mountAchievementPopups()");
assert.match(popup, /export function mountAchievementPopups\(/,
  "achievementPopup.js must export mountAchievementPopups()");

// It listens for roll completions (the main progress driver) and debounces
// bursts rather than fetching per roll.
assert.match(popup, /addEventListener\("gem:roll-complete"/,
  "popup watcher must react to gem:roll-complete");
assert.match(popup, /MIN_FETCH_INTERVAL_MS/,
  "popup watcher must throttle fetches with a minimum interval");

// It reads the same server payload the Achievements page uses.
assert.match(popup, /invoke\("features",\s*\{\s*body:\s*\{\s*action:\s*"achievements"\s*\}/,
  "popup watcher must call the features achievements action");
assert.match(popup, /\.filter\(\(entry\) => entry\.completed\)/,
  "popup watcher must diff on completed achievements");

// Snapshot state is namespaced per account and the first run only records a
// baseline (never retroactively pops every earned achievement).
assert.match(popup, /SNAPSHOT_PREFIX \+ user\.id/,
  "snapshot key must be namespaced per player id");
assert.match(popup, /First run for this account: record the baseline silently/,
  "first run must set a silent baseline");
assert.match(popup, /if \(previous === null\) \{\s*return;/,
  "first run (no snapshot) must return without showing popups");

// The popup is the Minecraft-style card and content is escaped.
assert.match(popup, /Achievement Unlocked!/,
  "popup must render the Minecraft-style heading");
assert.match(popup, /escapeHtml\(name\)/,
  "achievement name must be HTML-escaped");
assert.match(popupCss, /\.mc-achv\b/,
  "popup stylesheet must define the .mc-achv card");
assert.match(popupCss, /@media \(prefers-reduced-motion: reduce\)/,
  "popup stylesheet must respect reduced motion");

// ── Volcanic Depths themed destination ────────────────────────────────

assert.match(expeditionsHtml, /destination--volcanic/,
  "Volcanic Depths card must carry the volcanic modifier");
assert.match(expeditionsHtml, /class="ember-field"[^>]*aria-hidden="true"/,
  "ember field must be decorative (aria-hidden)");
assert.match(expeditionsCss, /\.destination--volcanic\{[^}]*filter:none/,
  "volcanic theme must override the desaturating WIP filter");
assert.match(expeditionsCss, /@keyframes volcanic-ember/,
  "volcanic theme must define the ember animation");

// Reduced motion must silence the ember/glow animation.
assert.match(
  expeditionsCss,
  /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?\.ember-field\{display:none\}/,
  "volcanic embers must be hidden under reduced motion"
);

// Bug fix: buttons live inside .destination__actions, so that wrapper (the
// real flex child) must be the one pushed to the card bottom.
assert.match(expeditionsCss, /\.destination__actions\{[^}]*margin-top:auto/,
  ".destination__actions must be bottom-aligned so CTAs line up across cards");

console.log("achievement-unlock-popup-test passed");

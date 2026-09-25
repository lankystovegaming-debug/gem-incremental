import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const gemCut = read("src/ui/gemCut.js");
const gemStyle = read("src/ui/gemStyle.js");
const appCss = read("src/styles/app.css");
const signInState = read("src/ui/signInState.js");
const shell = read("src/ui/shell.js");

// ---------- Faceted SVG gem cuts ----------

assert.match(gemCut, /export function gemCutSvg\(shape, seed = 0\)/);
assert.match(gemCut, /class="gem-icon__cut" viewBox="0 0 100 100"/);

// Cuts must not use ids/gradients: icon HTML is cached and cloned.
assert.doesNotMatch(gemCut, /\bid="/);
assert.doesNotMatch(gemCut, /Gradient/);

// Every silhouette gemStyle.js can pick has a drawing.
const shapesInStyle = new Set([
  ...[...gemStyle.matchAll(/:\s*"(brilliant|emerald-cut|cushion|oval|cabochon|crystal|hex|freeform)"/g)].map((match) => match[1]),
  "diamond",
  "crystal",
  "hex",
  "shard",
  "cushion",
  "prism"
]);

for (const shape of shapesInStyle) {
  if (shape === "cabochon") {
    assert.match(gemCut, /shape === "cabochon"/);
    continue;
  }

  assert.match(gemCut, new RegExp(`["\\s]${shape}"?: \\w+Cut`), `missing cut for ${shape}`);
}

assert.match(gemStyle, /import \{ gemCutSvg \} from "\.\/gemCut\.js";/);
assert.match(gemStyle, /const usesPhotoSpecimen = realism === "photoreal" && specimen !== "none";/);
assert.match(gemStyle, /usesPhotoSpecimen \? "" : "gem-icon--cut"/);
assert.match(gemStyle, /usesPhotoSpecimen \? "" : gemCutSvg\(shape, hashString\(safeName\)\)/);

// Legacy CSS layers are hidden only for SVG-cut icons; photoreal
// specimen photos keep their ::after image.
assert.match(appCss, /\.gem-icon--cut::after,\s*\.gem-icon--cut \.gem-icon__facet,\s*\.gem-icon--cut \.gem-icon__core,\s*\.gem-icon--cut \.gem-icon__shine \{\s*display: none;/);
assert.match(appCss, /\.gem-icon__cut \.c-tb \{ fill: var\(--cut-table\); \}/);
assert.match(appCss, /\.gem-icon--cut\[data-gem-realism="gemstone"\]/);
assert.match(appCss, /\.gem-icon--cut\.gem-icon--mutation-gilded \.cut-rim/);
assert.match(appCss, /\.gem-icon--cut\.gem-icon--mutation-corrupted \.gem-icon__cut/);

// ---------- Signed-out empty states ----------

assert.match(signInState, /export function signInEmptyStateHtml\(/);
assert.match(signInState, /href="\$\{base\}account\/"/);
assert.match(appCss, /\.empty--signin \{/);

const signedOutPages = {
  "inventory/inventory.js": /showSignedOutState\(\);/,
  "crafting/crafting.js": /recipeList\.innerHTML = signInEmptyStateHtml\(/,
  "boosts/boosts.js": /potionList\.innerHTML = signInEmptyStateHtml\(/,
  "gem-index/index.js": /if \(state\.signedOut\) \{\s*gemList\.innerHTML = `<div class="index-error">\$\{signInEmptyStateHtml\(/
};

for (const [path, pattern] of Object.entries(signedOutPages)) {
  const source = read(path);
  assert.match(source, /import \{ signInEmptyStateHtml \} from "\.\.\/src\/ui\/signInState\.js";/, path);
  assert.match(source, pattern, path);
}

// Gem Index buttons use the design-system .btn class, not the
// nonexistent .button class that rendered as a browser default.
for (const path of ["gem-index/index.html", "gem-index/index.js"]) {
  assert.ok(!/class="button\b/.test(read(path)), `${path} still uses the unstyled .button class`);
}

// ---------- Mobile polish ----------

assert.match(shell, /function keepSegmentedTabsInView\(\)/);
assert.ok(
  /keepSegmentedTabsInView\(\);\r?\n\r?\n  const header = document\.createElement\("header"\);/.test(shell),
  "mountShell() must bind the tab-strip scroll helper"
);
assert.match(appCss, /no-repeat local/);
assert.match(appCss, /\.field-with-prefix > span \{\s*flex: 0 0 auto;\s*white-space: nowrap;/);
assert.match(appCss, /@media \(max-width: 460px\) \{\s*\.session-insights__stats,\s*\.session-insights__highlights \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);

console.log("UI polish (gem cuts, signed-out states, mobile) test passed.");

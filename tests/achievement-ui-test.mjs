import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, ui, css] = await Promise.all([
  readFile(new URL("../achievements/index.html", import.meta.url), "utf8"),
  readFile(new URL("../achievements/achievements.js", import.meta.url), "utf8"),
  readFile(new URL("../achievements/achievements.css", import.meta.url), "utf8")
]);

assert.match(html, /achievementSearch/);
assert.match(html, /milestone track/i);
assert.match(ui, /CATEGORY_META/);
assert.match(ui, /summary-meter/);
assert.match(ui, /S\.search/);
assert.match(ui, /ready to claim/);
assert.match(css, /achievement-hero__copy/);
assert.match(css, /summary-primary/);
assert.match(css, /achievement-search/);
assert.match(css, /state-ready/);
assert.match(css, /prefers-reduced-motion/);

console.log("Achievement UI checks passed");

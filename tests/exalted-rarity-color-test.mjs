import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/styles/app.css", "utf8");
const format = fs.readFileSync("src/ui/format.js", "utf8");

assert.match(format, /id:\s*"exalted"/);
assert.equal((css.match(/--rarity-exalted:/g) ?? []).length, 4);
assert.match(css, /--rarity-exalted:\s*#fb923c/);
assert.match(css, /--rarity-exalted:\s*#c2410c/);
assert.match(css, /--rarity-exalted:\s*#ff9f43/);
assert.match(css, /\.tier-exalted\s*\{\s*--tier:\s*var\(--rarity-exalted\);\s*\}/);

console.log("Exalted rarity color checks passed");

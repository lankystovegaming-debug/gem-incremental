import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sharedStyles, rollStyles] = await Promise.all([
  readFile(new URL("../src/styles/app.css", import.meta.url), "utf8"),
  readFile(new URL("../style.css", import.meta.url), "utf8")
]);

assert.match(sharedStyles, /content-visibility: auto/);
assert.match(sharedStyles, /contain-intrinsic-size: auto 280px/);
assert.match(sharedStyles, /@media \(max-width: 520px\)[\s\S]*?\.stat-row[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(sharedStyles, /@media \(max-width: 720px\)[\s\S]*?backdrop-filter: none/);
assert.match(sharedStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation-duration: 0\.01ms/);
assert.match(rollStyles, /min-height: clamp\(280px, 34vw, 360px\)/);
assert.match(rollStyles, /@media \(max-width: 600px\)[\s\S]*?min-height: 272px/);

console.log("UI responsiveness checks passed");

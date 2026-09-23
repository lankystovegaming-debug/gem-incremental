import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../gem-index/index.js", import.meta.url), "utf8");
const start = source.indexOf("async function loadCombinations");
const end = source.indexOf("\nfunction unwrapRows", start);
const loader = source.slice(start, end);

assert.match(source, /const PAGE_SIZE = 1000/);
assert.match(loader, /\.order\("id", \{ ascending: true \}\)/);
assert.match(loader, /\.range\(from, from \+ PAGE_SIZE - 1\)/);
assert.match(loader, /if \(\(data\?\.length \?\? 0\) < PAGE_SIZE\) break/);
assert.match(loader, /throw new Error\(`Discovery history could not be loaded:/,
  "query failures must not silently masquerade as no discoveries");

console.log("Gem Index discovery pagination checks passed.");

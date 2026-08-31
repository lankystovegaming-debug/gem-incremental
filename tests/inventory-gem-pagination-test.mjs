import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const inventory = await readFile(
  new URL("../src/backend/cloudInventory.js", import.meta.url),
  "utf8"
);

assert.match(inventory, /const INVENTORY_PAGE_SIZE = 500/);
assert.match(inventory, /for \(let offset = 0; ; offset \+= INVENTORY_PAGE_SIZE\)/);
assert.match(inventory, /\.order\("created_at", \{ ascending: true \}\)\s+\.order\("id", \{ ascending: true \}\)/);
assert.match(inventory, /\.range\(offset, offset \+ INVENTORY_PAGE_SIZE - 1\)/);
assert.match(inventory, /gems\.push\(\.\.\.page\)/);
assert.match(inventory, /if \(page\.length < INVENTORY_PAGE_SIZE\) \{\s+break/);
assert.match(inventory, /if \(error\) \{[\s\S]*return null;[\s\S]*const page = data \?\? \[\]/);

console.log("Inventory gem pagination checks passed.");

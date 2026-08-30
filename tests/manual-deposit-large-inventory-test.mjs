import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../supabase/functions/manual-deposit/index.ts", import.meta.url),
  "utf8"
);

const inventoryQuery = source.match(
  /let gemQuery =\s+ctx\.supabase[\s\S]*?if \(gemsError\)/
)?.[0] ?? "";

assert.match(inventoryQuery, /typeof requirement\.gem === "string"/);
assert.match(inventoryQuery, /gemQuery = gemQuery\.eq\(\s*"gem_name",\s*requirement\.gem/);
assert.match(inventoryQuery, /gemQuery = gemQuery\.in\(\s*"gem_name",\s*requirement\.gems/);
assert.match(inventoryQuery, /await gemQuery\s+\.order\(/);

const exactGemFilter = inventoryQuery.indexOf("gemQuery.eq(");
const queryExecution = inventoryQuery.indexOf("await gemQuery");
assert.ok(exactGemFilter >= 0 && exactGemFilter < queryExecution);

console.log("Large-inventory manual deposit checks passed.");

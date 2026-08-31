import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import gems from "../src/data/gems.js";

const adminId = "004d883f-edbc-4610-b5e3-9068a0de0ca2";
const functionSource = readFileSync(
  new URL("../supabase/functions/admin/index.ts", import.meta.url),
  "utf8"
);
const shellSource = readFileSync(
  new URL("../src/ui/shell.js", import.meta.url),
  "utf8"
);
const pageSource = readFileSync(
  new URL("../admin/admin.js", import.meta.url),
  "utf8"
);

assert.ok(functionSource.includes(adminId), "server authorizes the configured admin");
assert.ok(shellSource.includes(adminId), "shell recognizes the configured admin");
assert.ok(pageSource.includes(adminId), "admin page recognizes the configured admin");

for (const action of [
  "search", "inspect", "money", "grant_gem", "potion",
  "reset_cooldown", "account_lock", "audit"
]) {
  assert.ok(functionSource.includes(`action === "${action}"`), `${action} is implemented`);
}

const catalogSource = functionSource.match(
  /const GEM_CATALOG = (\[[\s\S]*?\n\])\.map/
)?.[1];
assert.ok(catalogSource, "admin gem catalog can be read");
const catalogRows = Function(`"use strict"; return ${catalogSource}`)();

assert.deepEqual(
  catalogRows.toSorted(([left], [right]) => left.localeCompare(right)),
  gems.map(({ name, rarity, baseWeight, valuePerGram }) => [
    name, rarity, baseWeight, valuePerGram
  ]).toSorted(([left], [right]) => left.localeCompare(right)),
  "admin and game gem catalogs match"
);

assert.match(functionSource, /async function loadGemCatalog\(ctx: any\)/);
assert.match(functionSource, /\.from\("private_feature_gems"\)/);
assert.match(
  functionSource,
  /action === "grant_gem"[\s\S]*?await loadGemCatalog\(ctx\)[\s\S]*?invalid_gem/
);
assert.match(
  functionSource,
  /action === "grant_all_gems"[\s\S]*?await loadGemCatalog\(ctx\)/
);

console.log("Admin panel tests passed.");

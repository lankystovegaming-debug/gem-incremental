import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const path of [
  "supabase/functions/admin/index.ts",
  "gem-incremental-admin-panel/supabase/functions/admin/index.ts"
]) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.match(source, /async function loadGemCatalog\(ctx: any\)/, `${path} loads the live catalog`);
  assert.match(source, /\.from\("private_feature_gems"\)/, `${path} reads private_feature_gems`);
  assert.match(
    source,
    /action === "grant_gem"[\s\S]*?await loadGemCatalog\(ctx\)[\s\S]*?invalid_gem/,
    `${path} validates a single grant against the live catalog`
  );
  assert.match(
    source,
    /action === "grant_all_gems"[\s\S]*?await loadGemCatalog\(ctx\)/,
    `${path} builds grant-all from the live catalog`
  );
}

console.log("Admin live gem catalog sync checks passed.");

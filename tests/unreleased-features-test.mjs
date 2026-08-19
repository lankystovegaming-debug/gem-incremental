import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);

const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
assert.match(main, /buildJaOreCutscene/);
assert.match(main, /gemName\.toLowerCase\(\) === "ja-ore"/);

const cutscene = fs.readFileSync(path.join(root, "src/ui/jaOreCutscene.js"), "utf8");
assert.match(cutscene, /retro pixel-cinema/);
assert.match(cutscene, /buildJaOreCutscene/);

const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260819000010_unreleased_expansion_features.sql"),
  "utf8"
);
for (const id of ["world-bosses","relic-vault","seasons","bounties","treasure-expeditions"]) {
  assert.match(migration, new RegExp(`'${id}'`));
}
for (const name of ["world-bosses","relics","seasons","bounties","treasure-expeditions"]) {
  assert.ok(fs.existsSync(path.join(root, "supabase/functions", name, "index.ts")));
}
console.log("Unreleased expansion feature checks passed.");

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
assert.match(main, /buildJaOreCutscene/);
assert.match(main, /gemName\.toLowerCase\(\) === "ja-ore"/);

const cutscene = fs.readFileSync(path.join(root, "src/ui/jaOreCutscene.js"), "utf8");
const cutsceneCss = fs.readFileSync(path.join(root, "src/ui/jaOreCutscene.css"), "utf8");
assert.match(cutscene, /pixel-cinema/);
assert.match(cutscene, /With our powers combined/);
assert.match(cutscene, /JA_ORE_DATA_URI/);
assert.match(cutscene, /buildJaOreCutscene/);
assert.match(cutsceneCss, /data:image\/png;base64/);

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

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = [
  "artifact-archives","gem-fusion","enchanting-lab","collection-hall",
  "mining-events","merchant-caravan","research-tree"
];

for (const type of types) {
  assert.ok(fs.existsSync(path.join(root,type,"index.html")), `${type} page missing`);
  assert.ok(fs.existsSync(path.join(root,type,`${type}.js`)), `${type} JS missing`);
  assert.ok(fs.existsSync(path.join(root,type,`${type}.css`)), `${type} CSS missing`);
  const html = fs.readFileSync(path.join(root,type,"index.html"),"utf8");
  assert.match(html, /disabled until you enable/i);
}

const migration = fs.readFileSync(
  path.join(root,"supabase/migrations/20260819000011_expansion_feature_lab_v2.sql"),"utf8"
);
assert.match(migration, /create table if not exists public\.expansion_feature_definitions/i);
for (const type of types) assert.match(migration, new RegExp(`'${type}'`));

const replay = fs.readFileSync(path.join(root,"src/ui/cutsceneReplay.js"),"utf8");
assert.match(replay, /buildJaOreCutscene/);
assert.match(replay, /replayName === "ja-ore"/);

const upcoming = fs.readFileSync(path.join(root,"upcoming/index.html"),"utf8");
assert.match(upcoming, /data-tab="expansion"/);
const lab = fs.readFileSync(path.join(root,"upcoming/expansionLab.js"),"utf8");
assert.match(upcoming, /Structured configuration/);
assert.doesNotMatch(lab, /textarea[^>]+class="[^"]*raw-json/i);

console.log(`Expansion feature smoke test passed for ${types.length} systems.`);

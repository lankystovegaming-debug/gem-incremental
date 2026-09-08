import assert from "node:assert/strict";
import fs from "node:fs";

const saved = new Map();
globalThis.localStorage = {
  getItem(key) { return saved.has(key) ? saved.get(key) : null; },
  setItem(key, value) { saved.set(key, String(value)); }
};
globalThis.window = { addEventListener() {} };

const chances = await import("../src/logic/chances.js");
let cloud = { legacyAutoSell:false };
globalThis.__settingsBackend = {
 from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{settings:cloud},error:null}}};},
 async rpc(_name,{p_patch}){cloud={...cloud,...p_patch};return {data:cloud,error:null};}
};
const settingsSource=fs.readFileSync(new URL('../src/ui/settings.js',import.meta.url),'utf8')
 .replace('import { supabase } from "../backend/supabase.js";', 'const supabase=globalThis.__settingsBackend;')
 .replace('import { ensurePlayerAuth } from "../backend/auth.js";', 'const ensurePlayerAuth=async()=>({id:"test"});')
 .replace('"../data/mutations.js"',JSON.stringify(new URL('../src/data/mutations.js',import.meta.url).href));
const settings=await import('data:text/javascript;base64,'+Buffer.from(settingsSource).toString('base64'));

assert.equal(chances.meetsChatChanceThreshold("Uranium"), false);
assert.equal(chances.chanceDenominator({ name: "Uranium", rarity: 5_000 }), 5_000);
assert.equal(chances.meetsChatChanceThreshold({ name: "Uranium", rarity: 5_000 }), false);

assert.equal(
  settings.effectiveRarityForResult({
    gem: { name: "Diamond", rarity: 2_300 },
    mutationIds: ["gilded"]
  }),
  1_150_000
);
assert.equal(settings.shouldAutoKeep({
  gem: { name: "Diamond", rarity: 2_300 },
  mutationIds: ["gilded"]
}), true);
assert.equal(settings.shouldAutoKeep({
  gem: { name: "Aether Quartz", rarity: 140_000 },
  mutationIds: []
}), false);
assert.equal(settings.shouldAutoKeep({
  gem: { name: "Enchant Relic", rarity: 250, dropType: "relic" }
}), true);

await settings.updateSettings({ autoKeepEffectiveRarity: 2_000_000 });
assert.equal(settings.shouldAutoKeep({
  gem: { name: "Diamond", rarity: 2_300 },
  mutationIds: ["gilded"]
}), false);

const rollFunction = fs.readFileSync(
  new URL("../supabase/functions/roll/index.ts", import.meta.url),
  "utf8"
);
assert.match(rollFunction, /effectiveRarity\s*>=\s*50_000_000/);
assert.match(rollFunction, /effective_rarity:\s*effectiveRarity/);
assert.doesNotMatch(
  rollFunction,
  /const effectiveRarity\s*=\s*Math\.max\([^\n]*mutationMultiplier/
);

console.log("Chat and Auto Keep hotfix tests passed.");

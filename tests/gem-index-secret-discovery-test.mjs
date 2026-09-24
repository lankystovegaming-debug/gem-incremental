import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indexCombinationRecords } from "../src/logic/gemIndex.js";

const source = readFileSync(new URL("../gem-index/index.js", import.meta.url), "utf8");
const indexed = indexCombinationRecords([{
  gem_name: "Secret Gem",
  combination_key: "polished+gilded",
  mutation_ids: ["gilded", "polished"],
  total_found: 1
}]);

assert.equal(indexed.discoveredGemNames.has("Secret Gem"), true,
  "any exact combination must reveal the gem identity");
assert.equal(indexed.combinations.has("Secret Gem::gilded+polished"), true,
  "exact discovery must use the canonical combination key");
assert.match(source, /function identityDiscovered\(entry\)[\s\S]*state\.discoveredGemNames\.has/);
assert.match(source, /function exactCombinationDiscovered\(entry\)[\s\S]*discoveredRecord\(entry\)/);
assert.match(source, /Gem identified; this exact mutation combination has not been found\./);
assert.doesNotMatch(source, /UNKNOWN_TIER/,
  "locked cards should remain in the visible Secret rarity category");
assert.match(source, /function displayTier\(entry\)[\s\S]*rarityTier\(entry\.gem\.rarity, entry\.gem\.name\)/);
assert.match(source, /const searchableName = identityDiscovered\(entry\) \? entry\.gem\.name\.toLowerCase\(\) : ""/,
  "search must not reveal locked names");

console.log("Gem Index secret discovery checks passed.");

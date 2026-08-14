import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import gems from "../src/data/gems.js";
import { rarityTier } from "../src/ui/format.js";

const expected = {
  Citrine: [90, "rare"],
  Moonstone: [750, "epic"],
  Demantoid: [6800, "legendary"],
  Jeremejevite: [14000, "mythic"],
  Poudretteite: [22000, "mythic"],
  Serendibite: [35000, "mythic"],
  "Blue Garnet": [55000, "mythic"],
  Kyawthuite: [85000, "mythic"],
  "Aether Quartz": [140000, "exotic"],
  "Void Opal": [250000, "exotic"],
  Chronite: [480000, "exotic"],
  "Neutron Crystal": [800000, "exotic"],
  "Antimatter Crystal": [1800000, "cosmic"],
  "Singularity Shard": [4000000, "cosmic"],
  "Lanky Gem": [10000000, "cosmic"]
};

for (const [name, [rarity, tier]] of Object.entries(expected)) {
  const gem = gems.find((item) => item.name === name);
  assert.ok(gem, `${name} exists`);
  assert.equal(gem.rarity, rarity);
  assert.equal(rarityTier(gem.rarity).id, tier);
}

assert.equal(gems.length, 46);

const lanky = gems.find((gem) => gem.name === "Lanky Gem");
assert.equal(lanky.baseWeight, 40500);
assert.equal(lanky.hideRarityUntilDiscovered, true);
assert.ok(Math.abs(lanky.baseWeight * lanky.valuePerGram - 4500000) < 10);

assert.equal(rarityTier(99).id, "rare");
assert.equal(rarityTier(100).id, "epic");
assert.equal(rarityTier(1000).id, "legendary");
assert.equal(rarityTier(10000).id, "mythic");
assert.equal(rarityTier(100000).id, "exotic");
assert.equal(rarityTier(1000000).id, "cosmic");

const rollSource = readFileSync(
  new URL("../supabase/functions/roll/index.ts", import.meta.url),
  "utf8"
);
const serverArraySource = rollSource.match(/const gems = (\[[\s\S]*?\n\]);/)?.[1];
assert.ok(serverArraySource, "server gem array can be read");
const serverGems = Function(`"use strict"; return ${serverArraySource}`)();

assert.deepEqual(
  serverGems,
  gems.map(({ name, rarity, baseWeight, valuePerGram }) => ({
    name, rarity, baseWeight, valuePerGram
  })),
  "client and authoritative roll gem data match"
);

console.log("Gem expansion tests passed.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "../main.js",
  "../inventory/inventory.js",
  "../crafting/crafting.js",
  "../research-tree/research-tree.js",
  "../auctions/auctions.js",
  "../guilds/guilds.js",
  "../expeditions/expeditions.js"
];
const files = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")));
const [roll, inventory, crafting, research, market, guilds, expeditions] = files;

assert.match(roll, /automationPulse/);
assert.match(roll, /rolls\/min/);
assert.match(inventory, /savedFilter/);
assert.match(inventory, /duplicateGems/);
assert.match(inventory, /function finalWeightMultiplier\(gem\)/);
assert.match(inventory, /return finalWeight \/ baseWeight/);
assert.match(inventory, /formatMultiplier\(\s*finalWeightMultiplier\(gem\)/);
assert.match(inventory, /Lock .*visible/);
assert.match(crafting, /craftingNext/);
assert.match(crafting, /PINNED_RECIPE_STORAGE_KEY/);
assert.match(research, /Plan a build|planToggle/);
assert.match(research, /Suggested next/);
assert.match(market, /WATCHLIST_KEY/);
assert.match(market, /Median/);
assert.match(guilds, /activityFeed/);
assert.match(guilds, /missionPreview/);
assert.match(expeditions, /artifactOpportunities/);
assert.doesNotMatch(expeditions, /historyList/);

console.log("Progression quality-of-life checks passed");

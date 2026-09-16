import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MASTERWORK_PASSIVES, masterworkLevelCost, masterworkRerollCost } from "../src/data/masterwork.js";

assert.deepEqual(masterworkLevelCost(10, 5), { money: 25_000_000, enchant: 10, ancient: 3 });
assert.deepEqual(masterworkLevelCost(13, 5), { money: 41_250_000, enchant: 15, ancient: 5 });
assert.equal(Object.keys(MASTERWORK_PASSIVES.pickaxe).length, 4);
assert.equal(Object.keys(MASTERWORK_PASSIVES.lantern).length, 4);
assert.equal(Object.keys(MASTERWORK_PASSIVES.boots).length, 4);
assert.equal(masterworkLevelCost(9, 6), null);
assert.deepEqual(masterworkRerollCost(13, 4, "imprint"), { money: 123_750_000, enchant: 9, ancient: 3 });

const html = readFileSync(new URL("../inventory/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../inventory/inventory.css", import.meta.url), "utf8");
assert.match(html, /<details class="card forge-guide">/);
assert.match(html, /Each level adds 1% to its equipment bonuses/);
assert.match(html, /Level 3 grants a random Rank I passive/);
assert.match(html, /Ancient Insight presents three choices/);
assert.match(html, /Attune Level 4\+ pickaxes/);
assert.match(html, /equipment itself is never consumed/);
assert.match(css, /\.forge-guide__grid/);
assert.ok(css.includes('.forge-guide__grid { grid-template-columns:1fr; }'));

console.log("Masterwork Forge tests passed.");

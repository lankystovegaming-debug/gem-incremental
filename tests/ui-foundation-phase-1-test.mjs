import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [styles, mobileSheet, inventoryCss, inventoryJs, roll, inventory, settings, crafting, market] = await Promise.all([
  read("src/styles/app.css"),
  read("src/ui/mobileSheet.js"),
  read("inventory/inventory.css"),
  read("inventory/inventory.js"),
  read("index.html"),
  read("inventory/index.html"),
  read("settings/index.html"),
  read("crafting/index.html"),
  read("auctions/index.html")
]);

for (const token of [
  "--touch-target: 44px",
  "--card-padding:",
  "--safe-area-bottom:",
  "--floating-nav-clearance:",
  "--popover-max-height:"
]) {
  assert.ok(styles.includes(token), `missing shared token ${token}`);
}

for (const contract of [
  ".page-hero",
  ".form-row",
  ".responsive-tabs",
  ".mobile-sheet",
  ".action-bar"
]) {
  assert.ok(styles.includes(contract), `missing shared contract ${contract}`);
}

assert.match(styles, /@media \(max-width: 780px\)[\s\S]*?min-height: var\(--touch-target\)/);
assert.match(styles, /@media \(max-width: 560px\)[\s\S]*?\.dialog-overlay[\s\S]*?place-items: end center/);
assert.match(styles, /:where\(\.menu, \.popover, \.dropdown\)[\s\S]*?max-height: var\(--popover-max-height\)/);

assert.match(mobileSheet, /export function mountMobileSheet/);
assert.match(mobileSheet, /event\.key === "Escape"/);
assert.match(mobileSheet, /event\.key !== "Tab"/);
assert.match(mobileSheet, /document\.body\.classList\.toggle\("mobile-sheet-open", open\)/);
assert.match(inventoryJs, /mountMobileSheet\(\{/);
assert.doesNotMatch(inventoryCss, /\.inventory-filter-sheet\s*\{[\s\S]*?position:\s*fixed/);

for (const [name, page] of [
  ["inventory", inventory],
  ["settings", settings],
  ["crafting", crafting],
  ["market", market]
]) {
  assert.match(page, /page-head page-hero/, `${name} should use PageHero`);
}

assert.match(settings, /setting form-row/);
assert.match(roll, /automation__row automation__row--select form-row/);
assert.match(roll, /session-insights__actions action-bar/);
assert.match(crafting, /segmented responsive-tabs crafting-tabs/);
assert.match(market, /segmented responsive-tabs tabs/);
assert.match(market, /sell-row form-row form-row--fields/);
assert.match(inventory, /inventory-filter-sheet mobile-sheet/);
assert.match(inventory, /inventory-filter-backdrop mobile-sheet-backdrop/);
assert.match(inventory, /delete-rules__actions action-bar/);

console.log("PASS: Phase 1 shared responsive UI foundation contracts and representative migrations");

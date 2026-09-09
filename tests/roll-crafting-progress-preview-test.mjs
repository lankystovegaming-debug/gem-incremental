import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("index.html");
const script = read("main.js");
const styles = read("style.css");
const crafting = read("src/logic/crafting.js");

const automation = page.indexOf('id="section-automation"');
const preview = page.indexOf('id="craftingProgressPreview"');
const session = page.indexOf('id="section-session-history"');
assert.ok(automation < preview && preview < session, "crafting preview should sit between Automation and This session");
assert.match(page, /read-only preview/i);
assert.doesNotMatch(page.slice(preview, session), /deposit/i);
assert.match(script, /CRAFTING_PREVIEW_REFRESH_MS = 60_000/);
assert.match(script, /loadCloudCraftingState\(\)/);
assert.match(script, /refreshCraftingProgressPreview\(\)/);
assert.match(styles, /\.crafting-preview__recipe/);
assert.match(crafting, /requirement\.type === "lifetime-rolls"[\s\S]*inventory\?\.totalRolls/);

console.log("Roll-page crafting progress preview checks passed.");

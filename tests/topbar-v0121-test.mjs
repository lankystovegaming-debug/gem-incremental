import assert from "node:assert/strict";
import fs from "node:fs";

const shell = fs.readFileSync(new URL("../src/ui/shell.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
const updates = fs.readFileSync(new URL("../updates/index.html", import.meta.url), "utf8");

assert.match(shell, /CORE_PAGE_IDS[^\n]+roll[^\n]+inventory[^\n]+crafting[^\n]+boosts[^\n]+auctions[^\n]+expeditions/);
assert.match(shell, /id: "expeditions", label: "Expeditions", short: "Exped\.", href: "expeditions\/", icon: icons\.map/);
assert.match(shell, /shellExploreButton/);
assert.match(shell, /shellExploreMenu/);
assert.match(shell, /menuNavLink\(configured/);
assert.match(shell, /tabbar\.innerHTML = CORE_PAGES/);
assert.doesNotMatch(shell, /header\.querySelector\("\.nav"\)\?\.insertAdjacentHTML\("beforeend", navLink\(configured/);
assert.match(styles, /\.topbar-explore__menu/);
assert.match(updates, /v0\.12\.1/);
assert.match(updates, /Cleaner Navigation/);

console.log("Topbar v0.12.1 tests passed.");

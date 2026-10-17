import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [shell, styles, settings, mobileSheet, tour] = await Promise.all([
  read("src/ui/shell.js"),
  read("src/styles/app.css"),
  read("settings/index.html"),
  read("src/ui/mobileSheet.js"),
  read("src/ui/tour.js")
]);

assert.match(shell, /const DESKTOP_PRIMARY_LIMIT = 7/);
assert.match(shell, /const MOBILE_PRIMARY_LIMIT = 4/);
assert.match(shell, /getConfiguredNavigationPages\(\)\.slice\(0, DESKTOP_PRIMARY_LIMIT\)/);
assert.match(shell, /getConfiguredNavigationPages\(\)\.slice\(0, MOBILE_PRIMARY_LIMIT\)/);
assert.match(shell, /id="mobileNavigationTrigger"/);
assert.match(shell, /className = "mobile-navigation-sheet mobile-sheet"/);
assert.match(shell, /id="mobileNavigationSearch"/);
assert.match(shell, /renderMobileNavigationGroups\(getMobileMorePages\(\), page, base\)/);
assert.match(shell, /Settings &amp; help/);
assert.match(shell, /data-more-action="console"/);
assert.match(shell, /requestAnimationFrame\(\(\) => exploreMenu\.querySelector/);
assert.match(shell, /body\.classList\.add\("quick-nav-open"\)/);
assert.match(shell, /event\.key === "Tab"/);
assert.match(shell, /returnFocus\.focus/);

assert.match(styles, /\.topbar-explore__menu:not\(\[hidden\]\)[\s\S]*?display: grid/);
assert.match(styles, /width: min\(760px/);
assert.match(styles, /\.topbar-explore,[\s\S]*?\.topbar-settings,[\s\S]*?display: none/);
assert.match(styles, /\.mobile-navigation-sheet\.mobile-sheet[\s\S]*?z-index: 1301/);
assert.match(styles, /\.mobile-navigation-grid[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(styles, /\.mobile-navigation-row[\s\S]*?min-height: 52px/);
assert.match(settings, /Up to seven appear in the desktop top bar/);
assert.match(settings, /first four available choices appear in the mobile bottom bar/);
assert.match(mobileSheet, /mobile-sheet:opening/);
assert.match(tour, /querySelectorAll\('\[data-more-action="howto"\]'\)/);

console.log("PASS: Phase 2 desktop and mobile navigation contracts");

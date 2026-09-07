import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const html = read("admin/index.html");
const js = read("admin/admin.js");
const css = read("admin/admin.css");

// ── Tab bar markup ────────────────────────────────────────────────────
assert.match(html, /<nav class="admin-tabs" id="adminTabs"[^>]*hidden>/);
for (const tab of ["search", "economy", "content", "community"]) {
  assert.match(html, new RegExp(`data-admin-tab="${tab}"`), `tab bar must have the ${tab} tab`);
}
// The player search card gets an id so it can be moved into the Search tab.
assert.match(html, /<section class="card admin-search" id="adminSearchCard">/);

// ── Controller groups panels into tab pages ───────────────────────────
assert.match(js, /function initAdminTabs\(\)/);
// Player search + player panel live in the Search tab (not Feature Lab).
assert.match(js, /search: \["#adminSearchCard", "#searchResults", "#playerPanel", "#auditPanel"\]/);
assert.match(js, /economy: \["#analyticsPanel", "#shareholdersPanel", "#bankPanel"\]/);
assert.match(js, /community: \["#guildRosterPanel", "#referralsPanel", "#ipAuditPanel"\]/);
// Builds a page wrapper per tab and switches between them.
assert.match(js, /data\.adminTabPage = name|dataset\.adminTabPage = name/);
assert.match(js, /function showAdminTab\(name\)/);
assert.match(js, /page\.hidden = tab !== name/);
// Feature Lab is a separate overlay, not a tab — it is NOT in any group.
assert.doesNotMatch(js, /adminFeatureLab["']\]/);
// Heavy panels load only when their tab is first opened.
assert.match(js, /const LAZY = \{[\s\S]*loadAnalytics[\s\S]*loadIpAudit/);
assert.match(js, /if \(!loaded\.has\(name\) && LAZY\[name\]\)/);
// Reveals only once admin access is verified (Feature Lab button enabled).
assert.match(js, /MutationObserver/);
assert.match(js, /attributeFilter: \["disabled"\]/);
// The now-redundant header buttons are hidden (tabs replace them).
assert.match(js, /\["analyticsButton", "ipAuditButton"\]\.forEach/);

// ── Styling ───────────────────────────────────────────────────────────
assert.match(css, /\.admin-tabs\{/);
assert.match(css, /\.admin-tab-btn\.is-active\{/);
assert.match(css, /\.admin-tab-page\[hidden\]\{display:none\}/);

console.log("admin-panel-tabs-test passed");

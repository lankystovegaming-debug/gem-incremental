import assert from "node:assert/strict";
import fs from "node:fs";

const shell = fs.readFileSync(new URL("../src/ui/shell.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");

assert.match(styles, /\.topbar\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0 0 auto;/s);
assert.match(styles, /body\s*\{[^}]*padding-top:\s*var\(--nav-height\);/s);
assert.match(styles, /@media \(max-width:\s*780px\)[\s\S]*--nav-height:\s*58px;/);

assert.match(shell, /id:\s*"indexes"[\s\S]*pageIds:\s*\["gem-index", "mutation-index"/);
assert.match(shell, /renderExploreGroups\(EXPLORE_PAGES, page, base\)/);
assert.match(shell, /data-explore-group=/);
assert.match(shell, /appendExploreItem\(configured, page, base\)/);
assert.match(shell, /appendExploreItem\(adminPage, page, base\)/);
assert.doesNotMatch(shell, /EXPLORE_PAGES\.map\(\(item\) => menuNavLink/);

console.log("Fixed header and grouped Explore tests passed.");

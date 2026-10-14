import assert from "node:assert/strict";
import fs from "node:fs";

const shell = fs.readFileSync(new URL("../src/ui/shell.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");

assert.match(styles, /\.topbar\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0 0 auto;/s);
assert.match(styles, /body\s*\{[^}]*padding-top:\s*var\(--nav-height\);/s);
assert.match(styles, /@media \(max-width:\s*780px\)[\s\S]*--nav-height:\s*58px;/);

assert.match(shell, /id:\s*"indexes"[\s\S]*pageIds:\s*\["gem-index", "mutation-index"/);
assert.match(shell, /renderExploreGroups\(getExplorePages\(\), page, base\)/);
assert.match(shell, /data-explore-group=/);
assert.match(shell, /exploreMenu\.innerHTML=`<div class="menu__label">Explore<\/div>\$\{renderExploreGroups\(getExplorePages\(\),page,base\)\}`/);
assert.match(shell, /enabledSectionMap = sectionMap;[\s\S]*?rerenderPrimaryNavigation\(\)/);
assert.match(shell, /shellIsAdmin = true;[\s\S]*?rerenderPrimaryNavigation\(\)/);
assert.doesNotMatch(shell, /EXPLORE_PAGES\.map\(\(item\) => menuNavLink/);

console.log("Fixed header and grouped Explore tests passed.");

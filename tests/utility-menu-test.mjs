import assert from "node:assert/strict";
import fs from "node:fs";

const shell=fs.readFileSync(new URL("../src/ui/shell.js",import.meta.url),"utf8");
const onboarding=fs.readFileSync(new URL("../src/ui/onboarding.js",import.meta.url),"utf8");
const upcoming=fs.readFileSync(new URL("../upcoming/upcoming.js",import.meta.url),"utf8");
const migration=fs.readFileSync(new URL("../supabase/migrations/20260819000010_utility_navigation_menu.sql",import.meta.url),"utf8");
const updates=fs.readFileSync(new URL("../updates/index.html",import.meta.url),"utf8");

assert.match(shell,/sectionMap\.get\("utility-menu"\)\?\.enabled/);
assert.match(shell,/mountUtilityMenu/);
assert.match(shell,/data-howto-trigger/);
assert.match(shell,/mountContributeDock\(base\)/);
assert.match(onboarding,/howtoReady/);
assert.match(upcoming,/"utility-menu"/);
assert.match(migration,/'utility-menu'.*false/s);
assert.match(updates,/v0\.9\.1\.1/);
assert.match(updates,/Cleaner Utility Navigation/);

console.log("Utility menu tests passed.");

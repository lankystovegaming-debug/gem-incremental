import assert from "node:assert/strict";
import fs from "node:fs";

const shell=fs.readFileSync(new URL("../src/ui/shell.js",import.meta.url),"utf8");
const onboarding=fs.readFileSync(new URL("../src/ui/onboarding.js",import.meta.url),"utf8");
const upcoming=fs.readFileSync(new URL("../upcoming/upcoming.js",import.meta.url),"utf8");
const migration=fs.readFileSync(new URL("../supabase/migrations/20260819000010_utility_navigation_menu.sql",import.meta.url),"utf8");
const updates=fs.readFileSync(new URL("../updates/index.html",import.meta.url),"utf8");

assert.match(shell,/shellMoreButton|shellMoreMenu|Utility links are now mounted in the top bar/);
assert.match(shell,/shellMoreAnchor|shellMoreButton/);
assert.match(shell,/mountHowToPlay/);
assert.match(shell,/shellMoreMenu|Utility links/);
assert.match(onboarding,/howtoReady|How to play/i);
assert.match(upcoming,/sections|utility|More/i);
assert.match(migration,/utility/i);
assert.match(updates,/v0\.8\.2\.1/);
assert.match(updates,/Update|utility/i);

console.log("Utility menu tests passed.");

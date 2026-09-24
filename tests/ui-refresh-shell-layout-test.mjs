import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const appCss = read("src/styles/app.css");
const cliCss = read("src/styles/cli.css");
const chatCss = read("src/styles/chat.css");
const settingsCss = read("settings/settings.css");
const shell = read("src/ui/shell.js");
const auth = read("src/backend/auth.js");
const account = read("src/backend/account.js");
const settings = read("src/ui/settings.js");
const main = read("main.js");
const page = read("index.html");
const rareRolls = read("src/ui/rareRollsCard.js");
const playerCli = read("src/ui/cli/playerCli.js");


// ---------------------------------------------------------
// Design tokens: --radius-md is used by many page stylesheets and must
// exist, or those corners silently fall back to square.
// ---------------------------------------------------------

assert.match(appCss, /--radius-md: 14px;/);


// ---------------------------------------------------------
// Top bar: measured fitting instead of a clipped, scrolling link row.
// ---------------------------------------------------------

assert.match(shell, /function fitPrimaryNavigation\(\)/);
assert.match(shell, /\["topbar--no-wordmark", "topbar--tight", "topbar--compact"\]/);
assert.match(shell, /nav\.scrollWidth > nav\.clientWidth \+ 1/);
assert.match(shell, /window\.addEventListener\("resize", scheduleNavigationFit/);
assert.match(shell, /rerenderPrimaryNavigation=\(\)=>\{[\s\S]*?scheduleNavigationFit\(\);\r?\n\s*\};/);
assert.match(appCss, /\.nav::-webkit-scrollbar \{\r?\n\s*display: none;/);
assert.match(appCss, /\.topbar--compact \.nav > \.nav__link span/);
assert.match(appCss, /\.topbar--tight \.topbar-more__button > span/);


// ---------------------------------------------------------
// Signed-out visitors (guest sign-ins disabled) get a way in, not a
// "refresh to try again" error on every page.
// ---------------------------------------------------------

assert.match(auth, /export function isSignInRequired\(\)/);
assert.match(auth, /export const SIGN_IN_REQUIRED_MESSAGE/);
assert.match(auth, /code === "anonymous_provider_disabled"/);
// One doomed anonymous sign-in per page load, not one per feature.
assert.match(auth, /if \(guestSignInDisabledError\) \{\r?\n\s*lastAuthError =\r?\n\s*guestSignInDisabledError;/);

assert.match(account, /describeAccount\(user, username = null, \{ signedOut = false \} = \{\}\)/);
assert.match(shell, /function showSignInRequired\(\)/);
assert.match(shell, /if \(isSignInRequired\(\)\) showSignInRequired\(\);/);
assert.match(shell, /id = "shellSignInBanner"/);

assert.match(main, /if \(!user && isSignInRequired\(\)\) \{\r?\n\s*showSignInRequired\(\);/);
assert.match(main, /rollButton\.dataset\.signIn === "true"[\s\S]*?window\.location\.href = "\.\/account\/"/);
assert.match(settings, /error\.code = 'signed_out';/);
assert.match(settings, /export function isSignedOutError\(error\)/);
assert.match(main, /if \(isSignedOutError\(error\)\) return;/);

for (const path of [
  "inventory/inventory.js",
  "crafting/crafting.js",
  "boosts/boosts.js",
  "auctions/auctions.js",
  "leaderboards/leaderboards.js"
]) {
  assert.match(read(path), /isSignInRequired\(\)[\s\S]*?SIGN_IN_REQUIRED_MESSAGE/, `${path} should show the sign-in message`);
}


// ---------------------------------------------------------
// Player console button: styled by the always-loaded sheet, kept clear
// of the chat button, and reachable from More on phones.
// ---------------------------------------------------------

assert.match(appCss, /\.player-cli-fab \{\r?\n\s*position: fixed;/);
assert.doesNotMatch(cliCss, /\.player-cli-fab \{/);
assert.match(playerCli, /export function togglePlayerCli\(\)/);
assert.match(shell, /data-more-action="console"/);
assert.match(shell, /togglePlayerCli\(\);/);


// ---------------------------------------------------------
// Mobile floating controls and tab bar.
// ---------------------------------------------------------

// The chat button clears the tab bar at the same breakpoint it appears.
assert.match(chatCss, /@media \(max-width: 780px\) \{\r?\n\s*\.chat-fab \{/);
// Blur is off on phones, so the tab bar needs a solid surface.
assert.match(appCss, /\.tabbar \{\r?\n\s*padding: 5px 6px calc\(5px \+ env\(safe-area-inset-bottom\)\);[\s\S]*?background: var\(--surface-solid\);/);
assert.match(settingsCss, /label\.setting\.switch \{\r?\n\s*flex-direction: row;/);


// ---------------------------------------------------------
// Roll page: rare rolls still come first in the markup, become a sticky
// side column on wide screens and collapse above the roll button below.
// ---------------------------------------------------------

assert.match(page, /<main class="app-main app-main--narrow app-main--roll">/);
assert.ok(page.indexOf('id="rareRollsCard"') < page.indexOf('id="section-roll-stage"'));
assert.match(page, /id="rareRollsToggle"/);
assert.match(rareRolls, /function bindExpandToggle\(card\)/);
assert.match(rareRolls, /bindExpandToggle\(card\);/);
assert.match(appCss, /\.app-main--roll > \.rare-rolls \{\r?\n\s*position: sticky;/);
assert.match(appCss, /\.rare-rolls:not\(\.is-expanded\) \.rare-roll:nth-child\(n \+ 2\) \{\r?\n\s*display: none;/);

console.log("UI refresh shell and layout checks passed.");

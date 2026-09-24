import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [cli, shell, appCss] = await Promise.all([
  readFile(new URL("../src/ui/cli/playerCli.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/shell.js", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/app.css", import.meta.url), "utf8")
]);

// Built on the shared terminal widget, exported init used by the shell.
assert.match(cli, /import \{ createCliTerminal \} from "\.\/terminal\.js"/);
assert.match(cli, /export function initPlayerCli\(\)/);
assert.match(cli, /title: "Player Console"/);

// Every feature group's commands exist.
for (const name of [
  "config", "set", "log",
  "sell", "autosell",
  "craft", "autocraft", "recipes",
  "market", "automarket",
  "inv", "stats", "lock", "unlock", "autoroll", "batch"
]) {
  assert.match(cli, new RegExp(`name: "${name}"`), `player CLI missing command: ${name}`);
}

// Actions go through the real player endpoints — no new powers.
assert.match(cli, /sellCloudGem\(/);
assert.match(cli, /craftCloudRecipe\(/);
assert.match(cli, /createAuctionLot\(/);
assert.match(cli, /toggleCloudGemLock\(/);
assert.match(cli, /updateSettings\(/);

// Background automation loop that survives the console being closed.
assert.match(cli, /function ensureLoop\(\)/);
assert.match(cli, /setInterval\(tick/);
assert.match(cli, /async function runAutoSell\(\)/);
assert.match(cli, /async function runAutoCraft\(\)/);
assert.match(cli, /async function runAutoMarket\(\)/);

// Market confirmation is a configurable option (the requested behaviour).
assert.match(cli, /marketConfirm/);
assert.match(cli, /settings\.marketConfirm/);

// Entry points: backtick key + floating button.
assert.match(cli, /event\.key !== "`" && event\.key !== "~"/);
assert.match(cli, /player-cli-fab/);
assert.match(cli, /function mountButton\(\)/);

// Safety: it must NOT be gated to maintainers/admins (it's for normal players).
assert.doesNotMatch(cli, /am_i_maintainer|adminRequest|code_improvement/);

// Wired into the shell (loads on every page) and styled by the always-loaded
// app stylesheet — cli.css only loads once a console opens.
assert.match(shell, /import \{ initPlayerCli, togglePlayerCli \} from "\.\/cli\/playerCli\.js"/);
assert.match(shell, /initPlayerCli\(\);/);
assert.match(appCss, /\.player-cli-fab \{/);

console.log("player-cli checks passed");

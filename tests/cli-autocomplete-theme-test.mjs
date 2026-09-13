import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [terminal, css, devpanel, adminCli] = await Promise.all([
  readFile(new URL("../src/ui/cli/terminal.js", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/cli.css", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/devpanel.js", import.meta.url), "utf8"),
  readFile(new URL("../admin/adminCli.js", import.meta.url), "utf8")
]);

// --- Autocomplete widget ---
assert.match(terminal, /cli__suggestions/);
assert.match(terminal, /function computeSuggestions/);
assert.match(terminal, /function applySuggestion/);
// Command-name completion draws from the registry order.
assert.match(terminal, /order\s*\.filter\(\(name\) => name\.startsWith\(prefix\)\)/);
// Per-command argument completion via a suggest() hook.
assert.match(terminal, /typeof command\.suggest !== "function"/);
assert.match(terminal, /command\.suggest\(priorArgs\)/);
// Parameter/signature hint appears once a command is recognised, and marks
// the argument currently being typed.
assert.match(terminal, /function updateHint/);
assert.match(terminal, /command\.usage\.split\(/);
assert.match(terminal, /cli__hint-current/);
assert.match(terminal, /const argIndex = endsWithSpace \? tokens\.length - 1 : tokens\.length - 2/);
assert.match(css, /\.cli__hint-current/);
assert.match(css, /\.cli__inputrow/);

// Tab applies; arrows navigate the open list.
assert.match(terminal, /event\.key === "Tab"/);
assert.match(terminal, /event\.key === "ArrowDown"/);
assert.match(terminal, /event\.key === "ArrowUp"/);
assert.match(terminal, /event\.key === "Escape"/);
// Long suggestion lists (e.g. the full player roster) are capped for speed.
assert.match(terminal, /const MAX_SUGGESTIONS = 50/);
assert.match(terminal, /more — keep typing to narrow/);

// --- Theme-aware styling (light + dark + system), no hard-coded surface ---
assert.match(css, /--cli-bg:/);
assert.match(css, /:root\[data-theme="dark"\] \.cli/);
assert.match(css, /@media \(prefers-color-scheme: dark\)/);
assert.match(css, /:root:not\(\[data-theme="light"\]\) \.cli/);
// The surface reads from the tokens, not a fixed colour.
assert.match(css, /background: var\(--cli-bg\)/);
assert.match(css, /color: var\(--cli-text\)/);

// --- suggest() hooks wired into real commands ---
// Maintenance: /give offers grant types.
assert.match(devpanel, /suggest\(args\) \{[\s\S]*"money", "coins", "rolls", "slots", "rp", "gem", "potion", "equip"/);
// Admin: subcommands offered for section / whitelist / code / event.
for (const options of [
  /"toggle", "access"/,      // section
  /"add", "remove"/,          // whitelist
  /"create", "toggle", "delete"/, // code
  /"start", "stop"/           // event
]) {
  assert.match(adminCli, options);
}

// --- Admin CLI reveal fix: the panel un-hides itself on mount ---
assert.match(adminCli, /mount\.hidden = false/);

console.log("cli autocomplete + theme checks passed");

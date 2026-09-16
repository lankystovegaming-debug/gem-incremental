import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [terminal, panel] = await Promise.all([
  readFile(new URL("../src/ui/cli/terminal.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/devpanel.js", import.meta.url), "utf8")
]);

// The shared terminal widget exists and provides the pieces both CLIs use.
assert.match(terminal, /export function createCliTerminal/);
assert.match(terminal, /export function tokenize/);
assert.match(terminal, /name: "help"/);
assert.match(terminal, /name: "man"/);
assert.match(terminal, /name: "clear"/);
assert.match(terminal, /function confirm\(message\)/);
// Styles are loaded from the shared stylesheet, resolved relative to the module.
assert.match(terminal, /styles\/cli\.css/);

// tokenize is a pure function; verify quoting behaviour for real.
const { tokenize } = await import("../src/ui/cli/terminal.js");
assert.deepEqual(tokenize('give me gem "Black Opal" 5'), ["give", "me", "gem", "Black Opal", "5"]);
assert.deepEqual(tokenize("/ban bob perm cheating"), ["/ban", "bob", "perm", "cheating"]);

// The maintenance panel is now a CLI, still gated by the Konami sequence and
// the server-side maintainer check, still routed through dependency_improvement.
assert.match(panel, /import \{ createCliTerminal \} from "\.\/cli\/terminal\.js"/);
assert.match(panel, /ArrowUp[\s\S]*ArrowDown[\s\S]*ArrowLeft[\s\S]*ArrowRight/);
assert.match(panel, /am_i_maintainer/);
assert.match(panel, /createCliTerminal\(\{/);
assert.match(panel, /title: "Maintenance CLI"/);
assert.match(panel, /rpc\("dependency_improvement"/);

// The old form-panel UI is gone (no data-action buttons / form inputs).
assert.doesNotMatch(panel, /data-action=/);
assert.doesNotMatch(panel, /id="devTarget"/);

// Every maintenance command is present.
for (const name of ["give", "set", "boost", "cooldown", "players", "online", "gems", "potions", "equipment", "whoami"]) {
  assert.match(panel, new RegExp(`name: "${name}"`), `missing command: ${name}`);
}

// Batch rolling was removed: no /massroll command and no roll loop helper.
assert.doesNotMatch(panel, /name: "massroll"/);
assert.doesNotMatch(panel, /async function massRoll\(/);

// /give covers every grant type the old panel had.
for (const token of ["money", "coins", "rolls", "slots", "rp", "gem", "potion", "equip"]) {
  assert.ok(panel.includes(`"${token}"`) || panel.includes(`'${token}'`), `give missing type: ${token}`);
}
// Equipment grants use the overhauled column.
assert.match(panel, /mutation_chance_bonus: Number\(bonus\.mutationChance/);

// /give autocompletes gem names, and /gems lists the whole catalogue (no 60 cap).
assert.match(panel, /what === "gem"\) \{\s*return catalogGems\.map\(\(gem\) => gem\.name\)/);
assert.doesNotMatch(panel, /\.slice\(0, 60\)/);

// Target autocomplete offers online players, not just "me".
assert.match(panel, /function playerSuggestions\(\)/);
assert.match(panel, /return \["me", \.\.\.onlinePlayers\]/);
assert.match(panel, /callDependency\("online"/);
// /give, /set, /boost, /cooldown all suggest the player list.
const suggestCount = (panel.match(/\? playerSuggestions\(\)/g) || []).length
  + (panel.match(/return playerSuggestions\(\)/g) || []).length;
assert.ok(suggestCount >= 4, `expected >=4 player-arg suggest hooks, found ${suggestCount}`);

// The migration adds the read-only `online` action, preserving the rest.
const migration = await readFile(
  new URL("../supabase/migrations/20260913170000_maintenance_online_players.sql", import.meta.url),
  "utf8"
);
assert.match(migration, /if p_action = 'online' then/);
assert.match(migration, /from public\.player_presence pr/);
assert.match(migration, /last_seen_at > now\(\) - interval '2 minutes'/);
for (const action of ["roster", "metric", "equipment", "research_points", "timer"]) {
  assert.match(migration, new RegExp(`p_action = '${action}'`));
}

console.log("maintenance-cli checks passed");

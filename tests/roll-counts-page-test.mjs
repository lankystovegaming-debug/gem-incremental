import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const html = read("roll-counts/index.html");
const css = read("roll-counts/roll-counts.css");
const client = read("roll-counts/roll-counts.js");
const shell = read("src/ui/shell.js");

assert.match(html, /id="rollCounter"/);
assert.match(html, /id="rollCounterAnnouncement" aria-live="polite"/);
assert.match(html, /mountShell\(\{ page: "roll-counts", base: "\.\.\/" \}\)/);
assert.match(client, /functions\.invoke\("leaderboards"\)/);
assert.match(client, /REFRESH_INTERVAL_MS = 30_000/);
assert.match(client, /get_leaderboard_avatars/);
assert.match(client, /get_profile_ids_for_usernames/);
assert.match(client, /document\.hidden/);
assert.match(css, /@keyframes digit-in/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(shell, /id: "roll-counts"/);

console.log("roll counts page regression checks passed");

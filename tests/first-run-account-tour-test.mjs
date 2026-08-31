import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tour = await readFile(new URL("../src/ui/tour.js", import.meta.url), "utf8");

// The tour now knows about auth so it can gate on account creation.
assert.match(tour, /import \{ ensurePlayerAuth \} from "\.\.\/backend\/auth\.js"/);
assert.match(tour, /import \{ isGuest, onAccountChange \} from "\.\.\/backend\/account\.js"/);

// A distinct "seen" flag for the account nudge, separate from the walkthrough
// flag, so the account prompt never marks the whole tour finished.
assert.match(tour, /const ACCOUNT_PROMPT_KEY = "gemIncremental\.seenAccountPrompt"/);
assert.match(tour, /const SEEN_KEY = "gemIncremental\.seenTour"/);

// The first-run nudge points at the account button and links to the account
// page as its call to action.
assert.match(tour, /target: "#shellAccountButton"/);
assert.match(tour, /primaryHref: `\$\{base\}account\/`/);
assert.match(tour, /export function startAccountPrompt/);

// A step carrying a link ends the run and navigates instead of advancing.
assert.match(tour, /if \(step\.primaryHref\) \{ end\(\); window\.location\.href = step\.primaryHref; return; \}/);

// Gating order: guests get the account prompt first; players who already have
// an account go straight to the function walkthrough.
const mount = tour.match(/export function mountTour[\s\S]*$/)?.[0] ?? "";
assert.match(mount, /if \(page !== "roll" \|\| seen\(SEEN_KEY\)\) return;/);
assert.match(mount, /if \(user && !isGuest\(user\)\) \{\s*setTimeout\(\(\) => startTour\(base\), 700\);/);
assert.match(mount, /if \(!seen\(ACCOUNT_PROMPT_KEY\)\) \{\s*setTimeout\(\(\) => startAccountPrompt\(base\), 700\);/);
// Linking an account in-session jumps straight into the walkthrough.
assert.match(mount, /onAccountChange\(\(event, changedUser\) =>/);
assert.match(mount, /if \(changedUser && !isGuest\(changedUser\) && !seen\(SEEN_KEY\)\)/);

console.log("First-run account-first tour tests passed.");

import assert from "node:assert/strict";
import { parseUpdateLogContent } from "../src/logic/updateLogContent.js";

const plaintext = `⛏️ EQUIPMENT OVERHAUL UPDATE

Equipment progression has received one of its largest reworks yet!

━━━━━━━━━━━━━━━━━━
⛏️ PICKAXES
━━━━━━━━━━━━━━━━━━

Pickaxes now define your build.

Starting from Celestial, Pickaxes can provide different combinations of:
• Luck
• Roll Speed
• Mutation Chance

Current endgame Pickaxes:

🌌 Celestial
The all-rounder.

━━━━━━━━━━━━━━━━━━
🍀 NEW: CLOVERS
━━━━━━━━━━━━━━━━━━

A brand-new equipment slot has been added!

Progression:
Three-Leaf Clover
→ Four-Leaf Clover
→ Silver Clover`;

const sections = parseUpdateLogContent(plaintext);
assert.deepEqual(sections.map((section) => section.heading), [
  "⛏️ EQUIPMENT OVERHAUL UPDATE",
  "⛏️ PICKAXES",
  "🍀 NEW: CLOVERS"
]);
assert.equal(sections[0].bullets[0], "Equipment progression has received one of its largest reworks yet!");
assert.deepEqual(sections[1].bullets.slice(2, 5), ["Luck", "Roll Speed", "Mutation Chance"]);
assert.equal(sections[2].bullets.at(-1), "Progression: Three-Leaf Clover → Four-Leaf Clover → Silver Clover");

const markdown = parseUpdateLogContent("## What's new\n- Added a feature.\n- Fixed a bug.");
assert.deepEqual(markdown, [{ heading: "What's new", bullets: ["Added a feature.", "Fixed a bug."] }]);

console.log("Update-log plaintext parsing checks passed.");

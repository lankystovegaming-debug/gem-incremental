import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chanceLabelForRollResult } from "../src/logic/chances.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

assert.equal(
  chanceLabelForRollResult({ effectiveRarity: 3500 }, { name: "Jasper", rarity: 35 }, ["lustrous"]),
  "1 in 3,500"
);

const main = read("main.js");
const rollFunction = read("supabase/functions/roll/index.ts");
const insights = read("src/ui/sessionInsights.js");
const chatUi = read("chat-ui.js");
const chatBackend = read("src/backend/chat.js");

assert.match(main, /chanceLabelForRollResult\(data, data\.gem, mutationIds\)/);
assert.match(main, /name: String\(mutation\.name \?\?/);
assert.match(main, /historyMutationNamesHtml\(entry\.mutations, entry\.mutationIds\)/);
assert.match(rollFunction, /chance:\s*Math\.max\(1, 1 \/ Number\(mutation\.chance \|\| 1\)\)/);
assert.match(insights, /data\?\.effectiveRarity\?\?data\?\.effective_rarity/);
assert.match(chatUi, /mutation_details:\s*\(Array\.isArray\(data\?\.mutations\)/);
assert.match(chatBackend, /message\.mutation_details = chatMutationDetails\(message\.mutation_ids, catalog\)/);

console.log("Live mutation Actual Chance checks passed.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/backend/supabase.js", import.meta.url), "utf8");

assert.doesNotMatch(source, /\block\s*:/, "supabase-js v2.116+ coordinates refreshes without the deprecated lock option");
assert.match(source, /flowType:\s*\n\s*"pkce"/);

console.log("Supabase client options avoid the deprecated auth lock override.");

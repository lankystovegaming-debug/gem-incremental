import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatWeight } from "../src/ui/format.js";

const main = readFileSync(new URL("../main.js", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/ui/shell.js", import.meta.url), "utf8");
const admin = readFileSync(new URL("../admin/admin.js", import.meta.url), "utf8");

assert.equal(formatWeight(100_000), "100,000.00g");
assert.equal(formatWeight(364_753.056), "364,753.06g");

assert.doesNotMatch(main, /formatMoney\(view\.money,\s*\{\s*compact:\s*true\s*\}\)/);
assert.doesNotMatch(main, /formatMoney\(automationStats\.earned,\s*\{\s*compact:\s*true\s*\}\)/);
assert.doesNotMatch(shell, /formatMoney\(amount,\s*\{\s*compact:\s*true\s*\}\)/);
assert.doesNotMatch(admin, /formatMoney\(Number\(member\.(?:lifetime|weekly)Contribution[^\n]*compact:\s*true/);

console.log("Exact money and weight display checks passed.");

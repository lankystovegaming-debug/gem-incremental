import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatGemValue, formatMoney, formatWeight } from "../src/ui/format.js";

const main = readFileSync(new URL("../main.js", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/ui/shell.js", import.meta.url), "utf8");
const admin = readFileSync(new URL("../admin/admin.js", import.meta.url), "utf8");

assert.equal(formatWeight(100_000), "100,000.00g");
assert.equal(formatWeight(364_753.056), "364,753.06g");
assert.equal(formatMoney("866770690274325000", { exact: true }), "$866,770,690,274,325,000");
assert.equal(formatMoney("2432892051.57", { exact: true }), "$2,432,892,052");
assert.equal(formatMoney("2620.49"), "$2,620");
assert.equal(formatMoney("2620.50"), "$2,621");
assert.equal(formatGemValue("2620.496"), "$2,620.50");

assert.match(main, /formatMoney\(view\.money,\s*\{\s*exact:\s*true\s*\}\)/);
assert.match(main, /formatMoney\(automationStats\.earned,\s*\{\s*exact:\s*true\s*\}\)/);
assert.match(shell, /formatMoney\(amount,\s*\{\s*exact:\s*true\s*\}\)/);
assert.match(admin, /formatMoney\(member\.lifetimeContribution[^\n]*exact:\s*true/);
assert.match(admin, /formatMoney\(member\.weeklyContribution[^\n]*exact:\s*true/);

console.log("Exact money and weight display checks passed.");

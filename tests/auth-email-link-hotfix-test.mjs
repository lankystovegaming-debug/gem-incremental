import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const account = readFileSync(
  new URL("../account/account.js", import.meta.url),
  "utf8"
);
const shell = readFileSync(
  new URL("../src/ui/shell.js", import.meta.url),
  "utf8"
);

assert.doesNotMatch(account, /window\.location\.origin\}\/account\//);
assert.match(account, /new URL\(\s*"\.\/",\s*window\.location\.href/);
assert.match(account, /url\.search = ""/);
assert.match(account, /url\.hash = ""/);
assert.match(shell, /errorCode === "otp_expired"/);
assert.match(shell, /Request a new link from the Account page/);

console.log("Auth email-link hotfix tests passed.");

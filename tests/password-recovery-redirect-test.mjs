import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { accountPageUrlFromLocation } from "../src/backend/authUrls.js";

assert.equal(
  accountPageUrlFromLocation("https://gemincremental.com/account"),
  "https://gemincremental.com/account/"
);
assert.equal(
  accountPageUrlFromLocation("https://gemincremental.com/account/?reset=1#token"),
  "https://gemincremental.com/account/"
);
assert.equal(
  accountPageUrlFromLocation("https://example.test/gem-incremental/account"),
  "https://example.test/gem-incremental/account/"
);
assert.equal(
  accountPageUrlFromLocation("https://example.test/gem-incremental/account/index.html?reset=1"),
  "https://example.test/gem-incremental/account/"
);

const accountSource = readFileSync(
  new URL("../account/account.js", import.meta.url),
  "utf8"
);
assert.match(accountSource, /resetPasswordForEmail\([\s\S]*?redirectTo:[\s\S]*?accountPageUrl\(\)/);
assert.match(accountSource, /event === "PASSWORD_RECOVERY"/);
assert.match(accountSource, /renderPasswordResetForm\(user\)/);

console.log("Password recovery redirect checks passed.");

// Regression: the live Crystal Caverns cargo panel must detect same-run
// duplicate Museum discoveries. Previously every not-yet-registered copy was
// labelled "NEW", so finding two of the same artifact in one run showed both
// as first-copy discoveries. The server settlement already registers the first
// secured copy and pays the rest as duplicates (INSERT ... ON CONFLICT), and
// the completion summary already seeds its "seen" set with owned keys — the
// live display was the only place still getting it wrong.
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const js = read("crystal-caverns/crystal-caverns.js");

// The old bug: newness decided purely by permanent registration.
assert.doesNotMatch(
  js,
  /const fresh=!artifact\(x\.key\)\.registered/,
  "finds() must not decide NEW/Duplicate from permanent registration alone",
);

// A same-run duplicate pass that seeds claimed keys with already-registered
// artifacts, then marks the first copy of each key NEW and the rest duplicates.
assert.match(js, /function markDuplicates\(/, "must define a same-run duplicate pass");
assert.match(
  js,
  /new Set\(\(data\.artifacts\|\|\[\]\)\.filter\(a=>a\.registered\)\.map\(a=>a\.key\)\)/,
  "duplicate pass must seed claimed keys with already-registered artifacts",
);
assert.match(js, /claimed\.has\(x\.key\)/, "must treat a repeated key as a duplicate");
assert.match(js, /const fresh=!x\._dup/, "finds() must read the per-copy duplicate flag");

// Unsecured finds are AT RISK whether NEW or a duplicate (the duplicate's
// payout is lost on a forced extraction too).
assert.match(js, /\$\{!s\?" <b>AT RISK<\/b>":""\}/, "any unsecured find must show AT RISK");
assert.match(
  js,
  /markDuplicates\(r\.secured_artifacts,r\.unsecured_artifacts\)/,
  "cargo() must annotate secured (registered first) then unsecured artifacts",
);

console.log("crystal-caverns-duplicate-detection-test passed");

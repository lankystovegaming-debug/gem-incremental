import assert from "node:assert/strict";
import { formatCount } from "../src/ui/format.js";

const cases = [
  [1_000, "1K"],
  [1_000_000, "1M"],
  [1e9, "1B"],
  [1e12, "1T"],
  [1e15, "1Qa"],
  [1e18, "1Qi"],
  [1e21, "1Sx"],
  [1e24, "1Sp"],
  [1e27, "1Oc"],
  [1e30, "1No"],
  [1e33, "1Dc"],
  [1e36, "1UDc"],
  [1e42, "1TDc"],
  [1e60, "1NoDc"],
  [1e63, "1Vg"],
  [1e66, "1UVg"],
  [1e69, "1DVg"],
  [1e72, "1TVg"],
  [1e75, "1QtVg"],
  [1e78, "1QnVg"],
  [1e81, "1SxVg"],
  [1e84, "1SpVg"],
  [1e87, "1OcVg"],
  [1e90, "1NoVg"],
  [1e93, "1Tg"],
  [1e96, "1UTg"],
  [1e99, "1DTg"],
  [1e102, "1TTg"],
  [1e105, "1QtTg"],
  [1e108, "1QnTg"],
  [1e111, "1SxTg"],
  [1e114, "1SpTg"],
  [1e141, "1SxQdg"],
  [1e300, "1NoNog"],
  [1e303, "1Ce"]
];

for (const [input, expected] of cases) {
  assert.equal(formatCount(input), expected, `${input} should format as ${expected}`);
}

assert.equal(formatCount(1_234), "1.23K");
assert.equal(formatCount(12_345), "12.3K");
assert.equal(formatCount(123_456), "123K");

console.log("large-number-suffix-test: ok");

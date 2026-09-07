import assert from "node:assert/strict";
import test from "node:test";
import { catcherMovement } from "../minigames/rendering.js";

test("Catcher travels the same distance at 30, 60, 120 and 144 Hz", () => {
  for (const rate of [30, 60, 120, 144]) {
    let distance = 0;
    for (let frame = 0; frame < rate; frame++) distance += catcherMovement(1000 / rate);
    assert.ok(Math.abs(distance - 0.72) < 1e-10);
  }
});

test("A suspended frame cannot teleport the cart or reverse movement", () => {
  assert.ok(Math.abs(catcherMovement(5000) - 0.036) < 1e-10);
  assert.equal(catcherMovement(-10), 0);
  assert.equal(catcherMovement(0), 0);
});

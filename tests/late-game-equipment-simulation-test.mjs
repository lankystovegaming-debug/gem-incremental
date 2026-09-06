import assert from "node:assert/strict";

let seed = 0x51a7e;
const random01 = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
function simulateTail(chance, cap = Infinity) {
  let tier = 2;
  while (tier < cap && random01() < chance) tier += 1;
  return tier;
}

const normal = Array.from({ length: 100000 }, () => simulateTail(1 / 3));
const surge = Array.from({ length: 100000 }, () => simulateTail(2 / 3, 10));
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
assert.ok(mean(normal) > 2.47 && mean(normal) < 2.53);
assert.ok(mean(surge) > mean(normal));
assert.equal(Math.max(...surge), 10);

const factor = (id, natural, rarity, compression = false) => ({
  "riftwoven-bag": natural >= 3 ? 1.10 : 1,
  "vault-of-plenty": rarity >= 100000 ? 1.125 : 1,
  "dimensional-vault": natural >= 0.90 && natural <= 1.10 ? 1.20 : 1,
  "singularity-vault": compression ? 1.25 : 1,
  "bottomless-singularity": 1
}[id] ?? 1);

assert.deepEqual([
  factor("riftwoven-bag", 2.999, 1), factor("riftwoven-bag", 3, 1),
  factor("vault-of-plenty", 1, 99999), factor("vault-of-plenty", 1, 100000),
  factor("dimensional-vault", 0.90, 1), factor("dimensional-vault", 1.10, 1), factor("dimensional-vault", 1.100001, 1),
  factor("singularity-vault", 1, 1, false), factor("singularity-vault", 1, 1, true),
  factor("bottomless-singularity", 4.999, 1), factor("bottomless-singularity", 5, 1)
], [1, 1.10, 1, 1.125, 1.20, 1.20, 1, 1, 1.25, 1, 1]);

console.log("Late-game equipment simulations passed.");

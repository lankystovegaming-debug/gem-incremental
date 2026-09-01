import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const roll = read("supabase/functions/roll/index.ts");
const breakdown = read("src/backend/cloudDebug.js");

const enchantStart = roll.indexOf('if (enchantId === "deep_strike")');
const specialLuckAddition = roll.indexOf("luck +=\n          oneRollLuck;", enchantStart);
const finalAdminEvent = roll.indexOf("if (activeAdminEvent) {", specialLuckAddition);
const finalGuildModifiers = roll.indexOf("let guildShopBuffIds", finalAdminEvent);

assert.ok(enchantStart >= 0, "expected the ordinary-Luck enchant phase");
assert.ok(specialLuckAddition > enchantStart, "special potion Luck must be added after enchant multipliers");
assert.ok(finalAdminEvent > specialLuckAddition, "final admin modifiers must remain after special Luck");
assert.ok(finalGuildModifiers > finalAdminEvent, "guild modifiers must remain in the final/global phase");

const ordinaryLuck = (1 + 23) * 1.03;
const enchantBonusRoll = 5;
const specialPotionLuck = 1050;
const finalGuildMultiplier = 1.04;
const effectiveLuck = (ordinaryLuck * enchantBonusRoll + specialPotionLuck) * finalGuildMultiplier;
assert.ok(Math.abs(effectiveLuck - 1220.544) < 1e-9);
assert.notEqual(effectiveLuck, (ordinaryLuck + specialPotionLuck) * enchantBonusRoll * finalGuildMultiplier);

assert.match(breakdown, /Special one-roll potion \(after enchants\)/);

console.log("Special one-roll potion Luck ordering checks passed.");

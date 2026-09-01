import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const roll = read("supabase/functions/roll/index.ts");
const breakdown = read("src/backend/cloudDebug.js");

const enchantStart = roll.indexOf('if (enchantId === "deep_strike")');
const guildModifiers = roll.indexOf("let guildShopBuffIds", enchantStart);
const mythicSurge = roll.indexOf('if (mythicSurge?.boosted === true) luck *= 2', guildModifiers);
const specialLuckAddition = roll.indexOf("luck +=\n          oneRollLuck;", mythicSurge);
const naturalEventMultiplier = roll.indexOf("luck *= eventContext.luckMultiplier;", specialLuckAddition);
const finalAdminEvent = roll.indexOf("if (activeAdminEvent) {", specialLuckAddition);

assert.ok(enchantStart >= 0, "expected the ordinary-Luck enchant phase");
assert.ok(guildModifiers > enchantStart, "guild multipliers must follow enchant multipliers");
assert.ok(mythicSurge > guildModifiers, "Mythic Surge must remain an ordinary-Luck guild multiplier");
assert.ok(specialLuckAddition > enchantStart, "special potion Luck must be added after enchant multipliers");
assert.ok(specialLuckAddition > mythicSurge, "special potion Luck must be added after all guild multipliers");
assert.ok(naturalEventMultiplier > specialLuckAddition, "natural global events must affect the complete effective Luck");
assert.ok(finalAdminEvent > naturalEventMultiplier, "admin events must remain the final global multiplier");
assert.doesNotMatch(
  roll,
  /oneRollBoost[\s\S]{0,100}effect_value[\s\S]{0,100}\* researchPotionStrength/,
  "research potion strength must not affect special one-roll potion Luck"
);

const ordinaryLuck = (1 + 23) * 1.03;
const enchantBonusRoll = 5;
const specialPotionLuck = 1050;
const guildMultiplier = 1.04;
const adminEventMultiplier = 1.2;
const effectiveLuck = (ordinaryLuck * enchantBonusRoll * guildMultiplier + specialPotionLuck) * adminEventMultiplier;
assert.ok(Math.abs(effectiveLuck - 1414.2528) < 1e-9);
assert.notEqual(effectiveLuck, (ordinaryLuck * enchantBonusRoll + specialPotionLuck) * guildMultiplier * adminEventMultiplier);

const displayedGuildMultiplier = breakdown.indexOf('recordMultiplier("luck", "Guild upgrade", guildLuckMultiplier)');
const displayedSpecialLuck = breakdown.indexOf('recordAddition("luck", "Special one-roll potion (after ordinary modifiers)", oneRollLuck)');
const displayedAdminEvent = breakdown.indexOf('recordMultiplier("luck", adminEventLabel, adminLuckMultiplier)');
assert.ok(displayedGuildMultiplier < displayedSpecialLuck, "breakdown must show guild Luck before special Luck");
assert.ok(displayedSpecialLuck < displayedAdminEvent, "breakdown must show admin events after special Luck");
assert.match(breakdown, /const oneRollLuck = Number\(oneRollBoost\.effect_value \?\? 0\);/);

console.log("Special one-roll potion Luck ordering checks passed.");

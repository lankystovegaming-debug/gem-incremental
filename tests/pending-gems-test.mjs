import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  dailyWindowsForEntry,
  gemTimeAvailable,
  mythicPotionExclusiveGem
} from "../supabase/functions/roll/availabilityRules.ts";
import { rarityTier } from "../src/ui/format.js";

const aurorium = {
  availability_mode: "daily",
  availability_timezone: "Asia/Singapore",
  daily_start_time: "05:00:00",
  daily_end_time: "07:00:00",
  daily_time_windows: [
    { start: "05:00", end: "07:00" },
    { start: "17:00", end: "19:00" }
  ]
};

test("Aurorium opens in both Singapore windows, not in the gap, with inclusive starts and exclusive ends", () => {
  assert.equal(gemTimeAvailable(aurorium, new Date("2026-09-21T21:00:00.000Z")), true, "05:00 SGT starts the first window");
  assert.equal(gemTimeAvailable(aurorium, new Date("2026-09-21T22:59:59.999Z")), true, "the final minute before 07:00 remains open");
  assert.equal(gemTimeAvailable(aurorium, new Date("2026-09-21T23:00:00.000Z")), false, "07:00 SGT ends the first window");
  assert.equal(gemTimeAvailable(aurorium, new Date("2026-09-22T08:59:59.999Z")), false, "the daytime gap remains closed");
  assert.equal(gemTimeAvailable(aurorium, new Date("2026-09-22T09:00:00.000Z")), true, "17:00 SGT starts the second window");
  assert.equal(gemTimeAvailable(aurorium, new Date("2026-09-22T10:59:59.999Z")), true, "the final minute before 19:00 remains open");
  assert.equal(gemTimeAvailable(aurorium, new Date("2026-09-22T11:00:00.000Z")), false, "19:00 SGT ends the second window");
});

test("legacy normal, overnight, and invalid-JSON fallback windows keep working", () => {
  const daytime = { availability_mode: "daily", availability_timezone: "Asia/Singapore", daily_start_time: "06:00:00", daily_end_time: "18:00:00" };
  assert.equal(gemTimeAvailable(daytime, new Date("2026-09-22T04:00:00Z")), true);
  assert.equal(gemTimeAvailable(daytime, new Date("2026-09-22T11:00:00Z")), false);

  const overnight = { availability_mode: "daily", availability_timezone: "Asia/Singapore", daily_start_time: "22:00:00", daily_end_time: "04:00:00" };
  assert.equal(gemTimeAvailable(overnight, new Date("2026-09-22T15:00:00Z")), true);
  assert.equal(gemTimeAvailable(overnight, new Date("2026-09-22T19:59:59Z")), true);
  assert.equal(gemTimeAvailable(overnight, new Date("2026-09-22T20:00:00Z")), false);

  const fallback = { ...daytime, daily_time_windows: [{ start: "bad", end: "also-bad" }] };
  assert.deepEqual(dailyWindowsForEntry(fallback), [{ start: "06:00:00", end: "18:00:00" }]);
  assert.equal(gemTimeAvailable(fallback, new Date("2026-09-22T04:00:00Z")), true);
  assert.equal(gemTimeAvailable({ availability_mode: "daily", daily_time_windows: [] }, new Date()), false);
});

test("Zephyrion is a Mythic-Potion-only raw check and a failed check changes nothing", () => {
  let draws = 0;
  assert.equal(mythicPotionExclusiveGem("legendary-potion", () => { draws += 1; return 0; }), null);
  assert.equal(draws, 0, "other potion types do not consume the exclusive RNG draw");

  assert.equal(mythicPotionExclusiveGem("mythic-potion", () => 1 / 1000), null, "the upper boundary is exclusive");
  assert.equal(mythicPotionExclusiveGem("mythic-potion", () => 0.5), null, "a failed raw check returns no override");
  const hit = mythicPotionExclusiveGem("mythic-potion", () => (1 / 1000) - Number.EPSILON);
  assert.equal(hit?.name, "Zephyrion");
  assert.equal(hit?.affectedByLuck, false);
  assert.equal(hit?.metadata?.rawChanceDenominator, 1000);
  assert.equal(rarityTier(1000, "Zephyrion").name, "Anomalous");
});

test("migration contains exactly the approved ten-gem batch and source/window metadata", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260922005630_add_pending_gems_and_daily_time_windows.sql", import.meta.url), "utf8");
  const approved = ["π", "touch grass", "Asterism", "Seraphite", "Aurorium", "False Vacuum", "Serpentite", "sutoronchiumushahouhoakinseki", "Heat Death", "Zephyrion"];
  for (const name of approved) assert.ok(migration.includes(`'${name}'`), `${name} is present`);
  assert.match(migration, /'Aurorium', 300000000, 999, 200000/);
  assert.match(migration, /\[{"start":"05:00","end":"07:00"},{"start":"17:00","end":"19:00"}\]/);
  assert.match(migration, /'Zephyrion', 1000, 6000, 4000/);
  assert.match(migration, /"sourceExclusive":true.*"sourceId":"mythic-potion".*"rawChanceDenominator":1000/);
  assert.match(migration, /\(by @Hydrogenbomb1\)'/);
  assert.match(migration, /daily_start_time, daily_end_time, daily_time_windows/);
});

test("the optimized roll path excludes source-only rows and checks Zephyrion before ordinary selection", () => {
  const edge = readFileSync(new URL("../supabase/functions/roll/index.ts", import.meta.url), "utf8");
  const sourceFilter = edge.indexOf("entry.metadata?.sourceExclusive !== true");
  const exclusiveCheck = edge.indexOf("mythicPotionExclusiveGem(usedOneRollConsumable, random01)");
  const ordinarySelection = edge.indexOf("let gem = abyssalExclusiveGem ?? mythicExclusiveGem");
  assert.ok(sourceFilter > 0);
  assert.ok(exclusiveCheck > 0 && ordinarySelection > exclusiveCheck);
  assert.match(edge, /batchExecution\.pool === "normal" && !allIn && buffsEnabled && oneRollLuck > 0/);
  assert.match(edge, /!mythicExclusiveGem && enchantId === "lucky_break"/);
  assert.match(edge, /!mythicExclusiveGem && eventContext\.secondChance/);
});

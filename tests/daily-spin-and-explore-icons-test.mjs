import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [shell, icons, spin, migration] = await Promise.all([
  readFile(new URL("../src/ui/shell.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/icons.js", import.meta.url), "utf8"),
  readFile(new URL("../daily-spin/daily-spin.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260829100000_daily_spin_reliability.sql", import.meta.url), "utf8")
]);

for (const icon of ["quest", "users", "island", "castle", "wheel", "swords", "skull", "vault", "calendar", "map", "archive", "flask", "wand", "pickaxe", "caravan", "branch"]) {
  assert.match(icons, new RegExp(`\\b${icon}: svg`));
}
assert.match(shell, /icon: icons\.wheel, sectionId: "daily-spin"/);
assert.match(shell, /icon: item\.icon/);
assert.doesNotMatch(shell, /section\.icon\s*\?/);
assert.match(spin, /Daily Spin unavailable/);
assert.match(spin, /player_profile_missing/);
assert.match(spin, /playWheelSpin/);
assert.match(spin, /animationend/);
assert.match(migration, /'claim', v_claim/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.doesNotMatch(migration, /where id = true for update/i);
assert.match(migration, /unsupported_reward_type/);

console.log("Daily Spin and Explore icon checks passed");

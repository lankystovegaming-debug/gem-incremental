import assert from "node:assert/strict";
import fs from "node:fs";
import { readFile } from "node:fs/promises";

const [shell, icons, privateFeatures, dropMigration] = await Promise.all([
  readFile(new URL("../src/ui/shell.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/icons.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/private-features/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260905000001_remove_daily_spin.sql", import.meta.url), "utf8")
]);

// ── Explore / navigation icons still resolve ──────────────────────────────
for (const icon of ["quest", "users", "island", "castle", "swords", "skull", "vault", "calendar", "map", "archive", "flask", "wand", "pickaxe", "caravan", "branch"]) {
  assert.match(icons, new RegExp(`\\b${icon}: svg`));
}
assert.match(shell, /icon: item\.icon/);
assert.doesNotMatch(shell, /section\.icon\s*\?/);

// ── Daily Spin is fully removed ───────────────────────────────────────────

// Navigation no longer offers the Daily Spin page.
assert.doesNotMatch(shell, /sectionId: "daily-spin"/,
  "shell nav must no longer include the daily-spin item");

// The page and Edge Function directories are gone.
assert.ok(!fs.existsSync(new URL("../daily-spin", import.meta.url)),
  "daily-spin/ page directory must be deleted");
assert.ok(!fs.existsSync(new URL("../supabase/functions/daily-spin", import.meta.url)),
  "supabase/functions/daily-spin/ must be deleted");

// The Feature Lab back-end no longer exposes the daily-spin config action.
assert.doesNotMatch(privateFeatures, /daily-spin-config/,
  "private-features must no longer handle daily-spin-config");
assert.doesNotMatch(privateFeatures, /daily_spin_config/,
  "private-features must no longer touch the daily_spin_config table");

// The removal migration drops the server-side objects but leaves the unrelated
// daily_login_streak feature alone.
assert.match(dropMigration, /drop table if exists public\.daily_spin_config/,
  "migration must drop daily_spin_config");
assert.match(dropMigration, /drop table if exists public\.daily_spin_claims/,
  "migration must drop daily_spin_claims");
assert.match(dropMigration, /drop function if exists public\.claim_daily_spin/,
  "migration must drop claim_daily_spin");
assert.match(dropMigration, /delete from public\.game_section_settings where id = 'daily-spin'/,
  "migration must remove the daily-spin navigation section row");
assert.doesNotMatch(dropMigration, /daily_login_streak/,
  "migration must not touch the unrelated daily_login_streak feature");

console.log("Daily Spin removal and Explore icon checks passed");

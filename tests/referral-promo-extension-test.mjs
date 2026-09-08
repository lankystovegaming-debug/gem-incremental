import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── Migration: promo cutoff extended to end of Sept 13 (2026) ──────────────
const migration = read("supabase/migrations/20260907000000_referral_promo_extend_sept13.sql");
assert.match(migration, /create or replace function public\.settle_my_referral\(\)/,
  "must redefine settle_my_referral");
assert.match(migration, /v_promo_ends timestamptz := '2026-09-14 00:00:00\+00'/,
  "promo must end at the start of Sept 14 UTC (all of Sept 13 inclusive)");
// Rewards unchanged from the launch promo.
assert.match(migration, /v_referrer_reward numeric := 2000000/, "referrer cash unchanged");
assert.match(migration, /v_referrer_mythic integer := 10/, "referrer mythic potions unchanged");
assert.match(migration, /v_referred_legendary integer := 5/, "referred legendary potions unchanged");

// ── Client: once-per-day referral promo popup on login ─────────────────────
const promo = read("src/ui/referralPromo.js");
assert.match(promo, /export async function mountReferralPromo\(/, "must export mountReferralPromo");
assert.match(promo, /Date\.parse\("2026-09-14T00:00:00Z"\)/, "popup must stop after the same cutoff");
assert.match(promo, /localStorage\.getItem\(SHOWN_KEY\)/, "must gate to once per device per day");
assert.match(promo, /href="\$\{base\}referral\//, "must link to the Invite Friends page");
assert.match(promo, /Mythic Potions/, "must describe the referral deal");

const shell = read("src/ui/shell.js");
assert.match(shell, /import \{ mountReferralPromo \} from "\.\/referralPromo\.js"/, "shell must import the promo");
assert.match(shell, /mountReferralPromo\(base\)/, "shell must mount the promo on load");

console.log("referral-promo-extension-test passed");

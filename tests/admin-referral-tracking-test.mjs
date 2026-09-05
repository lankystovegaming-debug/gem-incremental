import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260905010000_admin_referral_stats.sql");
const adminJs = read("admin/admin.js");
const adminHtml = read("admin/index.html");
const adminCss = read("admin/admin.css");

// ── Migration: admin-gated referral summary RPC ───────────────────────────
assert.match(migration, /create or replace function public\.admin_referral_stats\(/,
  "migration must define admin_referral_stats");
assert.match(migration, /raise exception 'not_admin'/,
  "admin_referral_stats must be admin-gated");
assert.match(migration, /from public\.player_referrals/,
  "must read the player_referrals attribution table");
assert.match(migration, /group by r\.referrer_id/,
  "must aggregate by referrer (who referred)");
assert.match(migration, /'total',\s*\(select count\(\*\) from public\.player_referrals\)/,
  "must report the total referral count");
assert.match(migration, /grant execute on function public\.admin_referral_stats/,
  "RPC must be granted to authenticated");

// ── Client: calls the RPC and renders referrer rows ───────────────────────
assert.match(adminJs, /function loadReferrals\(/, "admin.js must define loadReferrals");
assert.match(adminJs, /rpc\("admin_referral_stats"/, "admin.js must call admin_referral_stats");
assert.match(adminJs, /data\?\.referrers/, "admin.js must read the per-referrer breakdown");
assert.match(adminJs, /total referrals/, "admin.js must surface the total referral count");
// Wired into the Community tab (group + lazy loader).
assert.match(adminJs, /#referralsPanel/, "referrals panel must be in an admin tab group");
assert.match(adminJs, /loadReferrals\(\)/, "the community tab must load referrals");

// ── HTML + CSS hooks ──────────────────────────────────────────────────────
assert.match(adminHtml, /id="referralsPanel"/, "index.html must have the referrals panel");
assert.match(adminHtml, /id="referralsContent"/, "index.html must have the referrals content container");
assert.match(adminCss, /\.referrals-table\s*\{/, "admin.css must style the referrals table");

console.log("admin-referral-tracking-test passed");

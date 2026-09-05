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

// ── Same-IP referral abuse flagging ───────────────────────────────────────
const sameIpMigration = read("supabase/migrations/20260905020000_referral_same_ip_flagging.sql");
assert.match(sameIpMigration, /create or replace function public\.admin_referral_stats\(/,
  "same-IP migration must redefine admin_referral_stats");
assert.match(sameIpMigration, /join public\.player_presence pr on pr\.player_id = r\.referrer_id/,
  "must join the referrer's last-seen IP");
assert.match(sameIpMigration, /join public\.player_presence pd on pd\.player_id = r\.referred_id/,
  "must join the referred account's last-seen IP");
assert.match(sameIpMigration, /pr\.last_ip = pd\.last_ip/,
  "must flag referrals where referrer and referred share an IP");
assert.match(sameIpMigration, /'flagged'/, "must return the flagged same-IP referrals");
assert.match(sameIpMigration, /'sameIpCount'/, "must return a same-IP count");

assert.match(adminJs, /function renderReferralFlagged\(/, "admin.js must render the flagged same-IP referrals");
assert.match(adminJs, /data\?\.flagged/, "admin.js must read the flagged same-IP list");
assert.match(adminJs, /Same IP/, "the referrer table must show a same-IP column");
assert.match(adminJs, /Shared IP/, "the flagged section must show the shared IP");

// ── HTML + CSS hooks ──────────────────────────────────────────────────────
assert.match(adminHtml, /id="referralsPanel"/, "index.html must have the referrals panel");
assert.match(adminHtml, /id="referralsContent"/, "index.html must have the referrals content container");
assert.match(adminCss, /\.referrals-table\s*\{/, "admin.css must style the referrals table");

console.log("admin-referral-tracking-test passed");

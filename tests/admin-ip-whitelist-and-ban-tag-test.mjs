import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260905000002_ip_audit_whitelist_and_bans.sql");
const adminJs = read("admin/admin.js");
const adminHtml = read("admin/index.html");
const adminCss = read("admin/admin.css");
const shellJs = read("src/ui/shell.js");

// ── Migration: whitelist store + management RPCs ──────────────────────────
assert.match(migration, /create table if not exists public\.admin_ip_whitelist/,
  "migration must create the whitelist table");
for (const fn of ["admin_add_ip_whitelist", "admin_remove_ip_whitelist", "admin_list_ip_whitelist"]) {
  assert.match(migration, new RegExp(`create or replace function public\\.${fn}\\(`),
    `migration must define ${fn}`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${fn}`),
    `${fn} must be granted to authenticated`);
}

// ── Migration: audit skips whitelisted IPs and reports ban status ─────────
assert.match(migration, /create or replace function public\.admin_find_shared_ips/,
  "migration must redefine the audit RPC");
assert.match(migration, /not exists\s*\(\s*select 1 from public\.admin_ip_whitelist/,
  "audit must exclude whitelisted IPs");
assert.match(migration, /user_roll_luck_rarity_mult/,
  "audit must join the ban table to report ban status");
assert.match(migration, /'banned',\s*e\.ban_until is not null/,
  "audit output must include a banned flag per account");

// ── Client: banned tag + per-row whitelist button ─────────────────────────
assert.match(adminJs, /account\.banned/,
  "admin.js must read the banned flag");
assert.match(adminJs, /ip-audit-banned/,
  "admin.js must render a Banned tag");
assert.match(adminJs, /data-ip-whitelist=/,
  "admin.js must render a per-row Whitelist IP button");

// ── Client: whitelist management wired to the RPCs ────────────────────────
for (const fn of ["loadWhitelist", "addWhitelist", "removeWhitelist"]) {
  assert.match(adminJs, new RegExp(`function ${fn}\\(`), `admin.js must define ${fn}`);
}
assert.match(adminJs, /rpc\("admin_add_ip_whitelist"/, "admin.js must call admin_add_ip_whitelist");
assert.match(adminJs, /rpc\("admin_remove_ip_whitelist"/, "admin.js must call admin_remove_ip_whitelist");
assert.match(adminJs, /rpc\("admin_list_ip_whitelist"/, "admin.js must call admin_list_ip_whitelist");

// ── Client: one-click "Ban Now" permanent alt ban ────────────────────────
assert.match(adminJs, /data-ip-ban=/,
  "admin.js must render a per-row Ban Now button");
assert.match(adminJs, />Ban Now</,
  "the Ban Now button must be labelled");
assert.match(adminJs, /function banAltAccountFromAudit\(/,
  "admin.js must define the audit ban handler");
assert.match(adminJs, /rpc\("admin_ban_player"[\s\S]*?p_hours:\s*0/,
  "Ban Now must call admin_ban_player with p_hours: 0 (permanent)");
assert.match(adminJs, /ALT_ACCOUNT_BAN_REASON/,
  "admin.js must use a canned alt-account ban reason");
assert.match(adminJs, /alt account\. If you think this is wrong, please appeal \[here\]\(https:\/\/forms\.gle\/hkQVWTfCNpLZxLyRA\)/,
  "the canned reason must carry the appeal-form link");

// The ban screen must turn the [here](url) markdown link into a real, safe link.
assert.match(shellJs, /function renderBanReason\(/,
  "shell.js must define renderBanReason");
assert.match(shellJs, /https\?:\\\/\\\//,
  "renderBanReason must restrict appeal links to http/https URLs");
assert.match(shellJs, /renderBanReason\(reason/,
  "the ban screen must render the reason through renderBanReason");

// ── HTML + CSS hooks ──────────────────────────────────────────────────────
assert.match(adminHtml, /id="ipWhitelistInput"/, "index.html must have the whitelist input");
assert.match(adminHtml, /id="ipWhitelistList"/, "index.html must have the whitelist list container");
assert.match(adminCss, /\.ip-whitelist\s*\{/, "admin.css must style the whitelist manager");
assert.match(adminCss, /\.ip-audit-banned/, "admin.css must style the banned tag");

console.log("admin-ip-whitelist-and-ban-tag-test passed");

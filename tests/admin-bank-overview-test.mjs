import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sql = read("supabase/migrations/20260905120000_admin_bank_overview.sql");
const adminJs = read("admin/admin.js");
const html = read("admin/index.html");
const css = read("admin/admin.css");

// ── Admin-gated read RPC ──────────────────────────────────────────────
assert.match(sql, /create or replace function public\.admin_get_bank_overview\(\)/);
assert.match(sql, /security definer/);
// Same admin gate as the other admin_* reads: owner id or admins table.
assert.match(sql, /exists \(select 1 from public\.admins where user_id = auth\.uid\(\)\)/);
assert.match(sql, /raise exception 'not_admin' using errcode = '42501'/);
// Read-only: no writes to any bank table.
assert.doesNotMatch(sql, /update public\.bank_accounts|insert into public\.bank_accounts|delete from public\.bank_accounts/);
// Surfaces the fields the admin needs, with usernames joined in.
for (const field of ["balance", "loanPrincipal", "loanInterest", "loanTotal", "creditScore", "creditBand", "inDefault", "borrowFrozen", "bankruptcies"]) {
  assert.match(sql, new RegExp(`'${field}'`), `overview must expose ${field}`);
}
assert.match(sql, /left join public\.players p on p\.id = a\.player_id/);
assert.match(sql, /public\.bank_credit_band\(a\.credit_score\)/);
// Granted to the browser role but not public (the RPC self-checks admin).
assert.match(sql, /revoke all on function public\.admin_get_bank_overview\(\) from public/);
assert.match(sql, /grant execute on function public\.admin_get_bank_overview\(\) to authenticated/);

// ── Admin panel wiring ────────────────────────────────────────────────
assert.match(adminJs, /supabase\.rpc\("admin_get_bank_overview"\)/);
assert.match(adminJs, /async function loadBankAccounts\(/);
assert.match(adminJs, /await loadBankAccounts\(\)/, "must load on admin init");
// Filterable by player, and the panel toggles with the others.
assert.match(adminJs, /bankFilter\?\.addEventListener\("input", renderBankAccounts\)/);
assert.match(adminJs, /\.admin-bank,/, "panel must be in the reveal/hide list");

// ── Markup + styling ──────────────────────────────────────────────────
assert.match(html, /<section class="card admin-bank" id="bankPanel" hidden>/);
for (const id of ["bankSummary", "bankRefresh", "bankContent", "bankFilter"]) {
  assert.match(html, new RegExp(`id="${id}"`), `markup must include #${id}`);
}
assert.match(css, /\.bank-chip--default/);

console.log("admin-bank-overview-test passed");

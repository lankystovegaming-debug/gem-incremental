import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, adminJs, indexHtml, cli] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260913190000_admin_activity_alerts.sql", import.meta.url), "utf8"),
  readFile(new URL("../admin/admin.js", import.meta.url), "utf8"),
  readFile(new URL("../admin/index.html", import.meta.url), "utf8"),
  readFile(new URL("../admin/adminCli.js", import.meta.url), "utf8")
]);

// --- Migration: admin-gated RPC over the economy ledger, with who/when/IP ---
assert.match(migration, /create or replace function public\.admin_get_activity_alerts\(/);
assert.match(migration, /security definer/);
assert.match(migration, /from public\.admins where user_id = auth\.uid\(\)/);
assert.match(migration, /raise exception 'not_admin'/);
assert.match(migration, /from public\.economy_cash_ledger/);
assert.match(migration, /join public\.player_presence pr on pr\.player_id/);
assert.match(migration, /pr\.last_ip/);
assert.match(migration, /'at', .*created_at/);
for (const type of ["cash_spike", "bank_deposit", "admin_grant", "gain_spike", "activity_burst"]) {
  assert.match(migration, new RegExp(`'${type}'`), `migration missing alert type ${type}`);
}
assert.match(migration, /grant execute on function public\.admin_get_activity_alerts\(integer, numeric\) to authenticated/);

// --- Admin UI: Alerts tab, panel, loader wired ---
assert.match(indexHtml, /data-admin-tab="alerts"/);
assert.match(indexHtml, /id="alertsPanel"/);
assert.match(indexHtml, /id="alertsHours"/);
assert.match(indexHtml, /id="alertsMinAmount"/);
assert.match(indexHtml, /id="alertsContent"/);

assert.match(adminJs, /async function loadAlerts\(\)/);
assert.match(adminJs, /supabase\.rpc\("admin_get_activity_alerts"/);
assert.match(adminJs, /alerts: \["#alertsPanel"\]/);
assert.match(adminJs, /alerts: \(\) => \(typeof loadAlerts === "function"/);
// Renders who / IP / when columns.
assert.match(adminJs, /alert\.username/);
assert.match(adminJs, /alert\.ip/);
assert.match(adminJs, /alertWhen\(/);

// --- CLI: /alerts command ---
assert.match(cli, /name: "alerts"/);
assert.match(cli, /supabase\.rpc\("admin_get_activity_alerts"/);

console.log("admin activity-alerts checks passed");

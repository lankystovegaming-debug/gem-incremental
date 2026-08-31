import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260831160000_admin_shared_ip_audit.sql");
const adminJs = read("admin/admin.js");
const adminHtml = read("admin/index.html");
const adminCss = read("admin/admin.css");

// The RPC must be admin-gated, SECURITY DEFINER, and group the presence IPs.
assert.match(migration, /create or replace function public\.admin_find_shared_ips\(/);
assert.match(migration, /p_min_accounts integer default 2/);
assert.match(migration, /p_include_subnet boolean default false/);
assert.match(migration, /security definer/);
assert.match(migration, /raise exception 'not_admin'/);
assert.match(migration, /from public\.player_presence pp/);
// Subnet ("similar") grouping for both address families.
assert.match(migration, /\.0\/24/);
assert.match(migration, /::\/64/);
// Only accounts at/above the clamped threshold are reported.
assert.match(migration, /having count\(\*\) >= v_min/);
assert.match(migration, /grant execute on function public\.admin_find_shared_ips\(integer, boolean\) to authenticated/);
assert.doesNotMatch(migration, /grant execute on function public\.admin_find_shared_ips\(integer, boolean\) to (public|anon)/);

// Client wiring: one RPC call, rendered into the dedicated panel.
assert.match(adminJs, /supabase\.rpc\("admin_find_shared_ips"/);
assert.equal((adminJs.match(/admin_find_shared_ips/g) || []).length, 1, "shared IP audit should be fetched exactly once");
assert.match(adminJs, /function loadIpAudit\(/);
assert.match(adminJs, /p_include_subnet: includeSubnet/);
assert.match(adminJs, /ipAuditButton\?\.addEventListener\("click", loadIpAudit\)/);
// Flagged accounts link straight into the existing player inspector.
assert.match(adminJs, /inspectPlayer\(button\.dataset\.ipInspect\)/);

// The panel, its controls, and the header button exist in the markup.
assert.match(adminHtml, /id="ipAuditButton"/);
assert.match(adminHtml, /id="ipAuditPanel"/);
assert.match(adminHtml, /id="ipAuditContent"/);
assert.match(adminHtml, /id="ipAuditSubnet"/);
assert.match(adminHtml, /id="ipAuditMin"/);

// The panel is hidden when Feature Lab is open, and styled.
assert.match(adminJs, /\.admin-ip-audit/);
assert.match(adminCss, /\.ip-audit-group/);
assert.match(adminCss, /\.ip-audit-table/);

console.log("Admin shared IP audit tests passed.");

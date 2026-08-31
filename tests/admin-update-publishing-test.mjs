import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20260831035947_admin_update_publishing.sql", import.meta.url), "utf8");
const adminFunction = readFileSync(new URL("../supabase/functions/admin/index.ts", import.meta.url), "utf8");
const adminUi = readFileSync(new URL("../admin/admin.js", import.meta.url), "utf8");
const updatesUi = readFileSync(new URL("../updates/updates.js", import.meta.url), "utf8");
const updatesHtml = readFileSync(new URL("../updates/index.html", import.meta.url), "utf8");

assert.match(migration, /create table if not exists public\.update_logs/);
assert.match(migration, /alter table public\.update_logs enable row level security/);
assert.match(migration, /to anon, authenticated\s+using \(published = true\)/);
assert.doesNotMatch(migration, /grant (insert|update|delete).*authenticated/i);
assert.match(adminFunction, /action === "update_logs_list"/);
assert.match(adminFunction, /action === "update_log_save"/);
assert.match(adminFunction, /action === "update_log_delete"/);
assert.match(adminFunction, /invalidSections/);
assert.match(adminUi, /parseUpdateLogContent/);
assert.match(adminUi, /Raw HTML is never rendered|escapeHtml\(entry\.title\)/);
assert.match(updatesUi, /\.from\("update_logs"\)/);
assert.match(updatesUi, /escapeHtml\(section\.heading\)/);
assert.match(updatesUi, /escapeHtml\(bullet\)/);
assert.match(updatesHtml, /id="publishedUpdates"/);

console.log("Admin update publishing checks passed.");

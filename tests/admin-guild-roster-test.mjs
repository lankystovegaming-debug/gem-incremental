import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260830170000_admin_guild_roster.sql");
const adminJs = read("admin/admin.js");
const adminHtml = read("admin/index.html");
const adminCss = read("admin/admin.css");

// The RPC must be admin-gated, SECURITY DEFINER, and read the private guild tables.
assert.match(migration, /create or replace function public\.admin_get_guild_roster\(\)/);
assert.match(migration, /security definer/);
assert.match(migration, /raise exception 'not_admin'/);
assert.match(migration, /from public\.guild_members/);
assert.match(migration, /from public\.guilds/);
assert.match(migration, /grant execute on function public\.admin_get_guild_roster\(\) to authenticated/);
assert.doesNotMatch(migration, /grant execute on function public\.admin_get_guild_roster\(\) to (public|anon)/);

// Client wiring: one RPC call, rendered into the dedicated panel, filterable.
assert.match(adminJs, /supabase\.rpc\("admin_get_guild_roster"\)/);
assert.equal((adminJs.match(/admin_get_guild_roster/g) || []).length, 1, "guild roster should be fetched exactly once");
assert.match(adminJs, /function loadGuildRoster\(/);
assert.match(adminJs, /await loadGuildRoster\(\);/);
assert.match(adminJs, /guildRosterSearch\?\.addEventListener\("input", renderGuildRoster\)/);

// The panel and its hooks exist in the markup and stylesheet.
assert.match(adminHtml, /id="guildRosterPanel"/);
assert.match(adminHtml, /id="guildRosterContent"/);
assert.match(adminHtml, /id="guildRosterSearch"/);
assert.match(adminCss, /\.guild-roster-card/);
assert.match(adminCss, /\.guild-role--owner/);

console.log("Admin guild roster tests passed.");

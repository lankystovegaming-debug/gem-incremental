import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/migrations/20260901060631_harden_browser_role_query_policy.sql", import.meta.url),
  "utf8"
);

assert.match(sql, /revoke truncate, trigger, references on all tables in schema public from anon, authenticated/i);
assert.match(sql, /drop policy if exists "Authenticated users can read player usernames"/i);
assert.match(sql, /p\.prosecdef/);
assert.match(sql, /revoke execute on function %s from public, anon/i);
assert.match(sql, /alter default privileges[\s\S]*revoke execute on functions from public, anon, authenticated/i);
assert.doesNotMatch(sql, /drop policy if exists "Players can view own row"/i);

console.log("database browser-role hardening checks passed");

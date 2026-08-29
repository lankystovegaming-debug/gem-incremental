import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const account = readFileSync(
  new URL("../account/account.js", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260829143000_restore_username_updates.sql",
    import.meta.url
  ),
  "utf8"
);

assert.match(account, /\.rpc\(\s*"set_own_username"/);
assert.doesNotMatch(account, /\.from\(\s*"players"\s*\)\s*\.upsert/);

assert.match(migration, /security definer/i);
assert.match(migration, /v_uid uuid := auth\.uid\(\)/);
assert.match(migration, /values \(v_uid, v_username\)/);
assert.match(migration, /grant execute on function public\.set_own_username\(text\) to authenticated/i);
assert.match(migration, /revoke all on function public\.set_own_username\(text\) from public, anon/i);

console.log("username save hotfix tests passed");

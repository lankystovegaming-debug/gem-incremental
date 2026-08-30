import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260830124748_prevent_gmail_alias_account_abuse.sql",
    import.meta.url
  ),
  "utf8"
);

assert.match(migration, /create schema if not exists private_auth/i);
assert.match(migration, /create or replace function private_auth\.canonical_account_email/i);
assert.match(migration, /v_domain in \('gmail\.com', 'googlemail\.com'\)/i);
assert.match(migration, /split_part\(v_local, '\+', 1\)/i);
assert.match(migration, /replace\(v_local, '\.', ''\)/i);
assert.match(migration, /return v_local \|\| '@gmail\.com'/i);

assert.match(migration, /canonical_email text primary key/i);
assert.match(migration, /user_id uuid not null unique/i);
assert.match(migration, /distinct on \(private_auth\.canonical_account_email\(auth_user\.email\)\)/i);
assert.match(migration, /order by[\s\S]*auth_user\.created_at[\s\S]*auth_user\.id/i);

assert.match(migration, /after insert or update of email or delete on auth\.users/i);
assert.match(migration, /email_inbox_already_registered/i);
assert.match(migration, /on conflict \(canonical_email\) do update/i);
assert.match(migration, /where private_auth\.account_email_claims\.user_id = excluded\.user_id/i);

assert.match(migration, /create or replace function private_auth\.before_user_created\(event jsonb\)/i);
assert.match(migration, /'http_code', 422/i);
assert.match(migration, /Gmail aliases cannot be used to create separate accounts/i);
assert.match(migration, /to supabase_auth_admin/i);
assert.match(migration, /revoke all on schema private_auth from public, anon, authenticated/i);

console.log("Gmail alias account-abuse checks passed.");

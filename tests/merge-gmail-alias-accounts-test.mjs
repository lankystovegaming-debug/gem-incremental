import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/20260830134000_merge_gmail_alias_accounts.sql', import.meta.url),
  'utf8',
);

const main = '1c144dce-7fbc-4570-ae9e-80ef05f26e4d';
const duplicates = [
  'd91802fb-077a-41f3-ad41-60277c4ad70e',
  '58876427-74d5-4254-86b7-856c509ae876',
  '80d95f74-3d44-4768-b30c-eb50084a818f',
  '516fdd44-7f4a-4bd9-bdcf-76efa9efb460',
  '8156f2ae-921a-449f-91b8-93781f6f6e02',
  '1a56892d-f550-442a-9492-1f63bd321556',
  '6f79d41c-609c-40b9-8832-95cc66a6dfcd',
];

assert.match(sql, new RegExp(main));
for (const id of duplicates) assert.match(sql, new RegExp(id));
assert.match(sql, /canonical_account_email/);
assert.match(sql, /main account does not own the email claim/);
assert.match(sql, /unexpected duplicate references/);
assert.match(sql, /account_merge_audit/);
assert.match(sql, /update public\.inventory_gems set player_id = v_main/);
assert.match(sql, /case when consumable_id='mythic-potion' then max\(quantity\)/);
assert.match(sql, /max\(achievement_points_awarded\)/);
assert.match(sql, /delete from auth\.users where id=any\(v_duplicates\)/);

console.log('Gmail alias account merge migration checks passed.');

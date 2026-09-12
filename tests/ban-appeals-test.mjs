import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260912010000_in_game_ban_appeals.sql");
const client = read("src/backend/cloudBanAppeals.js");
const shell = read("src/ui/shell.js");
const adminHtml = read("admin/index.html");
const adminJs = read("admin/admin.js");
const adminCss = read("admin/admin.css");
const adminEdge = read("supabase/functions/admin/index.ts");

// Database: private queue, one appeal per actual ban, username captured on the
// server, and player-only RPC access.
assert.match(migration, /create table if not exists public\.ban_appeals/);
assert.match(migration, /unique index[\s\S]*?\(player_id, ban_applied_at\)/);
assert.match(migration, /alter table public\.ban_appeals enable row level security/);
assert.match(migration, /revoke all on table public\.ban_appeals from anon, authenticated/);
assert.match(migration, /grant select, insert, update, delete on table public\.ban_appeals to service_role/);
assert.match(migration, /create or replace function public\.submit_ban_appeal\(p_reason text\)/);
assert.match(migration, /select coalesce\(nullif\(btrim\(player\.username\)/,
  "the server must save the username from players, not trust a client value");
assert.match(migration, /restriction\.active_until > now\(\)/,
  "only actively banned players may submit appeals");
assert.match(migration, /grant execute on function public\.submit_ban_appeal\(text\) to authenticated/);

// Acceptance is atomic: a warning is required, the appeal is marked accepted,
// and only the exact ban that was appealed is removed.
assert.match(migration, /v_decision = 'accepted' and v_message = ''[\s\S]*?unban_warning_required/);
assert.match(migration, /delete from public\.user_roll_luck_rarity_mult[\s\S]*?player_id = v_appeal\.player_id[\s\S]*?applied_at = v_appeal\.ban_applied_at/);
assert.match(migration, /status in \('accepted', 'rejected'\)[\s\S]*?notified_at is null/);
assert.match(migration, /acknowledge_ban_appeal_decision/);
assert.match(migration, /grant execute on function public\.admin_review_ban_appeal\(uuid,text,text,uuid\) to service_role/);

// Player UI replaces both Google Forms links with a reason-only in-game form
// and polls for the admin decision while the restriction screen is open.
for (const rpc of ["get_my_ban_appeal", "submit_ban_appeal", "acknowledge_ban_appeal_decision"]) {
  assert.match(client, new RegExp(`rpc\\("${rpc}"`));
}
assert.match(shell, /data-ban-appeal-form/);
assert.match(shell, /id="banAppealReason"/);
assert.match(shell, /Your current username is attached automatically/);
assert.match(shell, /Your ban appeal was rejected\./);
assert.match(shell, /showBanAppealDecision/);
assert.match(shell, /decision_message/);
assert.match(shell, /window\.setInterval[\s\S]*?loadMyBanAppeal/);
assert.doesNotMatch(shell, /forms\.gle/);

// Admin UI has a dedicated tab, queue, decision message, and both review
// actions. The Edge Function enforces admin access before touching the queue.
assert.match(adminHtml, /data-admin-tab="appeals">Appeals</);
assert.match(adminHtml, /id="appealsPanel"/);
assert.match(adminJs, /appeals: \["#appealsPanel"\]/);
assert.match(adminJs, /function loadBanAppeals\(\)/);
assert.match(adminJs, /data-appeal-review="rejected"/);
assert.match(adminJs, /data-appeal-review="accepted"/);
assert.match(adminJs, /Accept &amp; unban/);
assert.match(adminJs, /Warning required/);
assert.match(adminEdge, /if \(action === "appeals_list"\)/);
assert.match(adminEdge, /if \(action === "appeals_review"\)/);
assert.match(adminEdge, /rpc\("admin_review_ban_appeal"/);
assert.match(adminCss, /\.appeal-card/);

console.log("ban-appeals-test passed");

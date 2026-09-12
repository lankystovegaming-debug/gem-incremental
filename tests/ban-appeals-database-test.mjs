import assert from "node:assert/strict";
import fs from "node:fs/promises";

const { PGlite } = await import("@electric-sql/pglite");
const db = new PGlite();

const playerOne = "00000000-0000-4000-8000-000000000001";
const playerTwo = "00000000-0000-4000-8000-000000000002";
const reviewer = "00000000-0000-4000-8000-000000000099";

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '')
  $$;
  grant usage on schema auth to authenticated, service_role;
  grant execute on function auth.uid(), auth.role() to authenticated, service_role;

  create table public.players (
    id uuid primary key,
    username text
  );
  create table public.admins (
    user_id uuid primary key
  );
  create table public.user_roll_luck_rarity_mult (
    player_id uuid primary key references public.players(id),
    active_until timestamptz not null,
    note text,
    applied_at timestamptz not null default now(),
    applied_by uuid
  );

  insert into public.players (id, username) values
    ('${playerOne}', 'Appealing Player'),
    ('${playerTwo}', 'Rejected Player');
  insert into public.user_roll_luck_rarity_mult (player_id, active_until, applied_at) values
    ('${playerOne}', now() + interval '100 years', '2026-09-12 01:00:00+00'),
    ('${playerTwo}', now() + interval '100 years', '2026-09-12 02:00:00+00');
  grant select on public.players, public.admins, public.user_roll_luck_rarity_mult to service_role;
`);

await db.exec(await fs.readFile(
  new URL("../supabase/migrations/20260912010000_in_game_ban_appeals.sql", import.meta.url),
  "utf8"
));

async function becomePlayer(playerId) {
  await db.exec(`
    reset role;
    set role authenticated;
    set request.jwt.claim.sub = '${playerId}';
    set request.jwt.claim.role = 'authenticated';
  `);
}

async function becomeService() {
  await db.exec(`
    reset role;
    set role service_role;
    set request.jwt.claim.sub = '';
    set request.jwt.claim.role = 'service_role';
  `);
}

await becomePlayer(playerOne);
let appeal = (await db.query(
  "select public.submit_ban_appeal($1) as appeal",
  ["I understand the rule and would like another chance."]
)).rows[0].appeal;
assert.equal(appeal.username, "Appealing Player");
assert.equal(appeal.status, "pending");

// A repeated submission updates the same pending appeal instead of creating a
// second queue item for the same ban.
appeal = (await db.query(
  "select public.submit_ban_appeal($1) as appeal",
  ["Updated reason for the same ban."]
)).rows[0].appeal;
assert.equal(appeal.reason, "Updated reason for the same ban.");
await assert.rejects(db.query("select * from public.ban_appeals"), /permission denied/);

await becomeService();
let count = (await db.query("select count(*)::int as count from public.ban_appeals")).rows[0].count;
assert.equal(count, 1);
await assert.rejects(
  db.query("select public.admin_review_ban_appeal($1, 'accepted', '', $2)", [appeal.id, reviewer]),
  /unban_warning_required/
);

const warning = "Your appeal is accepted. This is a final warning: follow every game rule or the next ban may be permanent.";
await db.query(
  "select public.admin_review_ban_appeal($1, 'accepted', $2, $3)",
  [appeal.id, warning, reviewer]
);
count = (await db.query(
  "select count(*)::int as count from public.user_roll_luck_rarity_mult where player_id = $1",
  [playerOne]
)).rows[0].count;
assert.equal(count, 0, "accepting must remove the exact appealed ban");

await becomePlayer(playerOne);
appeal = (await db.query("select public.get_my_ban_appeal() as appeal")).rows[0].appeal;
assert.equal(appeal.status, "accepted");
assert.equal(appeal.decision_message, warning);
await db.query("select public.acknowledge_ban_appeal_decision($1)", [appeal.id]);
assert.equal((await db.query("select public.get_my_ban_appeal() as appeal")).rows[0].appeal, null);

// Rejection leaves the ban in place and provides the promised default notice.
await becomePlayer(playerTwo);
const rejected = (await db.query(
  "select public.submit_ban_appeal($1) as appeal",
  ["Please review my ban."]
)).rows[0].appeal;
await becomeService();
await db.query(
  "select public.admin_review_ban_appeal($1, 'rejected', '', $2)",
  [rejected.id, reviewer]
);
count = (await db.query(
  "select count(*)::int as count from public.user_roll_luck_rarity_mult where player_id = $1",
  [playerTwo]
)).rows[0].count;
assert.equal(count, 1, "rejecting must keep the ban active");
const rejectedRow = (await db.query(
  "select status, decision_message from public.ban_appeals where id = $1",
  [rejected.id]
)).rows[0];
assert.equal(rejectedRow.status, "rejected");
assert.equal(rejectedRow.decision_message, "Your ban appeal was rejected.");

await db.close();
console.log("ban-appeals-database-test passed");

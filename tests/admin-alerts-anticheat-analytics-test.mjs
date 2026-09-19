import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migration = readFileSync(
  new URL("../supabase/migrations/20260919100000_admin_alerts_anticheat_analytics.sql", import.meta.url),
  "utf8"
);
const adminId = "00000000-0000-4000-8000-000000000099";
const playerOne = "00000000-0000-4000-8000-000000000001";
const playerTwo = "00000000-0000-4000-8000-000000000002";

await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table public.admins(user_id uuid primary key);
  create table public.players(id uuid primary key, username text);
  create table public.player_presence(
    player_id uuid primary key,
    first_seen_at timestamptz not null,
    last_ip text,
    last_ip_at timestamptz
  );
  create table public.economy_cash_ledger(
    player_id uuid,
    account text not null,
    amount numeric not null,
    category text,
    subcategory text,
    created_at timestamptz not null default now()
  );
  insert into public.admins values ('${adminId}');
  insert into public.players values ('${playerOne}', 'Rapid Newcomer'), ('${playerTwo}', 'Network Peer');
  insert into public.player_presence values
    ('${playerOne}', now() - interval '1 day', '203.0.113.55', now()),
    ('${playerTwo}', now() - interval '20 days', '203.0.113.55', now());
  insert into public.economy_cash_ledger(player_id, account, amount, category, subcategory, created_at)
  select '${playerOne}'::uuid, 'wallet', 30, 'roll', 'reward', now() - interval '20 minutes'
  from generate_series(1, 8);
  insert into public.economy_cash_ledger values
    ('${playerOne}', 'wallet', 500, 'roll', 'jackpot', now() - interval '10 minutes'),
    ('${playerTwo}', 'wallet', 400, 'roll', 'jackpot', now() - interval '8 minutes');
`);

await db.exec(migration);
await db.exec(readFileSync(
  new URL("../supabase/migrations/20260919110000_admin_alerts_query_performance.sql", import.meta.url),
  "utf8"
));
await db.query("select set_config('request.jwt.claim.sub', $1, false)", [adminId]);

const raw = (await db.query("select public.admin_get_activity_alerts($1, $2) as result", [24, 100])).rows[0].result;
const result = typeof raw === "string" ? JSON.parse(raw) : raw;
assert.ok(result.summary, "response must include an analytics summary");
assert.ok(Array.isArray(result.timeline), "response must include hourly activity");
assert.ok(Array.isArray(result.topPlayers), "response must include prioritised player analytics");
assert.ok(result.summary.totalAlerts >= 1);
assert.ok(result.totalInflow > 0, "inflow must not be netted against withdrawals");
assert.equal(result.sampled, false, "small windows should retain every event");
assert.ok(result.topPlayers.some((player) => player.playerId === playerOne));

const alertTypes = new Set(result.alerts.map((alert) => alert.type));
for (const alertType of ["cash_spike", "income_velocity", "shared_ip_inflow", "new_account_windfall"]) {
  assert.ok(alertTypes.has(alertType), `missing ${alertType} signal`);
}

await db.query("select set_config('request.jwt.claim.sub', $1, false)", [playerOne]);
await assert.rejects(
  () => db.query("select public.admin_get_activity_alerts($1, $2)", [24, 100]),
  /not_admin/
);

await db.close();
console.log("admin anti-cheat alerts analytics migration passed");

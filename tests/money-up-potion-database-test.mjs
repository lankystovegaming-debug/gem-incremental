import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migration = readFileSync(
  new URL("../supabase/migrations/20260920120000_money_up_potion.sql", import.meta.url),
  "utf8"
);
const playerId = "00000000-0000-4000-8000-000000000001";

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create table public.players(
    id uuid primary key,
    username text,
    money double precision not null default 0,
    lifetime_earnings double precision not null default 0
  );
  create table public.inventory_gems(
    id bigint primary key,
    player_id uuid not null,
    gem_name text not null,
    value double precision not null,
    locked boolean not null default false
  );
  create table public.player_boosts(
    player_id uuid not null,
    family text not null,
    tier integer not null,
    effect_value numeric not null,
    expires_at timestamptz not null,
    updated_at timestamptz,
    primary key(player_id, family)
  );
  create table public.game_consumables(
    id text primary key,
    name text,
    family text,
    tier integer,
    effect_value numeric,
    duration_seconds integer,
    purchasable boolean,
    shop_price numeric
  );
  create table public.game_recipes(id text primary key, recipe jsonb not null);
  create table public.global_cash_events(player_name text, gem_name text, amount double precision);
  create function public.equipment_gem_sell_multiplier(uuid) returns numeric language sql stable as $$select 1::numeric$$;
  insert into public.players(id, username) values ('${playerId}', 'Potion Tester');
`);

await db.exec(migration);

await db.query(
  "insert into public.player_boosts(player_id, family, tier, effect_value, expires_at) values($1, 'gemValue', 1, 1.5, now() + interval '1 minute')",
  [playerId]
);
await db.query(
  "insert into public.inventory_gems(id, player_id, gem_name, value) values(1, $1, 'Quartz', 100)",
  [playerId]
);
let money = (await db.query(
  "select public.sell_inventory_gem($1, 1, 'auto') as money",
  [playerId]
)).rows[0].money;
assert.equal(money, 150, "an active Money Up Potion must multiply automatic sales");

await db.query(
  "insert into public.inventory_gems(id, player_id, gem_name, value) values(2, $1, 'Quartz', 100)",
  [playerId]
);
money = (await db.query(
  "select public.sell_inventory_gem($1, 2, 'manual') as money",
  [playerId]
)).rows[0].money;
assert.equal(money, 250, "manual sales must not receive the auto-sell multiplier");

await db.query("update public.player_boosts set expires_at = now() - interval '1 second' where player_id = $1", [playerId]);
await db.query(
  "insert into public.inventory_gems(id, player_id, gem_name, value) values(3, $1, 'Quartz', 100)",
  [playerId]
);
money = (await db.query(
  "select public.sell_inventory_gem($1, 3, 'auto') as money",
  [playerId]
)).rows[0].money;
assert.equal(money, 350, "expired Money Up Potions must not affect automatic sales");

const consumables = (await db.query(
  "select id, family, effect_value, duration_seconds from public.game_consumables where id like 'money-up-potion%' order by id"
)).rows.map((row) => ({ ...row, effect_value: Number(row.effect_value) }));
assert.deepEqual(consumables, [
  { id: "money-up-potion", family: "gemValue", effect_value: 1.5, duration_seconds: 60 },
  { id: "money-up-potion-2", family: "gemValue", effect_value: 2, duration_seconds: 60 }
]);

await db.close();
console.log("Money Up Potion database checks passed");

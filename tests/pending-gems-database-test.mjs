import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migration = readFileSync(
  new URL("../supabase/migrations/20260922005630_add_pending_gems_and_daily_time_windows.sql", import.meta.url),
  "utf8"
);

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;

  create table public.private_feature_gems (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    rarity double precision not null check (rarity > 0),
    base_weight numeric not null check (base_weight > 0),
    value_per_gram numeric not null check (value_per_gram >= 0),
    sort_order integer not null default 0,
    enabled boolean not null default true,
    starts_at timestamptz,
    ends_at timestamptz,
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    description text not null default '',
    hide_rarity_until_discovered boolean not null default false,
    title text not null default '',
    availability_mode text not null default 'always',
    daily_start_time time,
    daily_end_time time,
    availability_timezone text not null default 'Asia/Singapore',
    affected_by_luck boolean not null default true,
    special_gem boolean not null default false
  );

  create function public.roll_prepare_context(
    p_player_id uuid,
    p_now timestamptz,
    p_gem_catalog_version bigint default null,
    p_mutation_catalog_version bigint default null
  ) returns jsonb language sql security definer set search_path = '' as $$
    select jsonb_build_object('gemCatalog', coalesce((
      select jsonb_agg(to_jsonb(g)) from (
        select daily_start_time, daily_end_time,
          availability_timezone
        from public.private_feature_gems where enabled = true
      ) g
    ), '[]'::jsonb));
  $$;
`);

await db.exec(migration);

const rows = (await db.query(`
  select name, rarity, base_weight, value_per_gram, affected_by_luck,
    availability_mode, daily_time_windows, metadata, description
  from public.private_feature_gems
  order by name
`)).rows;

assert.equal(rows.length, 10);
const byName = new Map(rows.map((row) => [row.name, row]));
assert.deepEqual(byName.get("Aurorium").daily_time_windows, [
  { start: "05:00", end: "07:00" },
  { start: "17:00", end: "19:00" }
]);
assert.equal(byName.get("Aurorium").availability_mode, "daily");
assert.equal(Number(byName.get("Aurorium").rarity), 300000000);
assert.equal(byName.get("touch grass").affected_by_luck, false);

const zephyrion = byName.get("Zephyrion");
assert.equal(Number(zephyrion.rarity), 1000);
assert.equal(Number(zephyrion.base_weight), 6000);
assert.equal(Number(zephyrion.value_per_gram), 4000);
assert.equal(zephyrion.affected_by_luck, false);
assert.equal(zephyrion.metadata.rarityClass, "anomalous");
assert.equal(zephyrion.metadata.sourceId, "mythic-potion");
assert.match(zephyrion.description, /\(by @Hydrogenbomb1\)$/);

const publicAurorium = (await db.query(`
  select daily_time_windows from public.get_public_gem_catalog() where name = 'Aurorium'
`)).rows[0];
assert.deepEqual(publicAurorium.daily_time_windows, byName.get("Aurorium").daily_time_windows);

await db.exec("set role service_role");
const snapshot = (await db.query(`
  select public.roll_prepare_context(
    '00000000-0000-0000-0000-000000000001'::uuid,
    now(), null, null
  ) as value
`)).rows[0].value;
await db.exec("reset role");
assert.deepEqual(snapshot.gemCatalog.find((gem) => gem.daily_time_windows)?.daily_time_windows, byName.get("Aurorium").daily_time_windows);

console.log("Pending gems migration: ten rows, dual Aurorium windows, public catalog, and optimized roll snapshot projection passed.");

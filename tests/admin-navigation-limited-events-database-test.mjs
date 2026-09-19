import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migration = readFileSync(
  new URL("../supabase/migrations/20260919000001_admin_navigation_workbench_limited_events.sql", import.meta.url),
  "utf8"
);

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create table public.player_settings(
    player_id uuid primary key,
    settings jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
  );
  create table public.player_gem_mutation_combinations(player_id uuid, gem_name text);
  create table public.admins(user_id uuid primary key);
  create table public.game_pets(
    id text primary key,
    name text not null,
    chance_denominator numeric not null default 100000000,
    affected_by_luck boolean not null default false,
    enabled boolean not null default false,
    stats jsonb not null default '{}'::jsonb,
    description text not null default '',
    updated_at timestamptz not null default now(),
    updated_by uuid
  );
  create table public.admin_content_catalog(
    id bigint generated always as identity primary key,
    content_type text not null,
    content_key text not null,
    name text not null,
    enabled boolean not null default true,
    config jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    updated_by uuid,
    unique(content_type, content_key)
  );
  create table public.forge_config(
    id boolean primary key default true,
    enabled boolean not null default false,
    beta_label text not null default 'Workbench [BETA]',
    display_name text not null default 'Workbench [BETA]',
    icon text not null default '⚒',
    min_materials integer not null default 3,
    max_materials integer not null default 50,
    stage_time_seconds numeric not null default 8,
    quality_broken numeric not null default .65,
    quality_poor numeric not null default .8,
    quality_average numeric not null default 1,
    quality_good numeric not null default 1.1,
    quality_excellent numeric not null default 1.2,
    quality_masterwork numeric not null default 1.3,
    trait_threshold_minor numeric not null default .1,
    trait_threshold_full numeric not null default .3,
    ore_count_rules jsonb not null default '{}'::jsonb,
    trait_rules jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
  );
  create table public.game_section_settings(
    id text primary key,
    label text not null,
    short_label text,
    icon text,
    description text not null default '',
    enabled boolean not null default false,
    sort_order integer not null default 0,
    admin_only boolean not null default false,
    updated_at timestamptz not null default now()
  );
  create table public.game_recipes(id text primary key, recipe jsonb not null);

  insert into public.forge_config(id, enabled) values(true, true);
  insert into public.game_section_settings(id,label,enabled,admin_only)
  values('workbench','Workbench',true,true);
`);

await db.exec(migration);

const userId = "00000000-0000-0000-0000-000000000001";
await db.query("insert into auth.users(id) values($1)", [userId]);
await db.query("insert into admins(user_id) values($1)", [userId]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);

const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.result;

assert.equal(await scalar("select enabled result from forge_config where id=true"), false);
assert.equal(await scalar("select enabled result from limited_event_definitions where id='deep-sea'"), false);

const settings = await scalar("select update_qol_settings($1) result", [{ topBarMain: ["roll", "minigames"] }]);
assert.deepEqual(settings.topBarMain, ["roll", "minigames"]);
await assert.rejects(
  () => scalar("select update_qol_settings($1) result", [{ topBarMain: Array.from({ length: 13 }, (_, i) => `page-${i}`) }]),
  /invalid_navigation_settings/
);

await scalar("select admin_set_equipment_tab('armory',true) result");
assert.equal(await scalar("select enabled result from game_section_settings where id='equipment-armory'"), true);
await assert.rejects(() => scalar("select admin_set_equipment_tab('pickaxe',false) result"), /invalid_equipment_tab/);

await scalar("select admin_save_limited_event('active','Active event','Ready',true,null,null,'{}') result");
assert.equal(await scalar("select count(*)::int result from get_active_limited_events()"), 1);

await db.close();
console.log("Admin navigation, Workbench controls and limited-events migration passed.");

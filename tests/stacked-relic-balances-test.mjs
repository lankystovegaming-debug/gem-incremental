import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migration = await read("supabase/migrations/20260914053715_stacked_relic_balances.sql");
const roll = await read("supabase/functions/roll/index.ts");
const enchant = await read("supabase/functions/enchant-equipment/index.ts");
const inventory = await read("inventory/inventory.js");
const forge = await read("supabase/functions/forge/index.ts");
const museum = await read("supabase/functions/museum/index.ts");
const auctions = await read("auctions/auctions.js");
const workbench = await read("supabase/functions/workbench/index.ts");
const manualDeposit = await read("supabase/functions/manual-deposit/index.ts");

assert.match(roll, /rpc\(\s*["']grant_player_relic["']/);
assert.doesNotMatch(enchant, /relicGemId|inventory_gems|\.delete\(/);
assert.match(enchant, /apply_equipment_enchant/);
assert.match(inventory, /loadCloudRelicBalances/);
assert.match(inventory, /state\.relicBalances/);
assert.match(forge, /neq\("gem_name","Enchant Relic"\).*neq\("gem_name","Ancient Relic"\)/s);
assert.match(museum, /neq\("gem_name", "Enchant Relic"\).*neq\("gem_name", "Ancient Relic"\)/s);
assert.match(auctions, /!isRelic\(gem\)/);
assert.match(workbench, /neq\("gem_name", "Enchant Relic"\).*neq\("gem_name", "Ancient Relic"\)/s);
assert.match(manualDeposit, /neq\(\s*"gem_name",\s*"Enchant Relic"\s*\).*neq\(\s*"gem_name",\s*"Ancient Relic"\s*\)/s);

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create schema cosmetics_private;
  create schema roll_history_private;

  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');

  create table public.players(
    id uuid primary key, username text, display_title text, display_title_color text,
    created_at timestamptz default now(), total_rolls bigint default 0,
    lifetime_earnings numeric default 0, inventory_capacity integer default 15,
    rarest_gem_name text, rarest_gem_rarity integer, mutation_luck numeric default 1,
    showcase jsonb not null default '[]', money double precision default 0,
    legacy_save_migrated boolean default false
  );
  create table public.inventory_gems(
    id bigserial primary key, player_id uuid not null references public.players(id),
    gem_name text not null, rarity integer default 0, base_weight double precision default 0,
    value_per_gram double precision default 0, rolled_weight_multiplier double precision default 1,
    rolled_weight double precision default 0, final_weight double precision default 0,
    value double precision default 0, locked boolean default false, mutation_ids text[] default '{}'
  );
  create table public.player_equipment(
    id bigserial primary key, player_id uuid not null references public.players(id),
    equipment_id text, category text, tier integer default 1, name text,
    luck_bonus double precision default 0, roll_speed_bonus double precision default 0,
    weight_luck_bonus double precision default 0, weight_multiplier_bonus double precision default 0,
    equipped boolean default true, enchant_id text, enchant_grade text,
    enchant_state jsonb default '{}', masterwork_level integer default 0,
    masterwork_passive text, masterwork_passive_rank integer default 0,
    masterwork_attunement text, masterwork_rerolls integer default 0,
    masterwork_choices text[], masterwork_perfected_at timestamptz
  );
  create table public.museum_exhibits(
    player_id uuid not null references public.players(id),
    specimen_id bigint not null references public.inventory_gems(id)
  );
  create table public.player_titles(player_id uuid, title text, color text);
  create table public.player_gem_mutation_combinations(player_id uuid, gem_name text);
  create table public.private_feature_definitions(id text, feature_kind text, enabled boolean);
  create table public.private_feature_progress(player_id uuid, feature_id text, completed boolean);
  create table public.game_bundles(id text, name text, icon text, sort_order integer);
  create table roll_history_private.lifetime_facts(player_id uuid, raw_rarity numeric, gem_name text);
  create table public.player_mining_cache_items(
    player_id uuid, item_id text, quantity integer, updated_at timestamptz,
    primary key(player_id,item_id)
  );
  create table public.crafting_progress(player_id uuid, recipe_id text, progress jsonb, updated_at timestamptz);
  create table public.player_crafting(player_id uuid primary key, active_auto_craft text, created_at timestamptz, updated_at timestamptz);
  create table public.gem_index(player_id uuid, gem_name text, total_rolled bigint, heaviest_weight double precision, first_discovered_at timestamptz, updated_at timestamptz, primary key(player_id,gem_name));

  create function cosmetics_private.resolved_loadout(uuid) returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  create function public.bundle_public_summary(uuid) returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  create function public.museum_recalculate(uuid) returns void language sql as $$ select $$;
  create function public.record_expedition_relic_spend(uuid,integer,integer) returns void language sql as $$ select $$;
  create function public.migrate_legacy_save(uuid,numeric,integer,bigint,text,integer,jsonb,jsonb,jsonb,text,jsonb)
  returns jsonb language plpgsql security definer set search_path='' as $$
  begin
    delete from public.inventory_gems
    where player_id = p_player_id;
    return '{}'::jsonb;
  end $$;

  insert into public.players(id,username,showcase)
  values ('00000000-0000-0000-0000-000000000001','test',
    '[{"id":1,"gem_name":"Enchant Relic"},{"id":3,"gem_name":"Ruby"}]');
  insert into public.inventory_gems(player_id,gem_name) values
    ('00000000-0000-0000-0000-000000000001','Enchant Relic'),
    ('00000000-0000-0000-0000-000000000001','Enchant Relic'),
    ('00000000-0000-0000-0000-000000000001','Ruby'),
    ('00000000-0000-0000-0000-000000000001','Ancient Relic');
  insert into public.museum_exhibits values
    ('00000000-0000-0000-0000-000000000001',1);
`);

await db.exec(migration);

const balances = await db.query(`
  select relic_type,amount from public.player_relic_balances order by relic_type
`);
assert.deepEqual(balances.rows, [
  { relic_type: "Ancient Relic", amount: 1 },
  { relic_type: "Enchant Relic", amount: 2 }
]);
assert.equal((await db.query(`select count(*)::int n from public.inventory_gems`)).rows[0].n, 1);
assert.deepEqual((await db.query(`select showcase from public.players`)).rows[0].showcase, [
  { id: 3, gem_name: "Ruby" }
]);

await db.exec(`
  insert into public.inventory_gems(player_id,gem_name)
  select '00000000-0000-0000-0000-000000000001','Enchant Relic' from generate_series(1,3);
`);
assert.equal((await db.query(`select amount from public.player_relic_balances where relic_type='Enchant Relic'`)).rows[0].amount, 5);
assert.equal((await db.query(`select count(*)::int n from public.inventory_gems where gem_name='Enchant Relic'`)).rows[0].n, 0);

await db.exec(`select public.spend_player_relic('00000000-0000-0000-0000-000000000001','Enchant Relic',2)`);
assert.equal((await db.query(`select amount from public.player_relic_balances where relic_type='Enchant Relic'`)).rows[0].amount, 3);

console.log("Stacked relic migration and code-path tests passed.");

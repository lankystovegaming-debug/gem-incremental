import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const uid = "00000000-0000-0000-0000-000000000001";
const migration = readFileSync(
  new URL("../supabase/migrations/20260913033312_batch_rolling_and_all_in_balance.sql", import.meta.url),
  "utf8"
);
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    'select ''${uid}''::uuid';
  create table players (
    id uuid primary key,
    equipment_genuine_rolls bigint not null default 0,
    equipment_state jsonb not null default '{}',
    next_roll_at timestamptz,
    roll_lease_id uuid,
    roll_lease_expires_at timestamptz
  );
  create table player_equipment (
    id bigserial primary key,
    player_id uuid not null,
    equipment_id text not null,
    equipped boolean not null default false,
    roll_speed_bonus double precision not null default 0
  );
  create table equipment_ownership_history (player_id uuid not null, equipment_id text not null);
  create table game_recipes (id text primary key, recipe jsonb not null);
  create table player_settings (
    player_id uuid primary key,
    settings jsonb not null default '{}',
    updated_at timestamptz not null default now()
  );
  create table player_gem_mutation_combinations (player_id uuid not null, gem_name text not null);
  create or replace function public.claim_server_roll(p_player_id uuid, p_cooldown_ms numeric)
  returns jsonb language plpgsql security definer set search_path = '' as $$
  declare p public.players%rowtype; lease uuid := gen_random_uuid(); next_at timestamptz := clock_timestamp() + make_interval(secs => (p_cooldown_ms / 1000)::double precision);
  begin
    select * into p from public.players where id = p_player_id for update;
    if p.roll_lease_expires_at > clock_timestamp() then return jsonb_build_object('status','in_flight'); end if;
    update public.players set next_roll_at = next_at, roll_lease_id = lease,
      roll_lease_expires_at = clock_timestamp() + interval '30 seconds' where id = p_player_id;
    return jsonb_build_object('status','claimed','leaseId',lease,'nextRollAt',next_at,'genuineRoll',p.equipment_genuine_rolls + 1);
  end $$;
  insert into players(id) values ('${uid}');
  insert into game_recipes(id, recipe) values (
    'all-in-pickaxe',
    '{"reward":{"bonus":{"luck":249,"rollSpeed":-0.8,"mutationChance":-0.9,"weightLuck":-0.9,"weightMultiplier":-0.9}}}'
  );
  insert into player_equipment(player_id,equipment_id,equipped,roll_speed_bonus)
  values ('${uid}','all-in-pickaxe',true,-0.8);
`);
await db.exec(migration);

assert.equal(Number((await one("select recipe->'reward'->'bonus'->>'rollSpeed' speed from game_recipes where id='all-in-pickaxe'")).speed), -0.75);
assert.equal((await one("select roll_speed_bonus speed from player_equipment where equipment_id='all-in-pickaxe'")).speed, -0.75);
assert.equal(Number((await one("select update_qol_settings('{\"batchSize\":4}') result")).result.batchSize), 4);
for (const value of [0, 5, 1.5, "2", true, null]) {
  await assert.rejects(
    () => db.query("select update_qol_settings($1)", [{ batchSize: value }]),
    /invalid_batch_size/
  );
}
assert.equal((await one("select roll_batch_unlock_status($1,2) result", [uid])).result.status, "unlocked");
assert.equal((await one("select roll_batch_unlock_status($1,3) result", [uid])).result.status, "batch_locked");

await db.query("update players set equipment_genuine_rolls=100000 where id=$1", [uid]);
const state = (await one("select equipment_state from players where id=$1", [uid])).equipment_state;
const ids = (await db.query("select id from player_equipment where player_id=$1 and equipped order by id", [uid])).rows.map((row) => row.id);
const triple = (await one("select claim_equipment_roll_batch($1,7500,$2,$3,3) result", [uid, state, ids])).result;
assert.equal(triple.status, "claimed");
assert.equal(triple.batchSize, 3);
assert.equal(Number(triple.genuineRoll), 100001);

await db.query("update players set equipment_genuine_rolls=500000,next_roll_at=null,roll_lease_id=null,roll_lease_expires_at=null where id=$1", [uid]);
assert.equal((await one("select roll_batch_unlock_status($1,4) result", [uid])).result.status, "batch_locked");
await db.query("insert into equipment_ownership_history values($1,'celestial-pickaxe')", [uid]);
assert.equal((await one("select roll_batch_unlock_status($1,4) result", [uid])).result.status, "unlocked");
assert.equal((await one("select roll_batch_unlock_status($1,5) result", [uid])).result.status, "invalid_batch_size");
assert.equal(
  (await one("select has_function_privilege('authenticated','public.claim_equipment_roll_batch(uuid,numeric,jsonb,bigint[],integer)','execute') allowed")).allowed,
  false
);

await db.close();
console.log("Batch rolling migration unlocks, authoritative claim validation and All-In data updates passed.");

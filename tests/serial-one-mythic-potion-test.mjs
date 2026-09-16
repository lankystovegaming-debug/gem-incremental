import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../supabase/migrations/20260916011503_reward_serial_one_mythic_potion.sql", import.meta.url),
  "utf8"
);
const roll = readFileSync(
  new URL("../supabase/functions/roll/index.ts", import.meta.url),
  "utf8"
);

const db = new PGlite();
const uid = "00000000-0000-0000-0000-000000000001";

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create table players (
    id uuid primary key,
    roll_lease_id uuid,
    equipment_state_roll bigint not null default 0,
    equipment_genuine_rolls bigint not null default 0,
    equipment_state jsonb not null default '{}'
  );
  create table player_consumables (
    player_id uuid not null,
    consumable_id text not null,
    quantity integer not null default 0,
    updated_at timestamptz not null default now(),
    primary key (player_id, consumable_id)
  );
  create table inventory_gems (
    id bigserial primary key,
    player_id uuid not null,
    gem_name text,
    rarity integer,
    base_weight double precision,
    value_per_gram double precision,
    rolled_weight_multiplier double precision,
    rolled_weight double precision,
    final_weight double precision,
    mutation_id text,
    mutation_ids text[],
    mutation_multiplier double precision,
    mutation_multipliers jsonb,
    mutation_chance_multiplier double precision,
    value double precision,
    luck_at_roll double precision,
    locked boolean,
    serial_number bigint,
    roll_number bigint
  );
`);
await db.exec(migration);

await db.query(
  "insert into inventory_gems(player_id, serial_number, roll_number) values($1, 1, 42)",
  [uid]
);
assert.equal(
  Number((await db.query(
    "select quantity from player_consumables where player_id=$1 and consumable_id='mythic-potion'",
    [uid]
  )).rows[0].quantity),
  1,
  "a rolled serial #1 grants one mythic potion"
);

await db.query(
  "insert into inventory_gems(player_id, serial_number, roll_number) values($1, 1, 43)",
  [uid]
);
assert.equal(
  Number((await db.query(
    "select quantity from player_consumables where player_id=$1 and consumable_id='mythic-potion'",
    [uid]
  )).rows[0].quantity),
  2,
  "separate serial #1 gems stack rewards without a lost update"
);

await db.query(
  "insert into inventory_gems(player_id, serial_number, roll_number) values($1, 2, 44), ($1, 1, null)",
  [uid]
);
assert.equal(
  Number((await db.query(
    "select quantity from player_consumables where player_id=$1 and consumable_id='mythic-potion'",
    [uid]
  )).rows[0].quantity),
  2,
  "other serials and non-roll inventory grants do not receive the reward"
);

await db.exec(`
  create function assign_test_serial()
  returns trigger
  language plpgsql
  as $$
  begin
    if new.serial_number is null then new.serial_number := 1; end if;
    return new;
  end;
  $$;
  create trigger assign_test_serial_trg
    before insert on inventory_gems
    for each row execute function assign_test_serial();
  insert into players(id, roll_lease_id)
  values ('${uid}', '00000000-0000-0000-0000-000000000099');
`);

const bonus = {
  gem_name: "Breakneck Gem",
  rarity: 100000,
  base_weight: 1,
  value_per_gram: 2,
  rolled_weight_multiplier: 1.5,
  rolled_weight: 1.5,
  final_weight: 1.5,
  mutation_id: null,
  mutation_ids: [],
  mutation_multiplier: 1,
  mutation_multipliers: {},
  mutation_chance_multiplier: 1,
  value: 3,
  luck_at_roll: 10,
  roll_number: 45
};
await db.query(
  "select commit_equipment_roll($1, $2, 1, '{}'::jsonb, null, $3::jsonb, 100)",
  [uid, "00000000-0000-0000-0000-000000000099", bonus]
);
assert.equal(
  Number((await db.query(
    "select quantity from player_consumables where player_id=$1 and consumable_id='mythic-potion'",
    [uid]
  )).rows[0].quantity),
  3,
  "a serial #1 Breakneck bonus grants its mythic potion in the equipment transaction"
);
assert.equal(
  Number((await db.query(
    "select roll_number from inventory_gems where gem_name='Breakneck Gem'"
  )).rows[0].roll_number),
  45,
  "the Breakneck specimen retains its parent total_rolls number"
);

assert.match(
  migration,
  /insert into public\.inventory_gems[\s\S]*roll_number[\s\S]*\(p_bonus->>'roll_number'\)::bigint/,
  "the equipment bonus RPC persists the parent roll number"
);
assert.match(
  roll,
  /roll_number:\s*Number\(player\.total_rolls \?\? 0\) \+ 1/,
  "Breakneck bonus rolls use total_rolls for reward eligibility"
);
assert.doesNotMatch(
  roll,
  /roll_number:\s*Number\(player\.equipment_genuine_rolls/,
  "roll numbering never uses equipment_genuine_rolls"
);

await db.close();
console.log("Serial #1 roll mythic-potion rewards passed.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();

await db.exec(`
  create table global_chat_announcements (
    id bigint generated always as identity primary key,
    rarity numeric,
    effective_rarity numeric,
    mutation_ids text[] default '{}'
  );
  create table rare_roll_chat_events (
    source_type text not null,
    source_id bigint,
    player_id uuid,
    username text,
    gem_name text,
    rarity numeric,
    effective_rarity numeric,
    mutation_ids text[],
    base_luck numeric,
    created_at timestamptz,
    unique (source_type, source_id)
  );
  create table best_roll_history (
    id bigint generated always as identity primary key,
    player_id uuid,
    username text,
    gem_name text,
    rarity numeric,
    mutation_ids text[] default '{}',
    base_luck numeric default 1,
    created_at timestamptz default now()
  );
  create function get_mutation_chance_product(ids text[])
  returns numeric language sql immutable as $$
    select case
      when 'ten-billion' = any(ids) then 10000
      when 'sub-billion' = any(ids) then 999
      else 1
    end
  $$;
  create function filter_global_roll_announcements()
  returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger filter_global_roll_announcements
  after insert on global_chat_announcements
  for each row execute function filter_global_roll_announcements();
  create function persist_rare_roll_chat_event()
  returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger persist_rare_roll_chat_event
  after insert on best_roll_history
  for each row execute function persist_rare_roll_chat_event();
`);

const migration = readFileSync(
  new URL("../supabase/migrations/20260920235514_move_rare_rolls_out_of_chat.sql", import.meta.url),
  "utf8"
);
await db.exec(migration);

await db.exec(`
  insert into global_chat_announcements(rarity,effective_rarity,mutation_ids) values
    (100000000,100000000,'{}'),
    (99999999,99999999,'{}'),
    (100000000,999999999,'{sub-billion}'),
    (100,10000000000,'{ten-billion}');
`);
let rows = await db.query("select rarity,effective_rarity,mutation_ids from global_chat_announcements order by id");
assert.deepEqual(rows.rows.map((row) => Number(row.effective_rarity)), [100_000_000, 10_000_000_000]);

await db.exec(`
  insert into global_chat_announcements(rarity,effective_rarity,mutation_ids)
  values (100000000,100000000,'{}');
  update global_chat_announcements
  set mutation_ids='{sub-billion}', effective_rarity=999999999
  where id=(select max(id) from global_chat_announcements);
`);
rows = await db.query("select count(*)::integer as count from global_chat_announcements");
assert.equal(rows.rows[0].count, 2, "attaching a sub-billion mutation must remove a previously eligible base announcement");

const playerId = "00000000-0000-0000-0000-000000000001";
await db.query(`
  insert into best_roll_history(player_id,username,gem_name,rarity,mutation_ids) values
    ($1,'Tester','Natural',100000000,'{}'),
    ($1,'Tester','Too common',1000000,'{}'),
    ($1,'Tester','Mutated',1000000,'{ten-billion}')
`, [playerId]);
rows = await db.query("select gem_name from rare_roll_chat_events order by source_id");
assert.deepEqual(rows.rows.map((row) => row.gem_name), ["Natural", "Mutated"]);

await db.close();
console.log("Mutation announcement threshold database checks passed.");

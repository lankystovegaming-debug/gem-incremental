import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const backend = read("../src/backend/rareRolls.js");
const migration = read("../supabase/migrations/20260922090920_prioritize_base_rare_rolls.sql");

assert.match(
  backend,
  /const kind = rarity >= RARE_ROLL_BASE_THRESHOLD[\s\S]*?\? "base"[\s\S]*?: \(ids\.length \? "mutation" : "base"\)/
);
assert.match(
  migration,
  /if new\.rarity >= 100000000[\s\S]*?or \(new\.rarity < 100000000 and v_has_mutations and v_effective_rarity >= 10000000000\)/
);
assert.match(
  migration,
  /where e\.rarity >= 100000000[\s\S]*?e\.rarity < 100000000[\s\S]*?e\.effective_rarity >= 10000000000/
);
assert.match(migration, /revoke all on function public\.persist_rare_roll_chat_event\(\) from public/);
assert.match(migration, /grant execute on function public\.get_rare_roll_chat_history\(integer\) to anon, authenticated/);

const classify = ({ rarity, mutationIds }) => rarity >= 100_000_000
  ? "base"
  : (mutationIds.length ? "mutation" : "base");

assert.equal(classify({ rarity: 100_000_000, mutationIds: ["glossy"] }), "base");
assert.equal(classify({ rarity: 99_999_999, mutationIds: ["glossy"] }), "mutation");
assert.equal(classify({ rarity: 100_000_000, mutationIds: [] }), "base");

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create table public.rare_roll_chat_events (
    id bigint generated always as identity primary key,
    source_type text not null,
    source_id bigint,
    player_id uuid,
    username text,
    gem_name text,
    rarity numeric,
    effective_rarity numeric,
    mutation_ids text[] default '{}',
    base_luck numeric,
    created_at timestamptz default now()
  );
  create unique index rare_roll_chat_events_source_unique
    on public.rare_roll_chat_events(source_type, source_id)
    where source_id is not null;
  create table public.best_roll_history (
    id bigint generated always as identity primary key,
    player_id uuid,
    username text,
    gem_name text,
    rarity numeric,
    mutation_ids text[] default '{}',
    base_luck numeric default 1,
    raw_luck numeric,
    serial_number bigint,
    created_at timestamptz default now()
  );
  create table public.player_titles (
    player_id uuid primary key,
    title text,
    color text
  );
  create function public.get_mutation_chance_product(ids text[])
  returns numeric language sql immutable as $$
    select case
      when 'two-hundred' = any(ids) then 200
      when 'fifty' = any(ids) then 50
      else 1
    end
  $$;
  create function public.persist_rare_roll_chat_event()
  returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger persist_rare_roll_chat_event
  after insert on public.best_roll_history
  for each row execute function public.persist_rare_roll_chat_event();
`);
await db.exec(migration);

const playerId = "00000000-0000-0000-0000-000000000001";
await db.query(`
  insert into public.best_roll_history(player_id, username, gem_name, rarity, mutation_ids) values
    ($1, 'Tester', 'Rare mutated base', 100000000, '{fifty}'),
    ($1, 'Tester', 'Mutation effective', 50000000, '{two-hundred}'),
    ($1, 'Tester', 'Not rare enough', 50000000, '{fifty}')
`, [playerId]);

const events = await db.query(`
  select gem_name, rarity, effective_rarity
  from public.get_rare_roll_chat_history(100)
  order by id
`);
assert.deepEqual(events.rows.map((row) => row.gem_name), ["Rare mutated base", "Mutation effective"]);
assert.equal(Number(events.rows[0].rarity), 100_000_000);
assert.equal(Number(events.rows[0].effective_rarity), 5_000_000_000);

await db.close();

console.log("Rare Roll base-rarity precedence checks passed.");

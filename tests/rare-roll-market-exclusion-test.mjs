import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../supabase/migrations/20260921021800_exclude_market_gems_from_rare_rolls.sql", import.meta.url),
  "utf8"
);

assert.match(migration, /from public\.rare_roll_chat_events e/);
assert.doesNotMatch(migration, /from public\.inventory_gems|inventory_rows|union all/i);
assert.match(migration, /e\.rarity >= 100000000/);
assert.match(migration, /e\.effective_rarity >= 10000000000/);
assert.match(migration, /set search_path = ''/);
assert.match(migration, /revoke all on function public\.get_rare_roll_chat_history\(integer\) from public/);
assert.match(migration, /grant execute on function public\.get_rare_roll_chat_history\(integer\) to anon, authenticated/);

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create table players(id uuid primary key, username text);
  create table player_titles(player_id uuid primary key, title text, color text);
  create table inventory_gems(id bigint generated always as identity primary key, player_id uuid, gem_name text, rarity numeric);
  create table rare_roll_chat_events(
    id bigint generated always as identity primary key,
    player_id uuid not null, username text not null, gem_name text not null,
    rarity numeric not null, effective_rarity numeric not null,
    mutation_ids text[] not null default '{}', base_luck numeric,
    created_at timestamptz not null default now()
  );
`);
await db.exec(migration);

const buyer = "00000000-0000-0000-0000-000000000001";
const roller = "00000000-0000-0000-0000-000000000002";
await db.query("insert into players values ($1,'Buyer'),($2,'Roller')", [buyer, roller]);
await db.query("insert into inventory_gems(player_id,gem_name,rarity) values ($1,'Market Gem',666666666)", [buyer]);
await db.query(`
  insert into rare_roll_chat_events(player_id,username,gem_name,rarity,effective_rarity,mutation_ids)
  values ($1,'Roller','Genuine Gem',125000000,125000000,'{}')
`, [roller]);
const rows = await db.query("select username,gem_name from get_rare_roll_chat_history(100)");
assert.deepEqual(rows.rows, [{ username: "Roller", gem_name: "Genuine Gem" }]);
await db.close();

console.log("Rare Roll market-acquisition exclusion checks passed.");

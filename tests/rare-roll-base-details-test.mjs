import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../supabase/migrations/20260921023523_add_base_rare_roll_luck_and_serial.sql", import.meta.url),
  "utf8"
);
const backend = readFileSync(new URL("../src/backend/rareRolls.js", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/ui/rareRollsCard.js", import.meta.url), "utf8");

assert.match(migration, /add column if not exists serial_number bigint/);
assert.match(migration, /h\.raw_luck as luck_at_roll/);
assert.match(migration, /h\.serial_number/);
assert.match(backend, /luckAtRoll: row\?\.luck_at_roll/);
assert.match(backend, /serialNumber: row\?\.serial_number/);
assert.match(ui, /row\.kind === "base"/);
assert.match(ui, /Serial #/);
assert.match(ui, /× Luck/);

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create table player_titles(player_id uuid primary key, title text, color text);
  create table inventory_gems(
    id bigint generated always as identity primary key, player_id uuid,
    gem_name text, roll_number bigint, serial_number bigint
  );
  create table best_roll_history(
    id bigint generated always as identity primary key, player_id uuid,
    gem_name text, roll_number bigint, raw_luck numeric
  );
  create table rare_roll_chat_events(
    id bigint generated always as identity primary key, source_type text,
    source_id bigint, player_id uuid, username text, gem_name text,
    rarity numeric, effective_rarity numeric, mutation_ids text[],
    base_luck numeric, created_at timestamptz default now()
  );
`);
await db.exec(migration);

const player = "00000000-0000-0000-0000-000000000001";
await db.query("insert into inventory_gems(player_id,gem_name,roll_number,serial_number) values($1,'Rare Base',77,42)", [player]);
const history = await db.query("insert into best_roll_history(player_id,gem_name,roll_number,raw_luck) values($1,'Rare Base',77,1234.56) returning id,serial_number", [player]);
assert.equal(Number(history.rows[0].serial_number), 42);
await db.query("insert into rare_roll_chat_events(source_type,source_id,player_id,username,gem_name,rarity,effective_rarity,mutation_ids,base_luck) values('history',$1,$2,'Roller','Rare Base',100000000,100000000,'{}',2)", [history.rows[0].id, player]);
const rows = await db.query("select luck_at_roll,serial_number from get_rare_roll_chat_history(10)");
assert.deepEqual(rows.rows.map((row) => [Number(row.luck_at_roll), Number(row.serial_number)]), [[1234.56, 42]]);
await db.close();

console.log("Base Rare Roll luck and serial checks passed.");

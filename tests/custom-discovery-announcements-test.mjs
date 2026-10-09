import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  CUSTOM_DISCOVERY_ANNOUNCEMENTS,
  customDiscoveryAnnouncement
} from "../src/logic/discoveryAnnouncements.js";

const expected = {
  "Heart of the Deep": "The abyss has answered Nypseo.",
  "Glitched Gem": "Nypseo was not supposed to find this.",
  Finality: "It ends with Nypseo.",
  "Heat Death": "Around Nypseo, the last light has gone out.",
  Reminiscite: "Nypseo remembered what the universe forgot.",
  Incandescity: "The stars collided, and Nypseo caught the flame.",
  Zephyrion: "The universe briefly lost track of Nypseo.",
  Hadopelagic: "Nypseo descended where light cannot follow.",
  "The Bottom": "Nypseo reached the bottom. Something was already there.",
  i: "Nypseo has discovered something that should not exist."
};

assert.equal(Object.keys(CUSTOM_DISCOVERY_ANNOUNCEMENTS).length, 10);
for (const [gemName, announcement] of Object.entries(expected)) {
  assert.equal(customDiscoveryAnnouncement(gemName, "Nypseo"), announcement);
}
assert.equal(customDiscoveryAnnouncement("Quartz", "Nypseo"), null);

const card = readFileSync(new URL("../src/ui/rareRollsCard.js", import.meta.url), "utf8");
assert.match(card, /customDiscoveryAnnouncement\(row\.gemName, row\.username\)/);
assert.match(card, /class="rare-roll__announcement"/);
assert.match(card, /if \(gemName === "i"\) return "-1"/);
assert.match(card, /row\.kind === "mutation" \? row\.effectiveRarity : row\.rarity/);

const anomalousMigration = readFileSync(
  new URL("../supabase/migrations/20260922141158_announce_anomalous_rare_rolls.sql", import.meta.url),
  "utf8"
);
for (const gemName of ["the bottom", "hadopelagic", "zephyrion"]) {
  assert.match(anomalousMigration, new RegExp(gemName));
}
assert.match(anomalousMigration, /v_is_anomalous[\s\S]*?insert into public\.rare_roll_chat_events/);

const migration = readFileSync(
  new URL("../supabase/migrations/20261009014151_custom_discovery_announcements.sql", import.meta.url),
  "utf8"
);
const claimFixMigration = readFileSync(
  new URL("../supabase/migrations/20261009031550_fix_anomalous_i_claim_announcement.sql", import.meta.url),
  "utf8"
);
const db = new PGlite();
await db.exec(`
  create schema private;
  create table public.players (id uuid primary key, username text);
  create table public.inventory_gems (
    id bigint generated always as identity primary key,
    player_id uuid not null,
    gem_name text not null
  );
  create table private.gem_puzzle_claims (
    player_id uuid not null references public.players(id),
    puzzle_id text not null,
    claimed_at timestamptz not null default now(),
    specimen_id bigint references public.inventory_gems(id),
    primary key (player_id, puzzle_id)
  );
  create table public.rare_roll_chat_events (
    id bigint generated always as identity primary key,
    source_type text not null,
    source_id bigint,
    player_id uuid not null,
    username text not null,
    gem_name text not null,
    rarity numeric not null,
    effective_rarity numeric not null,
    mutation_ids text[] not null default '{}',
    base_luck numeric,
    luck_at_roll numeric,
    serial_number bigint,
    created_at timestamptz not null default now()
  );
  create unique index rare_roll_chat_events_source_unique
    on public.rare_roll_chat_events(source_type, source_id)
    where source_id is not null;
  create table public.global_chat_announcements (
    id bigint generated always as identity primary key,
    player_id uuid not null,
    gem_name text not null,
    rarity numeric not null,
    effective_rarity numeric,
    mutation_ids text[] not null default '{}',
    luck_at_roll numeric,
    created_at timestamptz not null default now(),
    constraint global_chat_announcements_rarity_check check (rarity >= 100000)
  );
  create table public.global_signal_audit (player_id uuid, gem_name text, rarity numeric);
  create function public.audit_global_signal() returns trigger language plpgsql as $$
  begin
    insert into public.global_signal_audit values (new.player_id, new.gem_name, new.rarity);
    return new;
  end $$;
  create trigger a_audit_global_signal after insert on public.global_chat_announcements
    for each row execute function public.audit_global_signal();
  create function public.filter_global_roll_announcements() returns trigger language plpgsql as $$
  begin
    if cardinality(coalesce(new.mutation_ids, '{}'::text[])) = 0 and new.rarity < 100000000 then
      delete from public.global_chat_announcements where id = new.id;
    end if;
    return new;
  end $$;
  create trigger z_filter_global_roll_announcements after insert on public.global_chat_announcements
    for each row execute function public.filter_global_roll_announcements();
`);

const first = "00000000-0000-0000-0000-000000000001";
await db.query("insert into public.players values ($1, 'EarlierPlayer')", [first]);
const firstSpecimen = (await db.query(
  "insert into public.inventory_gems(player_id,gem_name) values($1,'i') returning id",
  [first]
)).rows[0].id;
await db.query(
  "insert into private.gem_puzzle_claims(player_id,puzzle_id,specimen_id) values($1,'imaginary-unit',$2)",
  [first, firstSpecimen]
);

await db.exec(migration);
await db.exec(claimFixMigration);
let events = (await db.query("select * from public.rare_roll_chat_events order by id")).rows;
assert.equal(events.length, 1, "the migration backfills a prior i claim once");
assert.equal(events[0].username, "EarlierPlayer");
assert.equal(Number(events[0].rarity), -1);
assert.equal(Number((await db.query("select count(*) value from public.global_signal_audit")).rows[0].value), 0);

const second = "00000000-0000-0000-0000-000000000002";
await db.query("insert into public.players values ($1, 'NewPlayer')", [second]);
const secondSpecimen = (await db.query(
  "insert into public.inventory_gems(player_id,gem_name) values($1,'i') returning id",
  [second]
)).rows[0].id;
await db.query(
  "insert into private.gem_puzzle_claims(player_id,puzzle_id,specimen_id) values($1,'imaginary-unit',$2)",
  [second, secondSpecimen]
);

events = (await db.query("select * from public.rare_roll_chat_events order by id")).rows;
assert.equal(events.length, 2, "a successful new claim emits one durable event");
assert.deepEqual(
  events.map((event) => [event.source_type, event.username, event.gem_name, Number(event.rarity)]),
  [
    ["puzzle_claim", "EarlierPlayer", "i", -1],
    ["puzzle_claim", "NewPlayer", "i", -1]
  ]
);
assert.equal(Number((await db.query("select count(*) value from public.global_signal_audit")).rows[0].value), 1);
assert.equal(Number((await db.query("select count(*) value from public.global_chat_announcements")).rows[0].value), 0);
assert.equal(
  Number((await db.query("select rarity from public.global_signal_audit where gem_name='i'")).rows[0]?.rarity ?? 0),
  100000
);

await assert.rejects(
  () => db.query(
    "insert into private.gem_puzzle_claims(player_id,puzzle_id,specimen_id) values($1,'imaginary-unit',$2)",
    [second, secondSpecimen]
  ),
  /duplicate key|unique constraint/i
);
assert.equal(Number((await db.query("select count(*) value from public.rare_roll_chat_events")).rows[0].value), 2);

await db.close();
console.log("Custom discovery announcement checks passed.");

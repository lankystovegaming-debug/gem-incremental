import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260920122722_rebalance_crystal_caverns_duplicate_payouts.sql");
const cavernV1 = read("supabase/migrations/20260829042000_crystal_caverns_v1.sql");

const expectedPayouts = new Map([
  ["crystal-splinter", 125000],
  ["calcified-geode", 175000],
  ["quartz-cluster", 250000],
  ["broken-survey-lens", 350000],
  ["crystallized-lantern", 500000],
  ["prismatic-shard", 600000],
  ["ancient-crystal-chisel", 650000],
  ["fractured-prism", 750000],
  ["perfect-crystal-sphere", 900000],
  ["resonance-core", 1000000],
  ["frozen-light-fragment", 750000],
  ["heart-of-the-cavern", 1250000],
  ["bloodstained-crystal", 1000000],
  ["prismatic-fossil", 1000000],
  ["resonant-geode", 1350000],
  ["cracked-resonance-bell", 1500000],
  ["fractured-core", 2000000],
  ["prismatic-mirror", 2500000],
  ["impossible-crystal", 2250000],
  ["shattered-heart", 4000000],
]);

const migratedPayouts = new Map(
  [...migration.matchAll(/\('([^']+)',\s*(\d+)::numeric\)/g)]
    .map(([, key, value]) => [key, Number(value)]),
);

assert.deepEqual(migratedPayouts, expectedPayouts, "the finalized duplicate payout table must be exact");
assert.match(migration, /update public\.crystal_cavern_artifacts as artifact/);
assert.match(migration, /set duplicate_value = payout\.duplicate_value/);
assert.match(migration, /where cavern_run\.status <> 'settled'/);
assert.doesNotMatch(migration, /secured_cargo|unsecured_cargo|crystal_od_cargo_range|weight\s*=|min_depth|min_overdepth|min_instability|passive_/);

assert.match(cavernV1, /'duplicateValue',a\.duplicate_value/);
assert.match(cavernV1, /on conflict\(player_id,artifact_key\)do nothing;if found then registered:=registered\|\|jsonb_build_array\(x\);else dupes:=dupes\+coalesce\(\(x->>'duplicateValue'\)::numeric,0\);end if/);

const db = new PGlite();
await db.exec(`
  create table public.crystal_cavern_artifacts(
    key text primary key,
    duplicate_value numeric not null
  );
  create table public.crystal_cavern_runs(
    id bigint primary key,
    status text not null,
    secured_artifacts jsonb not null default '[]',
    unsecured_artifacts jsonb not null default '[]',
    secured_cargo jsonb not null default '[]',
    unsecured_cargo jsonb not null default '[]'
  );
  insert into public.crystal_cavern_artifacts(key, duplicate_value) values
    ${[...expectedPayouts.keys()].map(key => `('${key}', 1)`).join(",\n    ")},
    ('unstable-crystal-heart', 2000000);
  insert into public.crystal_cavern_runs(id, status, secured_artifacts, unsecured_artifacts, secured_cargo, unsecured_cargo) values
    (1, 'active',
      '[{"key":"crystal-splinter","duplicateValue":999},{"key":"unstable-crystal-heart","duplicateValue":2000000}]',
      '[{"key":"shattered-heart","duplicateValue":15000000}]',
      '[{"value":123456}]', '[{"value":654321}]'),
    (2, 'settled',
      '[{"key":"crystal-splinter","duplicateValue":999}]', '[]', '[]', '[]');
`);
await db.exec(migration);

const result = await db.query("select key, duplicate_value::double precision as duplicate_value from public.crystal_cavern_artifacts order by key");
const actualPayouts = new Map(result.rows.map(({ key, duplicate_value }) => [key, duplicate_value]));
for (const [key, value] of expectedPayouts) assert.equal(actualPayouts.get(key), value, `${key} payout must migrate exactly`);
assert.equal(actualPayouts.get("unstable-crystal-heart"), 2000000, "artifacts outside the finalized table must remain unchanged");

const runs = (await db.query("select * from public.crystal_cavern_runs order by id")).rows;
assert.equal(runs[0].secured_artifacts[0].duplicateValue, 125000, "open runs must use the finalized payout table");
assert.equal(runs[0].secured_artifacts[1].duplicateValue, 2000000, "unlisted artifact snapshots must remain unchanged");
assert.equal(runs[0].unsecured_artifacts[0].duplicateValue, 4000000, "both open-run artifact buckets must be refreshed");
assert.deepEqual(runs[0].secured_cargo, [{ value: 123456 }], "secured cargo must remain unchanged");
assert.deepEqual(runs[0].unsecured_cargo, [{ value: 654321 }], "unsecured cargo must remain unchanged");
assert.equal(runs[1].secured_artifacts[0].duplicateValue, 999, "settled history must remain immutable");
await db.close();

console.log("Crystal Caverns payout rebalance tests passed.");

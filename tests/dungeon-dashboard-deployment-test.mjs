import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDashboardFiles, outputDirectory } from '../scripts/build-dungeon-dashboard-sql.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
// Reuse the existing isolated baseline fixture (no live connection/credentials).
const setup = read('tests/dungeon-workbench-database-test.mjs').match(/await db\.exec\(`([\s\S]*?)`\);/)[1];
const files = buildDashboardFiles();
assert.equal(files.size, 18);
for (const [name, sql] of files) {
  assert.equal(fs.readFileSync(outputDirectory + '/' + name, 'utf8'), sql);
  assert(Buffer.byteLength(sql) < 750000);
  assert(Math.max(...sql.split('\n').map((line) => Buffer.byteLength(line))) < 20000);
}
const tables = ['dungeon_catalog_rooms','dungeon_regions','dungeon_difficulty_zones',
  'dungeon_boss_catalog','dungeon_forge_materials','dungeon_mutations','dungeon_workbench_recipes',
  'dungeon_equipment_crafting_chances'];
async function snapshot(db) {
  const result = {};
  for (const table of tables) result[table] = (await db.query(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`)).rows;
  result.functions = (await db.query("select proname,pg_get_functiondef(oid) as definition,proacl::text from pg_proc where proname in ('craft_dungeon_workbench','claim_dungeon_run_rewards') order by proname")).rows;
  result.policies = (await db.query("select * from pg_policies where tablename like 'dungeon_%' order by tablename,policyname")).rows;
  result.security = (await db.query("select relname,relrowsecurity,relacl::text from pg_class where relkind='r' and (relname like 'dungeon_%' or relname like 'player_dungeon_%') order by relname")).rows;
  result.sections = (await db.query('select * from game_section_settings order by id')).rows;
  result.definition = (await db.query('select name,description,enabled,max_enemies,entry_requirements,loot,rewards,sort_order from dungeon_definitions order by name')).rows;
  result.sequence = (await db.query('select last_value,is_called from dungeon_workbench_recipes_id_seq')).rows;
  return result;
}
let expected;
const original = new PGlite();
try {
  await original.exec(setup);
  await original.exec(read('supabase/migrations/20261008000000_dungeon_workbench_full_rebalance.sql'));
  expected = await snapshot(original);
} finally { await original.close(); }
const split = new PGlite();
try {
  await split.exec(setup);
  const entries = [...files];
  await split.exec(entries[0][1]);
  // Tables must be protected even before the room/data import finishes.
  assert((await split.query("select relrowsecurity from pg_class where relkind='r' and (relname like 'dungeon_%' and relname not in ('dungeon_runs','dungeon_definitions') or relname like 'player_dungeon_%')")).rows.every((r) => r.relrowsecurity));
  await split.exec('set role authenticated');
  await assert.rejects(() => split.query('select * from player_dungeon_materials'), /permission denied/);
  await split.exec('reset role');
  await assert.rejects(() => split.exec(entries[2][1]), /Expected rooms 1-100/);
  await split.exec('rollback;');
  assert.equal(Number((await split.query('select count(*) as n from dungeon_catalog_rooms')).rows[0].n), 0);
  for (const [, sql] of entries.slice(1)) await split.exec(sql);
  assert.deepEqual(await snapshot(split), expected, 'Split deployment must match original data/functions/permissions');
  // Room batches are safely repeatable after a confirmed completed attempt.
  await split.exec(entries[1][1]);
  assert.deepEqual(await snapshot(split), expected);
  console.log('Dashboard deployment tests passed: 18 files, original parity, RLS, ordering checks and repeatable room imports.');
} finally { await split.close(); }

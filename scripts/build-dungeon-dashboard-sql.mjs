import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
export const outputDirectory = path.join(root, 'docs/deployment/pr507-first-migration');
export function buildDashboardFiles() {
  const source = fs.readFileSync(path.join(root, 'supabase/migrations/20261008000000_dungeon_workbench_full_rebalance.sql'), 'utf8');
  const lines = source.trimEnd().split('\n');
  const roomIndex = lines.findIndex((line) => line.startsWith('insert into public.dungeon_catalog_rooms('));
  assert(roomIndex > 0);
  const statement = lines[roomIndex];
  const marker = "from jsonb_to_recordset('";
  const dataStart = statement.indexOf(marker) + marker.length;
  const dataEnd = statement.lastIndexOf("'::jsonb) as x(");
  assert(dataStart >= marker.length && dataEnd > dataStart);
  const rooms = JSON.parse(statement.slice(dataStart, dataEnd).replaceAll("''", "'"));
  assert.deepEqual(rooms.map((room) => room.room), Array.from({ length: 1500 }, (_, i) => i + 1));
  const securityStart = lines.findIndex((line) => line.startsWith('alter table public.dungeon_catalog_rooms enable row level security;'));
  const securityEnd = lines.findIndex((line) => line.startsWith('insert into public.game_section_settings('));
  assert(securityStart > roomIndex && securityEnd > securityStart);
  const header = '-- PR #507: SQL-editor alternative to the FIRST migration only.\n-- Keep maintenance enabled. Run numbered files in order; wait for a success result.\n';
  const files = new Map();
  // Apply original RLS/grants immediately: splitting must not expose new tables
  // between schema creation and the final catalogs/functions file.
  files.set('01-schema-and-security.sql', header + lines.slice(0, roomIndex).join('\n') + '\n' +
    lines.slice(securityStart, securityEnd).join('\n') + "\ncommit;\nselect '01 schema and security committed' as result;\n");
  for (let offset = 0; offset < rooms.length; offset += 100) {
    const number = String(2 + offset / 100).padStart(2, '0');
    const first = offset + 1, last = offset + 100;
    const payload = '[\n' + rooms.slice(offset, offset + 100).map((room) => JSON.stringify(room).replaceAll("'", "''")).join(',\n') + '\n]';
    const check = (end) => `do $$ begin\n  if (select count(*) from public.dungeon_catalog_rooms where room_number between 1 and ${end}) <> ${end} then\n    raise exception 'Expected rooms 1-${end}; stop and check the previous batch';\n  end if;\nend $$;\n`;
    const sql = header + 'begin;\n' + (offset ? check(offset) : '') +
      statement.slice(0, dataStart) + payload + statement.slice(dataEnd) + '\n' + check(last) +
      `commit;\nselect '${number} committed' as result, count(*) as rooms_in_batch\nfrom public.dungeon_catalog_rooms where room_number between ${first} and ${last};\n`;
    assert(Buffer.byteLength(sql) < 750000, 'Room batches must remain dashboard-sized');
    files.set(`${number}-rooms-${String(first).padStart(4, '0')}-${last}.sql`, sql);
  }
  files.set('17-catalogs-functions-and-permissions.sql', header + 'begin;\n' +
    "do $$ begin\n  if (select count(*) from public.dungeon_catalog_rooms where room_number between 1 and 1500) <> 1500 then\n    raise exception 'All 1500 rooms must be imported before this step';\n  end if;\nend $$;\n" +
    lines.slice(roomIndex + 1).join('\n') + "\nselect '17 catalogs, functions and permissions committed' as result;\n");
  const expected = { dungeon_catalog_rooms: 1500, dungeon_regions: 11, dungeon_difficulty_zones: 4,
    dungeon_boss_catalog: 30, dungeon_forge_materials: 198, dungeon_mutations: 66,
    dungeon_workbench_recipes: 142, dungeon_equipment_crafting_chances: 26 };
  let verification = header + '-- Read-only checks. A failure means STOP; do not run migration 2.\n';
  verification += 'do $$ begin\n';
  for (const [table, count] of Object.entries(expected)) verification +=
    `  if (select count(*) from public.${table}) <> ${count} then raise exception '${table}: expected ${count} rows'; end if;\n`;
  verification += "  if to_regprocedure('public.claim_dungeon_run_rewards(uuid,uuid)') is null or\n     to_regprocedure('public.craft_dungeon_workbench(uuid,text)') is null then\n    raise exception 'Missing dungeon RPC functions';\n  end if;\n";
  verification += "  if exists (select 1 from pg_class where oid in (\n" +
    [...Object.keys(expected), 'player_dungeon_materials', 'player_dungeon_essence', 'dungeon_gear'].map((table) => `    'public.${table}'::regclass`).join(',\n') +
    ") and not relrowsecurity) then raise exception 'Dungeon table missing RLS'; end if;\nend $$;\n";
  verification += "select 'FIRST migration complete. Now apply the four later migrations in README order.' as result;\n";
  files.set('18-verify-first-migration.sql', verification);
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = buildDashboardFiles();
  if (!process.argv.includes('--check')) fs.mkdirSync(outputDirectory, { recursive: true });
  for (const [name, sql] of files) {
    const target = path.join(outputDirectory, name);
    if (process.argv.includes('--check')) assert.equal(fs.readFileSync(target, 'utf8'), sql, `${name} needs regeneration`);
    else fs.writeFileSync(target, sql);
  }
  console.log(`${files.size} SQL-editor files ${process.argv.includes('--check') ? 'verified' : 'generated'}.`);
}

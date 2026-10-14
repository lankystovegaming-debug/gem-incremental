import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { renderRoomSummary } from '../dungeons/room-summary.js';
const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const sql = read('supabase/migrations/20261008000000_dungeon_workbench_full_rebalance.sql');
const line = sql.split('\n').find((line) => line.startsWith('insert into public.dungeon_catalog_rooms('));
const start = line.indexOf("from jsonb_to_recordset('") + "from jsonb_to_recordset('".length;
const rooms = JSON.parse(line.slice(start, line.lastIndexOf("'::jsonb) as x(")).replaceAll("''", "'"));
assert.equal(rooms.length, 1500);
const backendRoom = (r) => ({ ...r, room_number: r.room, room_type: r.title,
  room_key_chance: r.key_chance, mutation_summary: r.mutation_line });
for (const raw of rooms) {
  const html = renderRoomSummary(backendRoom(raw));
  assert.match(html, /<table/);
  assert.match(html, /scope="row"/);
  assert.doesNotMatch(html, /Catalog Page|<pre|Shard GP|page 2: material drops/);
  assert(html.length < 7000, `Room ${raw.room}: summary must stay compact`);
}
const regular = backendRoom(rooms[0]);
assert.match(renderRoomSummary(regular), /Weapon drop \/ enemy/);
assert.match(renderRoomSummary(regular), /4\.25%/);
const boss = backendRoom(rooms.find((r) => r.title.startsWith('Boss Room')));
assert.match(renderRoomSummary(boss), /Weapon drop \/ boss/);
assert.match(renderRoomSummary(boss), /Weapon drop \/ add/);
const treasure = backendRoom(rooms.find((r) => r.title.startsWith('Treasure Room')));
assert.match(renderRoomSummary(treasure), /Weapon drop \/ chest/);
assert.match(renderRoomSummary(treasure), /Weapon drop \/ guard/);
assert.doesNotMatch(renderRoomSummary({ room_number: 1, enemies: [{ name: '<img src=x onerror=alert(1)>', spawn: '2%' }] }), /<img/);

// Exercise the page's actual room-selection code with a backend response.
const nodes = new Map();
const document = { getElementById(id) {
  if (!nodes.has(id)) nodes.set(id, { textContent: '', innerHTML: '', style: {}, scrollIntoView() {} });
  return nodes.get(id);
} };
let fetches = 0;
const context = vm.createContext({ document, renderRoomSummary, mountShell() {},
  fetch() { throw Error('Opening a room must not download specification sheets'); },
  supabase: { functions: { async invoke(name, { body }) {
    fetches++; assert.equal(name, 'dungeons'); assert.equal(body.action, 'room');
    return { data: { room: regular, boss: null } };
  } } },
});
const page = read('dungeons/dungeons.js');
const code = page.replace(/^import .*;\n/gm, '').split("$('roomSearch').addEventListener")[0];
vm.runInContext(code, context);
await vm.runInContext('openRoom(1)', context);
assert.equal(fetches, 1);
assert.match(nodes.get('roomTitle').textContent, /Room 0001/);
assert.match(nodes.get('roomSummary').innerHTML, /Zombie/);
assert.equal(nodes.get('status').textContent, '');
assert.equal(typeof nodes.get('startRoom').onclick, 'function');
const html = read('dungeons/index.html');
assert.doesNotMatch(html, /pageOne|pageTwo|Catalog Page/);
assert.doesNotMatch(page, /page1|page2|loadRegionText|catalog\/regions/);

// Evaluate the real shell guard: no widget initialization means no polling
// or setting-change listener can re-enable it on the dungeon page.
const shell = read('src/ui/shell.js');
const guard = shell.match(/if \(page !== "dungeons" && page !== "dungeon"\) initGlobalCash\(\);/)?.[0];
assert(guard);
for (const [page, expected] of [['dungeons', 0], ['dungeon', 0], ['roll', 1], ['workbench', 1]]) {
  let calls = 0;
  vm.runInNewContext(guard, { page, initGlobalCash() { calls++; } });
  assert.equal(calls, expected, page);
}
console.log('Dungeon summary tests passed: 1500 rooms, boss/treasure labels, safe rendering, backend selection and cash-widget suppression.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { isRoomUnlocked, isRegionUnlocked } from '../dungeons/progression.js';
import { loadDungeonProgress } from '../supabase/functions/dungeons/progress.js';
const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const rooms = JSON.parse(read('dungeons/catalog/index.json'));
assert.equal(isRoomUnlocked(1, new Set()), true);
assert.equal(isRoomUnlocked(2, new Set()), false);
assert.equal(isRoomUnlocked(2, new Set([1])), true);
assert.equal(isRoomUnlocked(3, new Set([1])), false);
assert.equal(isRoomUnlocked(10, new Set([9])), true);
assert.equal(isRoomUnlocked(9, new Set([9])), false, 'Do not infer unlocks across missing completions');
for (const n of [0, -1, 1501, NaN, 1.5]) assert.equal(isRoomUnlocked(n, new Set()), false);
assert.equal(isRegionUnlocked('Entrance', rooms, new Set()), true);
assert.equal(isRegionUnlocked('Jungle', rooms, new Set()), false);
assert.equal(isRegionUnlocked('Jungle', rooms, new Set([199])), false);
assert.equal(isRegionUnlocked('Jungle', rooms, new Set([200])), true);
for (const r of rooms) {
  assert(isRoomUnlocked(r.room, new Set(r.room === 1 ? [] : [r.room - 1])));
  if (r.room > 1) assert(!isRoomUnlocked(r.room, new Set()));
}
for (const count of [0, 1, 499, 500, 501, 1001, 1499, 1500]) {
  const expected = Array.from({ length: count }, (_, i) => ({ room_number: i + 1, completed_at: 'fixture' }));
  const ranges = [];
  const client = { from(table) {
    assert.equal(table, 'dungeon_room_progress');
    const query = { select(fields) { assert.equal(fields, 'room_number,completed_at'); return query; },
      eq(key, value) { assert.equal(key, 'player_id'); assert.equal(value, 'owner'); return query; },
      order(key) { assert.equal(key, 'room_number'); return query; },
      async range(from, to) { ranges.push([from, to]); return { data: expected.slice(from, to + 1), error: null }; } };
    return query;
  } };
  assert.deepEqual(await loadDungeonProgress(client, 'owner'), expected);
  assert(ranges.length <= 3);
  if (count > 1000) assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]]);
}
const failure = { from() { const q = { select() { return q; }, eq() { return q; }, order() { return q; },
  async range() { return { error: new Error('progress unavailable') }; } }; return q; } };
await assert.rejects(() => loadDungeonProgress(failure, 'owner'), /progress unavailable/);

// Exercise the real materials renderer with more than the old 120-item cap.
const inventoryNode = { innerHTML: '' };
const workbench = read('workbench/workbench.js');
const context = vm.createContext({ document: { getElementById() { return inventoryNode; } }, mountShell() {} });
vm.runInContext(workbench.replace(/^import .*;\n/gm, '').split('$("recipeSearch").addEventListener')[0], context);
const materials = Array.from({ length: 140 }, (_, i) => ({ material_name: `Material ${i}`, quantity: i + 1 }));
materials.push({ material_name: 'Empty', quantity: 0 }, { material_name: '<img onerror=bad>', quantity: 2 });
context.materialFixture = materials;
vm.runInContext('inventory.materials=materialFixture;renderInventory()', context);
assert.equal((inventoryNode.innerHTML.match(/class="inv-row"/g) || []).length, 141);
assert.match(inventoryNode.innerHTML, /Material 139/);
assert.doesNotMatch(inventoryNode.innerHTML, /<img|>Empty</);
vm.runInContext('inventory.materials=[];renderInventory()', context);
assert.match(inventoryNode.innerHTML, /claim room rewards/);
const html = read('workbench/index.html');
assert(html.indexOf('id="inventory"') < html.indexOf('class="workbench-layout"'));
assert.equal((html.match(/id="inventory"/g) || []).length, 1);
assert.match(html, /id="essenceBar" class="essence-bar"/);
assert.match(read('dungeons/dungeons.css'), /\.room-list\{[^}]*grid-template-columns:1fr/);
console.log('Progression/material tests passed: 1500 unlocks, region boundaries, full progress pagination, ownership and uncapped inventory.');

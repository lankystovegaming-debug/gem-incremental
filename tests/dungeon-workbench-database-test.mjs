import assert from 'node:assert/strict';
import fs from 'node:fs';
// Override only for runners with dependencies installed outside the checkout.
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const player = '00000000-0000-0000-0000-000000000507';
const migration = read('supabase/migrations/20261012060602_dungeon_workbench_original_recipe_repairs.sql');

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table players(id uuid primary key);
    create table dungeon_definitions(id uuid primary key default gen_random_uuid(),
      name text unique, description text, enabled boolean, max_enemies int,
      entry_requirements jsonb, loot jsonb, rewards jsonb, sort_order int,
      updated_at timestamptz default now());
    create table dungeon_runs(id uuid primary key default gen_random_uuid(),
      player_id uuid references players(id), dungeon_id uuid references dungeon_definitions(id),
      enemy_ids uuid[], enemy_index int, enemy_health numeric, player_health numeric,
      status text, loot jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
    create table game_section_settings(id text primary key, label text, short_label text,
      icon text, description text, enabled boolean, sort_order int);
  `);
  for (const file of [
    '20261008000000_dungeon_workbench_full_rebalance.sql',
    '20261008140000_dungeon_backend_fix.sql',
    '20261011232956_prevent_parallel_dungeon_runs.sql',
    '20261011234848_fix_dungeon_catalog_runtime.sql',
  ]) await db.exec(read(`supabase/migrations/${file}`));
  await db.query('insert into players(id) values ($1)', [player]);

  // Include matching and nonmatching pre-existing gear to test repair scope.
  for (const [quality, room, power, recipe] of [
    ['Workbench', 0, 0, 'Basic Helmet'],
    ['Workbench', 0, 777777, 'Basic Helmet'],
    ['Common', 1, 0, 'Basic Helmet'],
    ['Workbench', 0, 0, 'Ice Wraith Robe'],
  ]) await db.query(`insert into dungeon_gear
    (player_id,room_number,source_enemy,item_type,quality,gem_power,stats)
    values ($1,$2,'fixture','armor',$3,$4,jsonb_build_object('recipe',$5::text))`,
    [player, room, quality, power, recipe]);
  const unrelated = await rows("select * from dungeon_workbench_recipes where kind <> 'original' order by id");
  const oldIngredients = await rows('select name,ingredients from dungeon_workbench_recipes');
  await db.exec(migration);
  const recipes = await rows('select * from dungeon_workbench_recipes order by id');
  assert.equal(recipes.length, 142);
  assert.deepEqual(await rows("select * from dungeon_workbench_recipes where kind <> 'original' order by id"), unrelated);
  const originals = recipes.filter((r) => r.kind === 'original');
  assert.equal(originals.length, 43);
  const reference = JSON.parse(read('workbench/catalog.json'));
  for (const r of recipes) {
    const local = reference.recipes.find((item) => item.name === r.name);
    assert.deepEqual(r.ingredients, local.ingredients, `${r.name}: reference ingredients must match the database`);
    assert.equal(Number(r.gem_power), Number(local.gem_power), `${r.name}: reference power must match the database`);
  }
  const baselines = [0, 10000, 25000, 50000, 75000, 100000, 125000];
  for (const r of originals) {
    assert(Number(r.gem_power) > baselines[r.tier] && Number(r.gem_power) <= baselines[r.tier] + 10000);
    assert(Math.floor(Number(r.gem_power) / 10000) >= 1, `${r.name} must affect combat`);
  }
  for (let tier = 2; tier <= 6; tier++) {
    assert(Math.min(...originals.filter((r) => r.tier === tier).map((r) => Number(r.gem_power))) >
      Math.max(...originals.filter((r) => r.tier === tier - 1).map((r) => Number(r.gem_power))));
  }
  assert(Math.max(...originals.map((r) => Number(r.gem_power))) < Number(recipes.find((r) => r.name === 'Ice Wraith Robe').gem_power));
  const aliases = { Hide: 'Orc Hide', 'Reaper Hearts': 'Reaper Heart', 'Ghost Shards': 'Ghost Shard' };
  for (const old of oldIngredients) {
    assert.deepEqual(recipes.find((r) => r.name === old.name).ingredients,
      old.ingredients.map((i) => ({ ...i, item: aliases[i.item] || i.item })));
  }
  const drops = JSON.parse(read('supabase/functions/dungeons/drop-data.json'));
  // Cover the actual backend roster, not just recipe ingredient availability.
  // A catalog name missing from drop-data silently awards no materials.
  const catalogRooms = await rows('select room_number,enemies from dungeon_catalog_rooms order by room_number');
  assert.equal(catalogRooms.length, 1500);
  const seenVariants = new Map();
  for (const room of catalogRooms) for (const enemy of room.enemies) {
    const name = enemy.name.replace(/\s*\(boss\)$/i, '').trim();
    const table = drops[name]?.items;
    assert(table?.length > 0, `Room ${room.room_number}: ${name} has no material-drop table`);
    for (const item of table) {
      assert(item.name && Number.isFinite(item.chance) && item.chance > 0 && item.chance <= 1,
        `${name}: invalid material probability for ${item.name}`);
    }
    if (['Archer Skeleton', 'Warrior Skeleton'].includes(name)) {
      assert.deepEqual(table, drops.Skeleton.items);
      seenVariants.set(name, (seenVariants.get(name) || 0) + 1);
    }
  }
  assert.deepEqual([...seenVariants].sort(), [['Archer Skeleton', 200], ['Warrior Skeleton', 200]]);
  const obtainable = new Set(Object.values(drops).flatMap((enemy) => enemy.items.map((i) => i.name)));
  for (const mutation of await rows('select name from dungeon_mutations')) {
    obtainable.add(`${mutation.name} Shard`); obtainable.add(`${mutation.name} Core`);
  }
  for (const r of recipes) for (const i of r.ingredients) {
    assert(obtainable.has(i.item) || ['TE', 'SE', 'LE', 'ME'].includes(i.item), `${r.name}: unavailable ${i.item}`);
  }
  const helmetPower = Number(recipes.find((r) => r.name === 'Basic Helmet').gem_power);
  assert.deepEqual((await rows("select gem_power from dungeon_gear where source_enemy='fixture' order by created_at,id"))
    .map((g) => Number(g.gem_power)).sort((a, b) => a - b), [0, 0, helmetPower, 777777]);

  // Run the real craft RPC for every recipe, including all six broken names.
  for (const r of recipes) {
    await db.exec('delete from player_dungeon_materials; delete from player_dungeon_essence;');
    let essenceCost = r.essence_cost;
    for (const i of r.ingredients) {
      if (i.item === r.essence_tier) essenceCost += i.qty;
      else await db.query('insert into player_dungeon_materials(player_id,material_name,quantity) values ($1,$2,$3)',
        [player, i.item, i.qty + 7]);
    }
    await db.query('insert into player_dungeon_essence(player_id,essence_tier,quantity) values ($1,$2,$3)',
      [player, r.essence_tier, essenceCost + 9]);
    const [{ result }] = await rows('select craft_dungeon_workbench($1,$2) as result', [player, r.name]);
    assert.equal(result.ok, true); assert.equal(result.gemPower, Number(r.gem_power));
    const [gear] = await rows('select * from dungeon_gear where id=$1', [result.gearId]);
    assert.equal(Number(gear.gem_power), Number(r.gem_power)); assert.equal(gear.stats.recipe, r.name);
    assert((await rows('select quantity from player_dungeon_materials')).every((m) => Number(m.quantity) === 7));
    assert.equal(Number((await rows('select quantity from player_dungeon_essence'))[0].quantity), 9);
  }
  // Failure must leave both balances and gear unchanged.
  await db.exec('delete from player_dungeon_materials; delete from player_dungeon_essence;');
  await db.query("insert into player_dungeon_essence values ($1,'TE',100,now())", [player]);
  await db.query("insert into player_dungeon_materials values ($1,'Orc Hide',11,now()),($1,'Bone',5,now())", [player]);
  const before = await rows('select * from dungeon_gear order by id');
  await assert.rejects(() => db.query('select craft_dungeon_workbench($1,$2)', [player, 'Reinforced Chestplate']), /insufficient_material:Orc Hide/);
  assert.deepEqual(await rows('select * from dungeon_gear order by id'), before);
  assert.equal(Number((await rows('select quantity from player_dungeon_essence'))[0].quantity), 100);
  assert.deepEqual((await rows('select quantity from player_dungeon_materials order by material_name')).map((r) => Number(r.quantity)), [5, 11]);
  await db.exec('update player_dungeon_materials set quantity=100; update player_dungeon_essence set quantity=0;');
  await assert.rejects(() => db.query('select craft_dungeon_workbench($1,$2)', [player, 'Reinforced Chestplate']), /insufficient_essence/);
  assert.deepEqual(await rows('select * from dungeon_gear order by id'), before);
  assert((await rows('select quantity from player_dungeon_materials')).every((r) => Number(r.quantity) === 100));

  // A repeated repair is harmless and preserves future custom balancing.
  await db.exec("update dungeon_workbench_recipes set gem_power=99999 where name='Basic Helmet'");
  const finalGear = await rows('select * from dungeon_gear order by id');
  await db.exec(migration);
  assert.equal(Number((await rows("select gem_power from dungeon_workbench_recipes where name='Basic Helmet'"))[0].gem_power), 99999);
  assert.deepEqual(await rows('select * from dungeon_gear order by id'), finalGear);
  console.log('Workbench database tests passed: 142 crafts, 43 power repairs, six ingredient fixes, backfill and rollback.');
} finally {
  await db.close();
}

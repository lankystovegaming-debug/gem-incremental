import assert from 'node:assert/strict';
import fs from 'node:fs';
import { combatGemPower, balancedEnemyHealth } from '../supabase/functions/dungeons/balance.js';
import { canonicalEnemyName, parseStatMultiplier } from '../supabase/functions/dungeons/formulas.js';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
const read = p => fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const rows = async (sql,params=[]) => (await db.query(sql,params)).rows;
const migration=read('supabase/migrations/20261017022655_dungeon_combat_balance.sql');
const changes=JSON.parse(read('docs/dungeon-balance-recipes.json'));
const player='00000000-0000-0000-0000-000000000507';
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create table players(id uuid primary key);
    create table dungeon_definitions(id uuid primary key default gen_random_uuid(),name text unique,description text,enabled boolean,max_enemies int,entry_requirements jsonb,loot jsonb,rewards jsonb,sort_order int,updated_at timestamptz default now());
    create table dungeon_runs(id uuid primary key default gen_random_uuid(),player_id uuid references players(id),dungeon_id uuid references dungeon_definitions(id),enemy_ids uuid[],enemy_index int,enemy_health numeric,player_health numeric,status text,loot jsonb,created_at timestamptz default now(),updated_at timestamptz default now());
    create table game_section_settings(id text primary key,label text,short_label text,icon text,description text,enabled boolean,sort_order int);`);
  for(const file of ['20261008000000_dungeon_workbench_full_rebalance.sql','20261008140000_dungeon_backend_fix.sql',
    '20261011232956_prevent_parallel_dungeon_runs.sql','20261011234848_fix_dungeon_catalog_runtime.sql',
    '20261012060602_dungeon_workbench_original_recipe_repairs.sql'])await db.exec(read('supabase/migrations/'+file));
  await db.query('insert into players values ($1)',[player]);
  const before=await rows('select * from dungeon_workbench_recipes order by id');
  assert.equal(changes.length,73);
  for(const c of changes){
    assert.equal(Number(before.find(r=>r.name===c.name).gem_power),c.oldGP);
    await db.query(`insert into dungeon_gear(player_id,room_number,source_enemy,item_type,quality,gem_power,stats)
      values ($1,0,'Workbench','armor','Workbench',$2,jsonb_build_object('recipe',$3::text))`,[player,c.oldGP,c.name]);
  }
  for(const [quality,room,gp] of [['Workbench',0,777777],['75%',449,104560875],['Common',1,changes[0].oldGP]]){
    await db.query(`insert into dungeon_gear(player_id,room_number,source_enemy,item_type,quality,gem_power,stats)
      values ($1,$2,'preserve','armor',$3,$4,jsonb_build_object('recipe',$5::text))`,[player,room,quality,gp,changes[0].name]);
  }
  const preserved=await rows("select * from dungeon_gear where source_enemy='preserve' order by id");
  await db.exec(migration);
  const after=await rows('select * from dungeon_workbench_recipes order by id');
  const catalog=JSON.parse(read('workbench/catalog.json'));
  for(const r of after){
    const old=before.find(o=>o.id===r.id),c=changes.find(c=>c.name===r.name);
    assert.deepEqual({...r,gem_power:old.gem_power},old,'only GP may change');
    assert.equal(Number(r.gem_power),c?.newGP??Number(old.gem_power));
    assert.equal(Number(r.gem_power),catalog.recipes.find(c=>c.name===r.name).gem_power);
    if(c){
      const [g]=await rows("select * from dungeon_gear where source_enemy='Workbench' and stats->>'recipe'=$1",[r.name]);
      assert.equal(Number(g.gem_power),c.newGP);assert.equal(combatGemPower(g),c.newGP);
    }
    // Real crafting still charges the exact same ingredients and essence.
    await db.exec('delete from player_dungeon_materials;delete from player_dungeon_essence;');
    let cost=Number(r.essence_cost);
    for(const i of r.ingredients){if(i.item===r.essence_tier)cost+=i.qty;
      else await db.query('insert into player_dungeon_materials(player_id,material_name,quantity) values($1,$2,$3)',[player,i.item,i.qty+7]);}
    await db.query('insert into player_dungeon_essence(player_id,essence_tier,quantity) values($1,$2,$3)',[player,r.essence_tier,cost+9]);
    const [{result}]=await rows('select craft_dungeon_workbench($1,$2) as result',[player,r.name]);
    assert.equal(result.gemPower,Number(r.gem_power));
    assert((await rows('select quantity from player_dungeon_materials')).every(m=>Number(m.quantity)===7));
    assert.equal(Number((await rows('select quantity from player_dungeon_essence'))[0].quantity),9);
  }
  assert.deepEqual(await rows("select * from dungeon_gear where source_enemy='preserve' order by id"),preserved);
  const finalGear=await rows('select * from dungeon_gear order by id');
  await db.exec(migration);
  assert.deepEqual(await rows('select * from dungeon_workbench_recipes order by id'),after);
  assert.deepEqual(await rows('select * from dungeon_gear order by id'),finalGear);
  // Reapplication does not overwrite later custom balancing.
  await db.query('update dungeon_workbench_recipes set gem_power=888888 where name=$1',[changes[0].name]);
  await db.exec(migration);
  assert.equal(Number((await rows('select gem_power from dungeon_workbench_recipes where name=$1',[changes[0].name]))[0].gem_power),888888);

  // All actual catalog rows use their role/difficulty once, including boss repeats.
  const reference=JSON.parse(read('supabase/functions/dungeons/balance-reference.json'));
  const regionMap=new Map((await rows('select * from dungeon_regions')).map(r=>[r.name,Number(r.hp_scale)]));
  const bosses=new Map((await rows('select * from dungeon_boss_catalog')).map(b=>[b.room_number,b]));
  const zone={Easy:.7,Normal:1,Hard:1.35,Brutal:1.8};
  const rooms=await rows('select * from dungeon_catalog_rooms order by room_number');
  assert.equal(rooms.length,1500);
  for(const room of rooms)for(const e of room.enemies){
    const boss=bosses.get(room.room_number),isBoss=canonicalEnemyName(e.name)===boss?.boss_name;
    const rh=regionMap.get(room.region),zh=zone[isBoss?boss.rating_used:room.zone];
    const repeat=isBoss?1+Number(boss.repeat_bonus):1;
    const base=parseStatMultiplier(e.hp)??rh*zh*(isBoss?15*repeat:1);
    const role=base/(rh*zh*(isBoss?15*repeat:1));
    const expected=Math.max(1,Math.round(reference[room.room_number-1]*(isBoss?10.5:3.25)*role*zh*repeat*5));
    assert.equal(balancedEnemyHealth(reference,room,e,1,5,rh,zh,isBoss,isBoss?boss.repeat_bonus:0),expected);
  }
  console.log('Dungeon balance database tests passed: 73 upgrades/backfills, 142 exact-cost crafts, all 1500 rooms, idempotence and custom/drop preservation.');
} finally { await db.close(); }

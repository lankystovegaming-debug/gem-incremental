-- PR #507: SQL-editor alternative to the FIRST migration only.
-- Keep maintenance enabled. Run numbered files in order; wait for a success result.
-- Full Dungeon + Workbench rebalance derived from the uploaded PDF.
begin;
create table if not exists public.dungeon_regions (id text primary key,name text not null unique,room_start integer not null,room_end integer not null,hp_scale numeric not null,damage_scale numeric not null,main_essence text not null,essence_rarity text not null,rec_level text not null,sort_order integer not null default 0);
create table if not exists public.dungeon_difficulty_zones (id text primary key,hp_multiplier numeric not null,damage_multiplier numeric not null,rewards_multiplier numeric not null,elite_multiplier numeric not null,mutation_multiplier numeric not null);
create table if not exists public.dungeon_catalog_rooms (room_number integer primary key,room_type text not null,region text not null,zone text not null,mob_level text not null,base_count text not null,room_key_chance text not null,fog_chance text not null,encounters jsonb not null default '[]'::jsonb,enemies jsonb not null default '[]'::jsonb,ranks jsonb not null default '[]'::jsonb,mutation_summary text not null default '',weapon_chance text not null default '0%',armor_chance text not null default '0%',gear_chances jsonb not null default '{}'::jsonb);
create table if not exists public.dungeon_boss_catalog (room_number integer primary key,boss_name text not null,zone_rating text not null,rating_used text not null,repeat_bonus numeric not null default 0);
create table if not exists public.dungeon_forge_materials (id integer primary key,name text not null unique,source text not null,slot text not null,gem_power bigint not null,used_in text not null default '');
create table if not exists public.dungeon_mutations (name text primary key,tier text not null,value_multiplier numeric not null,native_regions text[] not null,best_odds text not null,shard_gem_power bigint not null,core_gem_power bigint not null);
create table if not exists public.dungeon_workbench_recipes (id bigserial primary key,name text not null unique,tier integer not null,kind text not null,source text not null default '',essence_cost integer not null,essence_tier text not null,ingredients jsonb not null default '[]'::jsonb,gem_power bigint not null default 0,enabled boolean not null default true);
create table if not exists public.dungeon_equipment_crafting_chances (material_count integer not null,equipment text not null,chance numeric not null,primary key(material_count,equipment));
create table if not exists public.player_dungeon_materials (player_id uuid not null references public.players(id) on delete cascade,material_name text not null,quantity bigint not null default 0 check(quantity>=0),updated_at timestamptz not null default now(),primary key(player_id,material_name));
create table if not exists public.player_dungeon_essence (player_id uuid not null references public.players(id) on delete cascade,essence_tier text not null check(essence_tier in ('TE','SE','LE','ME')),quantity bigint not null default 0 check(quantity>=0),updated_at timestamptz not null default now(),primary key(player_id,essence_tier));
create table if not exists public.dungeon_gear (id uuid primary key default gen_random_uuid(),player_id uuid not null references public.players(id) on delete cascade,room_number integer not null,source_enemy text not null,item_type text not null check(item_type in ('weapon','armor')),quality text not null,upgrade_level integer not null default 0,gem_power bigint not null default 0,mutation_name text,stats jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
alter table public.dungeon_catalog_rooms add column if not exists weapon_chance text not null default '0%';
alter table public.dungeon_catalog_rooms add column if not exists armor_chance text not null default '0%';
alter table public.dungeon_catalog_rooms add column if not exists gear_chances jsonb not null default '{}';
alter table public.dungeon_catalog_rooms add column if not exists weapon_table jsonb not null default '[]'::jsonb;
alter table public.dungeon_catalog_rooms add column if not exists armor_table jsonb not null default '[]'::jsonb;
alter table public.dungeon_runs add column if not exists room_number integer;
alter table public.dungeon_runs add column if not exists combatants jsonb not null default '[]'::jsonb;
alter table public.dungeon_runs add column if not exists room_state jsonb not null default '{}'::jsonb;
alter table public.dungeon_runs add column if not exists claimed_at timestamptz;
alter table public.dungeon_runs add column if not exists player_attack numeric not null default 10;
insert into public.dungeon_definitions(name,description,enabled,max_enemies,entry_requirements,loot,rewards,sort_order) values ('The 1,500-Room Dungeon','The full Dungeon + Workbench rebalance: 1,500 catalog rooms, non-linear difficulty zones, regional mutations, bosses and forge drops.',true,9,'{}','[]','{}',1) on conflict(name) do update set enabled=true,description=excluded.description,max_enemies=9,updated_at=now();
insert into public.dungeon_regions(id,name,room_start,room_end,hp_scale,damage_scale,main_essence,essence_rarity,rec_level,sort_order) values
('entrance','Entrance',1,200,1,1,'TE','Common','1-10',1),
('jungle','Jungle',201,325,3,2,'SE','Uncommon','10-20',2),
('beach-sea','Beach & Sea',326,450,4,2.5,'SE','Uncommon','15-25',3),
('mountain','Mountain',451,575,10,5,'LE','Rare','25-40',4),
('volcano','Volcano',576,650,25,10,'LE','Rare','40-55',5),
('hell','Hell',651,800,50,20,'LE','Very Rare','50-70',6),
('dragon-s-domain','Dragon''s Domain',801,900,100,35,'ME','Epic','70-85',7),
('abyss','Abyss',901,1000,200,60,'ME','Legendary','85+',8),
('sky-citadel','Sky Citadel',1001,1150,400,110,'ME','Mythic','100+',9),
('time-rift','Time Rift',1151,1330,800,200,'ME','Mythic','115+',10),
('genesis-core','Genesis Core',1331,1500,1600,400,'ME','Primal','130+',11)
on conflict(id) do update set name=excluded.name,room_start=excluded.room_start,room_end=excluded.room_end,hp_scale=excluded.hp_scale,damage_scale=excluded.damage_scale,main_essence=excluded.main_essence,essence_rarity=excluded.essence_rarity,rec_level=excluded.rec_level,sort_order=excluded.sort_order;
insert into public.dungeon_difficulty_zones(id,hp_multiplier,damage_multiplier,rewards_multiplier,elite_multiplier,mutation_multiplier) values
('Easy',0.7,0.75,0.85,0.75,0.75),
('Normal',1,1,1,1,1),
('Hard',1.35,1.3,1.25,1.35,1.25),
('Brutal',1.8,1.6,1.6,1.75,1.5)
on conflict(id) do update set hp_multiplier=excluded.hp_multiplier,damage_multiplier=excluded.damage_multiplier,rewards_multiplier=excluded.rewards_multiplier,elite_multiplier=excluded.elite_multiplier,mutation_multiplier=excluded.mutation_multiplier;
alter table public.dungeon_catalog_rooms enable row level security; alter table public.dungeon_regions enable row level security; alter table public.dungeon_difficulty_zones enable row level security; alter table public.dungeon_boss_catalog enable row level security; alter table public.dungeon_forge_materials enable row level security; alter table public.dungeon_mutations enable row level security; alter table public.dungeon_workbench_recipes enable row level security; alter table public.dungeon_equipment_crafting_chances enable row level security; alter table public.player_dungeon_materials enable row level security; alter table public.player_dungeon_essence enable row level security; alter table public.dungeon_gear enable row level security;
revoke all on public.dungeon_catalog_rooms,public.dungeon_regions,public.dungeon_difficulty_zones,public.dungeon_boss_catalog,public.dungeon_forge_materials,public.dungeon_mutations,public.dungeon_workbench_recipes,public.dungeon_equipment_crafting_chances,public.player_dungeon_materials,public.player_dungeon_essence,public.dungeon_gear from anon,authenticated;
grant select on public.dungeon_catalog_rooms,public.dungeon_regions,public.dungeon_difficulty_zones,public.dungeon_boss_catalog,public.dungeon_forge_materials,public.dungeon_mutations,public.dungeon_workbench_recipes,public.dungeon_equipment_crafting_chances to anon,authenticated; grant all on public.player_dungeon_materials,public.player_dungeon_essence,public.dungeon_gear to service_role;
drop policy if exists dungeon_catalog_public_read on public.dungeon_catalog_rooms; create policy dungeon_catalog_public_read on public.dungeon_catalog_rooms for select to anon,authenticated using (true);
drop policy if exists dungeon_regions_public_read on public.dungeon_regions; create policy dungeon_regions_public_read on public.dungeon_regions for select to anon,authenticated using (true);
drop policy if exists dungeon_zones_public_read on public.dungeon_difficulty_zones; create policy dungeon_zones_public_read on public.dungeon_difficulty_zones for select to anon,authenticated using (true);
drop policy if exists dungeon_boss_public_read on public.dungeon_boss_catalog; create policy dungeon_boss_public_read on public.dungeon_boss_catalog for select to anon,authenticated using (true);
drop policy if exists dungeon_material_public_read on public.dungeon_forge_materials; create policy dungeon_material_public_read on public.dungeon_forge_materials for select to anon,authenticated using (true);
drop policy if exists dungeon_mutation_public_read on public.dungeon_mutations; create policy dungeon_mutation_public_read on public.dungeon_mutations for select to anon,authenticated using (true);
drop policy if exists dungeon_recipe_public_read on public.dungeon_workbench_recipes; create policy dungeon_recipe_public_read on public.dungeon_workbench_recipes for select to anon,authenticated using (true);
drop policy if exists dungeon_crafting_chance_public_read on public.dungeon_equipment_crafting_chances; create policy dungeon_crafting_chance_public_read on public.dungeon_equipment_crafting_chances for select to anon,authenticated using (true);
create index if not exists dungeon_catalog_region_idx on public.dungeon_catalog_rooms(region,room_number); create index if not exists dungeon_catalog_zone_idx on public.dungeon_catalog_rooms(zone,room_number); create index if not exists dungeon_gear_player_idx on public.dungeon_gear(player_id,created_at desc);
commit;
select '01 schema and security committed' as result;

-- PR #507: SQL-editor alternative to the FIRST migration only.
-- Keep maintenance enabled. Run numbered files in order; wait for a success result.
-- Read-only checks. A failure means STOP; do not run migration 2.
do $$ begin
  if (select count(*) from public.dungeon_catalog_rooms) <> 1500 then raise exception 'dungeon_catalog_rooms: expected 1500 rows'; end if;
  if (select count(*) from public.dungeon_regions) <> 11 then raise exception 'dungeon_regions: expected 11 rows'; end if;
  if (select count(*) from public.dungeon_difficulty_zones) <> 4 then raise exception 'dungeon_difficulty_zones: expected 4 rows'; end if;
  if (select count(*) from public.dungeon_boss_catalog) <> 30 then raise exception 'dungeon_boss_catalog: expected 30 rows'; end if;
  if (select count(*) from public.dungeon_forge_materials) <> 198 then raise exception 'dungeon_forge_materials: expected 198 rows'; end if;
  if (select count(*) from public.dungeon_mutations) <> 66 then raise exception 'dungeon_mutations: expected 66 rows'; end if;
  if (select count(*) from public.dungeon_workbench_recipes) <> 142 then raise exception 'dungeon_workbench_recipes: expected 142 rows'; end if;
  if (select count(*) from public.dungeon_equipment_crafting_chances) <> 26 then raise exception 'dungeon_equipment_crafting_chances: expected 26 rows'; end if;
  if to_regprocedure('public.claim_dungeon_run_rewards(uuid,uuid)') is null or
     to_regprocedure('public.craft_dungeon_workbench(uuid,text)') is null then
    raise exception 'Missing dungeon RPC functions';
  end if;
  if exists (select 1 from pg_class where oid in (
    'public.dungeon_catalog_rooms'::regclass,
    'public.dungeon_regions'::regclass,
    'public.dungeon_difficulty_zones'::regclass,
    'public.dungeon_boss_catalog'::regclass,
    'public.dungeon_forge_materials'::regclass,
    'public.dungeon_mutations'::regclass,
    'public.dungeon_workbench_recipes'::regclass,
    'public.dungeon_equipment_crafting_chances'::regclass,
    'public.player_dungeon_materials'::regclass,
    'public.player_dungeon_essence'::regclass,
    'public.dungeon_gear'::regclass) and not relrowsecurity) then raise exception 'Dungeon table missing RLS'; end if;
end $$;
select 'FIRST migration complete. Now apply the four later migrations in README order.' as result;

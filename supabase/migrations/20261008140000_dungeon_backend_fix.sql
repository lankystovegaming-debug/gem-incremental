begin;

create table if not exists public.dungeon_room_progress (
  player_id uuid not null references public.players(id) on delete cascade,
  room_number integer not null check(room_number between 1 and 1500),
  completed_at timestamptz not null default now(),
  primary key(player_id, room_number)
);

alter table public.dungeon_room_progress enable row level security;
revoke all on public.dungeon_room_progress from anon,authenticated;
grant all on public.dungeon_room_progress to service_role;
create index if not exists dungeon_room_progress_player_idx on public.dungeon_room_progress(player_id,room_number);

update public.dungeon_definitions
set entry_requirements=jsonb_build_object('minRolls',1), enabled=true, updated_at=now()
where name='The 1,500-Room Dungeon';

create or replace function public.claim_dungeon_run_rewards(p_run_id uuid,p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run public.dungeon_runs%rowtype;
  v_item jsonb;
  v_count bigint;
  v_materials jsonb:='[]'::jsonb;
  v_essence jsonb:='[]'::jsonb;
  v_gear jsonb:='[]'::jsonb;
  v_room integer;
begin
  select * into v_run
  from public.dungeon_runs
  where id=p_run_id and player_id=p_player_id and status='won'
  for update;

  if not found then raise exception 'run_not_claimable'; end if;
  v_room:=coalesce(v_run.room_number,0);

  for v_item in select value from jsonb_array_elements(coalesce(v_run.loot,'[]'::jsonb)) loop
    if v_item->>'type'='material' then
      v_count:=greatest(1,coalesce((v_item->>'quantity')::bigint,1));
      insert into public.player_dungeon_materials(player_id,material_name,quantity,updated_at)
      values(p_player_id,v_item->>'name',v_count,now())
      on conflict(player_id,material_name) do update set quantity=public.player_dungeon_materials.quantity+excluded.quantity,updated_at=now();
      v_materials:=v_materials||jsonb_build_array(jsonb_build_object('name',v_item->>'name','quantity',v_count));
    elsif v_item->>'type'='gear' then
      insert into public.dungeon_gear(player_id,room_number,source_enemy,item_type,quality,upgrade_level,gem_power,mutation_name,stats)
      values(
        p_player_id,
        v_room,
        coalesce(v_item->>'source_enemy','Dungeon enemy'),
        case when v_item->>'item_type'='armor' then 'armor' else 'weapon' end,
        coalesce(v_item->>'quality','Common'),
        greatest(0,coalesce((v_item->>'upgrade_level')::integer,0)),
        greatest(0,coalesce((v_item->>'gem_power')::bigint,0)),
        nullif(v_item->>'mutation_name',''),
        coalesce(v_item->'stats',jsonb_build_object('name',v_item->>'name','components',coalesce((v_item->>'components')::integer,0)))
      );
      v_gear:=v_gear||jsonb_build_array(v_item);
    elsif v_item->>'type'='essence' then
      v_count:=greatest(1,coalesce((v_item->>'quantity')::bigint,1));
      if v_item->>'tier' in ('TE','SE','LE','ME') then
        insert into public.player_dungeon_essence(player_id,essence_tier,quantity,updated_at)
        values(p_player_id,v_item->>'tier',v_count,now())
        on conflict(player_id,essence_tier) do update set quantity=public.player_dungeon_essence.quantity+excluded.quantity,updated_at=now();
        v_essence:=v_essence||jsonb_build_array(jsonb_build_object('tier',v_item->>'tier','quantity',v_count));
      end if;
    end if;
  end loop;

  if v_room between 1 and 1500 then
    insert into public.dungeon_room_progress(player_id,room_number,completed_at)
    values(p_player_id,v_room,now())
    on conflict(player_id,room_number) do update set completed_at=excluded.completed_at;
  end if;

  update public.dungeon_runs set status='claimed',claimed_at=now(),updated_at=now() where id=v_run.id;

  return jsonb_build_object('ok',true,'materials',v_materials,'essence',v_essence,'gear',v_gear,'loot',v_run.loot,'roomNumber',v_room,'runId',v_run.id);
end;
$$;

revoke all on function public.claim_dungeon_run_rewards(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_dungeon_run_rewards(uuid,uuid) to service_role;

create or replace function public.craft_dungeon_workbench(p_player_id uuid,p_recipe_name text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.dungeon_workbench_recipes%rowtype;
  i jsonb;
  need bigint;
  have bigint;
  v_gear uuid;
  v_ess bigint;
  v_gp bigint;
  v_total_ess bigint;
  v_kind text;
begin
  select * into r from public.dungeon_workbench_recipes where name=p_recipe_name and enabled=true for update;
  if not found then raise exception 'recipe_not_found'; end if;

  v_total_ess:=greatest(0,r.essence_cost);
  for i in select value from jsonb_array_elements(coalesce(r.ingredients,'[]'::jsonb)) loop
    if i->>'item' in ('TE','SE','LE','ME') and i->>'item'=r.essence_tier then
      v_total_ess:=v_total_ess+greatest(0,coalesce((i->>'qty')::bigint,0));
    end if;
  end loop;

  select quantity into v_ess
  from public.player_dungeon_essence
  where player_id=p_player_id and essence_tier=r.essence_tier
  for update;
  if coalesce(v_ess,0)<v_total_ess then raise exception 'insufficient_essence'; end if;

  for i in select value from jsonb_array_elements(coalesce(r.ingredients,'[]'::jsonb)) loop
    if i->>'item' in ('TE','SE','LE','ME') then continue; end if;
    need:=greatest(0,coalesce((i->>'qty')::bigint,0));
    select quantity into have from public.player_dungeon_materials
    where player_id=p_player_id and material_name=i->>'item'
    for update;
    if coalesce(have,0)<need then raise exception 'insufficient_material:%',(i->>'item'); end if;
  end loop;

  if v_total_ess>0 then
    update public.player_dungeon_essence set quantity=quantity-v_total_ess,updated_at=now()
    where player_id=p_player_id and essence_tier=r.essence_tier;
  end if;

  for i in select value from jsonb_array_elements(coalesce(r.ingredients,'[]'::jsonb)) loop
    if i->>'item' in ('TE','SE','LE','ME') then continue; end if;
    need:=greatest(0,coalesce((i->>'qty')::bigint,0));
    if need>0 then
      update public.player_dungeon_materials set quantity=quantity-need,updated_at=now()
      where player_id=p_player_id and material_name=i->>'item';
    end if;
  end loop;

  v_gp:=greatest(0,r.gem_power);
  v_kind:=coalesce(r.kind,'equipment');
  insert into public.dungeon_gear(player_id,room_number,source_enemy,item_type,quality,upgrade_level,gem_power,stats)
  values(p_player_id,0,coalesce(r.source,r.name),case when lower(v_kind) in ('weapon','tool') then 'weapon' else 'armor' end,'Workbench',0,v_gp,jsonb_build_object('recipe',r.name,'tier',r.tier,'kind',v_kind))
  returning id into v_gear;

  return jsonb_build_object('ok',true,'recipe',r.name,'tier',r.tier,'gemPower',v_gp,'gearId',v_gear);
end;
$$;

revoke all on function public.craft_dungeon_workbench(uuid,text) from public,anon,authenticated;
grant execute on function public.craft_dungeon_workbench(uuid,text) to service_role;

commit;

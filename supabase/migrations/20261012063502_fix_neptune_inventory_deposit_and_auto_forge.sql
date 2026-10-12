begin;

alter table public.player_deep_sea_state
  add column neptune_auto_craft boolean not null default false;

create function deep_sea_private.neptune_requirements()
returns table(gem_name text, quantity bigint)
language sql immutable set search_path = '' as $$
  values ('Clay',500::bigint),('Salt Crystal',250),('Seaweed',100),
    ('Sand Rock',50),('Sea Salt Rock',25),('Prismarine Fragment',10),
    ('Ancient Coin',5),('Pearl',5),('Pearl of the Sea',1)
$$;

-- Called only after the caller has locked the player and event state and
-- satisfied the materials. Auto Forge stores the pickaxe so an in-flight
-- batch keeps its original equipment; the manual craft still equips it.
create function deep_sea_private.finish_neptune(p_player_id uuid, p_equip boolean)
returns void language plpgsql set search_path = '' as $$
begin
  update public.players set money = money - 250000
  where id = p_player_id and money >= 250000;
  if not found then raise exception 'insufficient_funds' using errcode = 'P0001'; end if;

  if p_equip then
    update public.player_equipment set equipped = false
    where player_id = p_player_id and category = 'pickaxe' and equipped;
  end if;
  insert into public.player_equipment(
    player_id,equipment_id,category,tier,name,luck_bonus,roll_speed_bonus,
    mutation_chance_bonus,weight_luck_bonus,weight_multiplier_bonus,equipped
  ) values (p_player_id,'neptune','pickaxe',18,'Neptune',30,0.7,1.5,1.2,1.2,p_equip);

  -- Retain completed material counters for the event's permanent record.
  insert into public.player_deep_sea_progress(player_id,run_id,target,gem_name,quantity)
  select p_player_id,'deep-sea-2026','neptune',r.gem_name,r.quantity
  from deep_sea_private.neptune_requirements() r
  on conflict(player_id,run_id,target,gem_name) do update set quantity = excluded.quantity;
  update public.player_deep_sea_state
  set neptune_owned = true, neptune_auto_feed = false, neptune_auto_craft = false,
      updated_at = clock_timestamp()
  where player_id = p_player_id and run_id = 'deep-sea-2026';
end;
$$;

create function deep_sea_private.try_auto_forge_neptune(p_player_id uuid)
returns boolean language plpgsql set search_path = '' as $$
declare s public.player_deep_sea_state;
begin
  if not exists(select 1 from public.player_deep_sea_state
                where player_id = p_player_id and run_id = 'deep-sea-2026'
                  and neptune_auto_craft and not neptune_owned) then return false; end if;
  -- Same player -> state lock order as the atomic roll coordinator.
  perform 1 from public.players where id = p_player_id for update;
  select * into s from public.player_deep_sea_state
  where player_id = p_player_id and run_id = 'deep-sea-2026' for update;
  if not found or not s.neptune_auto_craft or s.neptune_owned
     or deep_sea_private.phase() not in ('active','redemption') then return false; end if;
  if exists(select 1 from public.player_equipment
            where player_id = p_player_id and equipment_id = 'neptune') then
    update public.player_deep_sea_state
    set neptune_owned = true, neptune_auto_feed = false, neptune_auto_craft = false
    where player_id = p_player_id and run_id = 'deep-sea-2026';
    return false;
  end if;
  if exists (
    select 1 from deep_sea_private.neptune_requirements() r
    left join public.player_deep_sea_progress p on p.player_id = p_player_id
      and p.run_id = 'deep-sea-2026' and p.target = 'neptune' and p.gem_name = r.gem_name
    where coalesce(p.quantity,0) < r.quantity
  ) or (select money from public.players where id = p_player_id) < 250000 then return false; end if;
  perform deep_sea_private.finish_neptune(p_player_id, false);
  return true;
end;
$$;

-- Inventory deposits are partial top-ups, not an all-or-nothing final craft.
-- Lock the exact rows that are consumed and cap each top-up at its deficit.
create function public.deep_sea_deposit_neptune(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; needed bigint; ids bigint[]; deposited integer := 0; taken integer;
begin
  if auth.uid() is null or auth.uid() <> p_player_id then
    raise exception 'not_authorized' using errcode = '42501'; end if;
  if deep_sea_private.phase() not in ('active','redemption') then
    raise exception 'wrong_phase' using errcode = 'P0001'; end if;
  perform 1 from public.players where id = p_player_id for update;
  insert into public.player_deep_sea_state(player_id,run_id)
  values(p_player_id,'deep-sea-2026') on conflict do nothing;
  if (select neptune_owned from public.player_deep_sea_state
      where player_id = p_player_id and run_id = 'deep-sea-2026' for update)
     or exists(select 1 from public.player_equipment
               where player_id = p_player_id and equipment_id = 'neptune') then
    raise exception 'already_owned' using errcode = 'P0001'; end if;
  for r in select * from deep_sea_private.neptune_requirements() loop
    select greatest(0,r.quantity - coalesce((select quantity
      from public.player_deep_sea_progress where player_id = p_player_id
      and run_id = 'deep-sea-2026' and target = 'neptune' and gem_name = r.gem_name),0)) into needed;
    if needed = 0 then continue; end if;
    select array_agg(i.id order by i.id) into ids from (
      select id from public.inventory_gems
      where player_id = p_player_id and gem_name = r.gem_name
        and not locked and not coalesce(museum_locked,false)
      order by id limit needed for update
    ) i;
    if coalesce(cardinality(ids),0) = 0 then continue; end if;
    delete from public.inventory_gems where player_id = p_player_id and id = any(ids);
    get diagnostics taken = row_count;
    if taken <> cardinality(ids) then
      raise exception 'recipe_gem_consumption_conflict:%',r.gem_name; end if;
    insert into public.player_deep_sea_progress(player_id,run_id,target,gem_name,quantity)
    values(p_player_id,'deep-sea-2026','neptune',r.gem_name,taken)
    on conflict(player_id,run_id,target,gem_name)
    do update set quantity = public.player_deep_sea_progress.quantity + excluded.quantity;
    deposited := deposited + taken;
  end loop;
  perform deep_sea_private.try_auto_forge_neptune(p_player_id);
  return jsonb_build_object('deposited',deposited,'snapshot',public.deep_sea_snapshot(p_player_id));
end;
$$;

create function public.deep_sea_set_neptune_auto_craft(p_player_id uuid, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() <> p_player_id then
    raise exception 'not_authorized' using errcode = '42501'; end if;
  if deep_sea_private.phase() not in ('active','redemption') then
    raise exception 'wrong_phase' using errcode = 'P0001'; end if;
  perform 1 from public.players where id = p_player_id for update;
  insert into public.player_deep_sea_state(player_id,run_id)
  values(p_player_id,'deep-sea-2026') on conflict do nothing;
  update public.player_deep_sea_state
  set neptune_auto_craft = p_enabled, updated_at = clock_timestamp()
  where player_id = p_player_id and run_id = 'deep-sea-2026' and not neptune_owned;
  perform deep_sea_private.try_auto_forge_neptune(p_player_id);
  return public.deep_sea_snapshot(p_player_id);
end;
$$;

create or replace function public.deep_sea_craft_neptune(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare remaining jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_player_id then
    raise exception 'not_authorized' using errcode = '42501'; end if;
  if deep_sea_private.phase() not in ('active','redemption') then
    raise exception 'wrong_phase' using errcode = 'P0001'; end if;
  perform 1 from public.players where id = p_player_id for update;
  insert into public.player_deep_sea_state(player_id,run_id)
  values(p_player_id,'deep-sea-2026') on conflict do nothing;
  if (select neptune_owned from public.player_deep_sea_state
      where player_id = p_player_id and run_id = 'deep-sea-2026' for update)
     or exists(select 1 from public.player_equipment
               where player_id = p_player_id and equipment_id = 'neptune') then
    raise exception 'already_owned' using errcode = 'P0001'; end if;
  select jsonb_agg(jsonb_build_object('gem',r.gem_name,'quantity',
    greatest(0,r.quantity - coalesce(p.quantity,0)))) into remaining
  from deep_sea_private.neptune_requirements() r
  left join public.player_deep_sea_progress p on p.player_id = p_player_id
    and p.run_id = 'deep-sea-2026' and p.target = 'neptune' and p.gem_name = r.gem_name;
  perform deep_sea_private.consume_gems(p_player_id,remaining);
  perform deep_sea_private.finish_neptune(p_player_id,true);
  return public.deep_sea_snapshot(p_player_id);
end;
$$;

-- An opted-in player who gains the cash cost after filling every material
-- can also finish while viewing Neptune, without needing another lucky roll.
create function public.deep_sea_neptune_progress(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() <> p_player_id then
    raise exception 'not_authorized' using errcode = '42501'; end if;
  perform deep_sea_private.try_auto_forge_neptune(p_player_id);
  return public.deep_sea_snapshot(p_player_id);
end;
$$;

revoke all on function deep_sea_private.neptune_requirements() from public,anon,authenticated;
revoke all on function deep_sea_private.finish_neptune(uuid,boolean) from public,anon,authenticated;
revoke all on function deep_sea_private.try_auto_forge_neptune(uuid) from public,anon,authenticated;
revoke all on function public.deep_sea_deposit_neptune(uuid) from public,anon;
revoke all on function public.deep_sea_set_neptune_auto_craft(uuid,boolean) from public,anon;
grant execute on function public.deep_sea_deposit_neptune(uuid) to authenticated;
grant execute on function public.deep_sea_set_neptune_auto_craft(uuid,boolean) to authenticated;
revoke all on function public.deep_sea_neptune_progress(uuid) from public,anon;
grant execute on function public.deep_sea_neptune_progress(uuid) to authenticated;

-- Extend the deployed event commit, keeping token awards, first-discovery
-- protection, feed priority, per-subroll cutoff and atomic rollback intact.
create or replace function public.deep_sea_commit_roll(p_player_id uuid,p_lease_id uuid,p_genuine_roll bigint,p_specimen jsonb,p_neptune boolean,p_inventory_required boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.player_deep_sea_state; g public.deep_sea_gems; first_discovery boolean; token_base bigint; token_award bigint; fed text; next_step int; req_count int; met_count int; reward public.deep_sea_depth_rewards; result jsonb; offering_used boolean:=false;
begin
 if deep_sea_private.phase() <> 'active' then raise exception 'deep_sea_event_ended' using errcode='P0001'; end if;
 select c.result into result from deep_sea_private.roll_commits c where c.player_id=p_player_id and c.run_id='deep-sea-2026' and c.lease_id=p_lease_id and c.genuine_roll=p_genuine_roll;
 if result is not null then return result; end if;
 select * into g from public.deep_sea_gems where name=p_specimen->>'gem_name' and enabled for share;
 if not found then raise exception 'invalid_deep_sea_gem'; end if;
 select exists(select 1 from public.player_gem_mutation_combinations c where c.player_id=p_player_id and c.gem_name=g.name) = false into first_discovery;
 select * into s from public.player_deep_sea_state where player_id=p_player_id and run_id='deep-sea-2026' for update;
 if not found then insert into public.player_deep_sea_state(player_id,run_id) values(p_player_id,'deep-sea-2026') returning * into s; end if;
 update public.players set money=money-5 where id=p_player_id and money>=5;
 if not found then raise exception 'insufficient_funds' using errcode='P0001'; end if;
 token_base:=case when g.name='Water' then 0 else floor(power(g.rarity::numeric,0.4))::bigint end;
 token_award:=token_base * case when s.treasure_tonic_rolls>0 then 2 else 1 end;
 if s.treasure_tonic_rolls>0 then s.treasure_tonic_rolls:=s.treasure_tonic_rolls-1; end if;
 if not first_discovery and s.neptune_auto_feed and not s.neptune_owned and exists(
   select 1 from deep_sea_private.neptune_requirements() r
   where r.gem_name=g.name and coalesce((select quantity from public.player_deep_sea_progress where player_id=p_player_id and run_id='deep-sea-2026' and target='neptune' and gem_name=g.name),0)<r.quantity
 ) then fed:='neptune';
 elsif not first_discovery and s.depths_auto_feed and exists(select 1 from public.deep_sea_depth_requirements r where r.step=s.depth_step+1 and r.gem_name=g.name and coalesce((select quantity from public.player_deep_sea_progress where player_id=p_player_id and run_id='deep-sea-2026' and target='depths:'||(s.depth_step+1)::text and gem_name=g.name),0)<r.quantity) then fed:='depths';
 end if;
 if p_inventory_required and fed is null then
   if (select count(*) from public.inventory_gems where player_id=p_player_id) >= (select inventory_capacity+coalesce((select inventory_bonus from public.player_research_effects where player_id=p_player_id),0) from public.players where id=p_player_id) then raise exception 'inventory_full' using errcode='P0001'; end if;
 end if;
 if fed is not null then insert into public.player_deep_sea_progress(player_id,run_id,target,gem_name,quantity) values(p_player_id,'deep-sea-2026',case when fed='depths' then 'depths:'||(s.depth_step+1)::text else fed end,g.name,1) on conflict(player_id,run_id,target,gem_name) do update set quantity=public.player_deep_sea_progress.quantity+1; end if;
 if p_neptune and s.offering_charges>0 then s.offering_charges:=s.offering_charges-1; offering_used:=true; end if;
 s.tide_tokens:=s.tide_tokens+token_award;
 loop
   next_step:=s.depth_step+1; exit when next_step>30;
   select count(*),count(*) filter(where coalesce(p.quantity,0)>=r.quantity) into req_count,met_count from public.deep_sea_depth_requirements r left join public.player_deep_sea_progress p on p.player_id=p_player_id and p.run_id='deep-sea-2026' and p.target='depths:'||next_step::text and p.gem_name=r.gem_name where r.step=next_step;
   exit when req_count=0 or met_count<>req_count;
   s.depth_step:=next_step; select * into reward from public.deep_sea_depth_rewards where step=next_step;
   insert into public.player_consumables(player_id,consumable_id,quantity,updated_at) values(p_player_id,reward.reward_id,reward.quantity,clock_timestamp()) on conflict(player_id,consumable_id) do update set quantity=public.player_consumables.quantity+excluded.quantity,updated_at=excluded.updated_at;
 end loop;
 update public.player_deep_sea_state set tide_tokens=s.tide_tokens,depth_step=s.depth_step,offering_charges=s.offering_charges,treasure_tonic_rolls=s.treasure_tonic_rolls,updated_at=clock_timestamp() where player_id=p_player_id and run_id='deep-sea-2026';
 if s.neptune_auto_craft then perform deep_sea_private.try_auto_forge_neptune(p_player_id); end if;
 result:=jsonb_build_object('tideTokens',s.tide_tokens,'awarded',token_award,'firstDiscovery',first_discovery,'fed',fed,'depthStep',s.depth_step,'offeringConsumed',offering_used);
 insert into deep_sea_private.roll_commits values(p_player_id,'deep-sea-2026',p_lease_id,p_genuine_roll,result,clock_timestamp());
 return result;
end $$;

commit;

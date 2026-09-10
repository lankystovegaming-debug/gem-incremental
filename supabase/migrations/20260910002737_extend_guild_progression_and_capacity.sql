begin;

-- Continue guild progression to level 20. Existing XP is retained, so guilds
-- already beyond the old level-10 threshold receive the appropriate level.
create or replace function public.guild_level(p_xp bigint)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_xp, 0) >= 1700000 then 20
    when p_xp >= 1350000 then 19
    when p_xp >= 1075000 then 18
    when p_xp >= 850000 then 17
    when p_xp >= 670000 then 16
    when p_xp >= 525000 then 15
    when p_xp >= 410000 then 14
    when p_xp >= 320000 then 13
    when p_xp >= 250000 then 12
    when p_xp >= 195000 then 11
    when p_xp >= 150000 then 10
    when p_xp >= 115000 then 9
    when p_xp >= 85000 then 8
    when p_xp >= 60000 then 7
    when p_xp >= 40000 then 6
    when p_xp >= 25000 then 5
    when p_xp >= 15000 then 4
    when p_xp >= 7500 then 3
    when p_xp >= 2500 then 2
    else 1
  end;
$$;

alter table public.guilds drop constraint if exists guilds_capacity_range;
alter table public.guilds
  add constraint guilds_capacity_range check (member_capacity between 3 and 15);

create or replace function public.guild_upgrade_cost(p_track text, p_next_tier integer)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_track_costs bigint[] := array[500,750,1000,1500,2000,3000,4000,5500,7500,10000];
  v_capacity_costs bigint[] := array[750,1250,2000,3000,4500,6000,8000,10500,13500,17000,21000,26000];
begin
  if p_track = 'capacity' then
    if p_next_tier not between 4 and 15 then raise exception 'invalid_upgrade_tier'; end if;
    return v_capacity_costs[p_next_tier - 3];
  end if;
  if p_next_tier not between 1 and 10 then raise exception 'invalid_upgrade_tier'; end if;
  return v_track_costs[p_next_tier];
end;
$$;

create or replace function public.guild_purchase_upgrade(p_player_id uuid, p_track text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guild public.guilds%rowtype;
  v_current integer;
  v_next integer;
  v_required integer;
  v_cost bigint;
begin
  select g.* into v_guild
  from public.guild_members m
  join public.guilds g on g.id = m.guild_id
  where m.player_id = p_player_id and m.role in ('owner', 'officer')
  for update of g;
  if not found then raise exception 'management_only'; end if;

  if p_track = 'capacity' then
    v_current := v_guild.member_capacity;
    v_next := v_current + 1;
    if v_next > 15 then raise exception 'max_upgrade'; end if;
    v_required := (array[2,3,4,5,6,7,9,11,13,15,17,19])[v_next - 3];
  elsif p_track = 'luck' then
    v_current := v_guild.luck_tier; v_next := v_current + 1; v_required := v_next;
  elsif p_track = 'speed' then
    v_current := v_guild.speed_tier; v_next := v_current + 1; v_required := v_next;
  elsif p_track = 'weight_luck' then
    v_current := v_guild.weight_luck_tier; v_next := v_current + 1; v_required := v_next;
  else
    raise exception 'invalid_upgrade';
  end if;

  if p_track <> 'capacity' and v_next > 10 then raise exception 'max_upgrade'; end if;
  if public.guild_level(v_guild.xp) < v_required then raise exception 'guild_level_required'; end if;
  v_cost := public.guild_upgrade_cost(p_track, v_next);
  if v_guild.guild_points < v_cost then raise exception 'insufficient_guild_points'; end if;

  update public.guilds set
    guild_points = guild_points - v_cost,
    member_capacity = case when p_track = 'capacity' then v_next else member_capacity end,
    luck_tier = case when p_track = 'luck' then v_next else luck_tier end,
    speed_tier = case when p_track = 'speed' then v_next else speed_tier end,
    weight_luck_tier = case when p_track = 'weight_luck' then v_next else weight_luck_tier end,
    updated_at = now()
  where id = v_guild.id;

  insert into public.guild_activity(guild_id, actor_id, action, details)
  values(v_guild.id, p_player_id, 'upgrade_purchased',
    jsonb_build_object('track', p_track, 'tier', v_next, 'cost', v_cost));

  return jsonb_build_object('ok', true, 'track', p_track, 'tier', v_next, 'cost', v_cost);
end;
$$;

revoke all on function public.guild_level(bigint) from public;
revoke all on function public.guild_upgrade_cost(text, integer) from public;
revoke all on function public.guild_purchase_upgrade(uuid, text) from public;
grant execute on function public.guild_level(bigint) to service_role;
grant execute on function public.guild_upgrade_cost(text, integer) to service_role;
grant execute on function public.guild_purchase_upgrade(uuid, text) to service_role;

commit;

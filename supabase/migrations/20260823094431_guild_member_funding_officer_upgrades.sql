begin;

create or replace function public.guild_purchase_points_with_cash(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.guild_members%rowtype;
  v_guild public.guilds%rowtype;
  v_date date := (now() at time zone 'utc')::date;
  v_purchase_number integer;
  v_costs bigint[] := array[1000000,1500000,2000000,3000000,5000000];
  v_cost bigint;
  v_money numeric;
  v_reset_at timestamptz := ((v_date + 1)::timestamp at time zone 'UTC');
begin
  select * into v_member
  from public.guild_members
  where player_id = p_player_id;
  if not found then raise exception 'not_in_guild'; end if;

  -- Every member may contribute personal cash to the shared treasury.
  select * into v_guild from public.guilds where id = v_member.guild_id for update;
  if not found then raise exception 'guild_not_found'; end if;

  select count(*)::integer + 1 into v_purchase_number
  from public.guild_point_cash_contributions
  where guild_id = v_member.guild_id and contribution_date = v_date;
  if v_purchase_number > 5 then raise exception 'guild_point_purchase_limit'; end if;
  v_cost := v_costs[v_purchase_number];

  select money into v_money from public.players where id = p_player_id for update;
  if not found then raise exception 'player_not_found'; end if;
  if coalesce(v_money, 0) < v_cost then raise exception 'insufficient_money'; end if;

  update public.players set money = money - v_cost where id = p_player_id returning money into v_money;
  update public.guilds set guild_points = guild_points + 100, updated_at = now()
  where id = v_member.guild_id returning * into v_guild;

  insert into public.guild_point_cash_contributions(
    guild_id, player_id, contribution_date, purchase_number, money_spent, points_awarded
  ) values(v_member.guild_id, p_player_id, v_date, v_purchase_number, v_cost, 100);

  insert into public.guild_activity(guild_id, actor_id, action, details)
  values(v_member.guild_id, p_player_id, 'guild_points_funded',
    jsonb_build_object('money', v_cost, 'points', 100, 'purchaseNumber', v_purchase_number));

  return jsonb_build_object(
    'ok', true,
    'moneySpent', v_cost,
    'playerMoney', v_money,
    'pointsAwarded', 100,
    'guildPoints', v_guild.guild_points,
    'purchaseCount', v_purchase_number,
    'remainingPurchases', 5 - v_purchase_number,
    'nextCost', case when v_purchase_number < 5 then v_costs[v_purchase_number + 1] else null end,
    'resetsAt', v_reset_at
  );
end;
$$;

create or replace function public.guild_purchase_upgrade(p_player_id uuid, p_track text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_guild public.guilds%rowtype; v_current int; v_next int; v_required int; v_cost bigint;
begin
  select g.* into v_guild
  from public.guild_members m
  join public.guilds g on g.id=m.guild_id
  where m.player_id=p_player_id and m.role in ('owner','officer')
  for update of g;
  if not found then raise exception 'management_only'; end if;
  if p_track='capacity' then v_current:=v_guild.member_capacity; v_next:=v_current+1;
    if v_next>10 then raise exception 'max_upgrade'; end if;
    v_required:=(array[2,3,4,5,6,7,9])[v_next-3];
  elsif p_track='luck' then v_current:=v_guild.luck_tier; v_next:=v_current+1; v_required:=v_next;
  elsif p_track='speed' then v_current:=v_guild.speed_tier; v_next:=v_current+1; v_required:=v_next;
  elsif p_track='weight_luck' then v_current:=v_guild.weight_luck_tier; v_next:=v_current+1; v_required:=v_next;
  else raise exception 'invalid_upgrade'; end if;
  if v_next>10 then raise exception 'max_upgrade'; end if;
  if public.guild_level(v_guild.xp)<v_required then raise exception 'guild_level_required'; end if;
  v_cost:=public.guild_upgrade_cost(p_track,v_next);
  if v_guild.guild_points<v_cost then raise exception 'insufficient_guild_points'; end if;
  update public.guilds set guild_points=guild_points-v_cost,
    member_capacity=case when p_track='capacity' then v_next else member_capacity end,
    luck_tier=case when p_track='luck' then v_next else luck_tier end,
    speed_tier=case when p_track='speed' then v_next else speed_tier end,
    weight_luck_tier=case when p_track='weight_luck' then v_next else weight_luck_tier end,
    updated_at=now() where id=v_guild.id;
  insert into public.guild_activity(guild_id,actor_id,action,details)
  values(v_guild.id,p_player_id,'upgrade_purchased',jsonb_build_object('track',p_track,'tier',v_next,'cost',v_cost));
  return jsonb_build_object('ok',true,'track',p_track,'tier',v_next,'cost',v_cost);
end $$;

revoke all on function public.guild_purchase_points_with_cash(uuid) from public;
revoke all on function public.guild_purchase_upgrade(uuid,text) from public;
grant execute on function public.guild_purchase_points_with_cash(uuid) to service_role;
grant execute on function public.guild_purchase_upgrade(uuid,text) to service_role;

commit;

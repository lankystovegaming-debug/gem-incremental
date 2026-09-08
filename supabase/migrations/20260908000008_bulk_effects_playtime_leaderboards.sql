-- Bulk potion buying, playtime-aware luck leaderboard, richer AP leaderboard.

create or replace function public.buy_consumables_bulk(
  p_consumable_id text,
  p_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_qty integer := greatest(1, least(coalesce(p_quantity,1), 1000000));
  v_unit_price numeric;
  v_total numeric;
  v_money numeric;
  v_new_quantity bigint;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  v_unit_price := case p_consumable_id
    when 'lucky-potion-1' then 200
    when 'speed-potion-1' then 150
    when 'fortune-potion-1' then 200
    when 'mass-potion-1' then 300
    else null
  end;
  if v_unit_price is null then raise exception 'consumable_not_purchasable'; end if;
  select money into v_money from public.players where id=v_user for update;
  if not found then raise exception 'player_not_found'; end if;
  v_total := v_unit_price * v_qty;
  if coalesce(v_money,0) < v_total then raise exception 'insufficient_funds'; end if;
  update public.players set money = money - v_total where id=v_user returning money into v_money;
  insert into public.player_consumables(player_id, consumable_id, quantity)
  values(v_user,p_consumable_id,v_qty)
  on conflict (player_id,consumable_id)
  do update set quantity=public.player_consumables.quantity + excluded.quantity
  returning quantity into v_new_quantity;
  return jsonb_build_object('quantity_bought',v_qty,'quantity',v_new_quantity,'money',v_money);
end $$;
grant execute on function public.buy_consumables_bulk(text,integer) to authenticated;

-- Base Luck includes permanent playtime Luck upgrades using the same tier table as roll/index.ts.
drop function if exists public.get_base_luck_leaderboard(integer);
create function public.get_base_luck_leaderboard(p_limit integer default 100)
returns table(rank bigint, username text, base_luck numeric, equipped_items bigint)
language sql security definer set search_path=''
as $$
  with player_luck as (
    select p.id,p.username,
      (1::numeric + coalesce(sum(case when e.equipped then coalesce(e.luck_bonus,0)::numeric else 0 end),0::numeric)) *
      (case greatest(0,least(10,coalesce(p.playtime_luck_level,0)))
        when 0 then 1::numeric when 1 then 1.05::numeric when 2 then 1.1::numeric when 3 then 1.2::numeric
        when 4 then 1.35::numeric when 5 then 1.5::numeric when 6 then 1.75::numeric when 7 then 2::numeric
        when 8 then 2.5::numeric when 9 then 3::numeric else 4::numeric end) as base_luck,
      count(*) filter(where e.equipped) as equipped_items
    from public.players p left join public.player_equipment e on e.player_id=p.id
    where p.username is not null and coalesce(p.leaderboard_hidden,false)=false
    group by p.id,p.username,p.playtime_luck_level
  )
  select row_number() over(order by base_luck desc,username asc),username,base_luck,equipped_items
  from player_luck order by base_luck desc,username asc
  limit greatest(1,least(coalesce(p_limit,100),100));
$$;
grant execute on function public.get_base_luck_leaderboard(integer) to anon,authenticated;

-- AP board uses the same player identity + displayed gem shape as other boards.
drop function if exists public.get_achievement_points_leaderboard(integer);
create function public.get_achievement_points_leaderboard(p_limit integer default 100)
returns table(rank bigint, username text, achievement_points bigint, gem_name text, mutation_ids text[])
language sql security definer set search_path=''
as $$
  with scored as (
    select p.id,p.username,coalesce(a.achievement_points,0)::bigint as achievement_points
    from public.player_achievement_profiles a join public.players p on p.id=a.player_id
    where coalesce(p.leaderboard_hidden,false)=false and p.username is not null
  ), rows as (
    select s.*, row_number() over(order by s.achievement_points desc,s.username asc) as r
    from scored s
  )
  select rows.r,rows.username,rows.achievement_points,h.gem_name,coalesce(h.mutation_ids,'{}'::text[])
  from rows
  left join lateral (
    select gem_name,mutation_ids from public.best_roll_history h
    where h.username=rows.username order by h.rarity desc,h.created_at desc limit 1
  ) h on true
  order by rows.r limit greatest(1,least(coalesce(p_limit,100),100));
$$;
grant execute on function public.get_achievement_points_leaderboard(integer) to authenticated;

notify pgrst,'reload schema';

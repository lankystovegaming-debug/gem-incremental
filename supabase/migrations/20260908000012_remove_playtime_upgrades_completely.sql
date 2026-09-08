-- Completely remove the retired Playtime Upgrades system.
-- Safe to run on databases where earlier Playtime Upgrades migrations were already applied.

begin;

-- Remove RPCs/helpers first so player columns are no longer referenced.
drop function if exists public.buy_playtime_upgrade(text);
drop function if exists public.get_playtime_upgrades();
drop function if exists public.award_playtime_points();
drop function if exists public.playtime_upgrade_multiplier(integer);
drop function if exists public.playtime_upgrade_cost(integer);

-- Rebuild the equipment preview without the retired playtime payload.
create or replace function public.get_equipment_roll_preview()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 return jsonb_build_object(
  'crystal',public.crystal_player_effects(uid),
  'expedition',public.player_expedition_artifact_effects(uid),
  'world',public.get_active_global_event(),
  'discoveries',(select count(distinct gem_name) from public.player_gem_mutation_combinations where player_id=uid)
 );
end $$;
revoke all on function public.get_equipment_roll_preview() from public,anon;
grant execute on function public.get_equipment_roll_preview() to authenticated;

-- Base Luck no longer includes any retired Playtime Upgrade multiplier.
drop function if exists public.get_base_luck_leaderboard(integer);
create function public.get_base_luck_leaderboard(p_limit integer default 100)
returns table(rank bigint, username text, base_luck numeric, equipped_items bigint)
language sql security definer set search_path=''
as $$
  with player_luck as (
    select p.id,p.username,
      1::numeric + coalesce(sum(case when e.equipped then coalesce(e.luck_bonus,0)::numeric else 0 end),0::numeric) as base_luck,
      count(*) filter(where e.equipped) as equipped_items
    from public.players p
    left join public.player_equipment e on e.player_id=p.id
    where p.username is not null and coalesce(p.leaderboard_hidden,false)=false
    group by p.id,p.username
  )
  select row_number() over(order by base_luck desc,username asc),username,base_luck,equipped_items
  from player_luck
  order by base_luck desc,username asc
  limit greatest(1,least(coalesce(p_limit,100),100));
$$;
grant execute on function public.get_base_luck_leaderboard(integer) to anon,authenticated;

-- Remove all Playtime Upgrade storage from players.
alter table public.players drop column if exists playtime_seconds;
alter table public.players drop column if exists playtime_last_award_at;
alter table public.players drop column if exists playtime_luck_level;
alter table public.players drop column if exists playtime_mutation_level;
alter table public.players drop column if exists playtime_roll_speed_level;
alter table public.players drop column if exists playtime_money_level;
alter table public.players drop column if exists playtime_points_spent;

notify pgrst, 'reload schema';
commit;

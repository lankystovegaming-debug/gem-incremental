-- Fixes the post-sort_order schema and all public callers.
-- Run after the previous cleanup migration.

-- Recreate mutation catalog RPC without the removed sort_order column.
drop function if exists public.get_public_mutation_catalog();
create function public.get_public_mutation_catalog()
returns table (
  id text, name text, chance numeric, multiplier numeric,
  description text, icon text, color text, enabled boolean,
  updated_at timestamptz, description_credit text
)
language sql stable security definer set search_path=public as $$
  select m.id,m.name,m.chance,m.multiplier,m.description,m.icon,m.color,m.enabled,m.updated_at,m.description_credit
  from public.game_mutations m
  where m.enabled=true
  order by m.multiplier asc,m.name asc,m.id asc;
$$;
revoke all on function public.get_public_mutation_catalog() from public;
grant execute on function public.get_public_mutation_catalog() to anon,authenticated,service_role;

-- Compatibility JSON RPCs used by Gem Index.
drop function if exists public.get_public_mutation_catalog_json();
create function public.get_public_mutation_catalog_json() returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.multiplier asc,x.name asc),'[]'::jsonb)
 from public.get_public_mutation_catalog() x;
$$;
grant execute on function public.get_public_mutation_catalog_json() to anon,authenticated,service_role;

drop function if exists public.get_public_mutation_catalog_all();
create function public.get_public_mutation_catalog_all() returns jsonb
language sql stable security definer set search_path=public as $$
 select public.get_public_mutation_catalog_json();
$$;
grant execute on function public.get_public_mutation_catalog_all() to anon,authenticated,service_role;

-- The old heartbeat award RPC is no longer called by the client. Keep a safe
-- authenticated implementation for any remaining legacy callers.
drop function if exists public.award_playtime_points();
create function public.award_playtime_points() returns record
language plpgsql security definer set search_path=public as $$
declare v_id uuid:=auth.uid(); v_now timestamptz:=now(); v_elapsed bigint; r public.players%rowtype;
begin
 if v_id is null then raise exception 'not_authenticated'; end if;
 select * into r from public.players where id=v_id for update;
 if not found then raise exception 'player_not_found'; end if;
 v_elapsed:=least(300,greatest(0,floor(extract(epoch from(v_now-coalesce(r.playtime_last_award_at,v_now))))::bigint));
 update public.players set playtime_seconds=coalesce(playtime_seconds,0)+v_elapsed,playtime_last_award_at=v_now where id=v_id;
 return;
end $$;
grant execute on function public.award_playtime_points() to authenticated,service_role;

-- AP leaderboard RPC for the Edge Function and future direct use.
create or replace function public.get_achievement_points_leaderboard(p_limit integer default 100)
returns table(rank bigint, player_id uuid, username text, achievement_points integer)
language sql stable security definer set search_path=public as $$
 select dense_rank() over(order by ap.achievement_points desc),ap.player_id,p.username,ap.achievement_points
 from public.player_achievement_profiles ap join public.players p on p.id=ap.player_id
 where coalesce(p.leaderboard_hidden,false)=false
 order by ap.achievement_points desc,p.username asc limit greatest(1,least(coalesce(p_limit,100),100));
$$;
grant execute on function public.get_achievement_points_leaderboard(integer) to authenticated,service_role;

notify pgrst,'reload schema';

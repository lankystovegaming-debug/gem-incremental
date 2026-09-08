-- Fast bulk consumables + achievement/AP leaderboard performance repair.
-- Replaces the old O(quantity) bulk-consume loop with O(1) SQL work.

begin;

create or replace function public.use_consumables_bulk(p_consumable_id text, p_quantity integer)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_qty integer := greatest(1,least(coalesce(p_quantity,1),10000000));
  v_owned bigint;
  v_family text;
  v_effect numeric;
  v_tier integer := 1;
  v_seconds bigint := 60;
  v_expires timestamptz;
  v_new_quantity bigint;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  case p_consumable_id
    when 'lucky-potion-1' then v_family:='luck'; v_effect:=0.10;
    when 'speed-potion-1' then v_family:='rollSpeed'; v_effect:=0.10;
    when 'fortune-potion-1' then v_family:='weightLuck'; v_effect:=0.10;
    when 'mass-potion-1' then v_family:='weightMultiplier'; v_effect:=0.05;
    else raise exception 'bulk_consumption_not_supported';
  end case;

  select quantity into v_owned from public.player_consumables
   where player_id=v_user and consumable_id=p_consumable_id for update;
  if coalesce(v_owned,0)<v_qty then raise exception 'none_owned'; end if;

  -- Stack duration from the current expiry. This is exactly equivalent to using
  -- the same timed potion repeatedly, without calling the single-use function N times.
  select greatest(now(),coalesce(expires_at,now())) + make_interval(secs => least(v_qty::bigint*v_seconds,2147483000)::integer)
    into v_expires
  from public.player_boosts
  where player_id=v_user and family=v_family
  for update;
  if v_expires is null then
    v_expires:=now()+make_interval(secs => least(v_qty::bigint*v_seconds,2147483000)::integer);
  end if;

  update public.player_consumables
     set quantity=quantity-v_qty
   where player_id=v_user and consumable_id=p_consumable_id
   returning quantity into v_new_quantity;

  insert into public.player_boosts(player_id,family,tier,effect_value,expires_at,updated_at)
  values(v_user,v_family,v_tier,v_effect,v_expires,now())
  on conflict(player_id,family) do update set
    tier=excluded.tier,effect_value=excluded.effect_value,expires_at=excluded.expires_at,updated_at=now();

  return jsonb_build_object('quantity',coalesce(v_new_quantity,0),'quantity_used',v_qty,'family',v_family,'effect_value',v_effect,'expires_at',v_expires);
end $$;
grant execute on function public.use_consumables_bulk(text,integer) to authenticated;

-- Useful indexes for the fast read paths.
create index if not exists player_achievement_profiles_points_idx on public.player_achievement_profiles(achievement_points desc,player_id);
create index if not exists private_feature_progress_player_feature_idx on public.private_feature_progress(player_id,feature_id);
create index if not exists private_feature_definitions_kind_enabled_sort_idx on public.private_feature_definitions(feature_kind,enabled,sort_order);
create index if not exists best_roll_history_username_rarity_created_idx on public.best_roll_history(username,rarity desc,created_at desc);

-- Reading the achievement page must not recompute the entire achievement system.
-- Progress is maintained by the normal roll/game triggers; this endpoint is now read-only.
create or replace function public.get_player_achievements_v013(p_player_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare defs jsonb; prog jsonb; points integer; visible_total integer; visible_done integer; unclaimed integer; ranking bigint; milestones jsonb;
begin
  if auth.uid() is distinct from p_player_id then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(to_jsonb(d) order by d.sort_order),'[]') into defs
  from public.private_feature_definitions d
  where d.feature_kind='achievement' and (d.enabled or exists(select 1 from public.private_feature_progress p where p.player_id=p_player_id and p.feature_id=d.id and p.completed));
  select coalesce(jsonb_agg(to_jsonb(p)),'[]') into prog
  from public.private_feature_progress p join public.private_feature_definitions d on d.id=p.feature_id
  where p.player_id=p_player_id and d.feature_kind='achievement';
  select coalesce(achievement_points,0) into points from public.player_achievement_profiles where player_id=p_player_id;
  select count(*) filter(where not coalesce((d.metadata->>'hidden')::boolean,false) and (d.enabled or p.completed)),
         count(*) filter(where p.completed and not coalesce((d.metadata->>'hidden')::boolean,false)),
         count(*) filter(where p.completed and not p.reward_granted)
    into visible_total,visible_done,unclaimed
  from public.private_feature_definitions d left join public.private_feature_progress p on p.feature_id=d.id and p.player_id=p_player_id
  where d.feature_kind='achievement';
  select 1+count(*) into ranking from public.player_achievement_profiles where achievement_points>coalesce(points,0);
  select jsonb_agg(m||jsonb_build_object('unlocked',coalesce(points,0)>=(m->>'ap')::integer,'claimed',c.ap is not null) order by (m->>'ap')::integer) into milestones
  from jsonb_array_elements(public.achievement_milestones_v013()) m
  left join public.player_achievement_milestones c on c.player_id=p_player_id and c.ap=(m->>'ap')::integer;
  return jsonb_build_object('definitions',defs,'progress',prog,'summary',jsonb_build_object('ap',coalesce(points,0),'visibleCompleted',coalesce(visible_done,0),'visibleTotal',coalesce(visible_total,0),'completionPercent',case when coalesce(visible_total,0)=0 then 0 else round(100.0*coalesce(visible_done,0)/visible_total,1) end,'rank',coalesce(ranking,1),'unclaimed',coalesce(unclaimed,0)),'milestones',coalesce(milestones,'[]'));
end $$;
grant execute on function public.get_player_achievements_v013(uuid) to authenticated;

-- AP leaderboard: rank the small AP table first, then perform indexed best-gem lookups.
drop function if exists public.get_achievement_points_leaderboard(integer);
create function public.get_achievement_points_leaderboard(p_limit integer default 100)
returns table(rank bigint,username text,achievement_points bigint,gem_name text,mutation_ids text[])
language sql security definer set search_path=''
as $$
  with top_players as (
    select p.id,p.username,ap.achievement_points::bigint,
           row_number() over(order by ap.achievement_points desc,p.username asc) as rank
    from public.player_achievement_profiles ap
    join public.players p on p.id=ap.player_id
    where p.username is not null and coalesce(p.leaderboard_hidden,false)=false
    order by ap.achievement_points desc,p.username asc
    limit greatest(1,least(coalesce(p_limit,100),100))
  )
  select t.rank,t.username,t.achievement_points,h.gem_name,coalesce(h.mutation_ids,'{}'::text[])
  from top_players t
  left join lateral (
    select gem_name,mutation_ids from public.best_roll_history h
    where h.username=t.username
    order by h.rarity desc,h.created_at desc
    limit 1
  ) h on true
  order by t.rank;
$$;
grant execute on function public.get_achievement_points_leaderboard(integer) to authenticated,service_role;

notify pgrst,'reload schema';
commit;

-- Return the Research Tree immediately. Source reconciliation is retained in
-- a separate RPC so the initial page render never waits for a player's full
-- discovery and achievement history to be scanned.

create or replace function public.get_research_tree_v014(p_player_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; ap integer; cooldown timestamptz; spent integer; resets integer;
begin
  perform public.ensure_research_profile_v014(p_player_id);
  select coalesce(achievement_points,0) into ap from public.player_achievement_profiles where player_id=p_player_id;
  select points_spent,reset_count,last_reset_at+interval '7 days' into spent,resets,cooldown from public.player_research_profiles where player_id=p_player_id;
  select jsonb_build_object(
    'nodes',(select coalesce(jsonb_agg(to_jsonb(n) order by sort_order),'[]') from public.research_nodes n where enabled),
    'purchases',(select coalesce(jsonb_agg(node_id),'[]') from public.player_research_purchases where player_id=p_player_id),
    'profile',(select to_jsonb(p) from public.player_research_profiles p where player_id=p_player_id),
    'effects',(select to_jsonb(e)-'player_id' from public.player_research_effects e where player_id=p_player_id),
    'achievementPoints',coalesce(ap,0),
    'reset',jsonb_build_object('cost',least(50000000,greatest(2000000,spent*25000))*case when resets=0 then 1 when resets=1 then 1.5 else 2 end,'availableAt',cooldown)
  ) into result;
  return result;
end$$;

create or replace function public.refresh_research_tree_v014(p_player_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.sync_research_sources_v014(p_player_id);
  return public.get_research_tree_v014(p_player_id);
end$$;

revoke all on function public.refresh_research_tree_v014(uuid) from public, anon, authenticated;
grant execute on function public.refresh_research_tree_v014(uuid) to service_role;

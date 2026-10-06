begin;

create function public.gemdle_lifetime_rarity_score(p_player_id uuid)
returns double precision
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(r.overall_rarity), 0)::double precision
  from public.gemdle_results r
  where r.player_id = p_player_id;
$$;

revoke all on function public.gemdle_lifetime_rarity_score(uuid) from public, anon, authenticated;
grant execute on function public.gemdle_lifetime_rarity_score(uuid) to service_role;

commit;

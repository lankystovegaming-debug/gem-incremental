begin;
-- Discovery-aware index: undiscovered rows contain no frequency/rules/name.
-- Distortion has no row at all until its first committed genuine roll.
create function public.get_biome_index() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'serverTime',statement_timestamp(),
  'tournament',coalesce((select settings->'biomeTournamentMode' from public.player_settings where player_id=auth.uid()),'false'::jsonb),
  'active',(select jsonb_build_object('id',o.id,'key',o.biome_key,'startsAt',o.starts_at,'endsAt',o.ends_at)
   from public.biome_scheduler s join public.biome_occurrences o on o.id=s.occurrence_id
   where o.starts_at<=statement_timestamp() and o.ends_at>statement_timestamp()),
  'entries',coalesce((select jsonb_agg(
   case when d.player_id is null then jsonb_build_object('slot',b.ordinal,'discovered',false)
   else jsonb_build_object('slot',b.ordinal,'key',b.key,'discovered',true,'phenomenon',b.phenomenon,
    'durationMinutes',b.duration_minutes,'meanIntervalMinutes',b.interval_minutes,
    'discoveredAt',d.discovered_at,
    'gems',(select jsonb_agg(jsonb_build_object('name',r.gem_name,'denominator',r.denominator,
     'exclusive',r.exclusive) order by r.denominator,r.gem_name) from public.biome_gem_rules r where r.biome_key=b.key)) end
   order by b.ordinal)
  from public.biome_definitions b left join public.player_biome_discoveries d
   on d.biome_key=b.key and d.player_id=auth.uid()
  where not b.phenomenon or d.player_id is not null),'[]'::jsonb)
 );
$$;
revoke all on function public.get_biome_index() from public,anon;
grant execute on function public.get_biome_index() to authenticated;
commit;

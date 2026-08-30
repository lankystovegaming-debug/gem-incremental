-- Some legacy player_seasons rows contain a scalar claimed_tiers value or a
-- malformed tier token. The achievement refresh expands and casts that data,
-- so one bad player row can fail only that player's entire dashboard.

begin;

do $block$
begin
  if to_regprocedure('public.refresh_player_achievements_v013_legacy(uuid)') is null then
    alter function public.refresh_player_achievements_v013(uuid)
      rename to refresh_player_achievements_v013_legacy;
  end if;
end
$block$;

create or replace function public.refresh_player_achievements_v013(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is not null and auth.uid() is distinct from p_uid then
    raise exception 'forbidden';
  end if;

  -- Keep valid string or numeric entries ending in a reasonably sized tier
  -- number. Scalars, objects, nulls and unsafe integer-sized suffixes become
  -- an empty array instead of aborting the achievement request.
  with normalized as (
    select
      ps.player_id,
      ps.season_id,
      coalesce(
        (
          select jsonb_agg(entry order by ordinal)
          from jsonb_array_elements(
            case
              when jsonb_typeof(ps.claimed_tiers) = 'array' then ps.claimed_tiers
              else '[]'::jsonb
            end
          ) with ordinality as entries(entry, ordinal)
          where jsonb_typeof(entry) in ('string', 'number')
            and entry #>> '{}' ~ '[0-9]{1,9}$'
        ),
        '[]'::jsonb
      ) as claimed_tiers
    from public.player_seasons ps
    where ps.player_id = p_uid
  )
  update public.player_seasons ps
  set claimed_tiers = normalized.claimed_tiers
  from normalized
  where ps.player_id = normalized.player_id
    and ps.season_id = normalized.season_id
    and ps.claimed_tiers is distinct from normalized.claimed_tiers;

  perform public.refresh_player_achievements_v013_legacy(p_uid);
end;
$function$;

revoke all on function public.refresh_player_achievements_v013(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_player_achievements_v013(uuid)
  to service_role;

commit;

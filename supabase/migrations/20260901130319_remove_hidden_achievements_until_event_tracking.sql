begin;

-- Hidden achievements are intentionally withdrawn until a dedicated,
-- versioned event ledger is implemented and verified. Delete the definitions
-- rather than disabling them so stale progress cannot reappear later.
delete from public.private_feature_definitions
where feature_kind = 'achievement'
  and coalesce((metadata->>'hidden')::boolean, false);

-- Stop collecting data into the experimental shared boolean cache. The tables
-- remain only because historical migration functions depend on their rowtypes;
-- they are emptied and no longer connected to the roll path.
drop trigger if exists track_secret_roll_progress_v1_trg on public.best_roll_history;
truncate table public.player_secret_roll_signatures,
  public.player_secret_roll_progress,
  public.secret_roll_backfill_state;
update public.secret_roll_backfill_config set cutoff_id = 0 where singleton;

revoke all on function public.accumulate_secret_roll_progress_v1(
  bigint,uuid,text,numeric,numeric,text[],numeric,numeric,numeric,bigint
) from public,anon,authenticated,service_role;
revoke all on function public.track_secret_roll_progress_v1()
  from public,anon,authenticated,service_role;
revoke all on function public.backfill_secret_roll_progress_v1(uuid,integer)
  from public,anon,authenticated,service_role;

-- Restore the visible-only authoritative refresh. This bypasses every previous
-- secret wrapper and prevents deleted definitions from being recreated or
-- progressed by a dashboard load.
create or replace function public.refresh_player_achievements_v013(p_uid uuid)
returns void language plpgsql security definer set search_path='' as $function$
begin
  if auth.uid() is not null and auth.uid() is distinct from p_uid then
    raise exception 'forbidden';
  end if;
  perform public.refresh_player_achievements_v013_pre_secret_rework(p_uid);
end;
$function$;

revoke all on function public.refresh_player_achievements_v013(uuid)
  from public,anon,authenticated;
grant execute on function public.refresh_player_achievements_v013(uuid)
  to service_role;

-- Definition deletion cascades every hidden progress row. Rebuild AP from the
-- remaining ledger, removing hidden AP regardless of claim status while leaving
-- already delivered reward inventory untouched.
insert into public.player_achievement_profiles(player_id,achievement_points,updated_at)
select player.id,coalesce(sum(progress.achievement_points_awarded),0)::integer,now()
from public.players player
left join public.private_feature_progress progress on progress.player_id=player.id
group by player.id
on conflict(player_id) do update set
  achievement_points=excluded.achievement_points,
  updated_at=excluded.updated_at;

commit;

-- Apply the current expedition recount after every older achievement layer.
create or replace function public.refresh_player_achievements_v013(p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and auth.uid() is distinct from p_uid then
    raise exception 'forbidden';
  end if;

  perform public.refresh_player_achievements_v013_pre_secret_rework(p_uid);
  perform public.sync_current_expedition_achievements_v013(p_uid);
end;
$$;

revoke all on function public.refresh_player_achievements_v013(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_player_achievements_v013(uuid)
  to service_role;

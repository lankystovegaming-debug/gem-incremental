-- Keep the optimized roll's single RPC, but dispatch to every active destination.
-- Each destination retains its own locking, mode routing and progress rules.
begin;

create or replace function public.record_abandoned_mine_roll(
  p_player_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1 from public.volcanic_depth_runs
    where player_id = p_player_id and status = 'active'
  ) then
    perform public.record_volcanic_depth_roll(p_player_id, p_payload);
  end if;

  if exists (
    select 1 from public.crystal_cavern_runs
    where player_id = p_player_id and status = 'active'
  ) then
    perform public.record_crystal_cavern_roll(p_player_id, p_payload);
  end if;

  if exists (
    select 1 from public.abandoned_mine_runs
    where player_id = p_player_id and mode = 'hell' and status = 'active'
  ) then
    perform public.record_abandoned_mine_hell_roll(p_player_id, p_payload);
  else
    perform public.record_normal_abandoned_mine_roll(p_player_id, p_payload);
  end if;
end;
$function$;

-- Only the trusted roll backend may submit progress.
revoke all on function public.record_abandoned_mine_roll(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_abandoned_mine_roll(uuid, jsonb)
  to service_role;

commit;

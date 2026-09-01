-- Allow Stabilisation Outposts to be skipped without buying a service.
create or replace function public.skip_crystal_outpost(p_run_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.crystal_cavern_runs;
begin
  select * into r
  from public.crystal_cavern_runs
  where id = p_run_id
    and player_id = auth.uid()
  for update;

  if not found
    or r.status <> 'decision'
    or coalesce(r.pending->>'type', '') <> 'outpost'
    or r.depth not in (3, 6, 9)
  then
    raise exception 'crystal_outpost_unavailable';
  end if;

  r.event_log := public.crystal_log(
    r.event_log,
    'event',
    'Skipped the D' || r.depth || ' Stabilisation Outpost'
  );

  update public.crystal_cavern_runs
  set status = 'awaiting_funding',
      pending = null,
      event_log = r.event_log,
      updated_at = now()
  where id = r.id
  returning * into r;

  return to_jsonb(r);
end
$$;

revoke all on function public.skip_crystal_outpost(bigint) from public, anon;
grant execute on function public.skip_crystal_outpost(bigint) to authenticated;

-- Hell Danger is volatile but does not passively change when descending.
-- Preserve the completed depth's Danger while still respecting any persistent
-- Danger floor. The previous function reset Danger to the floor on D2-D10.

create or replace function public.fund_abandoned_mine_hell(p_depth integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid();
  v_run public.abandoned_mine_runs;
  v_config jsonb:=public.abandoned_mine_hell_config();
  v_cost numeric;
  v_money numeric;
  v_state jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated';end if;
  perform pg_advisory_xact_lock(hashtext('abandoned-mine:'||v_uid::text));
  select * into v_run from public.abandoned_mine_runs
    where player_id=v_uid and status<>'settled' for update;
  if not found then
    perform public.start_abandoned_mine_hell();
    select * into v_run from public.abandoned_mine_runs
      where player_id=v_uid and status<>'settled' for update;
  end if;
  if v_run.mode<>'hell' or p_depth<>v_run.depth+1 or p_depth not between 1 and 10 or
    not (v_run.depth=0 or (v_run.status='ready_to_extract' and v_run.overdepth=0 and v_run.depth<10)) then
    raise exception 'hell_depth_out_of_sequence';
  end if;
  v_cost:=(select (value#>>'{}')::numeric
    from jsonb_array_elements(v_config->'depthCosts') with ordinality a(value,n)
    where n=p_depth);
  update public.players p
    set money=p.money-v_cost
    where p.id=v_uid and p.money>=v_cost
    returning p.money into v_money;
  if not found then raise exception 'insufficient_funds';end if;
  v_state:=public.abandoned_mine_hell_prepare_depth(v_run,p_depth,0);
  insert into public.abandoned_mine_funding(run_id,depth,amount)
    values(v_run.id,p_depth,v_cost);
  update public.abandoned_mine_runs set
    depth=p_depth,
    progress=0,
    target=ceil(coalesce(
      (v_state->'objective'->>'fallback')::numeric,
      (v_state->'objective'->>'target')::numeric))::integer,
    danger=greatest(v_run.danger,coalesce((v_state->>'dangerFloor')::integer,0)),
    status='active',
    hell_state=v_state,
    total_funding=total_funding+v_cost,
    updated_at=now()
    where id=v_run.id returning * into v_run;
  perform public.abandoned_mine_hell_log(
    v_run,'depth_enter',jsonb_build_object(
      'objective',v_state->'objective','event',v_state->'event'),v_cost);
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money);
end $$;

revoke all on function public.fund_abandoned_mine_hell(integer) from public,anon;
grant execute on function public.fund_abandoned_mine_hell(integer) to authenticated;

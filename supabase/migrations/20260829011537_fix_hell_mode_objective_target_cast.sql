-- Weight Hunt and Combined objectives may use decimal targets such as 2.5x.
-- abandoned_mine_runs.target is retained as an integer compatibility/display
-- field for the normal Mine, while the authoritative Hell target lives in
-- hell_state. Round only the compatibility value instead of casting decimal
-- JSON text directly to integer.

create or replace function public.fund_abandoned_mine_hell(p_depth integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.abandoned_mine_runs; cfg jsonb:=public.abandoned_mine_hell_config(); cost numeric; money numeric; state jsonb;
begin
  if uid is null then raise exception 'not_authenticated';end if;perform pg_advisory_xact_lock(hashtext('abandoned-mine:'||uid::text));
  select * into r from public.abandoned_mine_runs where player_id=uid and status<>'settled' for update;
  if not found then perform public.start_abandoned_mine_hell();select * into r from public.abandoned_mine_runs where player_id=uid and status<>'settled' for update;end if;
  if r.mode<>'hell' or p_depth<>r.depth+1 or p_depth not between 1 and 10 or
    not (r.depth=0 or (r.status='ready_to_extract' and r.overdepth=0 and r.depth<10)) then raise exception 'hell_depth_out_of_sequence';end if;
  cost:=(select (value#>>'{}')::numeric from jsonb_array_elements(cfg->'depthCosts') with ordinality a(value,n) where n=p_depth);
  update public.players set money=money-cost where id=uid and money>=cost returning money into money;if not found then raise exception 'insufficient_funds';end if;
  state:=public.abandoned_mine_hell_prepare_depth(r,p_depth,0);
  insert into public.abandoned_mine_funding(run_id,depth,amount) values(r.id,p_depth,cost);
  update public.abandoned_mine_runs set depth=p_depth,progress=0,
    target=ceil(coalesce((state->'objective'->>'fallback')::numeric,(state->'objective'->>'target')::numeric))::integer,
    danger=greatest(0,coalesce((state->>'dangerFloor')::integer,0)),status='active',hell_state=state,total_funding=total_funding+cost,updated_at=now() where id=r.id returning * into r;
  perform public.abandoned_mine_hell_log(r,'depth_enter',jsonb_build_object('objective',state->'objective','event',state->'event'),cost);
  return jsonb_build_object('run',to_jsonb(r),'money',money);
end $$;

revoke all on function public.fund_abandoned_mine_hell(integer) from public,anon;
grant execute on function public.fund_abandoned_mine_hell(integer) to authenticated;

-- Correct the Abandoned Mine D1-D10 balance values to the approved v1 table.
-- Keep the original migration immutable and preserve funding ledger history.

create or replace function public.abandoned_mine_depth_cost(p_depth integer)
returns numeric language sql immutable set search_path='' as $$
  select (array[100000,150000,250000,400000,650000,1000000,1600000,2500000,4000000,6500000]::numeric[])[p_depth]
$$;

create or replace function public.abandoned_mine_depth_target(p_depth integer, p_overdepth integer default 0)
returns integer language sql immutable set search_path='' as $$
  select case
    when p_depth between 1 and 10 then
      (array[100,150,200,275,350,450,575,725,900,1100]::integer[])[p_depth]
      + case when p_depth=10 then greatest(0,p_overdepth)*35 else 0 end
  end
$$;

create or replace function public.abandoned_mine_base_danger(p_depth integer)
returns integer language sql immutable set search_path='' as $$
  select (array[0,5,10,18,27,38,50,63,75,85]::integer[])[p_depth]
$$;

create or replace function public.get_abandoned_mine_dashboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_run jsonb; v_history jsonb; v_artifacts jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select to_jsonb(r) into v_run from public.abandoned_mine_runs r
    where r.player_id=v_uid and r.status<>'settled' order by r.id desc limit 1;
  select coalesce(jsonb_agg(to_jsonb(h) order by h.started_at desc),'[]'::jsonb) into v_history
    from (select id,status,depth,overdepth,total_funding,extraction_reason,settlement,started_at,settled_at
      from public.abandoned_mine_runs where player_id=v_uid and status='settled' order by started_at desc limit 12) h;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.registered_at desc),'[]'::jsonb) into v_artifacts
    from public.museum_artifact_registrations a where a.player_id=v_uid;
  return jsonb_build_object(
    'destination',jsonb_build_object('id','abandoned-mine','name','Abandoned Mine','available',true),
    'wipDestinations',jsonb_build_array('Crystal Caverns','Volcanic Depths','Ancient Ruins','Lost Jungle'),
    'run',v_run,'history',v_history,'artifacts',v_artifacts,
    'fundingCosts',to_jsonb(array[100000,150000,250000,400000,650000,1000000,1600000,2500000,4000000,6500000]::numeric[]),
    'progressTargets',to_jsonb(array[100,150,200,275,350,450,575,725,900,1100]::integer[]),
    'baseDanger',to_jsonb(array[0,5,10,18,27,38,50,63,75,85]::integer[]),
    'campDepths',jsonb_build_array(3,6,9),'routeDepths',jsonb_build_array(4,7));
end $$;

create or replace function public.fund_abandoned_mine(p_depth integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_run public.abandoned_mine_runs; v_cost numeric; v_money numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('abandoned-mine:'||v_uid::text));
  select * into v_run from public.abandoned_mine_runs where player_id=v_uid and status<>'settled' for update;
  if not found then
    if p_depth<>1 then raise exception 'mine_depth_out_of_sequence'; end if;
    insert into public.abandoned_mine_runs(player_id) values(v_uid) returning * into v_run;
  end if;
  if v_run.status<>'awaiting_funding' or p_depth<>v_run.depth+1 or p_depth not between 1 and 10 then
    raise exception 'mine_depth_out_of_sequence';
  end if;
  v_cost:=public.abandoned_mine_depth_cost(p_depth);
  update public.players set money=money-v_cost where id=v_uid and money>=v_cost returning money into v_money;
  if not found then raise exception 'insufficient_funds'; end if;
  insert into public.abandoned_mine_funding(run_id,depth,amount) values(v_run.id,p_depth,v_cost);
  update public.abandoned_mine_runs set depth=p_depth,progress=0,
    target=public.abandoned_mine_depth_target(p_depth,0),status='active',
    danger=public.abandoned_mine_base_danger(p_depth),total_funding=total_funding+v_cost,updated_at=now()
    where id=v_run.id returning * into v_run;
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money);
end $$;

-- Correct stages that have been funded but have not received any progress yet.
-- Runs already in progress retain their live Danger/modifiers and earned progress.
update public.abandoned_mine_runs
set target=public.abandoned_mine_depth_target(depth,overdepth),
    danger=public.abandoned_mine_base_danger(depth),
    updated_at=now()
where status='active' and progress=0 and overdepth=0 and depth between 1 and 10;

-- Every normal-depth run receives the corrected target. Progress is deliberately
-- retained, including progress above the old (incorrectly low) target.
update public.abandoned_mine_runs
set target=public.abandoned_mine_depth_target(depth,overdepth),updated_at=now()
where status in ('active','awaiting_funding','awaiting_route','ready_to_extract')
  and overdepth=0 and depth between 1 and 10;

revoke all on function public.abandoned_mine_depth_cost(integer),
  public.abandoned_mine_depth_target(integer,integer),public.abandoned_mine_base_danger(integer)
  from public,anon,authenticated;
revoke all on function public.get_abandoned_mine_dashboard(),public.fund_abandoned_mine(integer)
  from public,anon;
grant execute on function public.get_abandoned_mine_dashboard(),public.fund_abandoned_mine(integer)
  to authenticated;

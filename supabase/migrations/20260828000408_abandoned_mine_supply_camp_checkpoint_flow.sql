-- Split completed D3/D6/D9 checkpoints into explicit, one-use decisions.
-- Prices and Danger relief are server-owned; clients only render dashboard data.

alter table public.abandoned_mine_runs
  drop constraint if exists abandoned_mine_runs_status_check;
alter table public.abandoned_mine_runs
  add constraint abandoned_mine_runs_status_check check (status in (
    'awaiting_funding','active','checkpoint_decision','awaiting_route',
    'ready_to_extract','extracted','forced_extraction','settled'));

create or replace function public.abandoned_mine_checkpoint_secure_cost(p_depth integer)
returns numeric language sql immutable set search_path='' as $$
  select case p_depth when 3 then 150000 when 6 then 750000 when 9 then 3000000 end
$$;

create or replace function public.abandoned_mine_checkpoint_resupply_cost(p_depth integer)
returns numeric language sql immutable set search_path='' as $$
  select case p_depth when 3 then 300000 when 6 then 1250000 when 9 then 5000000 end
$$;

create or replace function public.abandoned_mine_checkpoint_danger_relief(p_depth integer)
returns integer language sql immutable set search_path='' as $$
  select case p_depth when 3 then 20 when 6 then 20 when 9 then 20 end
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
    'checkpointServices',jsonb_build_object(
      '3',jsonb_build_object('secureCost',public.abandoned_mine_checkpoint_secure_cost(3),'resupplyCost',public.abandoned_mine_checkpoint_resupply_cost(3),'dangerRelief',public.abandoned_mine_checkpoint_danger_relief(3)),
      '6',jsonb_build_object('secureCost',public.abandoned_mine_checkpoint_secure_cost(6),'resupplyCost',public.abandoned_mine_checkpoint_resupply_cost(6),'dangerRelief',public.abandoned_mine_checkpoint_danger_relief(6)),
      '9',jsonb_build_object('secureCost',public.abandoned_mine_checkpoint_secure_cost(9),'resupplyCost',public.abandoned_mine_checkpoint_resupply_cost(9),'dangerRelief',public.abandoned_mine_checkpoint_danger_relief(9))),
    'campDepths',jsonb_build_array(3,6,9),'routeDepths',jsonb_build_array(4,7));
end $$;

create or replace function public.record_abandoned_mine_roll(p_player_id uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_run public.abandoned_mine_runs; v_progress integer := 1;
  v_rarity numeric := greatest(0,coalesce((p_payload->>'rarity')::numeric,0));
  v_weight numeric := greatest(0,coalesce((p_payload->>'weightMultiplier')::numeric,0));
  v_mutations jsonb := coalesce(p_payload->'mutationIds','[]'::jsonb);
  v_new_progress integer; v_multiplier numeric; v_value numeric; v_cargo jsonb; v_artifact jsonb;
begin
  select * into v_run from public.abandoned_mine_runs
    where player_id=p_player_id and status='active' for update;
  if not found then return; end if;
  if v_rarity >= 50 then v_progress:=v_progress+1; end if;
  if v_rarity >= 1000 then v_progress:=v_progress+3; end if;
  if v_rarity >= 10000 then v_progress:=v_progress+7; end if;
  if jsonb_array_length(v_mutations)>0 then v_progress:=v_progress+3; end if;
  if v_weight>=2 then v_progress:=v_progress+3; end if;
  v_new_progress:=least(v_run.target,v_run.progress+v_progress);
  if v_run.progress<v_run.target and v_new_progress>=v_run.target then
    v_multiplier:=case when v_run.route_d4='rich_vein' then 1.25 else 1 end
      * case when v_run.route_d7='unstable_descent' then 1.4 else 1 end * (1+v_run.overdepth*.2);
    v_value:=round((1000+random()*3500)*v_run.depth*v_multiplier);
    v_cargo:=jsonb_build_object('kind','cargo','name',coalesce(p_payload->>'gemName','Relic fragments'),
      'value',v_value,'depth',v_run.depth,'overdepth',v_run.overdepth);
    v_run.unsecured_cargo:=v_run.unsecured_cargo||jsonb_build_array(v_cargo);
    if random()<least(.08,.004+v_run.depth*.002+v_run.overdepth*.003) then
      v_artifact:=public.abandoned_mine_artifact(v_run.depth,v_run.overdepth);
      v_run.protected_discoveries:=v_run.protected_discoveries||jsonb_build_array(v_artifact);
    end if;
  end if;
  update public.abandoned_mine_runs set progress=v_new_progress,
    unsecured_cargo=v_run.unsecured_cargo,protected_discoveries=v_run.protected_discoveries,
    status=case when v_new_progress>=target and depth in (3,6,9)
        and not (v_run.camps @> to_jsonb(array[v_run.depth])) then 'checkpoint_decision'
      when v_new_progress>=target and depth in (4,7) then 'awaiting_route'
      when v_new_progress>=target and depth=10 then 'ready_to_extract'
      when v_new_progress>=target then 'awaiting_funding' else status end,updated_at=now()
    where id=v_run.id;
end $$;

create or replace function public.choose_abandoned_mine_camp_service(p_run_id bigint,p_service text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_run public.abandoned_mine_runs; v_cost numeric; v_money numeric; v_relief integer:=0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_service not in ('secure','resupply') then raise exception 'invalid_camp_service'; end if;
  perform pg_advisory_xact_lock(hashtext('abandoned-mine:'||v_uid::text));
  select * into v_run from public.abandoned_mine_runs where id=p_run_id and player_id=v_uid for update;
  if not found or v_run.status<>'checkpoint_decision' or v_run.depth not in (3,6,9)
     or v_run.progress<v_run.target or v_run.camps @> to_jsonb(array[v_run.depth]) then
    raise exception 'supply_camp_unavailable';
  end if;
  if p_service='secure' then v_cost:=public.abandoned_mine_checkpoint_secure_cost(v_run.depth);
  else
    v_cost:=public.abandoned_mine_checkpoint_resupply_cost(v_run.depth);
    v_relief:=public.abandoned_mine_checkpoint_danger_relief(v_run.depth);
  end if;
  update public.players set money=money-v_cost where id=v_uid and money>=v_cost returning money into v_money;
  if not found then raise exception 'insufficient_funds'; end if;
  update public.abandoned_mine_runs set camps=camps||jsonb_build_array(v_run.depth),
    secured_cargo=secured_cargo||unsecured_cargo,unsecured_cargo='[]'::jsonb,
    danger_modifier=danger_modifier-v_relief,
    danger=public.abandoned_mine_effective_danger(depth,danger_modifier-v_relief),
    status='awaiting_funding',updated_at=now() where id=v_run.id returning * into v_run;
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money,'cost',v_cost,'service',p_service);
end $$;

-- Funding a checkpoint's next depth is the explicit "skip services" choice.
create or replace function public.fund_abandoned_mine(p_depth integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_run public.abandoned_mine_runs; v_cost numeric; v_money numeric;
  v_incident text:=null; v_severity_roll numeric; v_loss integer:=0; v_unsecured jsonb; v_modifier integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('abandoned-mine:'||v_uid::text));
  select * into v_run from public.abandoned_mine_runs where player_id=v_uid and status<>'settled' for update;
  if not found then
    if p_depth<>1 then raise exception 'mine_depth_out_of_sequence'; end if;
    insert into public.abandoned_mine_runs(player_id) values(v_uid) returning * into v_run;
  end if;
  if v_run.status not in ('awaiting_funding','checkpoint_decision') or p_depth<>v_run.depth+1
     or p_depth not between 1 and 10 then raise exception 'mine_depth_out_of_sequence'; end if;
  if v_run.status='checkpoint_decision' and (v_run.depth not in (3,6,9) or v_run.progress<v_run.target) then
    raise exception 'mine_depth_out_of_sequence';
  end if;
  v_cost:=public.abandoned_mine_depth_cost(p_depth);
  update public.players set money=money-v_cost where id=v_uid and money>=v_cost returning money into v_money;
  if not found then raise exception 'insufficient_funds'; end if;
  insert into public.abandoned_mine_funding(run_id,depth,amount) values(v_run.id,p_depth,v_cost);
  v_unsecured:=v_run.unsecured_cargo; v_modifier:=v_run.danger_modifier;
  if random()<v_run.danger::numeric/100 then
    v_severity_roll:=random();
    v_incident:=case when v_severity_roll<.65 then 'minor' when v_severity_roll<.92 then 'major' else 'critical' end;
    v_loss:=case v_incident when 'minor' then least(1,jsonb_array_length(v_unsecured))
      when 'major' then greatest(1,jsonb_array_length(v_unsecured)/2) else jsonb_array_length(v_unsecured) end;
    v_loss:=least(v_loss,jsonb_array_length(v_unsecured));
    if v_loss>0 then select coalesce(jsonb_agg(value order by n),'[]'::jsonb) into v_unsecured
      from jsonb_array_elements(v_unsecured) with ordinality x(value,n) where n>v_loss; end if;
    if v_incident='major' then v_modifier:=v_modifier+5; end if;
  end if;
  update public.abandoned_mine_runs set total_funding=total_funding+v_cost,
    camps=case when v_run.status='checkpoint_decision' and not (camps @> to_jsonb(array[v_run.depth]))
      then camps||jsonb_build_array(v_run.depth) else camps end,
    danger_modifier=v_modifier,unsecured_cargo=v_unsecured,
    incident_log=case when v_incident is null then incident_log else incident_log||jsonb_build_array(
      jsonb_build_object('severity',v_incident,'depth',p_depth,'fromDepth',depth,'overdepth',overdepth,'lost',v_loss,'at',now())) end,
    depth=case when v_incident='critical' then depth else p_depth end,
    progress=case when v_incident='critical' then progress else 0 end,
    target=case when v_incident='critical' then target else public.abandoned_mine_depth_target(p_depth,0) end,
    danger=case when v_incident='critical' then danger else public.abandoned_mine_effective_danger(p_depth,v_modifier) end,
    status=case when v_incident='critical' then 'forced_extraction' else 'active' end,
    extraction_reason=case when v_incident='critical' then 'critical_incident' else extraction_reason end,
    extracted_at=case when v_incident='critical' then now() else extracted_at end,updated_at=now()
    where id=v_run.id returning * into v_run;
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money,'incident',v_incident);
end $$;

-- Repair deployed open runs without exposing a camp during active progress.
update public.abandoned_mine_runs set status='active',updated_at=now()
where depth between 1 and 10 and progress<target and status='awaiting_funding';

update public.abandoned_mine_runs set status='checkpoint_decision',updated_at=now()
where depth in (3,6,9) and progress>=target and status='awaiting_funding'
  and not (camps @> to_jsonb(array[depth]));

drop function if exists public.build_abandoned_mine_camp(bigint);
revoke all on function public.abandoned_mine_checkpoint_secure_cost(integer),
  public.abandoned_mine_checkpoint_resupply_cost(integer),
  public.abandoned_mine_checkpoint_danger_relief(integer),
  public.record_abandoned_mine_roll(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_abandoned_mine_roll(uuid,jsonb) to service_role;
revoke all on function public.get_abandoned_mine_dashboard(),public.fund_abandoned_mine(integer),
  public.choose_abandoned_mine_camp_service(bigint,text) from public,anon;
grant execute on function public.get_abandoned_mine_dashboard(),public.fund_abandoned_mine(integer),
  public.choose_abandoned_mine_camp_service(bigint,text) to authenticated;

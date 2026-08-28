-- Restore the approved Abandoned Mine state machine without rewriting the
-- deployed expedition migrations. Rolls advance active stages only. Incidents
-- are resolved by descent actions, and rewards are created once per completed
-- depth.

alter table public.abandoned_mine_runs
  add column if not exists danger_modifier integer not null default 0;

create or replace function public.abandoned_mine_route_camp_modifier(
  p_depth integer,
  p_overdepth integer,
  p_route_d4 text,
  p_route_d7 text,
  p_camps jsonb
)
returns integer language sql immutable set search_path='' as $$
  select
    case when p_depth >= 4 then case p_route_d4
      when 'rich_vein' then 12 when 'reinforced_tunnel' then -10 else 0 end else 0 end
    + case when p_depth >= 7 then case p_route_d7
      when 'unstable_descent' then 16 when 'supply_line' then -12 else 0 end else 0 end
    - 20 * (select count(*)::integer from jsonb_array_elements(coalesce(p_camps, '[]'::jsonb)) camp
      where (camp.value)::text::integer <= p_depth)
    + greatest(0, p_overdepth) * 15
$$;

create or replace function public.abandoned_mine_effective_danger(
  p_depth integer,
  p_modifier integer
)
returns integer language sql immutable set search_path='' as $$
  select greatest(0, least(100,
    coalesce(public.abandoned_mine_base_danger(p_depth), 0) + coalesce(p_modifier, 0)))
$$;

-- Per-roll Danger and incidents were invalid. Reconstruct open runs solely
-- from the approved base table and explicit route/camp/overdepth choices.
update public.abandoned_mine_runs r
set danger_modifier = public.abandoned_mine_route_camp_modifier(
      r.depth, r.overdepth, r.route_d4, r.route_d7, r.camps),
    danger = public.abandoned_mine_effective_danger(
      r.depth,
      public.abandoned_mine_route_camp_modifier(
        r.depth, r.overdepth, r.route_d4, r.route_d7, r.camps)),
    updated_at = now()
where r.status in ('awaiting_funding','active','awaiting_route','ready_to_extract');

create or replace function public.record_abandoned_mine_roll(p_player_id uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_run public.abandoned_mine_runs;
  v_progress integer := 1;
  v_rarity numeric := greatest(0, coalesce((p_payload->>'rarity')::numeric, 0));
  v_weight numeric := greatest(0, coalesce((p_payload->>'weightMultiplier')::numeric, 0));
  v_mutations jsonb := coalesce(p_payload->'mutationIds', '[]'::jsonb);
  v_new_progress integer;
  v_multiplier numeric;
  v_value numeric;
  v_cargo jsonb;
  v_artifact jsonb;
begin
  select * into v_run
  from public.abandoned_mine_runs
  where player_id=p_player_id and status='active'
  for update;
  if not found then return; end if;

  -- Every condition is additive: a Mythic, mutated, 2x specimen earns 18.
  if v_rarity >= 50 then v_progress := v_progress + 1; end if;       -- Rare+
  if v_rarity >= 1000 then v_progress := v_progress + 3; end if;     -- Legendary+
  if v_rarity >= 10000 then v_progress := v_progress + 7; end if;    -- Mythic+
  if jsonb_array_length(v_mutations) > 0 then v_progress := v_progress + 3; end if;
  if v_weight >= 2 then v_progress := v_progress + 3; end if;

  v_new_progress := least(v_run.target, v_run.progress + v_progress);

  -- A completed depth creates one economic discovery and then rolls its
  -- independent artifact opportunity. Ordinary rolls create neither.
  if v_run.progress < v_run.target and v_new_progress >= v_run.target then
    v_multiplier := case when v_run.route_d4='rich_vein' then 1.25 else 1 end
      * case when v_run.route_d7='unstable_descent' then 1.4 else 1 end
      * (1 + v_run.overdepth * .2);
    v_value := round((1000 + random() * 3500) * v_run.depth * v_multiplier);
    v_cargo := jsonb_build_object(
      'kind','cargo','name',coalesce(p_payload->>'gemName','Relic fragments'),
      'value',v_value,'depth',v_run.depth,'overdepth',v_run.overdepth);
    v_run.unsecured_cargo := v_run.unsecured_cargo || jsonb_build_array(v_cargo);

    if random() < least(.08,.004+v_run.depth*.002+v_run.overdepth*.003) then
      v_artifact := public.abandoned_mine_artifact(v_run.depth,v_run.overdepth);
      v_run.protected_discoveries := v_run.protected_discoveries || jsonb_build_array(v_artifact);
    end if;
  end if;

  update public.abandoned_mine_runs set
    progress=v_new_progress,
    unsecured_cargo=v_run.unsecured_cargo,
    protected_discoveries=v_run.protected_discoveries,
    status=case when v_new_progress>=target and depth in (4,7) then 'awaiting_route'
      when v_new_progress>=target and depth=10 then 'ready_to_extract'
      when v_new_progress>=target then 'awaiting_funding' else status end,
    updated_at=now()
  where id=v_run.id;
end $$;

create or replace function public.fund_abandoned_mine(p_depth integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid();
  v_run public.abandoned_mine_runs;
  v_cost numeric;
  v_money numeric;
  v_incident text:=null;
  v_severity_roll numeric;
  v_loss integer:=0;
  v_unsecured jsonb;
  v_modifier integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('abandoned-mine:'||v_uid::text));
  select * into v_run from public.abandoned_mine_runs
    where player_id=v_uid and status<>'settled' for update;
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

  v_unsecured:=v_run.unsecured_cargo;
  v_modifier:=v_run.danger_modifier;
  -- Danger is the literal probability for this choice. Severity is a fresh,
  -- conditional roll made only when that incident check succeeds.
  if random() < v_run.danger::numeric/100 then
    v_severity_roll:=random();
    v_incident:=case
      when v_severity_roll < .65 then 'minor'
      when v_severity_roll < .92 then 'major'
      else 'critical' end;
    v_loss:=case v_incident when 'minor' then least(1,jsonb_array_length(v_unsecured))
      when 'major' then greatest(1,jsonb_array_length(v_unsecured)/2)
      else jsonb_array_length(v_unsecured) end;
    v_loss:=least(v_loss,jsonb_array_length(v_unsecured));
    if v_loss>0 then
      select coalesce(jsonb_agg(value order by n),'[]'::jsonb) into v_unsecured
      from jsonb_array_elements(v_unsecured) with ordinality x(value,n) where n>v_loss;
    end if;
    if v_incident='major' then v_modifier:=v_modifier+5; end if;
  end if;

  update public.abandoned_mine_runs set
    total_funding=total_funding+v_cost,
    danger_modifier=v_modifier,
    unsecured_cargo=v_unsecured,
    incident_log=case when v_incident is null then incident_log else incident_log||jsonb_build_array(
      jsonb_build_object('severity',v_incident,'depth',p_depth,'fromDepth',depth,
        'overdepth',overdepth,'lost',v_loss,'at',now())) end,
    depth=case when v_incident='critical' then depth else p_depth end,
    progress=case when v_incident='critical' then progress else 0 end,
    target=case when v_incident='critical' then target else public.abandoned_mine_depth_target(p_depth,0) end,
    danger=case when v_incident='critical' then danger
      else public.abandoned_mine_effective_danger(p_depth,v_modifier) end,
    status=case when v_incident='critical' then 'forced_extraction' else 'active' end,
    extraction_reason=case when v_incident='critical' then 'critical_incident' else extraction_reason end,
    extracted_at=case when v_incident='critical' then now() else extracted_at end,
    updated_at=now()
  where id=v_run.id returning * into v_run;
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money,'incident',v_incident);
end $$;

create or replace function public.choose_abandoned_mine_route(p_run_id bigint,p_route text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.abandoned_mine_runs; v_delta integer;
begin
  select * into v_run from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() for update;
  if not found or v_run.status<>'awaiting_route' then raise exception 'mine_route_unavailable'; end if;
  if v_run.depth=4 and p_route in ('reinforced_tunnel','rich_vein') then
    v_delta:=case when p_route='rich_vein' then 12 else -10 end;
    update public.abandoned_mine_runs set route_d4=p_route,status='awaiting_funding',
      danger_modifier=danger_modifier+v_delta,
      danger=public.abandoned_mine_effective_danger(depth,danger_modifier+v_delta),updated_at=now()
      where id=p_run_id returning * into v_run;
  elsif v_run.depth=7 and p_route in ('supply_line','unstable_descent') then
    v_delta:=case when p_route='unstable_descent' then 16 else -12 end;
    update public.abandoned_mine_runs set route_d7=p_route,status='awaiting_funding',
      danger_modifier=danger_modifier+v_delta,
      danger=public.abandoned_mine_effective_danger(depth,danger_modifier+v_delta),updated_at=now()
      where id=p_run_id returning * into v_run;
  else raise exception 'invalid_mine_route'; end if;
  return to_jsonb(v_run);
end $$;

create or replace function public.build_abandoned_mine_camp(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.abandoned_mine_runs; v_cost numeric; v_money numeric;
begin
  select * into v_run from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() for update;
  if not found or v_run.status not in ('active','awaiting_funding','awaiting_route','ready_to_extract')
     or v_run.depth not in (3,6,9) or v_run.camps @> to_jsonb(array[v_run.depth]) then
    raise exception 'supply_camp_unavailable';
  end if;
  v_cost:=v_run.depth*100000;
  update public.players set money=money-v_cost where id=auth.uid() and money>=v_cost returning money into v_money;
  if not found then raise exception 'insufficient_funds'; end if;
  update public.abandoned_mine_runs set camps=camps||jsonb_build_array(v_run.depth),
    secured_cargo=secured_cargo||unsecured_cargo,unsecured_cargo='[]'::jsonb,
    danger_modifier=danger_modifier-20,
    danger=public.abandoned_mine_effective_danger(depth,danger_modifier-20),updated_at=now()
    where id=p_run_id returning * into v_run;
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money,'cost',v_cost);
end $$;

create or replace function public.continue_mine_overdepth(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_run public.abandoned_mine_runs; v_incident text:=null; v_loss integer:=0;
  v_severity_roll numeric;
  v_unsecured jsonb; v_modifier integer;
begin
  select * into v_run from public.abandoned_mine_runs
    where id=p_run_id and player_id=auth.uid() and status='ready_to_extract' and depth=10 for update;
  if not found then raise exception 'mine_overdepth_unavailable'; end if;
  v_unsecured:=v_run.unsecured_cargo;
  v_modifier:=v_run.danger_modifier;
  if random() < v_run.danger::numeric/100 then
    v_severity_roll:=random();
    v_incident:=case when v_severity_roll<.65 then 'minor'
      when v_severity_roll<.92 then 'major' else 'critical' end;
    v_loss:=case v_incident when 'minor' then least(1,jsonb_array_length(v_unsecured))
      when 'major' then greatest(1,jsonb_array_length(v_unsecured)/2)
      else jsonb_array_length(v_unsecured) end;
    v_loss:=least(v_loss,jsonb_array_length(v_unsecured));
    if v_loss>0 then
      select coalesce(jsonb_agg(value order by n),'[]'::jsonb) into v_unsecured
      from jsonb_array_elements(v_unsecured) with ordinality x(value,n) where n>v_loss;
    end if;
    if v_incident='major' then v_modifier:=v_modifier+5; end if;
  end if;
  if v_incident<>'critical' or v_incident is null then v_modifier:=v_modifier+15; end if;
  update public.abandoned_mine_runs set
    overdepth=case when v_incident='critical' then overdepth else overdepth+1 end,
    progress=case when v_incident='critical' then progress else 0 end,
    target=case when v_incident='critical' then target else public.abandoned_mine_depth_target(10,overdepth+1) end,
    danger_modifier=v_modifier,unsecured_cargo=v_unsecured,
    danger=case when v_incident='critical' then danger else public.abandoned_mine_effective_danger(10,v_modifier) end,
    incident_log=case when v_incident is null then incident_log else incident_log||jsonb_build_array(
      jsonb_build_object('severity',v_incident,'depth',10,'overdepth',overdepth+1,'lost',v_loss,'at',now())) end,
    status=case when v_incident='critical' then 'forced_extraction' else 'active' end,
    extraction_reason=case when v_incident='critical' then 'critical_incident' else extraction_reason end,
    extracted_at=case when v_incident='critical' then now() else extracted_at end,updated_at=now()
  where id=p_run_id returning * into v_run;
  return to_jsonb(v_run);
end $$;

revoke all on function public.abandoned_mine_route_camp_modifier(integer,integer,text,text,jsonb),
  public.abandoned_mine_effective_danger(integer,integer),
  public.record_abandoned_mine_roll(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_abandoned_mine_roll(uuid,jsonb) to service_role;
revoke all on function public.fund_abandoned_mine(integer),
  public.choose_abandoned_mine_route(bigint,text),public.build_abandoned_mine_camp(bigint),
  public.continue_mine_overdepth(bigint) from public,anon;
grant execute on function public.fund_abandoned_mine(integer),
  public.choose_abandoned_mine_route(bigint,text),public.build_abandoned_mine_camp(bigint),
  public.continue_mine_overdepth(bigint) to authenticated;

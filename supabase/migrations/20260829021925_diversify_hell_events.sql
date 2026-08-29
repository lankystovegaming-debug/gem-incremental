-- Give the twelve Hell events distinct, truthful choices. Full cargo securing
-- belongs only to Functional Cargo Lift, which cannot repeat within a run.

create or replace function public.abandoned_mine_hell_event_options(p_name text,p_depth integer)
returns jsonb language plpgsql immutable set search_path='' as $$
begin
  return case p_name
    when 'Forked Mineworks' then jsonb_build_array(
      jsonb_build_object('id','survey','label','Chart the supported branch','cost',750000,'dangerDelta',-8,'incidentDelta',-3,'info','Exact'),
      jsonb_build_object('id','unmarked','label','Take the unmarked workings','cost',0,'dangerDelta',7,'info','Vague'))
    when 'Collapsed Junction' then jsonb_build_array(
      jsonb_build_object('id','reinforce','label','Reinforce a passage','cost',1500000,'dangerDelta',-12,'info','Exact'),
      jsonb_build_object('id','crawl','label','Crawl through the collapse','cost',0,'dangerDelta',10,'info','Exact'))
    when 'Flooded Galleries' then jsonb_build_array(
      jsonb_build_object('id','pump','label','Bring in portable pumps','cost',1000000,'dangerDelta',-10,'info','Exact'),
      jsonb_build_object('id','ledges','label','Cross along the upper ledges','cost',0,'dangerDelta',6,'info','Vague'),
      jsonb_build_object('id','salvage','label','Search the flooded lockers','cost',500000,'dangerDelta',4,'cargoValue',75000,'info','???'))
    when 'Old Railway' then jsonb_build_array(
      jsonb_build_object('id','brakes','label','Repair the brake carriage','cost',1250000,'dangerDelta',-7,'revealTaxDelta',-.15,'info','Exact'),
      jsonb_build_object('id','ride','label','Ride the uncontrolled ore cart','cost',0,'dangerDelta',9,'cargoValue',100000,'info','Vague'))
    when 'Ventilation Network' then jsonb_build_array(
      jsonb_build_object('id','fans','label','Restore the ventilation fans','cost',750000,'dangerDelta',-9,'incidentDelta',-5,'info','Exact'),
      jsonb_build_object('id','masks','label','Continue with filter masks','cost',0,'dangerDelta',4,'info','Exact'))
    when 'Deep Shaft' then jsonb_build_array(
      jsonb_build_object('id','cage','label','Lower the safety cage','cost',3000000,'dangerDelta',-15,'recoveryPenaltyDelta',-.05,'info','Exact'),
      jsonb_build_object('id','cables','label','Descend on the old cables','cost',0,'dangerDelta',12,'info','???'))
    when 'Exposed Ore Vein' then jsonb_build_array(
      jsonb_build_object('id','shore','label','Shore up and mine the vein','cost',1000000,'dangerDelta',2,'cargoValue',150000,'info','Exact'),
      jsonb_build_object('id','leave','label','Leave the vein untouched','cost',0,'dangerDelta',0,'info','Exact'))
    when 'Broken Mine Railway' then jsonb_build_array(
      jsonb_build_object('id','clear','label','Clear a safe route','cost',750000,'dangerDelta',-6,'info','Exact'),
      jsonb_build_object('id','salvage','label','Salvage the stranded ore','cost',0,'dangerDelta',6,'cargoValue',125000,'info','Vague'))
    when 'Functional Cargo Lift' then jsonb_build_array(
      jsonb_build_object('id','crew','label','Hire a recovery crew','cost',case when p_depth>=9 then 5000000 else 3000000 end,'dangerDelta',-3,'secureCargo',true,'info','Exact'),
      jsonb_build_object('id','inspect','label','Inspect the lift controls','cost',0,'dangerDelta',2,'recoveryPenaltyDelta',-.02,'info','Vague'),
      jsonb_build_object('id','bypass','label','Leave the lift unused','cost',0,'dangerDelta',0,'info','Exact'))
    when 'Failing Supports' then jsonb_build_array(
      jsonb_build_object('id','brace','label','Install emergency bracing','cost',2000000,'dangerDelta',-12,'info','Exact'),
      jsonb_build_object('id','sprint','label','Sprint beneath the failing roof','cost',0,'dangerDelta',11,'info','Exact'))
    when 'Abandoned Survey Station' then jsonb_build_array(
      jsonb_build_object('id','restore','label','Restore the survey instruments','cost',1000000,'dangerDelta',-5,'revealTaxDelta',-.15,'info','Exact'),
      jsonb_build_object('id','notes','label','Take the damaged field notes','cost',0,'dangerDelta',3,'incidentDelta',-3,'info','Vague'))
    when 'Sealed Mining Chamber' then jsonb_build_array(
      jsonb_build_object('id','open','label','Break the chamber seal','cost',0,'dangerDelta',8,'cargoValue',200000,'info','???'),
      jsonb_build_object('id','reseal','label','Reinforce the chamber seal','cost',500000,'dangerDelta',-5,'info','Exact'),
      jsonb_build_object('id','leave','label','Leave the chamber alone','cost',0,'dangerDelta',0,'info','Exact'))
    else jsonb_build_array(jsonb_build_object('id','continue','label','Continue carefully','cost',0,'dangerDelta',0,'info','Exact'))
  end;
end $$;

create or replace function public.abandoned_mine_hell_event(p_depth integer,p_seen jsonb)
returns jsonb language plpgsql volatile set search_path='' as $$
declare
  v_names text[]:=array['Forked Mineworks','Collapsed Junction','Flooded Galleries','Old Railway','Ventilation Network','Deep Shaft','Exposed Ore Vein','Broken Mine Railway','Functional Cargo Lift','Failing Supports','Abandoned Survey Station','Sealed Mining Chamber'];
  v_name text;
begin
  select x into v_name from unnest(v_names)x
    where not coalesce(p_seen,'[]') @> jsonb_build_array(x) order by random() limit 1;
  return jsonb_build_object('name',v_name,
    'kind',case when array_position(v_names,v_name)<=6 then 'route' else 'situation' end,
    'resolved',false,
    'options',public.abandoned_mine_hell_event_options(v_name,p_depth));
end $$;

create or replace function public.resolve_abandoned_mine_hell_event(p_run_id bigint,p_option text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_run public.abandoned_mine_runs;v_state jsonb;v_event jsonb;v_option jsonb;
  v_cost numeric;v_money numeric:=null;v_bonus jsonb;
begin
  select * into v_run from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() and mode='hell' for update;
  if not found or v_run.status<>'active' or v_run.hell_state->>'phase'<>'event' then raise exception 'hell_event_unavailable';end if;
  v_state:=v_run.hell_state;v_event:=v_state->'event';
  select value into v_option from jsonb_array_elements(v_event->'options') where value->>'id'=p_option;
  if v_option is null then raise exception 'invalid_hell_event_option';end if;
  v_cost:=coalesce((v_option->>'cost')::numeric,0);
  if v_cost>0 and coalesce(v_state->'doomBreaks','[]') @> '["severed_funding"]' then raise exception 'hell_paid_support_disabled';end if;
  if coalesce((v_option->>'secureCargo')::boolean,false) and coalesce(v_state->'doomBreaks','[]') @> '["broken_safeguards"]' then raise exception 'hell_safeguards_disabled';end if;
  if v_cost>0 then
    update public.players p set money=p.money-v_cost where p.id=v_run.player_id and p.money>=v_cost returning p.money into v_money;
    if not found then raise exception 'insufficient_funds';end if;
  end if;
  if coalesce((v_option->>'secureCargo')::boolean,false) then
    v_run.secured_cargo:=v_run.secured_cargo||v_run.unsecured_cargo;v_run.unsecured_cargo:='[]';
  end if;
  if coalesce((v_option->>'cargoValue')::numeric,0)>0 then
    v_bonus:=jsonb_build_object('kind','cargo','name',(v_event->>'name')||' discovery','value',(v_option->>'cargoValue')::numeric,'depth',v_run.depth,'overdepth',v_run.overdepth);
    v_run.unsecured_cargo:=v_run.unsecured_cargo||jsonb_build_array(v_bonus);
  end if;
  v_state:=v_state||jsonb_build_object(
    'nextIncidentBonus',coalesce((v_state->>'nextIncidentBonus')::numeric,0)+coalesce((v_option->>'incidentDelta')::numeric,0),
    'revealTax',greatest(0,coalesce((v_state->>'revealTax')::numeric,0)+coalesce((v_option->>'revealTaxDelta')::numeric,0)),
    'recoveryPenalty',greatest(0,coalesce((v_state->>'recoveryPenalty')::numeric,0)+coalesce((v_option->>'recoveryPenaltyDelta')::numeric,0)));
  v_event:=v_event||jsonb_build_object('resolved',true,'selected',p_option);
  v_state:=v_state||jsonb_build_object('event',v_event,'phase','cards','eventSpend',coalesce((v_state->>'eventSpend')::numeric,0)+v_cost);
  update public.abandoned_mine_runs m set
    danger=greatest(coalesce((v_state->>'dangerFloor')::integer,0),least(100,m.danger+coalesce((v_option->>'dangerDelta')::integer,0))),
    secured_cargo=v_run.secured_cargo,unsecured_cargo=v_run.unsecured_cargo,hell_state=v_state,updated_at=now()
    where m.id=v_run.id returning * into v_run;
  perform public.abandoned_mine_hell_log(v_run,'event_choice',jsonb_build_object(
    'event',v_event->>'name','option',p_option,'securedCargo',coalesce((v_option->>'secureCargo')::boolean,false),'cargoValue',coalesce((v_option->>'cargoValue')::numeric,0)),v_cost);
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money);
end $$;

-- Replace only an unresolved generic event hand. Event identity and history are
-- preserved, so reconnect still cannot reroll the event.
update public.abandoned_mine_runs
set hell_state=jsonb_set(hell_state,'{event,options}',
  public.abandoned_mine_hell_event_options(hell_state->'event'->>'name',depth)),
  updated_at=now()
where mode='hell' and status='active' and hell_state->>'phase'='event'
  and coalesce((hell_state->'event'->>'resolved')::boolean,false)=false;

revoke all on function public.abandoned_mine_hell_event_options(text,integer),
  public.abandoned_mine_hell_event(integer,jsonb) from public,anon,authenticated;
revoke all on function public.resolve_abandoned_mine_hell_event(bigint,text) from public,anon;
grant execute on function public.resolve_abandoned_mine_hell_event(bigint,text) to authenticated;

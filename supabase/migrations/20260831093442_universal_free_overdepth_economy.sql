-- Expeditions fund their planned D1-D10 route. Overdepth descent is universally free.
-- Destination mechanics may still offer separately priced optional services.

create or replace function public.expedition_overdepth_cost(
  p_destination text,
  p_mode text,
  p_overdepth integer)
returns numeric language plpgsql immutable set search_path='' as $$
begin
  if p_destination not in ('abandoned-mine','crystal-caverns')
    or p_mode not in ('normal','hell') or p_overdepth<1 then
    raise exception 'invalid_expedition_overdepth';
  end if;
  return 0;
end $$;

comment on function public.expedition_overdepth_cost(text,text,integer) is
  'Universal expedition policy: D1-D10 are funded; Overdepth descent is free.';

create or replace function public.abandoned_mine_overdepth_cost(p_overdepth integer)
returns numeric language sql immutable set search_path='' as $$
  select public.expedition_overdepth_cost('abandoned-mine','normal',p_overdepth)
$$;

create or replace function public.abandoned_mine_overdepth_cargo_range(p_overdepth integer)
returns numeric[] language plpgsql immutable set search_path='' as $$
declare lo numeric; hi numeric; multiplier numeric;
begin
  if p_overdepth<1 then raise exception 'invalid_overdepth'; end if;
  if p_overdepth<=10 then
    lo:=(array[250000,300000,375000,450000,550000,700000,850000,1000000,1250000,1500000]::numeric[])[p_overdepth];
    hi:=(array[350000,425000,525000,650000,800000,1000000,1200000,1500000,1800000,2200000]::numeric[])[p_overdepth];
  else
    multiplier:=1+.18*sqrt((p_overdepth-10)::numeric);
    lo:=1500000*multiplier;
    hi:=2200000*multiplier;
  end if;
  return array[lo,hi];
end $$;

-- Keep the older range API aligned for callers and diagnostics that still use it.
create or replace function public.abandoned_mine_economic_range(p_depth integer,p_overdepth integer default 0)
returns numeric[] language plpgsql immutable set search_path='' as $$
begin
  if p_overdepth>0 then return public.abandoned_mine_overdepth_cargo_range(p_overdepth); end if;
  if p_depth not between 1 and 10 then raise exception 'invalid_depth'; end if;
  return array[
    (array[15000,30000,60000,100000,175000,300000,500000,850000,1400000,2500000]::numeric[])[p_depth],
    (array[25000,50000,90000,150000,250000,450000,750000,1200000,2000000,3500000]::numeric[])[p_depth]
  ];
end $$;

create or replace function public.continue_mine_overdepth(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_run public.abandoned_mine_runs; v_money numeric; v_next integer;
  v_incident text:=null; v_severity_roll numeric; v_loss_percentage numeric; v_loss jsonb; v_unsecured jsonb;
  v_modifier integer; v_exact numeric; v_target_danger integer; v_critical_cutoff numeric:=.92;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('abandoned-mine:'||v_uid::text));
  select * into v_run from public.abandoned_mine_runs where id=p_run_id and player_id=v_uid for update;
  if not found or v_run.mode<>'normal' or v_run.status<>'ready_to_extract' or v_run.depth<>10 then raise exception 'mine_overdepth_unavailable'; end if;
  v_next:=v_run.overdepth+1;
  select money into v_money from public.players where id=v_uid;
  v_unsecured:=v_run.unsecured_cargo; v_modifier:=v_run.danger_modifier;
  v_exact:=case when v_run.normal_danger_exact is null or round(v_run.normal_danger_exact)<>v_run.danger then v_run.danger else v_run.normal_danger_exact end;
  if public.player_has_mine_artifact(v_uid,'canary-charm') then v_critical_cutoff:=.928; end if;
  if random()<v_exact/100 then
    v_severity_roll:=random(); v_incident:=case when v_severity_roll<.65 then 'minor' when v_severity_roll<v_critical_cutoff then 'major' else 'critical' end;
    v_loss_percentage:=case v_incident when 'minor' then round((8+random()*4)::numeric,2)
      when 'major' then round((20+random()*10)::numeric,2) else round((35+random()*15)::numeric,2) end;
    v_loss:=public.abandoned_mine_apply_cargo_loss(v_unsecured,v_loss_percentage); v_unsecured:=v_loss->'cargo';
    if v_incident='major' then v_modifier:=v_modifier+5; end if;
  end if;
  if v_incident is distinct from 'critical' then
    v_modifier:=v_modifier+15; v_target_danger:=public.abandoned_mine_effective_danger(10,v_modifier);
    if public.player_has_mine_artifact(v_uid,'descent-chain') and v_target_danger>v_exact then v_exact:=v_exact+(v_target_danger-v_exact)*.95;
    else v_exact:=v_target_danger; end if;
  end if;
  update public.abandoned_mine_runs set overdepth=case when v_incident='critical' then overdepth else v_next end,
    progress=case when v_incident='critical' then progress else 0 end,
    target=case when v_incident='critical' then target else public.abandoned_mine_depth_target(10,v_next) end,
    danger_modifier=v_modifier,unsecured_cargo=v_unsecured,normal_danger_exact=v_exact,
    danger=case when v_incident='critical' then danger else round(v_exact)::integer end,
    incident_log=case when v_incident is null then incident_log else incident_log||jsonb_build_array(jsonb_build_object(
      'severity',v_incident,'depth',10,'overdepth',v_next,'lossPercentage',v_loss->'lossPercentage','valueBefore',v_loss->'valueBefore',
      'valueLost',v_loss->'valueLost','valueRetained',v_loss->'valueRetained','at',now())) end,
    status=case when v_incident='critical' then 'forced_extraction' else 'active' end,
    extraction_reason=case when v_incident='critical' then 'critical_incident' else extraction_reason end,
    extracted_at=case when v_incident='critical' then now() else extracted_at end,updated_at=now()
    where id=v_run.id returning * into v_run;
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money,'cost',0,'incident',v_incident);
end $$;

create or replace function public.crystal_funding(p_depth integer,p_od integer default 0)
returns numeric language plpgsql immutable set search_path='' as $$
begin
  if p_od>0 then return public.expedition_overdepth_cost('crystal-caverns','normal',p_od); end if;
  if p_depth not between 1 and 10 then raise exception 'invalid_crystal_depth'; end if;
  return (array[200000,300000,450000,650000,900000,1300000,2000000,3000000,4500000,7000000]::numeric[])[p_depth];
end $$;

create or replace function public.crystal_od_cargo_range(p_od integer)
returns numeric[] language plpgsql immutable set search_path='' as $$
declare lo numeric; hi numeric; multiplier numeric;
begin
  if p_od<1 then raise exception 'invalid_overdepth'; end if;
  if p_od<=10 then
    lo:=(array[300000,400000,500000,650000,850000,1100000,1400000,1800000,2300000,3000000]::numeric[])[p_od];
    hi:=(array[450000,600000,750000,1000000,1300000,1700000,2200000,2800000,3500000,4500000]::numeric[])[p_od];
  else
    multiplier:=1+.18*sqrt((p_od-10)::numeric);
    lo:=3000000*multiplier;
    hi:=4500000*multiplier;
  end if;
  return array[lo,hi];
end $$;

-- This is an optional extraction service, not a descent charge. Preserve its V1 prices.
create or replace function public.crystal_overdepth_formation_cost(p_overdepth integer)
returns numeric language plpgsql immutable set search_path='' as $$
declare n numeric; lvl integer;
begin
  if p_overdepth<1 then raise exception 'invalid_overdepth'; end if;
  if p_overdepth<=10 then
    return (array[2400000,3600000,5200000,7600000,10800000,15200000,21600000,30400000,42800000,60000000]::numeric[])[p_overdepth];
  end if;
  n:=60000000;
  for lvl in 11..p_overdepth loop n:=floor((n*1.4+100000)/200000)*200000; end loop;
  return n;
end $$;

create or replace function public.continue_crystal_overdepth(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.crystal_cavern_runs; n integer; m numeric;
begin
  select * into r from public.crystal_cavern_runs where id=p_run_id and player_id=auth.uid() for update;
  if not found or r.status<>'ready_to_extract' or r.depth<>10
    or not(coalesce((r.pending->>'fractured')::boolean,false) or r.overdepth>0) then raise exception 'crystal_overdepth_unavailable'; end if;
  n:=r.overdepth+1;
  select money into m from public.players where id=r.player_id;
  update public.crystal_cavern_runs set overdepth=n,progress=0,target=600+n*50,
    danger=public.crystal_base_danger(10,n),status='active',pending=null,
    event_log=public.crystal_log(event_log,'depth','Descended to OD'||n,
      jsonb_build_object('cost',0,'danger',public.crystal_base_danger(10,n))),updated_at=now()
    where id=r.id returning * into r;
  return jsonb_build_object('run',to_jsonb(r),'money',m,'cost',0);
end $$;

-- Preserve every formation branch while sourcing the paid careful-extraction
-- option from its own service price rather than the free descent cost.
create or replace function public.resolve_crystal_decision(p_run_id bigint,p_choice text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.crystal_cavern_runs;t text;e text;c numeric:=0;di integer:=0;count_ integer:=0;quality boolean:=false;pool text:='formation';m numeric:=null;nextp jsonb:=null;before_artifacts integer;
begin
 select*into r from public.crystal_cavern_runs where id=p_run_id and player_id=auth.uid()for update;
 if not found or r.status<>'decision'then raise exception'crystal_decision_unavailable';end if;
 t:=r.pending->>'type';before_artifacts:=jsonb_array_length(r.unsecured_artifacts);
 if t='minor_event'then e:=r.pending->>'event';if p_choice='leave'then null;elsif e='pocket'and p_choice='excavate'then di:=5;count_:=1;pool:='general';elsif e='resonance'and p_choice='trigger'then di:=8;count_:=1;quality:=true;elsif e='deposit'and p_choice='break'then di:=3;r.unsecured_cargo:=r.unsecured_cargo||jsonb_build_array(public.crystal_cargo(r.depth,0));r.event_log:=public.crystal_log(r.event_log,'treasure','Treasure found in crystal deposit');else raise exception'invalid_crystal_choice';end if;r.status:='awaiting_funding';
 elsif t in('formation','od_formation')then if p_choice='leave'then null;elsif t='od_formation'and p_choice='careful'then c:=public.crystal_overdepth_formation_cost(r.overdepth);di:=8;count_:=2;quality:=true;pool:='od';elsif t='od_formation'and p_choice='shatter'then di:=25;count_:=4;pool:='od';elsif t='formation'and p_choice='careful'then c:=case r.depth when 4 then 750000 when 7 then 2000000 else 4500000 end;di:=case r.depth when 4 then 4 when 7 then 6 else 8 end;count_:=case when r.depth=9 then 2 else 1 end;quality:=true;elsif t='formation'and p_choice='shatter'then di:=case r.depth when 4 then 12 when 7 then 18 else 25 end;count_:=case r.depth when 4 then 2 when 7 then 3 else 4 end;else raise exception'invalid_crystal_choice';end if;if t='od_formation'then r.status:='ready_to_extract';elsif r.depth=9 then nextp:=jsonb_build_object('type','outpost','depth',9);r.status:='decision';else r.status:='awaiting_funding';end if;
 elsif t='outpost'then if p_choice not in('secure','reinforce')then raise exception'invalid_crystal_choice';end if;c:=case r.depth when 3 then case p_choice when'secure'then 250000 else 500000 end when 6 then case p_choice when'secure'then 1000000 else 1750000 end else case p_choice when'secure'then 3500000 else 5500000 end end;if p_choice='reinforce'then r.danger:=greatest(0,r.danger-15);end if;r.secured_cargo:=r.secured_cargo||r.unsecured_cargo;r.unsecured_cargo:='[]';r.secured_artifacts:=r.secured_artifacts||r.unsecured_artifacts;r.unsecured_artifacts:='[]';r.status:='awaiting_funding';r.event_log:=public.crystal_log(r.event_log,'secured','Outpost secured all cargo and artifacts',jsonb_build_object('service',p_choice,'cost',c,'danger',r.danger));
 elsif t='d10_choice'then if p_choice='extract'then r.status:='ready_to_extract';elsif p_choice='fracture'then r.instability:=r.instability+30;r.event_log:=public.crystal_log(r.event_log,'instability','Fracturing the Heart added 30 Instability');r.status:='ready_to_extract';nextp:=jsonb_build_object('fractured',true);else raise exception'invalid_crystal_choice';end if;else raise exception'invalid_crystal_choice';end if;
 if c>0 then update public.players p set money=p.money-c where id=r.player_id and p.money>=c returning p.money into m;if not found then raise exception'insufficient_funds';end if;r.total_funding:=r.total_funding+c;end if;
 r.instability:=r.instability+di;if di>0 then r.event_log:=public.crystal_log(r.event_log,'instability','Cavern choice added '||di||' Instability');end if;
 if count_>0 then r.unsecured_artifacts:=public.crystal_add_opportunities(r,pool,count_,case when r.overdepth>0 then least(.40,.20+(r.overdepth-1)*.03)else case when r.depth<=6 then .20 else .25 end end,quality);end if;
 if jsonb_array_length(r.unsecured_artifacts)>before_artifacts then r.event_log:=public.crystal_log(r.event_log,'artifact','Artifact discovered — unsecured and at risk');end if;
 r.event_log:=public.crystal_log(r.event_log,'event','Resolved '||replace(t,'_',' ')||': '||p_choice);r.pending:=nextp;
 update public.crystal_cavern_runs set(status,instability,danger,secured_cargo,unsecured_cargo,secured_artifacts,unsecured_artifacts,pending,total_funding,event_log,updated_at)=(r.status,r.instability,r.danger,r.secured_cargo,r.unsecured_cargo,r.secured_artifacts,r.unsecured_artifacts,r.pending,r.total_funding,r.event_log,now())where id=r.id returning*into r;
 return jsonb_build_object('run',to_jsonb(r),'money',m,'cost',c);
end $$;

create or replace function public.get_crystal_caverns_dashboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.crystal_cavern_runs;rj jsonb;a jsonb;m numeric;next_od numeric;next_danger integer;formation_cost numeric;
begin
 if auth.uid()is null then raise exception'not_authenticated';end if;
 select*into r from public.crystal_cavern_runs x where player_id=auth.uid()and status<>'settled'order by id desc limit 1;
 rj:=case when r.id is null then null else to_jsonb(r)end;select p.money into m from public.players p where id=auth.uid();
 select coalesce(jsonb_agg(to_jsonb(x)order by x.sort_order),'[]')into a from(select c.*,exists(select 1 from public.museum_artifact_registrations z where z.player_id=auth.uid()and z.artifact_key=c.key)registered from public.crystal_cavern_artifacts c)x;
 if r.id is not null and r.depth=10 then next_od:=public.expedition_overdepth_cost('crystal-caverns','normal',r.overdepth+1);next_danger:=public.crystal_base_danger(10,r.overdepth+1);if r.overdepth>0 then formation_cost:=public.crystal_overdepth_formation_cost(r.overdepth);end if;end if;
 return jsonb_build_object('destination',jsonb_build_object('id','crystal-caverns','name','Crystal Caverns','identity','How much will you disturb?'),'run',rj,'money',m,'artifacts',a,'funding',to_jsonb(array[200000,300000,450000,650000,900000,1300000,2000000,3000000,4500000,7000000]),'danger',to_jsonb(array[0,3,7,12,18,26,35,45,57,70]),'overdepthPolicy',jsonb_build_object('fundedDepths',10,'descentCost',0,'label','D1-D10 are funded; Overdepth is free'),'nextOverdepthCost',next_od,'nextOverdepthDanger',next_danger,'overdepthFormationCost',formation_cost);
end $$;

revoke all on function public.expedition_overdepth_cost(text,text,integer),public.abandoned_mine_overdepth_cargo_range(integer),public.abandoned_mine_economic_range(integer,integer),public.crystal_od_cargo_range(integer),public.crystal_overdepth_formation_cost(integer) from public,anon,authenticated;

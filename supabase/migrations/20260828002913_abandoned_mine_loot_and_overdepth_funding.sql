-- Player-facing Abandoned Mine loot catalogue and paid Overdepth entry.
-- The catalogue rows are consumed directly by abandoned_mine_artifact(), so
-- eligibility, weights and settlement values have one authoritative source.

create table public.abandoned_mine_loot_catalog (
  key text primary key,
  name text not null,
  category text not null check (category in ('economic','normal','lost_workings','d10','overdepth')),
  kind text not null check (kind in ('economic','artifact')),
  earliest_depth integer not null check (earliest_depth between 1 and 10),
  earliest_overdepth integer not null default 0 check (earliest_overdepth >= 0),
  required_route text check (required_route in ('rich_vein','unstable_descent')),
  eligibility_condition text not null,
  weight numeric not null check (weight > 0),
  protected boolean not null,
  duplicate_value numeric check (duplicate_value >= 0),
  collection text not null check (collection in ('normal_mine','overdepth')),
  sort_order integer not null
);

alter table public.abandoned_mine_loot_catalog enable row level security;
revoke all on public.abandoned_mine_loot_catalog from public,anon,authenticated;
grant all on public.abandoned_mine_loot_catalog to service_role;

create table public.abandoned_mine_loot_rules (
  singleton boolean primary key default true check (singleton),
  artifact_base_chance numeric not null,
  artifact_depth_increment numeric not null,
  artifact_overdepth_increment numeric not null,
  artifact_maximum_chance numeric not null,
  economic_chance numeric not null
);
alter table public.abandoned_mine_loot_rules enable row level security;
revoke all on public.abandoned_mine_loot_rules from public,anon,authenticated;
grant all on public.abandoned_mine_loot_rules to service_role;
insert into public.abandoned_mine_loot_rules values(true,.004,.002,.003,.08,1);

insert into public.abandoned_mine_loot_catalog
  (key,name,category,kind,earliest_depth,earliest_overdepth,required_route,eligibility_condition,weight,protected,duplicate_value,collection,sort_order)
values
  ('economic-cargo','Recovered mineral cargo','economic','economic',1,0,null,'Complete any funded depth',1,false,null,'normal_mine',10),
  ('miners-lamp','Miner''s Lamp','normal','artifact',1,0,null,'Complete D1 or deeper',40,true,25000,'normal_mine',100),
  ('surveyors-compass','Surveyor''s Compass','normal','artifact',2,0,null,'Complete D2 or deeper',32,true,50000,'normal_mine',110),
  ('silver-pick','Silver Pick','normal','artifact',4,0,null,'Complete D4 or deeper',24,true,100000,'normal_mine',120),
  ('foreman-seal','Foreman''s Seal','normal','artifact',6,0,null,'Complete D6 or deeper',18,true,150000,'normal_mine',130),
  ('canary-charm','Canary Charm','normal','artifact',8,0,null,'Complete D8 or deeper',12,true,200000,'normal_mine',140),
  ('vein-prism','Vein Prism','lost_workings','artifact',4,0,'rich_vein','Complete D4+ after choosing Rich Vein',16,true,175000,'normal_mine',200),
  ('descent-chain','Descent Chain','lost_workings','artifact',7,0,'unstable_descent','Complete D7+ after choosing Unstable Descent',14,true,250000,'normal_mine',210),
  ('deepcore-map','Deepcore Map','d10','artifact',10,0,null,'Complete D10 or an Overdepth',10,true,350000,'normal_mine',300),
  ('clockwork-drill','Clockwork Drill','d10','artifact',10,0,null,'Complete D10 or an Overdepth',7,true,500000,'normal_mine',310),
  ('royal-claim','Royal Claim','overdepth','artifact',10,1,null,'Complete Overdepth 1+',8,true,750000,'overdepth',400),
  ('black-geode','Black Geode','overdepth','artifact',10,3,null,'Complete Overdepth 3+',5,true,1250000,'overdepth',410),
  ('bedrock-crown','Bedrock Crown','overdepth','artifact',10,6,null,'Complete Overdepth 6+',2,true,2500000,'overdepth',420);

drop function public.abandoned_mine_artifact(integer,integer);
create or replace function public.abandoned_mine_artifact(
  p_depth integer,
  p_overdepth integer default 0,
  p_route_d4 text default null,
  p_route_d7 text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_item public.abandoned_mine_loot_catalog;
begin
  select c.* into v_item
  from public.abandoned_mine_loot_catalog c
  where c.kind='artifact'
    and p_depth>=c.earliest_depth
    and p_overdepth>=c.earliest_overdepth
    and (c.required_route is null or c.required_route in (p_route_d4,p_route_d7))
  order by -ln(greatest(random(),0.0000000001))/c.weight
  limit 1;
  if not found then return null; end if;
  return jsonb_build_object('kind','artifact','key',v_item.key,'name',v_item.name,
    'depth',p_depth,'overdepth',greatest(0,p_overdepth),'duplicateValue',v_item.duplicate_value,
    'protected',v_item.protected,'collection',v_item.collection);
end $$;

create or replace function public.abandoned_mine_artifact_opportunity_chance(p_depth integer,p_overdepth integer)
returns numeric language sql stable security definer set search_path='' as $$
  select least(r.artifact_maximum_chance,r.artifact_base_chance+p_depth*r.artifact_depth_increment+p_overdepth*r.artifact_overdepth_increment)
  from public.abandoned_mine_loot_rules r where r.singleton
$$;

create or replace function public.record_abandoned_mine_roll(p_player_id uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_run public.abandoned_mine_runs; v_progress integer:=1;
  v_rarity numeric:=greatest(0,coalesce((p_payload->>'rarity')::numeric,0));
  v_weight numeric:=greatest(0,coalesce((p_payload->>'weightMultiplier')::numeric,0));
  v_mutations jsonb:=coalesce(p_payload->'mutationIds','[]'::jsonb);
  v_new_progress integer; v_multiplier numeric; v_value numeric; v_cargo jsonb; v_artifact jsonb;
begin
  select * into v_run from public.abandoned_mine_runs where player_id=p_player_id and status='active' for update;
  if not found then return; end if;
  if v_rarity>=50 then v_progress:=v_progress+1; end if;
  if v_rarity>=1000 then v_progress:=v_progress+3; end if;
  if v_rarity>=10000 then v_progress:=v_progress+7; end if;
  if jsonb_array_length(v_mutations)>0 then v_progress:=v_progress+3; end if;
  if v_weight>=2 then v_progress:=v_progress+3; end if;
  v_new_progress:=least(v_run.target,v_run.progress+v_progress);
  if v_run.progress<v_run.target and v_new_progress>=v_run.target then
    v_multiplier:=case when v_run.route_d4='rich_vein' then 1.25 else 1 end * case when v_run.route_d7='unstable_descent' then 1.4 else 1 end * (1+v_run.overdepth*.2);
    v_value:=round((1000+random()*3500)*v_run.depth*v_multiplier);
    v_cargo:=jsonb_build_object('kind','cargo','key','economic-cargo','name',coalesce(p_payload->>'gemName','Recovered mineral cargo'),'value',v_value,'depth',v_run.depth,'overdepth',v_run.overdepth,'protected',false);
    v_run.unsecured_cargo:=v_run.unsecured_cargo||jsonb_build_array(v_cargo);
    if random()<public.abandoned_mine_artifact_opportunity_chance(v_run.depth,v_run.overdepth) then
      v_artifact:=public.abandoned_mine_artifact(v_run.depth,v_run.overdepth,v_run.route_d4,v_run.route_d7);
      if v_artifact is not null then v_run.protected_discoveries:=v_run.protected_discoveries||jsonb_build_array(v_artifact); end if;
    end if;
  end if;
  update public.abandoned_mine_runs set progress=v_new_progress,unsecured_cargo=v_run.unsecured_cargo,protected_discoveries=v_run.protected_discoveries,
    status=case when v_new_progress>=target and depth in (3,6,9) and not (v_run.camps @> to_jsonb(array[v_run.depth])) then 'checkpoint_decision'
      when v_new_progress>=target and depth in (4,7) then 'awaiting_route' when v_new_progress>=target and depth=10 then 'ready_to_extract'
      when v_new_progress>=target then 'awaiting_funding' else status end,updated_at=now() where id=v_run.id;
end $$;

-- OD1..OD8 are fixed. Thereafter each level is 1.6x the previous one,
-- rounded to the nearest whole million (half rounds upward).
create or replace function public.abandoned_mine_overdepth_cost(p_overdepth integer)
returns numeric language plpgsql immutable set search_path='' as $$
declare v_cost numeric; v_level integer;
begin
  if p_overdepth<1 then raise exception 'invalid_overdepth'; end if;
  if p_overdepth<=8 then
    return (array[10000000,16000000,26000000,42000000,68000000,110000000,178000000,288000000]::numeric[])[p_overdepth];
  end if;
  v_cost:=288000000;
  for v_level in 9..p_overdepth loop
    v_cost:=floor((v_cost*1.6+500000)/1000000)*1000000;
  end loop;
  return v_cost;
end $$;

-- Generalise the existing ledger without rewriting its historical D1-D10 rows.
alter table public.abandoned_mine_funding drop constraint abandoned_mine_funding_pkey;
alter table public.abandoned_mine_funding drop constraint abandoned_mine_funding_depth_check;
alter table public.abandoned_mine_funding alter column depth drop not null;
alter table public.abandoned_mine_funding add column id bigint generated always as identity primary key;
alter table public.abandoned_mine_funding add column overdepth integer;
alter table public.abandoned_mine_funding add constraint abandoned_mine_funding_stage_check check (
  (depth between 1 and 10 and overdepth is null) or
  (depth is null and overdepth >= 1));
create unique index abandoned_mine_funding_depth_once on public.abandoned_mine_funding(run_id,depth) where depth is not null;
create unique index abandoned_mine_funding_overdepth_once on public.abandoned_mine_funding(run_id,overdepth) where overdepth is not null;

create or replace function public.get_abandoned_mine_dashboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_run jsonb; v_run_row public.abandoned_mine_runs;
  v_history jsonb; v_artifacts jsonb; v_catalog jsonb; v_money numeric; v_rules public.abandoned_mine_loot_rules;
  v_next_overdepth integer; v_next_cost numeric; v_projected_danger integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_run_row from public.abandoned_mine_runs r
    where r.player_id=v_uid and r.status<>'settled' order by r.id desc limit 1;
  if found then
    v_run:=to_jsonb(v_run_row);
    v_next_overdepth:=v_run_row.overdepth+1;
    v_next_cost:=public.abandoned_mine_overdepth_cost(v_next_overdepth);
    v_projected_danger:=public.abandoned_mine_effective_danger(10,v_run_row.danger_modifier+15);
  end if;
  select p.money into v_money from public.players p where p.id=v_uid;
  select * into strict v_rules from public.abandoned_mine_loot_rules where singleton;
  select coalesce(jsonb_agg(to_jsonb(h) order by h.started_at desc),'[]'::jsonb) into v_history
    from (select id,status,depth,overdepth,total_funding,extraction_reason,settlement,started_at,settled_at
      from public.abandoned_mine_runs where player_id=v_uid and status='settled' order by started_at desc limit 12) h;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.registered_at desc),'[]'::jsonb) into v_artifacts
    from public.museum_artifact_registrations a where a.player_id=v_uid;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order),'[]'::jsonb) into v_catalog
  from (select c.*,
      exists(select 1 from public.museum_artifact_registrations r where r.player_id=v_uid and r.artifact_key=c.key) registered
    from public.abandoned_mine_loot_catalog c) x;
  return jsonb_build_object(
    'destination',jsonb_build_object('id','abandoned-mine','name','Abandoned Mine','available',true),
    'wipDestinations',jsonb_build_array('Crystal Caverns','Volcanic Depths','Ancient Ruins','Lost Jungle'),
    'run',v_run,'history',v_history,'artifacts',v_artifacts,'lootCatalog',v_catalog,
    'artifactOpportunity',jsonb_build_object('description','Chance of any artifact opportunity per completed depth','baseChance',v_rules.artifact_base_chance,'depthIncrement',v_rules.artifact_depth_increment,'overdepthIncrement',v_rules.artifact_overdepth_increment,'maximumChance',v_rules.artifact_maximum_chance),
    'economicOpportunity',jsonb_build_object('description','Economic cargo awarded on every completed depth','chance',v_rules.economic_chance),
    'nextOverdepth',v_next_overdepth,'nextOverdepthCost',v_next_cost,'money',v_money,'projectedDanger',v_projected_danger,
    'fundingCosts',to_jsonb(array[100000,150000,250000,400000,650000,1000000,1600000,2500000,4000000,6500000]::numeric[]),
    'progressTargets',to_jsonb(array[100,150,200,275,350,450,575,725,900,1100]::integer[]),
    'baseDanger',to_jsonb(array[0,5,10,18,27,38,50,63,75,85]::integer[]),
    'checkpointServices',jsonb_build_object(
      '3',jsonb_build_object('secureCost',public.abandoned_mine_checkpoint_secure_cost(3),'resupplyCost',public.abandoned_mine_checkpoint_resupply_cost(3),'dangerRelief',public.abandoned_mine_checkpoint_danger_relief(3)),
      '6',jsonb_build_object('secureCost',public.abandoned_mine_checkpoint_secure_cost(6),'resupplyCost',public.abandoned_mine_checkpoint_resupply_cost(6),'dangerRelief',public.abandoned_mine_checkpoint_danger_relief(6)),
      '9',jsonb_build_object('secureCost',public.abandoned_mine_checkpoint_secure_cost(9),'resupplyCost',public.abandoned_mine_checkpoint_resupply_cost(9),'dangerRelief',public.abandoned_mine_checkpoint_danger_relief(9))),
    'campDepths',jsonb_build_array(3,6,9),'routeDepths',jsonb_build_array(4,7));
end $$;

create or replace function public.continue_mine_overdepth(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_run public.abandoned_mine_runs; v_cost numeric; v_money numeric;
  v_next integer; v_incident text:=null; v_loss integer:=0; v_severity_roll numeric;
  v_unsecured jsonb; v_modifier integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('abandoned-mine:'||v_uid::text));
  select * into v_run from public.abandoned_mine_runs
    where id=p_run_id and player_id=v_uid for update;
  if not found or v_run.status<>'ready_to_extract' or v_run.depth<>10 then
    raise exception 'mine_overdepth_unavailable';
  end if;
  v_next:=v_run.overdepth+1;
  v_cost:=public.abandoned_mine_overdepth_cost(v_next);
  -- This conditional update both locks the money row and performs the debit.
  update public.players set money=money-v_cost
    where id=v_uid and money>=v_cost returning money into v_money;
  if not found then raise exception 'insufficient_funds'; end if;
  insert into public.abandoned_mine_funding(run_id,depth,overdepth,amount)
    values(v_run.id,null,v_next,v_cost);
  update public.abandoned_mine_runs set total_funding=total_funding+v_cost where id=v_run.id returning * into v_run;
  -- Payment is deliberately committed to the run before incident resolution;
  -- a Critical result forces extraction but never refunds the entry fee.
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
  if v_incident is distinct from 'critical' then v_modifier:=v_modifier+15; end if;
  update public.abandoned_mine_runs set
    overdepth=case when v_incident='critical' then overdepth else v_next end,
    progress=case when v_incident='critical' then progress else 0 end,
    target=case when v_incident='critical' then target else public.abandoned_mine_depth_target(10,v_next) end,
    danger_modifier=v_modifier,unsecured_cargo=v_unsecured,
    danger=case when v_incident='critical' then danger else public.abandoned_mine_effective_danger(10,v_modifier) end,
    incident_log=case when v_incident is null then incident_log else incident_log||jsonb_build_array(
      jsonb_build_object('severity',v_incident,'depth',10,'overdepth',v_next,'lost',v_loss,'at',now())) end,
    status=case when v_incident='critical' then 'forced_extraction' else 'active' end,
    extraction_reason=case when v_incident='critical' then 'critical_incident' else extraction_reason end,
    extracted_at=case when v_incident='critical' then now() else extracted_at end,updated_at=now()
    where id=v_run.id returning * into v_run;
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money,'cost',v_cost,'incident',v_incident);
end $$;

revoke all on function public.abandoned_mine_artifact(integer,integer,text,text),
  public.abandoned_mine_artifact_opportunity_chance(integer,integer),public.abandoned_mine_overdepth_cost(integer),public.record_abandoned_mine_roll(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_abandoned_mine_roll(uuid,jsonb) to service_role;
revoke all on function public.get_abandoned_mine_dashboard(),public.continue_mine_overdepth(bigint) from public,anon;
grant execute on function public.get_abandoned_mine_dashboard(),public.continue_mine_overdepth(bigint) to authenticated;

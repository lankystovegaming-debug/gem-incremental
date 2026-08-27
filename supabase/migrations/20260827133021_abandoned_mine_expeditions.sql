-- Expeditions v2: the server-authoritative Abandoned Mine.
-- The v0.9 daily/weekly tables and functions are intentionally retained as
-- immutable history. New play is stored in the tables below.

create table public.abandoned_mine_runs (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'awaiting_funding'
    check (status in ('awaiting_funding','active','awaiting_route','ready_to_extract','extracted','forced_extraction','settled')),
  depth integer not null default 0 check (depth between 0 and 10),
  overdepth integer not null default 0 check (overdepth >= 0),
  progress integer not null default 0 check (progress >= 0),
  target integer not null default 0 check (target >= 0),
  danger integer not null default 0 check (danger between 0 and 100),
  total_funding numeric not null default 0 check (total_funding >= 0),
  route_d4 text check (route_d4 in ('reinforced_tunnel','rich_vein')),
  route_d7 text check (route_d7 in ('supply_line','unstable_descent')),
  camps jsonb not null default '[]'::jsonb,
  secured_cargo jsonb not null default '[]'::jsonb,
  unsecured_cargo jsonb not null default '[]'::jsonb,
  protected_discoveries jsonb not null default '[]'::jsonb,
  incident_log jsonb not null default '[]'::jsonb,
  extraction_reason text,
  settlement jsonb,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  extracted_at timestamptz,
  settled_at timestamptz
);
create unique index abandoned_mine_one_open_run on public.abandoned_mine_runs(player_id)
  where status <> 'settled';
create index abandoned_mine_history_idx on public.abandoned_mine_runs(player_id, started_at desc);

create table public.abandoned_mine_funding (
  run_id bigint not null references public.abandoned_mine_runs(id) on delete cascade,
  depth integer not null check (depth between 1 and 10),
  amount numeric not null check (amount > 0),
  funded_at timestamptz not null default now(),
  primary key (run_id, depth)
);

create table public.museum_artifact_registrations (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  artifact_key text not null,
  artifact_name text not null,
  depth_found integer not null,
  discovery_snapshot jsonb not null,
  registered_at timestamptz not null default now(),
  unique (player_id, artifact_key)
);

alter table public.abandoned_mine_runs enable row level security;
alter table public.abandoned_mine_funding enable row level security;
alter table public.museum_artifact_registrations enable row level security;
revoke all on public.abandoned_mine_runs, public.abandoned_mine_funding,
  public.museum_artifact_registrations from public, anon, authenticated;
grant all on public.abandoned_mine_runs, public.abandoned_mine_funding,
  public.museum_artifact_registrations to service_role;

create or replace function public.abandoned_mine_depth_cost(p_depth integer)
returns numeric language sql immutable set search_path='' as $$
  select (array[100000,175000,300000,500000,800000,1250000,2000000,3250000,5000000,7500000]::numeric[])[p_depth]
$$;

create or replace function public.abandoned_mine_depth_target(p_depth integer, p_overdepth integer default 0)
returns integer language sql immutable set search_path='' as $$
  select case when p_depth < 10 then 20 + p_depth * 10
    else 140 + greatest(0,p_overdepth) * 35 end
$$;

create or replace function public.abandoned_mine_artifact(p_depth integer, p_overdepth integer default 0)
returns jsonb language plpgsql volatile set search_path='' as $$
declare
  v_keys text[] := array['miners-lamp','surveyors-compass','silver-pick','foreman-seal','canary-charm','deepcore-map','clockwork-drill','royal-claim'];
  v_names text[] := array['Miner''s Lamp','Surveyor''s Compass','Silver Pick','Foreman''s Seal','Canary Charm','Deepcore Map','Clockwork Drill','Royal Claim'];
  v_index integer;
begin
  v_index := 1 + floor(random() * least(array_length(v_keys,1), greatest(2, 2 + p_depth / 2)))::integer;
  return jsonb_build_object('kind','artifact','key',v_keys[v_index],'name',v_names[v_index],
    'depth',p_depth,'overdepth',greatest(0,p_overdepth),'duplicateValue',25000 * (p_depth + greatest(0,p_overdepth)));
end $$;

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
    'fundingCosts',to_jsonb(array[100000,175000,300000,500000,800000,1250000,2000000,3250000,5000000,7500000]::numeric[]),
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
    danger=least(100,danger+case when p_depth=1 then 4 else 6 end),total_funding=total_funding+v_cost,updated_at=now()
    where id=v_run.id returning * into v_run;
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money);
end $$;

create or replace function public.choose_abandoned_mine_route(p_run_id bigint,p_route text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.abandoned_mine_runs;
begin
  select * into v_run from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() for update;
  if not found or v_run.status<>'awaiting_route' then raise exception 'mine_route_unavailable'; end if;
  if v_run.depth=4 and p_route in ('reinforced_tunnel','rich_vein') then
    update public.abandoned_mine_runs set route_d4=p_route,status='awaiting_funding',
      danger=greatest(0,least(100,danger+case when p_route='rich_vein' then 12 else -10 end)),updated_at=now()
      where id=p_run_id returning * into v_run;
  elsif v_run.depth=7 and p_route in ('supply_line','unstable_descent') then
    update public.abandoned_mine_runs set route_d7=p_route,status='awaiting_funding',
      danger=greatest(0,least(100,danger+case when p_route='unstable_descent' then 16 else -12 end)),updated_at=now()
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
    danger=greatest(0,danger-20),updated_at=now() where id=p_run_id returning * into v_run;
  return jsonb_build_object('run',to_jsonb(v_run),'money',v_money,'cost',v_cost);
end $$;

create or replace function public.record_abandoned_mine_roll(p_player_id uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_run public.abandoned_mine_runs; v_danger integer; v_incident text:=null; v_roll numeric:=random();
  v_loss integer:=0; v_cargo jsonb; v_unsecured jsonb; v_value numeric; v_multiplier numeric:=1;
begin
  select * into v_run from public.abandoned_mine_runs where player_id=p_player_id and status='active' for update;
  if not found then return; end if;
  v_multiplier:=case when v_run.route_d4='rich_vein' then 1.25 else 1 end *
    case when v_run.route_d7='unstable_descent' then 1.4 else 1 end * (1+v_run.overdepth*.2);
  v_danger:=least(100,v_run.danger+1+v_run.depth/3+v_run.overdepth*2);
  v_unsecured:=v_run.unsecured_cargo;
  if random() < least(.45,.09+v_run.depth*.018+v_run.overdepth*.025) then
    v_value:=round((1000+random()*3500)*v_run.depth*v_multiplier);
    v_cargo:=jsonb_build_object('kind','cargo','name',coalesce(p_payload->>'gemName','Relic fragments'),
      'value',v_value,'depth',v_run.depth,'overdepth',v_run.overdepth);
    v_unsecured:=v_unsecured||jsonb_build_array(v_cargo);
  end if;
  if random() < least(.08,.004+v_run.depth*.002+v_run.overdepth*.003) then
    update public.abandoned_mine_runs set protected_discoveries=protected_discoveries||
      jsonb_build_array(public.abandoned_mine_artifact(v_run.depth,v_run.overdepth)) where id=v_run.id;
  end if;
  if v_roll < v_danger::numeric/1000 then
    v_incident:=case when v_roll < v_danger::numeric/5000 then 'critical'
      when v_roll < v_danger::numeric/2000 then 'major' else 'minor' end;
    v_loss:=case v_incident when 'minor' then 1 when 'major' then greatest(1,jsonb_array_length(v_unsecured)/2)
      else jsonb_array_length(v_unsecured) end;
    if v_loss>0 then
      select coalesce(jsonb_agg(value),'[]'::jsonb) into v_unsecured from
        (select value from jsonb_array_elements(v_unsecured) with ordinality x(value,n)
         where n>v_loss order by n) kept;
    end if;
  end if;
  update public.abandoned_mine_runs set progress=progress+1,danger=v_danger,
    unsecured_cargo=v_unsecured,
    incident_log=case when v_incident is null then incident_log else incident_log||jsonb_build_array(
      jsonb_build_object('severity',v_incident,'depth',depth,'overdepth',overdepth,'lost',v_loss,'at',now())) end,
    status=case when v_incident='critical' then 'forced_extraction'
      when progress+1>=target and depth in (4,7) then 'awaiting_route'
      when progress+1>=target and depth=10 then 'ready_to_extract'
      when progress+1>=target then 'awaiting_funding' else status end,
    extraction_reason=case when v_incident='critical' then 'critical_incident' else extraction_reason end,
    extracted_at=case when v_incident='critical' then now() else extracted_at end,updated_at=now()
    where id=v_run.id;
end $$;

create or replace function public.continue_mine_overdepth(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.abandoned_mine_runs;
begin
  update public.abandoned_mine_runs set overdepth=overdepth+1,progress=0,
    target=public.abandoned_mine_depth_target(10,overdepth+1),danger=least(100,danger+15),status='active',updated_at=now()
  where id=p_run_id and player_id=auth.uid() and status='ready_to_extract' and depth=10 returning * into v_run;
  if not found then raise exception 'mine_overdepth_unavailable'; end if;
  return to_jsonb(v_run);
end $$;

create or replace function public.extract_abandoned_mine(p_run_id bigint,p_forced boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.abandoned_mine_runs;
begin
  select * into v_run from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() for update;
  if not found or v_run.status='settled' then raise exception 'mine_not_active'; end if;
  if p_forced and v_run.status<>'forced_extraction' then raise exception 'mine_not_forced'; end if;
  update public.abandoned_mine_runs set
    secured_cargo=case when status='forced_extraction' then secured_cargo else secured_cargo||unsecured_cargo end,
    unsecured_cargo='[]'::jsonb,status=case when status='forced_extraction' then 'forced_extraction' else 'extracted' end,
    extraction_reason=coalesce(extraction_reason,case when p_forced then 'forced' else 'voluntary' end),
    extracted_at=coalesce(extracted_at,now()),updated_at=now() where id=p_run_id returning * into v_run;
  return to_jsonb(v_run);
end $$;

create or replace function public.settle_abandoned_mine(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_run public.abandoned_mine_runs; v_item jsonb; v_cargo_value numeric:=0; v_duplicate_value numeric:=0;
  v_registered jsonb:='[]'::jsonb; v_duplicates jsonb:='[]'::jsonb; v_money numeric;
begin
  select * into v_run from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() for update;
  if not found or v_run.status not in ('extracted','forced_extraction') then raise exception 'mine_not_extracted'; end if;
  select coalesce(sum((x->>'value')::numeric),0) into v_cargo_value from jsonb_array_elements(v_run.secured_cargo) x;
  for v_item in select value from jsonb_array_elements(v_run.protected_discoveries) loop
    insert into public.museum_artifact_registrations(player_id,artifact_key,artifact_name,depth_found,discovery_snapshot)
    values(v_run.player_id,v_item->>'key',v_item->>'name',coalesce((v_item->>'depth')::integer,v_run.depth),v_item)
    on conflict(player_id,artifact_key) do nothing;
    if found then v_registered:=v_registered||jsonb_build_array(v_item);
    else v_duplicate_value:=v_duplicate_value+coalesce((v_item->>'duplicateValue')::numeric,0);
      v_duplicates:=v_duplicates||jsonb_build_array(v_item); end if;
  end loop;
  update public.players set money=money+v_cargo_value+v_duplicate_value,
    lifetime_earnings=lifetime_earnings+v_cargo_value+v_duplicate_value where id=v_run.player_id returning money into v_money;
  update public.abandoned_mine_runs set status='settled',settled_at=now(),updated_at=now(),
    settlement=jsonb_build_object('cargoValue',v_cargo_value,'duplicateArtifactSales',v_duplicate_value,
      'registeredArtifacts',v_registered,'duplicateArtifacts',v_duplicates,'money',v_money)
    where id=v_run.id returning * into v_run;
  return jsonb_build_object('run',to_jsonb(v_run),'settlement',v_run.settlement,'money',v_money);
end $$;

revoke all on function public.abandoned_mine_depth_cost(integer),public.abandoned_mine_depth_target(integer,integer),
  public.abandoned_mine_artifact(integer,integer),public.record_abandoned_mine_roll(uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.record_abandoned_mine_roll(uuid,jsonb) to service_role;
revoke all on function public.get_abandoned_mine_dashboard(),public.fund_abandoned_mine(integer),
  public.choose_abandoned_mine_route(bigint,text),public.build_abandoned_mine_camp(bigint),
  public.continue_mine_overdepth(bigint),public.extract_abandoned_mine(bigint,boolean),
  public.settle_abandoned_mine(bigint) from public,anon;
grant execute on function public.get_abandoned_mine_dashboard(),public.fund_abandoned_mine(integer),
  public.choose_abandoned_mine_route(bigint,text),public.build_abandoned_mine_camp(bigint),
  public.continue_mine_overdepth(bigint),public.extract_abandoned_mine(bigint,boolean),
  public.settle_abandoned_mine(bigint) to authenticated;
